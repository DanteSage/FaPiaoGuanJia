import { useMemo } from "react";
import type { ArchivedInvoice, InvoiceCategory, InvoiceFolder } from "../../types";
import { CATEGORY_LABELS } from "../../hooks/archiveUtils";

type CategoryStat = {
  category: InvoiceCategory;
  label: string;
  count: number;
  matchedFolder: InvoiceFolder | null;
};

type PostImportClassifyDialogProps = {
  importedInvoices: ArchivedInvoice[];
  userFolders: InvoiceFolder[];
  onCreateByCategory: () => void;
  onChooseExisting: () => void;
  onSkip: () => void;
};

const FolderPlusIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <line x1="12" y1="11" x2="12" y2="17" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
);

const FolderMoveIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    <polyline points="9 14 12 11 15 14" />
    <line x1="12" y1="11" x2="12" y2="17" />
  </svg>
);

export function PostImportClassifyDialog({
  importedInvoices,
  userFolders,
  onCreateByCategory,
  onChooseExisting,
  onSkip,
}: PostImportClassifyDialogProps) {
  const stats = useMemo<CategoryStat[]>(() => {
    const folderByName = new Map<string, InvoiceFolder>();
    for (const folder of userFolders) {
      folderByName.set(folder.name, folder);
    }
    const counter = new Map<InvoiceCategory, number>();
    for (const invoice of importedInvoices) {
      counter.set(invoice.category, (counter.get(invoice.category) ?? 0) + 1);
    }
    const list: CategoryStat[] = [];
    counter.forEach((count, category) => {
      const label = CATEGORY_LABELS[category];
      list.push({
        category,
        label,
        count,
        matchedFolder: folderByName.get(label) ?? null,
      });
    });
    list.sort((a, b) => b.count - a.count);
    return list;
  }, [importedInvoices, userFolders]);

  const totalCount = importedInvoices.length;
  const willCreateCount = stats.filter((s) => !s.matchedFolder).length;
  const willReuseCount = stats.length - willCreateCount;
  const hasExistingFolders = userFolders.length > 0;

  return (
    <div className="dialogOverlay" onClick={onSkip}>
      <div className="dialog postImportClassifyDialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <div className="dialogTitle">
            导入完成
            <span className="dialogSubtitle">（{totalCount} 张发票已导入到「未分类」）</span>
          </div>
          <button className="dialogCloseBtn" onClick={onSkip}>×</button>
        </div>
        <div className="dialogBody">
          <div className="postImportClassifyHint">
            建议为这批发票创建分类，便于后续筛选与提交报销。
          </div>
          <div className="postImportClassifyList">
            {stats.map((stat) => (
              <div key={stat.category} className="postImportClassifyItem">
                <div className="postImportClassifyItemMain">
                  <span className="postImportClassifyItemName">{stat.label}</span>
                  <span className="postImportClassifyItemCount">{stat.count} 张</span>
                </div>
                <div className="postImportClassifyItemHint">
                  {stat.matchedFolder ? (
                    <>归入已有分类「{stat.matchedFolder.name}」</>
                  ) : (
                    <>将创建分类「{stat.label}」</>
                  )}
                </div>
              </div>
            ))}
          </div>
          {stats.length > 0 && (
            <div className="postImportClassifySummary">
              一键归档将
              {willCreateCount > 0 ? <> 新建 <strong>{willCreateCount}</strong> 个分类</> : null}
              {willCreateCount > 0 && willReuseCount > 0 ? <>，</> : null}
              {willReuseCount > 0 ? <> 复用 <strong>{willReuseCount}</strong> 个已有分类</> : null}
              。
            </div>
          )}
        </div>
        <div className="dialogFooter postImportClassifyFooter">
          <button type="button" onClick={onSkip}>暂不归类</button>
          {hasExistingFolders && (
            <button type="button" className="postImportClassifySecondary" onClick={onChooseExisting}>
              {FolderMoveIcon}
              移动到现有分类
            </button>
          )}
          <button
            type="button"
            className="primary postImportClassifyPrimary"
            onClick={onCreateByCategory}
            disabled={stats.length === 0}
          >
            {FolderPlusIcon}
            按类型自动归档
          </button>
        </div>
      </div>
    </div>
  );
}
