const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { loadEnv } = require("../config");
const packageJson = require("../package.json");
const { buildRpaRuntime } = require("./lib/rpa-runtime");

const rootDir = path.resolve(__dirname, "..");
const appEnv = process.env.APP_ENV || "dev";

loadEnv(appEnv);

const buildPlatform = process.env.BUILD_PLATFORM || process.platform;
const releaseSourceDir = path.join(rootDir, "frontend", "release");
const stagedReleaseDir = path.resolve(
  rootDir,
  process.env.FRONTEND_RELEASE_DIR || path.join("dist", buildPlatform),
);
const archivePath = path.join(rootDir, "dist", `invoice-tool-${packageJson.version}-${buildPlatform}.zip`);
const pythonBackendDir = path.join(rootDir, "python-backend");
const pythonServiceDir = path.join(pythonBackendDir, "dist", "service");
const embeddedRpaRuntimeDir = path.join(pythonServiceDir, "rpa-runtime");
const skipRpaBundle = process.env.FAPIAO_SKIP_RPA_BUNDLE === "1";
const pythonCommand = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const childEnv = {
  ...process.env,
  APP_ENV: appEnv,
  BUILD_PLATFORM: buildPlatform,
  FRONTEND_RELEASE_DIR: path.relative(rootDir, stagedReleaseDir).replace(/\\/g, "/"),
};

function run(command, args, options = {}) {
  const useShell = process.platform === "win32";
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: childEnv,
    stdio: "inherit",
    shell: useShell,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureCleanDirectory(directoryPath) {
  fs.rmSync(directoryPath, { recursive: true, force: true });
  fs.mkdirSync(directoryPath, { recursive: true });
}

function cleanLegacyPyInstallerOutputs() {
  fs.rmSync(path.join(rootDir, "build"), { recursive: true, force: true });
  fs.rmSync(path.join(rootDir, "dist", "service"), { recursive: true, force: true });
}

function stageFrontendRelease() {
  if (!fs.existsSync(releaseSourceDir)) {
    throw new Error(`鍓嶇鏋勫缓杈撳嚭涓嶅瓨鍦? ${releaseSourceDir}`);
  }

  ensureCleanDirectory(stagedReleaseDir);
  for (const entry of fs.readdirSync(releaseSourceDir)) {
    fs.cpSync(
      path.join(releaseSourceDir, entry),
      path.join(stagedReleaseDir, entry),
      { recursive: true, force: true },
    );
  }
}

function createArchive() {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.rmSync(archivePath, { force: true });

  if (process.platform === "win32") {
    run("tar", ["-a", "-c", "-f", archivePath, "-C", stagedReleaseDir, "."]);
    return;
  }

  run("zip", ["-rq", archivePath, "."], { cwd: stagedReleaseDir });
}

run("mvn", ["-f", "java/pom.xml", "clean", "verify"]);
cleanLegacyPyInstallerOutputs();
run(pythonCommand, ["-m", "PyInstaller", "build.spec", "--noconfirm"], { cwd: pythonBackendDir });
if (skipRpaBundle) {
  fs.rmSync(embeddedRpaRuntimeDir, { recursive: true, force: true });
  console.log("[build-release] FAPIAO_SKIP_RPA_BUNDLE=1, skipping embedded RPA runtime.");
} else {
  console.log(`[build-release] Installing RPA runtime into ${embeddedRpaRuntimeDir}`);
  buildRpaRuntime(embeddedRpaRuntimeDir, { pythonCommand });
}
run("npm", ["--prefix", "frontend", "run", "dist"]);
stageFrontendRelease();
createArchive();
run("node", ["scripts/verify-release.js"]);
