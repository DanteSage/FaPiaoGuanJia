const { ipcMain } = require("electron");
const { callPython, registerPythonIpc } = require("./python.cjs");
const { installRpaComponent } = require("./rpa.cjs");

function registerIpcVerify() {
  registerPythonIpc("verify:invoice", "verify_invoice", ([params]) => params);

  ipcMain.handle("verify:invoiceByFile", async (_e, filePath) => {
    return await callPython("verify_invoice_by_file", { filePath });
  });

  ipcMain.handle("verify:setConfig", async (_e, params) => {
    return await callPython("set_verify_config", params);
  });

  ipcMain.handle("verify:getConfig", async () => {
    return await callPython("get_verify_config", {});
  });

  registerPythonIpc("verify:clearConfig", "clear_verify_config", () => ({}));

  registerPythonIpc("rpa:verifyInvoice", "rpa_verify_invoice", ([params]) => params);

  registerPythonIpc("rpa:setConfig", "set_rpa_config", ([params]) => params);

  registerPythonIpc("rpa:getConfig", "get_rpa_config", () => ({}));

  registerPythonIpc("rpa:clearConfig", "clear_rpa_config", () => ({}));

  registerPythonIpc("rpa:testBrowser", "test_rpa_browser", ([params]) => params || {});

  ipcMain.handle("rpa:installComponent", async (_e, options) => installRpaComponent(options || {}));

  ipcMain.handle("verify:historyAdd", async (_e, data) => {
    return await callPython("verify_history_add", { data });
  });

  ipcMain.handle("verify:historyList", async (_e, { limit, offset, verifyMode }) => {
    return await callPython("verify_history_list", { limit, offset, verifyMode });
  });

  ipcMain.handle("verify:historyDelete", async (_e, { uid }) => {
    return await callPython("verify_history_delete", { uid });
  });

  ipcMain.handle("verify:historyBatchDelete", async (_e, { uids }) => {
    return await callPython("verify_history_batch_delete", { uids });
  });

  ipcMain.handle("verify:historyClear", async (_e, { verifyMode } = {}) => {
    return await callPython("verify_history_clear", { verifyMode });
  });
}

module.exports = { registerIpcVerify };
