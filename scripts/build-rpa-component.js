const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageJson = require("../package.json");
const { buildRpaRuntime, requirementsPath } = require("./lib/rpa-runtime");

const rootDir = path.resolve(__dirname, "..");
const buildPlatform = process.env.BUILD_PLATFORM || process.platform;
const stageRoot = path.join(rootDir, "dist", "rpa-component", buildPlatform, "rpa-runtime");
const archivePath = path.join(
  rootDir,
  "dist",
  `invoice-tool-rpa-component-${packageJson.version}-${buildPlatform}.zip`,
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "").trim() || `${command} failed`);
  }
  return result.stdout.trim();
}

function writeReadme() {
  const readmePath = path.join(stageRoot, "README.txt");
  fs.writeFileSync(
    readmePath,
    [
      "发票管家 RPA 可选组件（热更新包）",
      "",
      "适用场景：主包已自带 RPA 引擎，该 zip 用于独立升级或离线补装 RPA。",
      "",
      "安装步骤：",
      "1. 先关闭发票管家。",
      "2. 将 rpa-runtime 目录解压到应用服务目录。",
      "3. 目标路径示例：",
      "   resources/python-backend/service/rpa-runtime",
      "",
      "注意：",
      "- 该组件只提供 RPA Python 引擎，不额外包含浏览器运行时。",
      "- 安装后仍需系统 Microsoft Edge、系统 Chrome 或设置中指定的 Chrome 可执行文件。",
      "",
      "安装完成后，重新启动应用，并在 设置 > 验真配置 > RPA 浏览器环境 中确认状态。",
      "",
    ].join("\r\n"),
    "utf8",
  );
}

function createArchive() {
  fs.rmSync(archivePath, { force: true });
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });

  if (process.platform === "win32") {
    const sourceGlob = path.join(path.dirname(stageRoot), "*");
    run("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${sourceGlob.replace(/'/g, "''")}' -DestinationPath '${archivePath.replace(/'/g, "''")}' -Force`,
    ]);
    return;
  }

  run("zip", ["-rq", archivePath, "."], { cwd: path.dirname(stageRoot) });
}

try {
  buildRpaRuntime(stageRoot);
  writeReadme();
  createArchive();
  console.log(`RPA component packaged: ${archivePath}`);
} catch (error) {
  console.error("RPA component build failed.");
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`Expected requirements file: ${requirementsPath}`);
  process.exit(1);
}
