const { ipcMain } = require("electron");
const { callPython } = require("./python.cjs");

function registerIpcReimbursement() {
  ipcMain.handle("reimbursement:load", async () => {
    return await callPython("reimbursement_load", {});
  });

  ipcMain.handle("reimbursement:create", async (_e, data) => {
    return await callPython("reimbursement_create", { data });
  });

  ipcMain.handle("reimbursement:update", async (_e, { id, data }) => {
    return await callPython("reimbursement_update", { id, data });
  });

  ipcMain.handle("reimbursement:delete", async (_e, { id }) => {
    return await callPython("reimbursement_delete", { id });
  });

  ipcMain.handle("reimbursement:batchDelete", async (_e, { ids }) => {
    return await callPython("reimbursement_batch_delete", { ids });
  });

  ipcMain.handle("reimbursement:addItem", async (_e, { reimbursementId, item }) => {
    return await callPython("reimbursement_add_item", { reimbursementId, item });
  });

  ipcMain.handle("reimbursement:updateItem", async (_e, { itemId, reimbursementId, item }) => {
    return await callPython("reimbursement_update_item", { itemId, reimbursementId, item });
  });

  ipcMain.handle("reimbursement:removeItem", async (_e, { itemId, reimbursementId }) => {
    return await callPython("reimbursement_remove_item", { itemId, reimbursementId });
  });

  ipcMain.handle("reimbursement:addApproval", async (_e, { reimbursementId, record }) => {
    return await callPython("reimbursement_add_approval", { reimbursementId, record });
  });

  ipcMain.handle("reimbursement:statistics", async () => {
    return await callPython("reimbursement_statistics", {});
  });
}

module.exports = { registerIpcReimbursement };
