import React, { useState, useEffect } from "react";
import type { InvoiceTag } from "../../types";
import { TAG_COLORS } from "../../hooks/useArchiveState";

type TagDialogProps = {
  tag?: InvoiceTag | null;
  onConfirm: (name: string, color: string) => void;
  onDelete?: () => void;
  onCancel: () => void;
};

export function TagDialog({ tag, onConfirm, onDelete, onCancel }: TagDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);

  useEffect(() => {
    if (tag) {
      setName(tag.name);
      setColor(tag.color);
    } else {
      setName("");
      setColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
    }
  }, [tag]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onConfirm(name.trim(), color);
    }
  };

  return (
    <div className="dialogOverlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <div className="dialogTitle">{tag ? "编辑标签" : "新建标签"}</div>
          <button className="dialogCloseBtn" onClick={onCancel}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialogBody">
            <div className="dialogField">
              <label>标签名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入标签名称"
                autoFocus
                maxLength={10}
              />
            </div>
            <div className="dialogField">
              <label>标签颜色</label>
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
            {tag && onDelete && (
              <button type="button" className="danger" onClick={onDelete}>
                删除
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="primary" disabled={!name.trim()}>
              {tag ? "保存" : "创建"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
