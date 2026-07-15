const path = require("node:path");
const { app, dialog, ipcMain, shell } = require("electron");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const state = require("./state.cjs");
const { validatePathSafe, registerAllowedPath, registerAllowedPaths } = require("./security.cjs");
const { getAllowedDirectories, getAppOutputsRoot } = require("./storage.cjs");
const { loadThemeConfig, saveThemeConfig, loadLegalConsentStatus, saveLegalConsentStatus } = require("./config.cjs");
const { callPython, registerPythonIpc } = require("./python.cjs");

function registerIpcCore() {
  ipcMain.handle("theme:save", async (_e, theme) => {
    if (typeof theme === "string" && state.THEME_BG_MAP[theme]) {
      saveThemeConfig(theme);
      if (
        process.platform !== "darwin"
        && state.mainWindow
        && !state.mainWindow.isDestroyed()
        && typeof state.mainWindow.setTitleBarOverlay === "function"
      ) {
        try {
          state.mainWindow.setTitleBarOverlay({
            color: state.THEME_TOPBAR_MAP[theme] || state.THEME_BG_MAP[theme],
            symbolColor: state.THEME_SYMBOL_MAP[theme] || "#ffffff",
            height: 40,
          });
        } catch (e) {
          console.warn("更新窗口标题栏配色失败:", e);
        }
      }
    }
  });

  ipcMain.handle("legal:getConsentStatus", async () => {
    return loadLegalConsentStatus();
  });

  ipcMain.handle("legal:acceptConsent", async () => {
    return saveLegalConsentStatus();
  });

  ipcMain.handle("app:relaunch", async () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle("dialog:pickFiles", async () => {
    const res = await dialog.showOpenDialog(state.mainWindow, {
      title: "选择文件",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "支持格式", extensions: ["pdf", "ofd", "xml", "png", "jpg", "jpeg", "bmp", "webp", "tif", "tiff"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: "OFD", extensions: ["ofd"] },
        { name: "XML发票", extensions: ["xml"] },
        { name: "图片", extensions: ["png", "jpg", "jpeg", "bmp", "webp", "tif", "tiff"] },
      ],
    });
    const filePaths = res.canceled ? [] : res.filePaths;
    registerAllowedPaths(filePaths);
    return filePaths;
  });

  const handlePickChromeExecutable = async () => {
    const filters = process.platform === "win32"
      ? [
          { name: "可执行文件", extensions: ["exe"] },
          { name: "所有文件", extensions: ["*"] },
        ]
      : undefined;
    const res = await dialog.showOpenDialog(state.mainWindow, {
      title: "选择 Chrome 可执行文件",
      properties: ["openFile"],
      filters,
    });
    const filePath = res.canceled ? null : res.filePaths[0] || null;
    if (filePath) {
      registerAllowedPath(filePath, { includeParentDirectory: true });
    }
    return filePath;
  };

  ipcMain.handle("dialog:pickChromeExecutable", handlePickChromeExecutable);
  ipcMain.handle("dialog:pickChromiumExecutable", handlePickChromeExecutable);

  ipcMain.handle("dialog:pickRpaComponentZip", async () => {
    const res = await dialog.showOpenDialog(state.mainWindow, {
      title: "选择 RPA 插件包",
      properties: ["openFile"],
      filters: [
        { name: "RPA 插件包", extensions: ["zip"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    const filePath = res.canceled ? null : res.filePaths[0] || null;
    if (filePath) {
      registerAllowedPath(filePath, { includeParentDirectory: true });
    }
    return filePath;
  });

  ipcMain.handle("file:authorizePaths", async (_e, filePaths) => {
    registerAllowedPaths(filePaths);
    return Array.isArray(filePaths) ? filePaths : [filePaths].filter(Boolean);
  });

  ipcMain.handle("file:read", async (_e, filePath) => {
    const safePath = validatePathSafe(filePath, getAllowedDirectories());
    const buf = await fs.readFile(safePath);
    return new Uint8Array(buf);
  });

  ipcMain.handle("file:exists", async (_e, filePaths) => {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const allowed = getAllowedDirectories();
    const results = {};
    for (const p of paths) {
      try {
        const safePath = validatePathSafe(String(p), allowed);
        await fs.access(safePath);
        results[p] = true;
      } catch (e) {
        console.warn("检查文件存在失败:", p, e);
        results[p] = false;
      }
    }
    return results;
  });

  ipcMain.handle("temp:makePath", async (_e, { prefix, suffix }) => {
    const safePrefix = String(prefix || "tmp_").replace(/[^\w.-]/g, "_");
    const safeSuffix = String(suffix || "").replace(/[^\w.-]/g, "_");
    const name = `${safePrefix}${Date.now()}_${crypto.randomUUID()}${safeSuffix}`;
    return path.join(app.getPath("temp"), name);
  });

  ipcMain.handle("file:delete", async (_e, filePaths) => {
    const fps = Array.isArray(filePaths) ? filePaths : [];
    const allowed = getAllowedDirectories();
    for (const fp of fps) {
      try {
        const safePath = validatePathSafe(String(fp), allowed);
        await fs.unlink(safePath);
      } catch (e) {
        console.warn("删除文件失败:", fp, e);
      }
    }
    return true;
  });

  ipcMain.handle("ocr:run", async (_e, filePath) => callPython("ocr", { filePath }));

  ipcMain.handle("ocr:getEngineStatus", async () => callPython("ocr_get_engine_status", {}));

  ipcMain.handle("merge:pdf", async (_e, payload) => {
    const filePaths = Array.isArray(payload) ? payload : payload?.filePaths;
    const config = Array.isArray(payload) ? undefined : payload?.config;
    const result = await callPython("merge_pdf", { filePaths, config });
    return result.outputPath;
  });

  ipcMain.handle("reimbursement:buildCoverPdf", async (_e, payload) => {
    const data = payload?.data;
    const outputPath = payload?.outputPath;
    const template = payload?.template;
    const result = await callPython("build_reimbursement_cover_pdf", { data, outputPath, template });
    return result.outputPath;
  });

  ipcMain.handle("reimbursement:buildPdf", async (_e, payload) => {
    const data = payload?.data;
    const invoiceFilePaths = Array.isArray(payload?.invoiceFilePaths) ? payload.invoiceFilePaths : [];
    const config = payload?.config;
    const outputPath = payload?.outputPath;
    const template = payload?.template;
    const result = await callPython("build_reimbursement_pdf", {
      data,
      invoiceFilePaths,
      config,
      outputPath,
      template,
    });
    return result;
  });

  ipcMain.handle("merge:pngsToPdf", async (_e, { pngDataUrls, outputPath, paperWidthMm, paperHeightMm }) => {
    const result = await callPython("merge_pngs_to_pdf", { pngDataUrls, outputPath, paperWidthMm, paperHeightMm });
    return result.outputPath;
  });

  ipcMain.handle("pdf:renderPage", async (_e, payload) => callPython("pdf_render_page", payload));

  ipcMain.handle("shell:showItemInFolder", async (_e, filePath) => {
    const safePath = validatePathSafe(filePath);
    shell.showItemInFolder(safePath);
  });

  ipcMain.handle("capture:rectPng", async (_e, rect) => {
    if (!state.mainWindow) throw new Error("窗口未就绪");
    if (!rect || typeof rect !== "object") throw new Error("rect参数无效");
    const x = Math.max(0, Math.floor(Number(rect.x) || 0));
    const y = Math.max(0, Math.floor(Number(rect.y) || 0));
    const width = Math.max(1, Math.floor(Number(rect.width) || 1));
    const height = Math.max(1, Math.floor(Number(rect.height) || 1));
    const image = await state.mainWindow.webContents.capturePage({ x, y, width, height });
    return new Uint8Array(image.toPNG());
  });

  ipcMain.handle("dialog:save", async (_e, { defaultName }) => {
    const res = await dialog.showSaveDialog(state.mainWindow, {
      title: "保存文件",
      defaultPath: defaultName || "ocr.txt",
      filters: [
        { name: "PDF", extensions: ["pdf"] },
        { name: "PNG", extensions: ["png"] },
        { name: "图片", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff"] },
        { name: "文本", extensions: ["txt"] },
        { name: "JSON", extensions: ["json"] },
      ],
    });
    if (res.canceled || !res.filePath) return null;
    registerAllowedPath(res.filePath, { includeParentDirectory: true });
    return res.filePath;
  });

  ipcMain.handle("file:saveText", async (_e, { filePath, content }) => {
    if (!filePath) throw new Error("保存路径为空");
    const safePath = validatePathSafe(filePath, getAllowedDirectories());
    await fs.writeFile(safePath, String(content ?? ""), "utf-8");
    return true;
  });

  ipcMain.handle("file:saveBase64", async (_e, { filePath, base64 }) => {
    if (!filePath) throw new Error("保存路径为空");
    const safePath = validatePathSafe(filePath, getAllowedDirectories());
    const b64Str = String(base64 ?? "");
    if (b64Str.length > 0 && !/^[A-Za-z0-9+/=]+$/.test(b64Str)) {
      throw new Error("无效的 base64 数据");
    }
    const buf = Buffer.from(b64Str, "base64");
    await fs.writeFile(safePath, buf);
    return true;
  });

  ipcMain.handle("file:saveBytes", async (_e, { filePath, bytes }) => {
    if (!filePath) throw new Error("保存路径为空");
    const safePath = validatePathSafe(filePath, getAllowedDirectories());
    const MAX_SIZE = 100 * 1024 * 1024;
    if (bytes && bytes.length > MAX_SIZE) {
      throw new Error("文件过大，超过 100MB 限制");
    }
    const buf = Buffer.from(bytes);
    await fs.writeFile(safePath, buf);
    return true;
  });

  ipcMain.handle("shell:openPath", async (_e, filePath) => {
    const safePath = validatePathSafe(filePath, getAllowedDirectories());
    const error = await shell.openPath(safePath);
    if (error) {
      throw new Error(`无法打开文件: ${error}`);
    }
  });

  ipcMain.handle("shell:openExternal", async (_e, url) => {
    if (typeof url !== "string" || (!url.startsWith("https://") && !url.startsWith("http://") && !url.startsWith("mailto:"))) {
      throw new Error("仅允许打开 http/https/mailto 链接");
    }
    await shell.openExternal(url);
  });

  ipcMain.handle("printers:list", async () => {
    try {
      const printers = await state.mainWindow.webContents.getPrintersAsync();
      if (printers && printers.length > 0) {
        return printers.map((p) => ({
          name: p.name,
          isDefault: p.isDefault,
        }));
      }
    } catch (e) {
      console.error("Electron getPrintersAsync 失败:", e);
    }

    if (process.platform === "win32") {
      const { exec } = require("node:child_process");
      return new Promise((resolve) => {
        exec(
          'powershell -Command "Get-Printer | Select-Object Name, Default | ConvertTo-Json"',
          { encoding: "utf-8" },
          (err, stdout) => {
            if (err) {
              console.error("PowerShell 获取打印机失败:", err);
              resolve([]);
              return;
            }
            try {
              const result = JSON.parse(stdout || "[]");
              const printers = Array.isArray(result) ? result : [result];
              resolve(
                printers.map((p) => ({
                  name: p.Name,
                  isDefault: p.Default === true,
                }))
              );
            } catch (parseErr) {
              console.error("解析打印机列表失败:", parseErr);
              resolve([]);
            }
          }
        );
      });
    }

    return [];
  });

  ipcMain.handle("printers:print", async (_e, { printerName, pdfPath, copies }) => {
    const n = Math.max(1, Math.min(99, Number(copies) || 1));
    const result = await callPython("print_pdf", {
      filePath: pdfPath,
      printerName: printerName || "",
      copies: n,
    });
    return result;
  });

  ipcMain.handle("ofd:extract", async (_e, filePath) => {
    return callPython("ofd_extract", { filePath });
  });

  ipcMain.handle("ofd:ocrFallback", async (_e, filePath) => {
    return callPython("ofd_ocr_fallback", { filePath });
  });

  ipcMain.handle("ofd:preload", async (_e, filePath) => {
    return callPython("preload_ofd", { filePath });
  });

  registerPythonIpc("file:storageStats", "file_stats", () => ({}));

  registerPythonIpc("file:deleteStored", "file_delete", ([payload]) => payload);

  ipcMain.handle("cache:clearOfdCaches", async () => {
    const outputsRoot = getAppOutputsRoot();
    const cacheSubdirs = ["ofd_cache", "ofd_render_cache"];
    const tmpPagePattern = /^tmp_page_\d+_\d+\.png$/;
    let deletedFiles = 0;
    let freedBytes = 0;

    async function safeRmRecursive(dirPath) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const childPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            await safeRmRecursive(childPath);
            try { await fs.rmdir(childPath); } catch (_) { /* 目录占用忽略 */ }
          } else {
            try {
              const stat = await fs.stat(childPath);
              freedBytes += stat.size;
              await fs.unlink(childPath);
              deletedFiles += 1;
            } catch (e) {
              console.warn("[cache:clearOfdCaches] 删除失败", childPath, e?.message || e);
            }
          }
        }
      } catch (e) {
        if (e && e.code !== "ENOENT") {
          console.warn("[cache:clearOfdCaches] 扫描失败", dirPath, e?.message || e);
        }
      }
    }

    for (const sub of cacheSubdirs) {
      await safeRmRecursive(path.join(outputsRoot, sub));
    }

    try {
      const topEntries = await fs.readdir(outputsRoot, { withFileTypes: true });
      for (const entry of topEntries) {
        if (entry.isFile() && tmpPagePattern.test(entry.name)) {
          const fp = path.join(outputsRoot, entry.name);
          try {
            const stat = await fs.stat(fp);
            freedBytes += stat.size;
            await fs.unlink(fp);
            deletedFiles += 1;
          } catch (e) {
            console.warn("[cache:clearOfdCaches] 删除临时页失败", fp, e?.message || e);
          }
        }
      }
    } catch (e) {
      if (e && e.code !== "ENOENT") {
        console.warn("[cache:clearOfdCaches] 扫描根目录失败", outputsRoot, e?.message || e);
      }
    }

    return { deletedFiles, freedBytes };
  });

  ipcMain.handle("dialog:pickDirectory", async (_e, { title } = {}) => {
    const res = await dialog.showOpenDialog(state.mainWindow, {
      title: title || "选择文件夹",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("storage:changeRoot", async (_e, { newPath, migrate }) => {
    const fsExtra = require("node:fs");
    const fsp = require("node:fs/promises");

    if (!newPath || typeof newPath !== "string") {
      throw new Error("目标路径无效");
    }

    const target = path.resolve(newPath);
    try {
      await fsp.mkdir(target, { recursive: true });
      const probe = path.join(target, `.fapiao_write_probe_${Date.now()}`);
      await fsp.writeFile(probe, "");
      await fsp.unlink(probe);
    } catch (e) {
      throw new Error(`目标路径不可写: ${e.message}`);
    }

    if (migrate) {
      const { getAppStorageRoot } = require("./storage.cjs");
      const oldRoot = getAppStorageRoot();
      if (path.resolve(oldRoot) !== target) {
        const entries = await fsp.readdir(oldRoot, { withFileTypes: true });
        for (const entry of entries) {
          const src = path.join(oldRoot, entry.name);
          const dest = path.join(target, entry.name);
          try {
            if (entry.isDirectory()) {
              await fsp.cp(src, dest, { recursive: true, force: true });
            } else {
              await fsp.copyFile(src, dest);
            }
          } catch (e) {
            console.warn("[storage:changeRoot] 迁移文件失败:", entry.name, e.message);
          }
        }
      }
    }

    const configPath = path.join(app.getPath("userData"), "storage-config.json");
    await fsp.writeFile(configPath, JSON.stringify({ storageRoot: target }, null, 2), "utf-8");

    return { success: true, newPath: target, needRestart: true };
  });
}

module.exports = { registerIpcCore };
