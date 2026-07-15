const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..", "..");
const requirementsPath = path.join(rootDir, "python-backend", "requirements", "rpa.txt");

function resolvePythonCommand() {
  return process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
}

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

function ensureCleanDir(directoryPath) {
  fs.rmSync(directoryPath, { recursive: true, force: true });
  fs.mkdirSync(directoryPath, { recursive: true });
}

function removePath(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function stripUnneededArtifacts(pythonStageDir) {
  const stack = [pythonStageDir];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath || !fs.existsSync(currentPath)) {
      continue;
    }

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "__pycache__" || entry.name === "tests" || entry.name === "testing") {
          removePath(fullPath);
          continue;
        }

        stack.push(fullPath);
        continue;
      }

      if (entry.name.endsWith(".pyc") || entry.name.endsWith(".pyo")) {
        removePath(fullPath);
      }
    }
  }

  removePath(path.join(pythonStageDir, "Scripts"));
  removePath(path.join(pythonStageDir, "bin"));
}

function buildRpaRuntime(runtimeDir, options = {}) {
  if (!runtimeDir) {
    throw new Error("buildRpaRuntime: runtimeDir is required");
  }
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`Missing requirements file: ${requirementsPath}`);
  }

  const pythonCommand = options.pythonCommand || resolvePythonCommand();
  const pythonStageDir = path.join(runtimeDir, "python");

  ensureCleanDir(runtimeDir);
  fs.mkdirSync(pythonStageDir, { recursive: true });

  run(pythonCommand, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "--upgrade",
    "--no-compile",
    "--target",
    pythonStageDir,
    "-r",
    requirementsPath,
  ]);

  stripUnneededArtifacts(pythonStageDir);

  return { runtimeDir, pythonStageDir };
}

function isRpaRuntimeReady(runtimeDir) {
  if (!runtimeDir) return false;
  return fs.existsSync(path.join(runtimeDir, "python", "playwright"));
}

module.exports = {
  buildRpaRuntime,
  isRpaRuntimeReady,
  requirementsPath,
  resolvePythonCommand,
};
