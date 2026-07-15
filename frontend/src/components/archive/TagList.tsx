import React, { useState } from "react";
import type { InvoiceTag } from "../../types";

type TagListProps = {
  tags: InvoiceTag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: () => void;
  onEditTag: (tag: InvoiceTag) => void;
  onDeleteTag: (tagId: string) => void;
};

const PlusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const EditIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const TrashIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const ChevronIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export function TagList({
  tags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onEditTag,
  onDeleteTag,
}: TagListProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="tagList">
      <div className="tagListHeader" onClick={() => setExpanded(!expanded)}>
        <div className="tagListHeaderLeft">
          <span
            className="tagListChevron"
            style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
          >
            {ChevronIcon}
          </span>
          <span className="tagListTitle">标签管理</span>
          {selectedTagIds.length > 0 && (
            <span className="tagListBadge">{selectedTagIds.length}</span>
          )}
        </div>
        <button
          className="tagListAddBtn"
          onClick={(e) => {
            e.stopPropagation();
            onCreateTag();
          }}
          title="新建标签"
        >
          {PlusIcon}
        </button>
      </div>

      {expanded && (
        <div className="tagListBody">
          {tags.length === 0 ? (
            <div className="tagListEmpty">
              暂无标签
              <button className="tagListEmptyBtn" onClick={onCreateTag}>
                创建标签
              </button>
            </div>
          ) : (
            tags.map((tag) => (
              <div
                key={tag.id}
                className={`tagListItem ${selectedTagIds.includes(tag.id) ? "tagListItemActive" : ""}`}
                onClick={() => onToggleTag(tag.id)}
              >
                <span className="tagListItemDot" style={{ backgroundColor: tag.color }} />
                <span className="tagListItemName">{tag.name}</span>
                <div className="tagListItemActions">
                  <button
                    className="tagListItemBtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTag(tag);
                    }}
                    title="编辑标签"
                  >
                    {EditIcon}
                  </button>
                  <button
                    className="tagListItemBtn tagListItemBtnDanger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteTag(tag.id);
                    }}
                    title="删除标签"
                  >
                    {TrashIcon}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
