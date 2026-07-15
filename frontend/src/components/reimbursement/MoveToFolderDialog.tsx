import { useState, useMemo } from "react";
import type { ReimbursementFolder } from "../../types/reimbursement";

type MoveToFolderDialogProps = {
  folders: ReimbursementFolder[];
  folderCounts: Record<string, number>;
  selectedCount: number;
  onConfirm: (folderId: string | null) => void;
  onCancel: () => void;
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

const ChevronIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const MoveIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14" />
    <path d="M12 5l7 7-7 7" />
  </svg>
);

export function MoveToFolderDialog({ folders, folderCounts, selectedCount, onConfirm, onCancel }: MoveToFolderDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  };

  const renderFolderNode = (node: FolderNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = selectedFolderId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`folderItem ${isSelected ? "folderItemActive" : ""}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => setSelectedFolderId(node.id)}
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
          <span className="folderIcon" style={{ color: node.color }}>{FolderIcon}</span>
          <span className="folderName">{node.name}</span>
          <span className="folderCount">{folderCounts[node.id] || 0}</span>
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
    <div className="dialogOverlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
        <div className="dialogHeader">
          <div className="dialogTitle" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {MoveIcon}
            移动到文件夹
          </div>
          <button className="dialogCloseBtn" onClick={onCancel}>×</button>
        </div>
        <div className="dialogBody" style={{ padding: 0 }}>
          <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--muted)", borderBottom: "1px solid var(--line)" }}>
            将 {selectedCount} 个报销移动到：
          </div>
          <div style={{ maxHeight: 320, overflow: "auto", padding: "4px 0" }}>

            <div
              className={`folderItem ${selectedFolderId === null ? "folderItemActive" : ""}`}
              onClick={() => setSelectedFolderId(null)}
            >
              <span className="folderExpandPlaceholder" />
              <span className="folderIcon">{InboxIcon}</span>
              <span className="folderName">未分类</span>
              <span className="folderCount">{folderCounts.__uncategorized__ || 0}</span>
            </div>

            {folderTree.map((node) => renderFolderNode(node, 0))}
            {folders.length === 0 && (
              <div className="folderEmpty">暂无文件夹</div>
            )}
          </div>
        </div>
        <div className="dialogFooter">
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onCancel}>取消</button>
          <button
            type="button"
            className="primary"
            onClick={() => onConfirm(selectedFolderId)}
          >
            移动
          </button>
        </div>
      </div>
    </div>
  );
}
