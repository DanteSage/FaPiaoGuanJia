const { app, BrowserWindow } = require("electron");
const state = require("./main/state.cjs");
const { getAppStorageRoot } = require("./main/storage.cjs");
const { startPython, stopPython } = require("./main/python.cjs");
const { createSplashWindow, createWindow } = require("./main/windows.cjs");
const { registerAllIpcHandlers } = require("./main/ipc.cjs");

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.focus();
    }
  });

  state.APP_DATA_DIR = getAppStorageRoot();

  registerAllIpcHandlers();

  app.whenReady().then(async () => {
    createSplashWindow();
    startPython();
    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    state.isQuitting = true;
    stopPython();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
