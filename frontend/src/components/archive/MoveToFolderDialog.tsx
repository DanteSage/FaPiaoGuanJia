import React, { useState } from "react";
import type { InvoiceFolder } from "../../types";

type MoveToFolderDialogProps = {
  folders: InvoiceFolder[];
  currentFolderId: string | null;
  invoiceCount: number;
  onConfirm: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onCancel: () => void;
};

const FolderIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const InboxIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const CheckIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PlusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export function MoveToFolderDialog({
  folders,
  currentFolderId,
  invoiceCount,
  onConfirm,
  onCreateFolder,
  onCancel,
}: MoveToFolderDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId);

  const userFolders = folders.filter((f) => !f.id.startsWith("__"));

  const handleConfirm = () => {
    onConfirm(selectedFolderId);
  };

  return (
    <div className="dialogOverlay" onClick={onCancel}>
      <div className="dialog moveToFolderDialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <div className="dialogTitle">
            移动到分类
            <span className="dialogSubtitle">（{invoiceCount} 张发票）</span>
          </div>
          <button className="dialogCloseBtn" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="dialogBody">
          <div className="folderSelectList">
            {           }
            <div
              className={`folderSelectItem ${selectedFolderId === null ? "active" : ""}`}
              onClick={() => setSelectedFolderId(null)}
            >
              <span className="folderSelectIcon">{InboxIcon}</span>
              <span className="folderSelectName">未分类</span>
              {selectedFolderId === null && <span className="folderSelectCheck">{CheckIcon}</span>}
            </div>

            {userFolders.map((folder) => (
              <div
                key={folder.id}
                className={`folderSelectItem ${selectedFolderId === folder.id ? "active" : ""}`}
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <span
                  className="folderSelectIcon"
                  style={folder.color ? { color: folder.color } : undefined}
                >
                  {FolderIcon}
                </span>
                <span className="folderSelectName">{folder.name}</span>
                {selectedFolderId === folder.id && (
                  <span className="folderSelectCheck">{CheckIcon}</span>
                )}
              </div>
            ))}

            <div className="folderSelectItem folderSelectCreate" onClick={onCreateFolder}>
              <span className="folderSelectIcon">{PlusIcon}</span>
              <span className="folderSelectName">新建分类...</span>
            </div>
          </div>
        </div>
        <div className="dialogFooter">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="primary" onClick={handleConfirm}>
            移动
          </button>
        </div>
      </div>
    </div>
  );
}
