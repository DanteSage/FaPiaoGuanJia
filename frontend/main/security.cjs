const path = require("node:path");
const fsSync = require("node:fs");
const crypto = require("node:crypto");
const state = require("./state.cjs");
const { normalizePath, comparablePath } = require("./utils.cjs");

function validatePathSafe(filePath, allowedBases = null) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("路径无效");
  }

  const normalized = normalizePath(filePath);
  const comparable = comparablePath(normalized);

  if (allowedBases && allowedBases.length > 0) {
    const isAllowed = allowedBases.some((base) => {
      const normalizedBase = normalizePath(base);
      const comparableBase = comparablePath(normalizedBase);
      return comparable === comparableBase || comparable.startsWith(comparableBase + path.sep);
    });
    if (!isAllowed) {
      throw new Error("路径超出允许范围");
    }
  }

  return normalized;
}

const SESSION_ALLOWED_PATHS_MAX = 1000;

function addAllowedPathLru(normalized) {
  if (state.sessionAllowedPaths.has(normalized)) {
    state.sessionAllowedPaths.delete(normalized);
  }
  state.sessionAllowedPaths.add(normalized);
  while (state.sessionAllowedPaths.size > SESSION_ALLOWED_PATHS_MAX) {
    const oldest = state.sessionAllowedPaths.values().next().value;
    if (oldest === undefined) break;
    state.sessionAllowedPaths.delete(oldest);
  }
}

function registerAllowedPath(filePath, { includeParentDirectory = false } = {}) {
  if (!filePath || typeof filePath !== "string") return;
  const normalized = normalizePath(filePath);
  addAllowedPathLru(normalized);
  if (includeParentDirectory) {
    addAllowedPathLru(path.dirname(normalized));
  }
}

function registerAllowedPaths(filePaths, options = {}) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  for (const filePath of paths) {
    registerAllowedPath(filePath, options);
  }
}

function ensureWritableDirectory(dirPath) {
  const normalized = normalizePath(dirPath);
  fsSync.mkdirSync(normalized, { recursive: true });

  const stat = fsSync.statSync(normalized);
  if (!stat.isDirectory()) {
    throw new Error(`目标不是目录: ${normalized}`);
  }

  const probePath = path.join(
    normalized,
    `.fapiao-write-probe-${process.pid}-${Date.now()}-${crypto.randomUUID()}`
  );
  fsSync.writeFileSync(probePath, "");
  fsSync.unlinkSync(probePath);
  return normalized;
}

function resolveWritableDirectory(candidates, label) {
  let lastError = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return ensureWritableDirectory(candidate);
    } catch (error) {
      lastError = error;
      console.warn(`[Storage] ${label} unavailable: ${candidate}`, error);
    }
  }
  throw lastError || new Error(`未找到可用的${label}目录`);
}

function assertPathWithinBase(targetPath, basePath) {
  const target = comparablePath(targetPath);
  const base = comparablePath(basePath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error("目标路径超出允许范围");
  }
}

module.exports = {
  validatePathSafe,
  registerAllowedPath,
  registerAllowedPaths,
  ensureWritableDirectory,
  resolveWritableDirectory,
  assertPathWithinBase,
};
