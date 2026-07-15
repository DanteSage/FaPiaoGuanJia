import {
  LEGAL_DOCUMENT_LIST,
  LEGAL_DOCUMENTS,
  type LegalDocumentId,
} from "../legal/documents";

type LegalDocumentDialogProps = {
  documentId: LegalDocumentId;
  onClose: () => void;
  onChangeDocument?: (documentId: LegalDocumentId) => void;
};

export function LegalDocumentDialog({
  documentId,
  onClose,
  onChangeDocument,
}: LegalDocumentDialogProps) {
  const document = LEGAL_DOCUMENTS[documentId];

  return (
    <div className="legalDialogOverlay" data-testid="legal-document-dialog" onClick={onClose}>
      <div className="legalDialog" onClick={(e) => e.stopPropagation()}>
        <div className="legalDialogHeader">
          <div>
            <div className="legalDialogTitle" data-testid="legal-document-title">{document.title}</div>
            <div className="legalDialogMeta">更新日期：{document.updatedAt}</div>
          </div>
          <button className="legalDialogClose" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="legalDialogTabs">
          {LEGAL_DOCUMENT_LIST.map((item) => (
            <button
              key={item.id}
              className={`legalDialogTab ${item.id === documentId ? "legalDialogTabActive" : ""}`}
              onClick={() => onChangeDocument?.(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>

        <div className="legalDialogBody">
          <div className="legalDialogSummary">{document.summary}</div>
          {document.sections.map((section) => (
            <section key={section.title} className="legalDialogSection">
              <h4>{section.title}</h4>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="legalDialogFooter">
          <button onClick={onClose}>我知道了</button>
        </div>
      </div>
    </div>
  );
}
