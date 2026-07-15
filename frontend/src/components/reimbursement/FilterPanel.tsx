import React, { useState, useMemo } from "react";
import type { ReimbursementFilter, ReimbursementStatus, ReimbursementType, ReimbursementStats, ReimbursementFolder } from "../../types/reimbursement";

type FilterPanelProps = {
  filter: ReimbursementFilter;
  stats: ReimbursementStats;
  folders: ReimbursementFolder[];
  folderCounts: Record<string, number>;
  onFilterChange: (filter: ReimbursementFilter) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onEditFolder: (folder: ReimbursementFolder) => void;
  onDeleteFolder: (folderId: string) => void;

  dragOverFolderId?: string | null;
  onFolderDragOver?: (e: React.DragEvent, folderId: string) => void;
  onFolderDragLeave?: (e: React.DragEvent) => void;
  onFolderDrop?: (e: React.DragEvent, folderId: string) => void;
};

type FolderNode = ReimbursementFolder & { children: FolderNode[] };

function buildFolderTree(folders: ReimbursementFolder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  folders.forEach((f) => {
    const node = map.get(f.id)!;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

const STATUS_LABELS: Record<ReimbursementStatus, string> = {
  draft: "草稿",
  pending_payment: "待支付",
  paid: "已支付"
};

const TYPE_LABELS: Record<ReimbursementType, string> = {
  travel: "差旅费",
  transportation: "交通费",
  accommodation: "住宿费",
  office: "办公费",
  entertainment: "招待费",
  meal: "餐饮费",
  training: "培训费",
  communication: "通讯费",
  medical: "医疗费",
  other: "其他"
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

const InboxIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

const ListIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
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

export function FilterPanel({ filter, stats, folders, folderCounts, onFilterChange, onCreateFolder, onEditFolder, onDeleteFolder, dragOverFolderId, onFolderDragOver, onFolderDragLeave, onFolderDrop }: FilterPanelProps) {
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [typeExpanded, setTypeExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ folderId: string; x: number; y: number } | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);

  const activeFolderId = filter.folderId;
  const isAllActive = activeFolderId === undefined || activeFolderId === null;
  const isUncategorizedActive = activeFolderId === "__uncategorized__";

  const selectFolder = (folderId: string | null | undefined) => {
    onFilterChange({ ...filter, folderId: folderId === undefined ? undefined : folderId });
  };

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  };

  const toggleStatus = (status: ReimbursementStatus) => {
    const current = filter.status || [];
    const updated = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onFilterChange({ ...filter, status: updated.length > 0 ? updated : undefined });
  };

  const toggleType = (type: ReimbursementType) => {
    const current = filter.type || [];
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    onFilterChange({ ...filter, type: updated.length > 0 ? updated : undefined });
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folder: ReimbursementFolder) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
  };

  const renderFolderNode = (node: FolderNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isActive = activeFolderId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`folderItem ${isActive ? "folderItemActive" : ""} ${dragOverFolderId === node.id ? "folderItemDragOver" : ""}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => selectFolder(node.id)}
          onContextMenu={(e) => handleFolderContextMenu(e, node)}
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
          <span className="folderIcon" style={{ color: node.color }}>
            {isActive && hasChildren ? FolderOpenIcon : FolderIcon}
          </span>
          <span className="folderName">{node.name}</span>
          <span className="folderCount">{folderCounts[node.id] || 0}</span>
          <button
            className="folderMoreBtn"
            onClick={(e) => handleFolderContextMenu(e, node)}
          >
            {MoreIcon}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div className="folderChildren">
            {node.children.map((child) => renderFolderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "4px 0" }} onClick={() => setContextMenu(null)}>

      <div className="folderSection">
        <div className="folderSectionHeader folderSectionCollapsible" onClick={() => setFoldersExpanded(!foldersExpanded)}>
          <div className="folderSectionHeaderLeft">
            <span className={`folderSectionChevron ${foldersExpanded ? "expanded" : ""}`}>
              {ChevronIcon}
            </span>
            <span className="folderSectionTitle">文件夹</span>
          </div>
          <button
            className="folderAddBtn"
            onClick={(e) => { e.stopPropagation(); onCreateFolder(null); }}
            title="新建文件夹"
          >
            {PlusIcon}
          </button>
        </div>
        {foldersExpanded && (
          <>

            <div
              className={`folderItem ${isAllActive ? "folderItemActive" : ""}`}
              onClick={() => selectFolder(undefined)}
            >
              <span className="folderExpandPlaceholder" />
              <span className="folderIcon">{ListIcon}</span>
              <span className="folderName">全部</span>
              <span className="folderCount">{folderCounts.__all__ || 0}</span>
            </div>

            <div
              className={`folderItem ${isUncategorizedActive ? "folderItemActive" : ""} ${dragOverFolderId === "__uncategorized__" ? "folderItemDragOver" : ""}`}
              onClick={() => selectFolder("__uncategorized__")}
              onDragOver={(e) => onFolderDragOver?.(e, "__uncategorized__")}
              onDragLeave={onFolderDragLeave}
              onDrop={(e) => onFolderDrop?.(e, "__uncategorized__")}
            >
              <span className="folderExpandPlaceholder" />
              <span className="folderIcon">{InboxIcon}</span>
              <span className="folderName">未分类</span>
              <span className="folderCount">{folderCounts.__uncategorized__ || 0}</span>
            </div>

            {folderTree.map((node) => renderFolderNode(node, 0))}
            {folders.length === 0 && (
              <div className="folderEmpty">
                暂无文件夹
                <button className="folderEmptyBtn" onClick={() => onCreateFolder(null)}>创建文件夹</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="folderSection">
        <div className="folderSectionHeader folderSectionCollapsible" onClick={() => setStatusExpanded(!statusExpanded)}>
          <div className="folderSectionHeaderLeft">
            <span className={`folderSectionChevron ${statusExpanded ? "expanded" : ""}`}>
              {ChevronIcon}
            </span>
            <span className="folderSectionTitle">状态</span>
          </div>
        </div>
        {statusExpanded && (["draft", "pending_payment", "paid"] as ReimbursementStatus[]).map(status => (
          <div
            key={status}
            className={`folderItem ${filter.status?.includes(status) ? "folderItemActive" : ""}`}
            onClick={() => toggleStatus(status)}
          >
            <span className="folderExpandPlaceholder" />
            <span className="folderName">{STATUS_LABELS[status]}</span>
            <span className="folderCount">{stats.byStatus[status] || 0}</span>
          </div>
        ))}
      </div>

      <div className="folderSection">
        <div className="folderSectionHeader folderSectionCollapsible" onClick={() => setTypeExpanded(!typeExpanded)}>
          <div className="folderSectionHeaderLeft">
            <span className={`folderSectionChevron ${typeExpanded ? "expanded" : ""}`}>
              {ChevronIcon}
            </span>
            <span className="folderSectionTitle">报销类型</span>
          </div>
        </div>
        {typeExpanded && (["travel", "transportation", "accommodation", "office", "entertainment", "meal", "training", "communication", "medical", "other"] as ReimbursementType[]).map(type => (
          <div
            key={type}
            className={`folderItem ${filter.type?.includes(type) ? "folderItemActive" : ""}`}
            onClick={() => toggleType(type)}
          >
            <span className="folderExpandPlaceholder" />
            <span className="folderName">{TYPE_LABELS[type]}</span>
            <span className="folderCount">{stats.byType[type] || 0}</span>
          </div>
        ))}
      </div>

      {contextMenu && (
        <div
          className="contextMenu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="contextMenuItem"
            onClick={() => {
              onCreateFolder(contextMenu.folderId);
              setContextMenu(null);
            }}
          >
            新建子文件夹
          </button>
          <button
            className="contextMenuItem"
            onClick={() => {
              const folder = folders.find(f => f.id === contextMenu.folderId);
              if (folder) onEditFolder(folder);
              setContextMenu(null);
            }}
          >
            编辑
          </button>
          <button
            className="contextMenuItem contextMenuItemDanger"
            onClick={() => {
              onDeleteFolder(contextMenu.folderId);
              setContextMenu(null);
            }}
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}
