import React from "react";

type FeatureItem = {
  text: string;
};

type FeaturePlaceholderProps = {
  title: string;
  icon: React.ReactNode;
  featureTitle: string;
  description: string | React.ReactNode;
  features: FeatureItem[];
  headerButtons?: React.ReactNode;
  showStatus?: boolean;
  statusText?: string;
};

const CheckIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="20,6 9,17 4,12" />
  </svg>
);

export function FeaturePlaceholder({
  title,
  icon,
  featureTitle,
  description,
  features,
  headerButtons,
  showStatus = true,
  statusText = "🚧 功能开发中...",
}: FeaturePlaceholderProps) {
  return (
    <div className="panel previewPanel fullPanel">
      <div className="panelHeader">
        <div className="panelHeaderLeft">
          <div className="panelTitle">{title}</div>
        </div>
        {headerButtons && <div className="panelHeaderRight">{headerButtons}</div>}
      </div>
      <div className="previewBody">
        <div className="featurePlaceholder">
          <div className="featureIcon">{icon}</div>
          <div className="featureTitle">{featureTitle}</div>
          <div className="featureDesc">{description}</div>
          <div className="featureList">
            {features.map((feature, index) => (
              <div className="featureListItem" key={index}>
                {CheckIcon}
                {feature.text}
              </div>
            ))}
          </div>
          {showStatus && <div className="featureStatus">{statusText}</div>}
        </div>
      </div>
    </div>
  );
}

export const FeatureIcons = {
  folder: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  document: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  chart: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  shield: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9,12 11,14 15,10" />
    </svg>
  ),
  download: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  info: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};
