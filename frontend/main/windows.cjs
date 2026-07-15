const path = require("node:path");
const { BrowserWindow, ipcMain } = require("electron");
const state = require("./state.cjs");
const { getProjectRoot } = require("./storage.cjs");
const { loadThemeConfig, loadWindowState, saveWindowState, isWindowInBounds } = require("./config.cjs");

function createSplashWindow() {
  const theme = loadThemeConfig();
  const family = state.THEME_FAMILY_MAP[theme] || "dark";
  const bgColor = family === "light" ? "#f8f9fc" : "#0f0c29";
  state.splashProgressCompletionPromise = new Promise((resolve) => {
    let resolved = false;
    state.resolveSplashProgressCompletion = () => {
      if (resolved) return;
      resolved = true;
      resolve();
      state.resolveSplashProgressCompletion = null;
    };
  });

  state.splashWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: false,
    backgroundColor: bgColor,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const splashPath = path.join(getProjectRoot(), "splash.html");
  state.splashWindow.loadURL(`file://${splashPath.replace(/\\/g, "/")}?family=${family}`);
  state.splashWindow.webContents.once("did-finish-load", () => {
    const currentSplash = state.splashWindow;
    if (!currentSplash || currentSplash.isDestroyed()) {
      state.resolveSplashProgressCompletion?.();
      return;
    }

    void currentSplash.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const progressBar = document.querySelector(".progress-bar");
        if (!progressBar) {
          resolve("missing");
          return;
        }

        let settled = false;
        const finish = (reason) => {
          if (settled) return;
          settled = true;
          progressBar.removeEventListener("animationend", handleAnimationEnd);
          resolve(reason);
        };
        const handleAnimationEnd = (event) => {
          if (event.animationName === "progressFill") {
            finish("animationend");
          }
        };

        progressBar.addEventListener("animationend", handleAnimationEnd);
        window.setTimeout(() => finish("timeout"), ${state.SPLASH_PROGRESS_FALLBACK_MS});
      });
    `, true)
      .catch((error) => {
        console.warn("[Splash] 等待进度条完成失败:", error);
      })
      .finally(() => {
        state.resolveSplashProgressCompletion?.();
      });
  });
  state.splashWindow.once("ready-to-show", () => {
    const currentSplash = state.splashWindow;
    if (!currentSplash || currentSplash.isDestroyed()) return;

    void currentSplash.webContents.executeJavaScript(
      'document.documentElement.classList.add("splash-ready");',
      true
    )
      .catch((error) => {
        console.warn("[Splash] 启动进度动画失败:", error);
      })
      .finally(() => {
        if (!currentSplash.isDestroyed()) {
          currentSplash.show();
        }
      });
  });
  state.splashWindow.once("closed", () => {
    state.resolveSplashProgressCompletion?.();
  });
}

async function createWindow() {
  const windowState = loadWindowState();
  const positionValid = isWindowInBounds(windowState);

  const savedTheme = loadThemeConfig();
  const mainBgColor = state.THEME_BG_MAP[savedTheme] || "#0b1020";
  const topbarColor = state.THEME_TOPBAR_MAP[savedTheme] || mainBgColor;
  const symbolColor = state.THEME_SYMBOL_MAP[savedTheme] || "#ffffff";

  const platformChrome = process.platform === "darwin"
    ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 14 } }
    : {
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: topbarColor,
          symbolColor,
          height: 40,
        },
      };

  state.mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    minWidth: 1024,
    minHeight: 680,
    x: positionValid ? windowState.x : undefined,
    y: positionValid ? windowState.y : undefined,
    backgroundColor: mainBgColor,
    show: false,
    autoHideMenuBar: true,
    ...platformChrome,
    webPreferences: {
      preload: path.join(getProjectRoot(), "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  state.mainWindow.webContents.once("did-finish-load", () => {
    void state.splashProgressCompletionPromise.then(() => {
      if (!state.mainWindow || state.mainWindow.isDestroyed()) return;

      if (state.splashWindow && !state.splashWindow.isDestroyed()) {
        state.splashWindow.close();
        state.splashWindow = null;
      }

      if (windowState.isMaximized) {
        state.mainWindow.maximize();
      }
      state.mainWindow.show();
    });
  });

  let saveTimeout = null;
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        saveWindowState(state.mainWindow);
      }
    }, 500);
  };

  state.mainWindow.on("resize", debouncedSave);
  state.mainWindow.on("move", debouncedSave);
  state.mainWindow.on("maximize", debouncedSave);
  state.mainWindow.on("unmaximize", debouncedSave);

  state.mainWindow.on("close", (e) => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      saveWindowState(state.mainWindow);
    }
    if (state.isQuitting) return;
    e.preventDefault();
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send("app:confirmClose");
    }
  });

  ipcMain.on("app:closeConfirmed", () => {
    state.isQuitting = true;
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.close();
    }
  });

  ipcMain.on("app:closeCancelled", () => {
                  });

  if (state.isDev) {
    await state.mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    await state.mainWindow.loadFile(path.join(getProjectRoot(), "dist", "index.html"));
  }
}

module.exports = {
  createSplashWindow,
  createWindow,
};
