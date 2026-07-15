const path = require("node:path");
const { app } = require("electron");
const fsSync = require("node:fs");
const state = require("./state.cjs");
const { findMatchingFile } = require("./utils.cjs");
const { resolveWritableDirectory } = require("./security.cjs");

function getProjectRoot() {
  return path.resolve(app.getAppPath());
}

function getResourcesPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath);
  }
  return path.resolve(getProjectRoot(), "..");
}

function loadStorageConfigRoot() {
  try {
    const configPath = path.join(app.getPath("userData"), "storage-config.json");
    if (fsSync.existsSync(configPath)) {
      const data = JSON.parse(fsSync.readFileSync(configPath, "utf-8"));
      const root = (data && data.storageRoot || "").trim();
      if (root && fsSync.existsSync(root)) {
        return root;
      }
    }
  } catch (e) {
    console.warn("读取存储配置失败:", e);
  }
  return "";
}

function getAppStorageRoot() {
  if (state.appStorageRootCache) {
    return state.appStorageRootCache;
  }

  const userConfigRoot = loadStorageConfigRoot();
  const envOverride = (process.env.FAPIAO_TOOL_STORAGE_DIR || "").trim();
  const localAppData = (process.env.LOCALAPPDATA || "").trim();
  state.appStorageRootCache = resolveWritableDirectory(
    [
      userConfigRoot,
      envOverride,
      localAppData ? path.join(localAppData, "FapiaoTool") : "",
      path.join(app.getPath("userData"), "storage"),
      path.join(app.getPath("temp"), "FapiaoTool"),
    ],
    "存储"
  );
  process.env.FAPIAO_TOOL_STORAGE_DIR = state.appStorageRootCache;
  return state.appStorageRootCache;
}

function getAppOutputsRoot() {
  if (state.appOutputsRootCache) {
    return state.appOutputsRootCache;
  }

  const envOverride = (process.env.FAPIAO_TOOL_OUTPUTS_DIR || "").trim();
  state.appOutputsRootCache = resolveWritableDirectory(
    [
      envOverride,
      path.join(getAppStorageRoot(), "outputs"),
      path.join(app.getPath("temp"), "FapiaoTool", "outputs"),
    ],
    "输出"
  );
  process.env.FAPIAO_TOOL_OUTPUTS_DIR = state.appOutputsRootCache;
  return state.appOutputsRootCache;
}

function getAllowedDirectories() {
  return Array.from(new Set([
    app.getPath("temp"),
    app.getPath("documents"),
    app.getPath("downloads"),
    app.getPath("desktop"),
    app.getPath("userData"),
    getAppStorageRoot(),
    getAppOutputsRoot(),
    getResourcesPath(),
    ...state.sessionAllowedPaths,
    ...(state.isDev ? [getProjectRoot(), path.resolve(getProjectRoot(), "..")] : []),
  ].filter(Boolean)));
}

function getRpaRuntimeInstallDir() {
  return path.join(getAppStorageRoot(), "rpa-runtime");
}

function isRpaRuntimeDir(runtimeDir) {
  if (!runtimeDir || typeof runtimeDir !== "string") return false;
  return fsSync.existsSync(path.join(runtimeDir, "python", "playwright"));
}

function getJavaExecutable() {
  const bundledCandidates = app.isPackaged
    ? [
        path.join(getResourcesPath(), "jre", process.platform, "bin", "java.exe"),
        path.join(getResourcesPath(), "jre", "bin", "java.exe"),
      ]
    : [
        path.resolve(getProjectRoot(), "..", "jre-min", process.platform, "bin", "java.exe"),
        path.resolve(getProjectRoot(), "..", "jre-min", "bin", "java.exe"),
        path.resolve(getProjectRoot(), "..", "jre", "bin", "java.exe"),
      ];

  const candidates = [];

  if (!app.isPackaged) {
    const javaHome = (process.env.JAVA_HOME || "").trim();
    if (javaHome) {
      candidates.push(path.join(javaHome, "bin", "java.exe"));
    }

    const pf = (process.env.ProgramFiles || "").trim();
    const pf86 = (process.env["ProgramFiles(x86)"] || "").trim();
    const javaRoots = [];
    if (pf) {
      javaRoots.push(path.join(pf, "Java"), path.join(pf, "Eclipse Adoptium"));
    }
    if (pf86) {
      javaRoots.push(path.join(pf86, "Java"));
    }

    for (const root of javaRoots) {
      if (!fsSync.existsSync(root)) continue;
      try {
        const subdirs = fsSync
          .readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
          .reverse();
        for (const subdir of subdirs) {
          candidates.push(path.join(root, subdir, "bin", "java.exe"));
        }
      } catch (e) {
        console.warn("扫描Java安装目录失败:", e);
      }
    }
  }

  candidates.push(...bundledCandidates);

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  return "java";
}

function getPythonEntry() {
  if (app.isPackaged) {
    return path.join(getResourcesPath(), "python-backend", "service.py");
  }
  return path.resolve(getProjectRoot(), "..", "python-backend", "service.py");
}

function getPythonEnv() {
  return {
    ...process.env,
    PYTHONUTF8: "1",
    FAPIAO_TOOL_STORAGE_DIR: getAppStorageRoot(),
    FAPIAO_TOOL_OUTPUTS_DIR: getAppOutputsRoot(),
    FAPIAO_RPA_RUNTIME_DIR: getRpaRuntimeInstallDir(),
  };
}

function getOfdrwCliPath() {
  if (app.isPackaged) {
    return findMatchingFile(path.join(getResourcesPath(), "java"), /^ofdrw-cli-.*\.jar$/);
  }
  return findMatchingFile(path.resolve(getProjectRoot(), "..", "java", "target"), /^ofdrw-cli-.*\.jar$/);
}

module.exports = {
  getProjectRoot,
  getResourcesPath,
  getAppStorageRoot,
  getAppOutputsRoot,
  getAllowedDirectories,
  getRpaRuntimeInstallDir,
  isRpaRuntimeDir,
  getJavaExecutable,
  getPythonEntry,
  getPythonEnv,
  getOfdrwCliPath,
};
