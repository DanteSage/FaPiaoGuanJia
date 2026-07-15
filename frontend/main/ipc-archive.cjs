const { ipcMain } = require("electron");
const state = require("./state.cjs");
const { registerAllowedPath, registerAllowedPaths } = require("./security.cjs");
const { callPython } = require("./python.cjs");

function registerIpcArchive() {
  ipcMain.handle("archive:load", async () => {
    try {
      const result = await callPython("archive_load", {});
      registerAllowedPaths((result?.invoices || []).map((invoice) => invoice?.filePath).filter(Boolean));
      return result;
    } catch (e) {
      console.error("加载归档数据失败:", e);
      return { invoices: [], folders: [], tags: [] };
    }
  });

  ipcMain.handle("archive:addInvoice", async (_e, data) => {
    const result = await callPython("archive_add_invoice", { data });
    if (result?.invoice?.filePath) {
      registerAllowedPath(result.invoice.filePath);
    }
    return result;
  });

  ipcMain.handle("archive:updateInvoice", async (_e, { id, data }) => {
    const result = await callPython("archive_update_invoice", { id, data });
    if (data?.filePath) {
      registerAllowedPath(data.filePath);
    }
    return result;
  });

  ipcMain.handle("archive:deleteInvoice", async (_e, { id, deleteFile, cascadeMode }) => {
    return await callPython("archive_delete_invoice", { id, deleteFile, cascadeMode });
  });

  ipcMain.handle("archive:deleteInvoices", async (_e, { ids, deleteFiles, cascadeMode }) => {
    return await callPython("archive_delete_invoices", { ids, deleteFiles, cascadeMode });
  });

  ipcMain.handle("archive:checkReimbursementRefs", async (_e, { ids }) => {
    return await callPython("archive_check_reimbursement_refs", { ids });
  });

  ipcMain.handle("archive:checkDuplicate", async (_e, { filePath, invoiceCode, invoiceNumber }) => {
    return await callPython("archive_check_duplicate", { filePath, invoiceCode, invoiceNumber });
  });

  ipcMain.handle("archive:statistics", async () => {
    return await callPython("archive_statistics", {});
  });

  ipcMain.handle("archive:moveToFolder", async (_e, { invoiceIds, folderId }) => {
    return await callPython("archive_move_to_folder", { invoiceIds, folderId });
  });

  ipcMain.handle("archive:addTags", async (_e, { invoiceIds, tagIds }) => {
    return await callPython("archive_add_tags", { invoiceIds, tagIds });
  });

  ipcMain.handle("archive:removeTags", async (_e, { invoiceIds, tagIds }) => {
    return await callPython("archive_remove_tags", { invoiceIds, tagIds });
  });

  ipcMain.handle("archive:getDataPath", async () => {
    return state.APP_DATA_DIR;
  });

  ipcMain.handle("archive:getStoragePaths", async () => {
    try {
      return await callPython("get_storage_paths", {});
    } catch (e) {
      console.error("获取存储路径失败:", e);
      return null;
    }
  });

  ipcMain.handle("archive:save", async () => {
    return true;
  });

  ipcMain.handle("folder:add", async (_e, data) => {
    return await callPython("folder_add", { data });
  });

  ipcMain.handle("folder:update", async (_e, { id, data }) => {
    return await callPython("folder_update", { id, data });
  });

  ipcMain.handle("folder:delete", async (_e, id) => {
    return await callPython("folder_delete", { id });
  });

  ipcMain.handle("folder:list", async () => {
    return await callPython("folder_list", {});
  });

  ipcMain.handle("tag:add", async (_e, data) => {
    return await callPython("tag_add", { data });
  });

  ipcMain.handle("tag:update", async (_e, { id, data }) => {
    return await callPython("tag_update", { id, data });
  });

  ipcMain.handle("tag:delete", async (_e, id) => {
    return await callPython("tag_delete", { id });
  });

  ipcMain.handle("tag:list", async () => {
    return await callPython("tag_list", {});
  });

  ipcMain.handle("file:store", async (_e, { filePath, move }) => {
    const result = await callPython("file_store", {
      filePath: filePath,
      move: move || false,
    });
    return result;
  });

  ipcMain.handle("file:storeAndSave", async (_e, { filePath, data, move }) => {
    const result = await callPython("file_store_and_save", {
      filePath: filePath,
      data: data || {},
      move: move || false,
    });
    return result;
  });
}

module.exports = { registerIpcArchive };
