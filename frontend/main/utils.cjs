const path = require("node:path");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const { spawnSync } = require("node:child_process");

function normalizePath(filePath) {
  return path.resolve(path.normalize(filePath));
}

function comparablePath(filePath) {
  const normalized = normalizePath(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function escapePwshSingleQuoted(str) {
  if (!str || typeof str !== "string") {
    return "";
  }
  return str.replace(/'/g, "''");
}

function findMatchingFile(directoryPath, pattern) {
  if (!fsSync.existsSync(directoryPath)) {
    return "";
  }
  return fsSync
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort()
    .at(-1) || "";
}

function sleepSync(ms) {
  if (process.platform === "win32") {
    spawnSync("cmd", ["/c", "timeout", "/t", String(Math.ceil(ms / 1000)), "/nobreak"], { stdio: "ignore" });
  } else {
    spawnSync("sleep", [String(ms / 1000)], { stdio: "ignore" });
  }
}

function rmSyncWithRetry(targetPath, maxRetries = 5, delayMs = 300) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      fsSync.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (e) {
      if (e.code !== "EBUSY" || i === maxRetries - 1) {
        throw e;
      }
      sleepSync(delayMs);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rmWithRetry(targetPath, maxRetries = 5, delayMs = 300) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (e) {
      if (e.code !== "EBUSY" || i === maxRetries - 1) {
        throw e;
      }
      await sleep(delayMs);
    }
  }
}

module.exports = {
  normalizePath,
  comparablePath,
  escapePwshSingleQuoted,
  findMatchingFile,
  sleepSync,
  rmSyncWithRetry,
  sleep,
  rmWithRetry,
};
