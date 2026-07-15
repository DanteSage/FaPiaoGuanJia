const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("invoiceApi", {
  pickFiles: () => ipcRenderer.invoke("dialog:pickFiles"),
  pickChromeExecutable: () => ipcRenderer.invoke("dialog:pickChromeExecutable"),
  pickChromiumExecutable: () => ipcRenderer.invoke("dialog:pickChromiumExecutable"),
  pickRpaComponentZip: () => ipcRenderer.invoke("dialog:pickRpaComponentZip"),
  authorizePaths: (filePaths) => ipcRenderer.invoke("file:authorizePaths", filePaths),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  checkFilesExist: (filePaths) => ipcRenderer.invoke("file:exists", filePaths),
  deleteFiles: (filePaths) => ipcRenderer.invoke("file:delete", filePaths),
  makeTempPath: (prefix, suffix) => ipcRenderer.invoke("temp:makePath", { prefix, suffix }),
  ocrFile: (filePath) => ipcRenderer.invoke("ocr:run", filePath),
  ocrGetEngineStatus: () => ipcRenderer.invoke("ocr:getEngineStatus"),
  mergeFiles: (filePaths, config) => ipcRenderer.invoke("merge:pdf", { filePaths, config }),
  mergePngsToPdf: (pngDataUrls, outputPath, paperWidthMm, paperHeightMm) => ipcRenderer.invoke("merge:pngsToPdf", { pngDataUrls, outputPath, paperWidthMm, paperHeightMm }),
  buildReimbursementCoverPdf: (data, outputPath, template) => ipcRenderer.invoke("reimbursement:buildCoverPdf", { data, outputPath, template }),
  buildReimbursementPdf: (data, invoiceFilePaths, config, outputPath, template) => ipcRenderer.invoke("reimbursement:buildPdf", { data, invoiceFilePaths, config, outputPath, template }),
  showItemInFolder: (filePath) => ipcRenderer.invoke("shell:showItemInFolder", filePath),
  renderPdfPage: (filePath, pageIndex, scale) => ipcRenderer.invoke("pdf:renderPage", { filePath, pageIndex, scale }),
  captureRectPng: (rect) => ipcRenderer.invoke("capture:rectPng", rect),
  chooseSavePath: (defaultName) => ipcRenderer.invoke("dialog:save", { defaultName }),
  saveText: (filePath, content) => ipcRenderer.invoke("file:saveText", { filePath, content }),
  saveBase64: (filePath, base64) => ipcRenderer.invoke("file:saveBase64", { filePath, base64 }),
  saveBytes: (filePath, bytes) => ipcRenderer.invoke("file:saveBytes", { filePath, bytes }),
  openPath: (filePath) => ipcRenderer.invoke("shell:openPath", filePath),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  getPrinters: () => ipcRenderer.invoke("printers:list"),
  print: (options) => ipcRenderer.invoke("printers:print", options),
          
  saveTheme: (theme) => ipcRenderer.invoke("theme:save", theme),
  getLegalConsentStatus: () => ipcRenderer.invoke("legal:getConsentStatus"),
  acceptLegalConsent: () => ipcRenderer.invoke("legal:acceptConsent"),
  relaunchApp: () => ipcRenderer.invoke("app:relaunch"),
  pickStorageDirectory: (title) => ipcRenderer.invoke("dialog:pickDirectory", { title }),
  changeStorageRoot: (newPath, migrate) => ipcRenderer.invoke("storage:changeRoot", { newPath, migrate }),

         
  onConfirmClose: (callback) => {
    ipcRenderer.on("app:confirmClose", callback);
             
    return () => ipcRenderer.removeListener("app:confirmClose", callback);
  },
  confirmClose: () => ipcRenderer.send("app:closeConfirmed"),
  cancelClose: () => ipcRenderer.send("app:closeCancelled"),

                                                   
             
  loadArchiveData: () => ipcRenderer.invoke("archive:load"),
                  
  saveArchiveData: () => ipcRenderer.invoke("archive:save"),
  getDataPath: () => ipcRenderer.invoke("archive:getDataPath"),
  getStoragePaths: () => ipcRenderer.invoke("archive:getStoragePaths"),

           
  addArchivedInvoice: (data) => ipcRenderer.invoke("archive:addInvoice", data),
  updateArchivedInvoice: (id, data) => ipcRenderer.invoke("archive:updateInvoice", { id, data }),
  deleteArchivedInvoice: (id, deleteFile = true, cascadeMode = "remove") => ipcRenderer.invoke("archive:deleteInvoice", { id, deleteFile, cascadeMode }),
  deleteArchivedInvoices: (ids, deleteFiles = true, cascadeMode = "remove") => ipcRenderer.invoke("archive:deleteInvoices", { ids, deleteFiles, cascadeMode }),
  checkReimbursementRefs: (ids) => ipcRenderer.invoke("archive:checkReimbursementRefs", { ids }),
  checkInvoiceDuplicate: (filePath, invoiceCode, invoiceNumber) => ipcRenderer.invoke("archive:checkDuplicate", { filePath, invoiceCode, invoiceNumber }),
  getArchiveStatistics: () => ipcRenderer.invoke("archive:statistics"),

         
  moveInvoicesToFolder: (invoiceIds, folderId) => ipcRenderer.invoke("archive:moveToFolder", { invoiceIds, folderId }),
  addTagsToInvoices: (invoiceIds, tagIds) => ipcRenderer.invoke("archive:addTags", { invoiceIds, tagIds }),
  removeTagsFromInvoices: (invoiceIds, tagIds) => ipcRenderer.invoke("archive:removeTags", { invoiceIds, tagIds }),

          
  addFolder: (data) => ipcRenderer.invoke("folder:add", data),
  updateFolder: (id, data) => ipcRenderer.invoke("folder:update", { id, data }),
  deleteFolder: (id) => ipcRenderer.invoke("folder:delete", id),
  listFolders: () => ipcRenderer.invoke("folder:list"),

         
  addTag: (data) => ipcRenderer.invoke("tag:add", data),
  updateTag: (id, data) => ipcRenderer.invoke("tag:update", { id, data }),
  deleteTag: (id) => ipcRenderer.invoke("tag:delete", id),
  listTags: () => ipcRenderer.invoke("tag:list"),

                                     
  loadReimbursements: () => ipcRenderer.invoke("reimbursement:load"),
  createReimbursement: (data) => ipcRenderer.invoke("reimbursement:create", data),
  updateReimbursement: (id, data) => ipcRenderer.invoke("reimbursement:update", { id, data }),
  deleteReimbursement: (id) => ipcRenderer.invoke("reimbursement:delete", { id }),
  batchDeleteReimbursements: (ids) => ipcRenderer.invoke("reimbursement:batchDelete", { ids }),
  addReimbursementItem: (reimbursementId, item) => ipcRenderer.invoke("reimbursement:addItem", { reimbursementId, item }),
  updateReimbursementItem: (itemId, reimbursementId, item) => ipcRenderer.invoke("reimbursement:updateItem", { itemId, reimbursementId, item }),
  removeReimbursementItem: (itemId, reimbursementId) => ipcRenderer.invoke("reimbursement:removeItem", { itemId, reimbursementId }),
  addReimbursementApproval: (reimbursementId, record) => ipcRenderer.invoke("reimbursement:addApproval", { reimbursementId, record }),
  getReimbursementStatistics: () => ipcRenderer.invoke("reimbursement:statistics"),
                  
  storeFile: (filePath, move) => ipcRenderer.invoke("file:store", { filePath, move }),
  storeFileAndSave: (filePath, data, move) => ipcRenderer.invoke("file:storeAndSave", { filePath, data, move }),
  getStorageStats: () => ipcRenderer.invoke("file:storageStats"),
  deleteStoredFile: (filePath) => ipcRenderer.invoke("file:deleteStored", { filePath }),
               
  extractOfdData: (filePath) => ipcRenderer.invoke("ofd:extract", filePath),
  ocrOfdFallback: (filePath) => ipcRenderer.invoke("ofd:ocrFallback", filePath),
  preloadOfd: (filePath) => ipcRenderer.invoke("ofd:preload", filePath),

                                     
  verifyInvoice: (params) => ipcRenderer.invoke("verify:invoice", params),
  verifyInvoiceByFile: (filePath) => ipcRenderer.invoke("verify:invoiceByFile", filePath),
  setVerifyConfig: (params) => ipcRenderer.invoke("verify:setConfig", params),
  getVerifyConfig: () => ipcRenderer.invoke("verify:getConfig"),
  clearVerifyConfig: () => ipcRenderer.invoke("verify:clearConfig"),

                                       
  rpaVerifyInvoice: (params) => ipcRenderer.invoke("rpa:verifyInvoice", params),
  onRpaVerifyProgress: (callback) => {
    const wrapped = (_e, payload) => callback(payload);
    ipcRenderer.on("rpa:verifyProgress", wrapped);
    return () => ipcRenderer.removeListener("rpa:verifyProgress", wrapped);
  },
  setRpaConfig: (params) => ipcRenderer.invoke("rpa:setConfig", params),
  getRpaConfig: () => ipcRenderer.invoke("rpa:getConfig"),
  clearRpaConfig: () => ipcRenderer.invoke("rpa:clearConfig"),
  testRpaBrowser: (params) => ipcRenderer.invoke("rpa:testBrowser", params),
  installRpaComponent: (options) => ipcRenderer.invoke("rpa:installComponent", options || {}),

                                     
  addVerifyHistory: (data) => ipcRenderer.invoke("verify:historyAdd", data),
  getVerifyHistory: (limit, offset, verifyMode) => ipcRenderer.invoke("verify:historyList", { limit, offset, verifyMode }),
  deleteVerifyHistory: (uid) => ipcRenderer.invoke("verify:historyDelete", { uid }),
  batchDeleteVerifyHistory: (uids) => ipcRenderer.invoke("verify:historyBatchDelete", { uids }),
  clearVerifyHistory: (verifyMode) => ipcRenderer.invoke("verify:historyClear", { verifyMode }),

  clearOfdCaches: () => ipcRenderer.invoke("cache:clearOfdCaches"),
});
