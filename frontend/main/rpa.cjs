const path = require("node:path");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { normalizePath, escapePwshSingleQuoted, findMatchingFile, rmWithRetry } = require("./utils.cjs");
const { assertPathWithinBase } = require("./security.cjs");
const { getProjectRoot, getResourcesPath, getAppStorageRoot, getRpaRuntimeInstallDir, isRpaRuntimeDir } = require("./storage.cjs");
const { stopPythonAsync } = require("./python.cjs");

function getRpaComponentSourceDirs() {
  const envSource = (process.env.FAPIAO_RPA_COMPONENT_SOURCE || "").trim();
  const resourcesPath = getResourcesPath();
  const appDir = path.dirname(process.execPath);
  const projectParent = path.resolve(getProjectRoot(), "..");
  const platform = process.platform;

  return [
    envSource,
    path.join(resourcesPath, "rpa-component", "rpa-runtime"),
    path.join(resourcesPath, "rpa-runtime"),
    path.join(appDir, "rpa-component", "rpa-runtime"),
    path.join(appDir, "rpa-runtime"),
    path.join(projectParent, "dist", "rpa-component", platform, "rpa-runtime"),
    path.join(projectParent, "python-backend", "vendor", "rpa-runtime"),
  ].filter(Boolean);
}

function findRpaRuntimeSourceDir() {
  for (const candidate of getRpaComponentSourceDirs()) {
    const runtimeDir = normalizePath(candidate);
    if (isRpaRuntimeDir(runtimeDir)) {
      return runtimeDir;
    }
  }
  return "";
}

function getRpaComponentZipCandidates() {
  const envSource = (process.env.FAPIAO_RPA_COMPONENT_SOURCE || "").trim();
  const resourcesPath = getResourcesPath();
  const appDir = path.dirname(process.execPath);
  const projectParent = path.resolve(getProjectRoot(), "..");
  const platform = process.platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const zipPattern = new RegExp(`^invoice-tool-rpa-component-.*-${platform}\\.zip$`);

  const candidates = [];
  if (envSource && envSource.toLowerCase().endsWith(".zip")) {
    candidates.push(envSource);
  }

  for (const directoryPath of [
    resourcesPath,
    path.join(resourcesPath, "rpa-component"),
    appDir,
    path.join(projectParent, "dist"),
  ]) {
    const match = findMatchingFile(directoryPath, zipPattern);
    if (match) candidates.push(match);
  }

  return candidates;
}

function extractRpaComponentZip(zipPath, destinationDir) {
  const command = process.platform === "win32" ? "powershell" : "unzip";
  const args = process.platform === "win32"
    ? [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath '${escapePwshSingleQuoted(zipPath)}' -DestinationPath '${escapePwshSingleQuoted(destinationDir)}' -Force`,
      ]
    : ["-q", zipPath, "-d", destinationDir];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error((stderr || stdout || "").trim() || "解压 RPA 组件失败"));
      }
    });
  });
}

function findRpaRuntimeInside(directoryPath) {
  const root = normalizePath(directoryPath);
  const direct = isRpaRuntimeDir(root) ? root : "";
  if (direct) return direct;

  const nested = path.join(root, "rpa-runtime");
  if (isRpaRuntimeDir(nested)) return nested;

  return "";
}

async function installRpaRuntimeFromSource(sourceDir) {
  const storageRoot = getAppStorageRoot();
  const installDir = getRpaRuntimeInstallDir();
  const tmpDir = path.join(storageRoot, `rpa-runtime-install-${process.pid}-${Date.now()}`);

  assertPathWithinBase(tmpDir, storageRoot);
  assertPathWithinBase(installDir, storageRoot);

  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(path.dirname(tmpDir), { recursive: true });
  await fs.cp(sourceDir, tmpDir, { recursive: true });

  if (!isRpaRuntimeDir(tmpDir)) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    throw new Error("RPA 组件包结构无效，缺少 python/playwright");
  }

  await stopPythonAsync();

  let removed = false;
  try {
    await rmWithRetry(installDir);
    removed = true;
  } catch (e) {
    if (e.code === "EBUSY") {
      const backupDir = installDir + ".old-" + Date.now();
      await fs.rename(installDir, backupDir);
      removed = true;
      fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
    } else {
      throw e;
    }
  } finally {
    if (!removed) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  await fs.rename(tmpDir, installDir);

  return installDir;
}

async function installRpaComponentFromZip(zipPath) {
  const storageRoot = getAppStorageRoot();
  const extractDir = path.join(storageRoot, `rpa-component-extract-${process.pid}-${Date.now()}`);
  assertPathWithinBase(extractDir, storageRoot);
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  try {
    await extractRpaComponentZip(zipPath, extractDir);
    const extractedRuntime = findRpaRuntimeInside(extractDir);
    if (!extractedRuntime) {
      throw new Error("RPA 组件包结构无效，缺少 rpa-runtime/python/playwright");
    }
    const installDir = await installRpaRuntimeFromSource(extractedRuntime);
    return {
      success: true,
      installed: true,
      componentRoot: installDir,
      pythonPath: path.join(installDir, "python"),
      message: "RPA 引擎已安装",
    };
  } finally {
    await fs.rm(extractDir, { recursive: true, force: true });
  }
}

async function installRpaComponent(options = {}) {
  const { zipPath } = options || {};

  if (zipPath) {
    const normalizedZip = normalizePath(zipPath);
    if (!normalizedZip || !fsSync.existsSync(normalizedZip)) {
      return { success: false, installed: false, error: "所选插件包不存在" };
    }
    if (!normalizedZip.toLowerCase().endsWith(".zip")) {
      return { success: false, installed: false, error: "仅支持 .zip 格式的插件包" };
    }
    return await installRpaComponentFromZip(normalizedZip);
  }

  const sourceDir = findRpaRuntimeSourceDir();
  if (sourceDir) {
    const installDir = await installRpaRuntimeFromSource(sourceDir);
    return {
      success: true,
      installed: true,
      componentRoot: installDir,
      pythonPath: path.join(installDir, "python"),
      message: "RPA 引擎已安装",
    };
  }

  const zipCandidates = getRpaComponentZipCandidates();
  if (zipCandidates.length > 0) {
    return await installRpaComponentFromZip(zipCandidates[0]);
  }

  return {
    success: false,
    installed: false,
    error: "未找到 RPA 组件包，请先选择本地插件包后重试",
  };
}

module.exports = {
  getRpaComponentSourceDirs,
  findRpaRuntimeSourceDir,
  getRpaComponentZipCandidates,
  extractRpaComponentZip,
  findRpaRuntimeInside,
  installRpaRuntimeFromSource,
  installRpaComponent,
};
