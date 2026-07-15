import React, { useState, useMemo } from "react";
import type { InvoiceFolder } from "../../types";

type FolderTreeProps = {
  folders: InvoiceFolder[];
  selectedFolderId: string | null;
  invoiceCounts: Record<string, number>;
  onSelect: (folderId: string) => void;
  onCreateFolder?: (parentId?: string | null) => void;
  onEditFolder?: (folder: InvoiceFolder) => void;
  onDeleteFolder?: (folderId: string) => void;
  onSubmitFolderToReimbursement?: (folderId: string) => void;
  onFolderStats?: (folderId: string) => void;

  readOnly?: boolean;

  dragOverFolderId?: string | null;
  onFolderDragOver?: (e: React.DragEvent, folderId: string) => void;
  onFolderDragLeave?: (e: React.DragEvent) => void;
  onFolderDrop?: (e: React.DragEvent, folderId: string) => void;
};

const FolderIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const FolderOpenIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1" />
    <path d="M5 12h14l2 7H3l2-7z" />
  </svg>
);

const ClockIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const InboxIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const PlusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const MoreIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);

const ChevronIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

function getFolderIcon(folder: InvoiceFolder, isSelected: boolean) {
  if (folder.id === "__recent__") return ClockIcon;
  if (folder.id === "__uncategorized__") return InboxIcon;
  return isSelected ? FolderOpenIcon : FolderIcon;
}

type FolderNode = InvoiceFolder & { children: FolderNode[] };

function buildFolderTree(folders: InvoiceFolder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];

  folders.forEach((folder) => {
    map.set(folder.id, { ...folder, children: [] });
  });

  folders.forEach((folder) => {
    const node = map.get(folder.id)!;
    if (folder.parentId && map.has(folder.parentId)) {
      map.get(folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export function FolderTree({
  folders,
  selectedFolderId,
  invoiceCounts,
  onSelect,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  onSubmitFolderToReimbursement,
  onFolderStats,
  readOnly,
  dragOverFolderId,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
}: FolderTreeProps) {
  const [contextMenu, setContextMenu] = useState<{ folderId: string; x: number; y: number } | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [smartExpanded, setSmartExpanded] = useState(true);
  const [myFoldersExpanded, setMyFoldersExpanded] = useState(true);

  const systemFolders = folders.filter((f) => f.id.startsWith("__"));
  const userFolders = folders.filter((f) => !f.id.startsWith("__"));

  const folderTree = useMemo(() => buildFolderTree(userFolders), [userFolders]);

  const handleContextMenu = (e: React.MouseEvent, folder: InvoiceFolder) => {
    if (readOnly) return;
    if (folder.id.startsWith("__")) return;
    e.preventDefault();
    setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const renderFolderItem = (node: FolderNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const isDragOver = dragOverFolderId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`folderItem ${isSelected ? "folderItemActive" : ""} ${isDragOver ? "folderItemDragOver" : ""}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => onSelect(node.id)}
          onContextMenu={(e) => handleContextMenu(e, node)}
          onDragOver={(e) => onFolderDragOver?.(e, node.id)}
          onDragLeave={onFolderDragLeave}
          onDrop={(e) => onFolderDrop?.(e, node.id)}
        >
          {hasChildren ? (
            <span
              className={`folderExpandBtn ${isExpanded ? "expanded" : ""}`}
              onClick={(e) => toggleExpand(node.id, e)}
            >
              {ChevronIcon}
            </span>
          ) : (
            <span className="folderExpandPlaceholder" />
          )}
          <span className="folderIcon" style={node.color ? { color: node.color } : undefined}>
            {getFolderIcon(node, isSelected)}
          </span>
          <span className="folderName" title={node.name}>{node.name}</span>
          <span className="folderCount">{invoiceCounts[node.id] || 0}</span>
          {!readOnly && (
            <button
              className="folderMoreBtn"
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenu(e, node);
              }}
            >
              {MoreIcon}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="folderChildren">
            {node.children.map((child) => renderFolderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="folderTree" onClick={closeContextMenu}>

      <div className="folderSection">
        <div className="folderSectionHeader folderSectionCollapsible" onClick={() => setSmartExpanded(!smartExpanded)}>
          <div className="folderSectionHeaderLeft">
            <span className={`folderSectionChevron ${smartExpanded ? "expanded" : ""}`}>
              {ChevronIcon}
            </span>
            <span className="folderSectionTitle">智能分类</span>
          </div>
        </div>
        {smartExpanded && systemFolders.map((folder) => (
          <div
            key={folder.id}
            className={`folderItem ${selectedFolderId === folder.id ? "folderItemActive" : ""} ${
              dragOverFolderId === folder.id ? "folderItemDragOver" : ""
            }`}
            onClick={() => onSelect(folder.id)}
            onDragOver={(e) => onFolderDragOver?.(e, folder.id)}
            onDragLeave={onFolderDragLeave}
            onDrop={(e) => onFolderDrop?.(e, folder.id)}
          >
            <span className="folderExpandPlaceholder" />
            <span className="folderIcon">{getFolderIcon(folder, selectedFolderId === folder.id)}</span>
            <span className="folderName" title={folder.name}>{folder.name}</span>
            <span className="folderCount">{invoiceCounts[folder.id] || 0}</span>
          </div>
        ))}
      </div>

      <div className="folderSection">
        <div className="folderSectionHeader folderSectionCollapsible" onClick={() => setMyFoldersExpanded(!myFoldersExpanded)}>
          <div className="folderSectionHeaderLeft">
            <span className={`folderSectionChevron ${myFoldersExpanded ? "expanded" : ""}`}>
              {ChevronIcon}
            </span>
            <span className="folderSectionTitle">我的分类</span>
          </div>
          {!readOnly && (
            <button
              className="folderAddBtn"
              onClick={(e) => {
                e.stopPropagation();
                onCreateFolder?.(null);
              }}
              title="新建分类"
            >
              {PlusIcon}
            </button>
          )}
        </div>
        {myFoldersExpanded && (
          folderTree.length === 0 ? (
            <div className="folderEmpty">
              暂无自定义分类
              {!readOnly && (
                <button className="folderEmptyBtn" onClick={() => onCreateFolder?.(null)}>
                  创建分类
                </button>
              )}
            </div>
          ) : (
            folderTree.map((node) => renderFolderItem(node, 0))
          )
        )}
      </div>

      {!readOnly && contextMenu && (
        <div
          className="contextMenu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="contextMenuItem"
            onClick={() => {
              onCreateFolder?.(contextMenu.folderId);
              closeContextMenu();
            }}
          >
            新建子分类
          </button>
          <button
            className="contextMenuItem"
            onClick={() => {
              const folder = folders.find((f) => f.id === contextMenu.folderId);
              if (folder) onEditFolder?.(folder);
              closeContextMenu();
            }}
          >
            编辑
          </button>
          {onSubmitFolderToReimbursement && (
            <button
              className="contextMenuItem"
              onClick={() => {
                onSubmitFolderToReimbursement(contextMenu.folderId);
                closeContextMenu();
              }}
            >
              提交报销
            </button>
          )}
          {onFolderStats && (
            <button
              className="contextMenuItem"
              onClick={() => {
                onFolderStats(contextMenu.folderId);
                closeContextMenu();
              }}
            >
              统计
            </button>
          )}
          <button
            className="contextMenuItem contextMenuItemDanger"
            onClick={() => {
              onDeleteFolder?.(contextMenu.folderId);
              closeContextMenu();
            }}
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}
