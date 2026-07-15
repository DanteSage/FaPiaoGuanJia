const path = require("node:path");
const { app, dialog, ipcMain } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const state = require("./state.cjs");
const { sleepSync, sleep } = require("./utils.cjs");
const { getResourcesPath, getPythonEntry, getPythonEnv } = require("./storage.cjs");

function startPython() {
  if (state.py) return;
  if (state.pyDisabled) {
    const elapsed = Date.now() - state.pyDisabledTimestamp;
    if (elapsed > state.PY_RESET_COOLDOWN_MS) {
      console.info(`[Python] 已禁用 ${Math.round(elapsed / 1000)}s，冷却期结束，重置重启计数器`);
      state.pyDisabled = false;
      state.pyDisabledTimestamp = 0;
      state.pyRestartTimestamps.length = 0;
    } else {
      return;
    }
  }

  const now = Date.now();
  while (state.pyRestartTimestamps.length > 0 && now - state.pyRestartTimestamps[0] > state.PY_RESTART_WINDOW_MS) {
    state.pyRestartTimestamps.shift();
  }
  state.pyRestartTimestamps.push(now);
  if (state.pyRestartTimestamps.length > state.PY_MAX_RESTARTS) {
    state.pyDisabled = true;
    state.pyDisabledTimestamp = Date.now();
    console.error(`[Python] 后端进程在 ${state.PY_RESTART_WINDOW_MS / 1000}s 内重启超过 ${state.PY_MAX_RESTARTS} 次，已停止重启`);
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "后端服务异常",
        "Python 后端进程反复崩溃，已停止自动重启。\n部分功能（OCR、打印、导出等）将不可用。\n\n请尝试重启应用，如问题持续请联系技术支持。"
      );
    }
    return;
  }

  if (app.isPackaged) {
    const exePath = path.join(getResourcesPath(), "python-backend", "service", "service.exe");
    state.py = spawn(exePath, ["--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: getPythonEnv(),
    });
  } else {
    const entry = getPythonEntry();
    state.py = spawn("py", ["-3", "-X", "utf8", entry, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: getPythonEnv(),
    });
  }

  state.py.stdout.setEncoding("utf-8");
  let buffer = "";
  state.py.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx < 0) break;
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "ready") continue;
        if (msg.type === "rpa_progress") {
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            state.mainWindow.webContents.send("rpa:verifyProgress", {
              stage: msg.stage || "",
              message: msg.message || "",
              attempt: msg.attempt,
              pollAttempt: msg.pollAttempt,
              pollTotal: msg.pollTotal,
            });
          }
          continue;
        }
        const key = msg.id;
        const item = state.pending.get(key);
        if (!item) continue;
        state.pending.delete(key);
        if (msg.ok) item.resolve(msg.result);
        else {
          const err = new Error(msg.error || "Python调用失败");
          err.code = msg.code || 2;
          item.reject(err);
        }
      } catch (e) {
        console.error("[Python stdout] JSON解析失败:", line, e);
      }
    }
  });

  state.py.stderr.setEncoding("utf-8");
  state.py.stderr.on("data", (chunk) => {
    console.error("[Python stderr]", chunk);
  });

  state.py.on("error", (err) => {
    console.error("[Python error]", err);
    state.py = null;
    for (const [, item] of state.pending) item.reject(new Error(`Python进程启动失败: ${err.message}`));
    state.pending.clear();
  });

  state.py.on("exit", (code, signal) => {
    console.error("[Python exit]", { code, signal });
    state.py = null;
    for (const [, item] of state.pending) item.reject(new Error(`Python进程已退出 (code=${code}, signal=${signal})`));
    state.pending.clear();
  });
}

function _detachPythonProcess() {
  const pid = state.py.pid;
  state.py.removeAllListeners("error");
  state.py.removeAllListeners("exit");
  state.py.on("exit", () => {});
  state.py.stdout.destroy();
  state.py.stderr.destroy();
  state.py.stdin.destroy();
  state.py.kill("SIGTERM");
  state.py = null;
  for (const [id] of state.pending) {
    rejectForId(id, new Error("Python后端进程已主动停止"));
  }
  state.pending.clear();
  return pid;
}

function stopPython() {
  if (!state.py) return;
  console.info("[Python] 主动停止后端进程");
  const pid = _detachPythonProcess();

  sleepSync(500);

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
  } else {
    spawnSync("pkill", ["-9", "-P", String(pid)], { stdio: "ignore" });
    spawnSync("kill", ["-9", String(pid)], { stdio: "ignore" });
  }
  sleepSync(1500);
}

async function stopPythonAsync() {
  if (!state.py) return;
  console.info("[Python] 主动停止后端进程 (async)");
  const pid = _detachPythonProcess();

  await sleep(500);

  await new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "taskkill" : "pkill";
    const args = process.platform === "win32"
      ? ["/F", "/T", "/PID", String(pid)]
      : ["-9", "-P", String(pid)];
    const child = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
    child.once("exit", () => resolve());
    child.once("error", () => resolve());
  });

  if (process.platform !== "win32") {
    await new Promise((resolve) => {
      const child = spawn("kill", ["-9", String(pid)], { stdio: "ignore" });
      child.once("exit", () => resolve());
      child.once("error", () => resolve());
    });
  }

  await sleep(1500);
}

async function callPython(method, params) {
  if (state.pyDisabled) throw new Error("Python后端已停止，请重启应用");
  startPython();
  if (!state.py) throw new Error("Python进程启动失败");
  const id = ++state.requestSeq;
  const payload = JSON.stringify({ id, method, params }) + "\n";
  const timeoutId = setTimeout(() => {
    rejectForId(id, new Error(`Python调用超时 (${state.PY_CALL_TIMEOUT_MS / 1000}s): ${method}`));
  }, state.PY_CALL_TIMEOUT_MS);
  return await new Promise((resolve, reject) => {
    const wrappedResolve = (result) => {
      clearTimeout(timeoutId);
      resolve(result);
    };
    const wrappedReject = (err) => {
      clearTimeout(timeoutId);
      reject(err);
    };
    state.pending.set(id, { resolve: wrappedResolve, reject: wrappedReject });
    try {
      state.py.stdin.write(payload, "utf-8");
    } catch (e) {
      clearTimeout(timeoutId);
      state.pending.delete(id);
      reject(new Error(`Python进程写入失败: ${e.message}`));
    }
  });
}

function rejectForId(id, err) {
  const item = state.pending.get(id);
  if (item) {
    state.pending.delete(id);
    item.reject(err);
  }
}

function registerPythonIpc(channel, method, transform = (args) => args) {
  ipcMain.handle(channel, async (_e, ...args) => callPython(method, transform(args)));
}

module.exports = {
  startPython,
  stopPython,
  stopPythonAsync,
  callPython,
  rejectForId,
  registerPythonIpc,
};
