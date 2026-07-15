import React, { useState, useEffect } from "react";
import type { InvoiceFolder } from "../../types";
import { TAG_COLORS } from "../../hooks/useArchiveState";

type FolderDialogProps = {
  folder?: InvoiceFolder | null;
  folders?: InvoiceFolder[];
  defaultParentId?: string | null;
  onConfirm: (name: string, color?: string, parentId?: string | null) => void;
  onDelete?: () => void;
  onCancel: () => void;
};

export function FolderDialog({ folder, folders = [], defaultParentId, onConfirm, onDelete, onCancel }: FolderDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [parentId, setParentId] = useState<string | null>(null);

  const getDescendantIds = (folderId: string): string[] => {
    const descendants: string[] = [folderId];
    const children = folders.filter((f) => f.parentId === folderId);
    children.forEach((child) => {
      descendants.push(...getDescendantIds(child.id));
    });
    return descendants;
  };

  const excludeIds = folder ? getDescendantIds(folder.id) : [];
  const availableParents = folders.filter(
    (f) => !f.id.startsWith("__") && !excludeIds.includes(f.id)
  );

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setColor(folder.color || TAG_COLORS[0]);
      setParentId(folder.parentId);
    } else {
      setName("");
      setColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
      setParentId(defaultParentId ?? null);
    }
  }, [folder, defaultParentId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim(), color, parentId);
    }
  };

  return (
    <div className="dialogOverlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <div className="dialogTitle">{folder ? "编辑分类" : "新建分类"}</div>
          <button className="dialogCloseBtn" onClick={onCancel}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialogBody">
            <div className="dialogField">
              <label>分类名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入分类名称"
                autoFocus
                maxLength={20}
              />
            </div>
            {availableParents.length > 0 && (
              <div className="dialogField">
                <label>父分类</label>
                <select
                  value={parentId || ""}
                  onChange={(e) => setParentId(e.target.value || null)}
                  className="dialogSelect"
                >
                  <option value="">无（顶级分类）</option>
                  {availableParents.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="dialogField">
              <label>分类颜色</label>
              <div className="colorPicker">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`colorPickerItem ${color === c ? "active" : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="dialogFooter">
            {folder && onDelete && (
              <button type="button" className="danger" onClick={onDelete}>
                删除
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="primary" disabled={!name.trim()}>
              {folder ? "保存" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
