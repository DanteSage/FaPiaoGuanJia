const { registerIpcCore } = require("./ipc-core.cjs");
const { registerIpcArchive } = require("./ipc-archive.cjs");
const { registerIpcReimbursement } = require("./ipc-reimbursement.cjs");
const { registerIpcVerify } = require("./ipc-verify.cjs");

function registerAllIpcHandlers() {
  registerIpcCore();
  registerIpcArchive();
  registerIpcReimbursement();
  registerIpcVerify();
}

module.exports = { registerAllIpcHandlers };
