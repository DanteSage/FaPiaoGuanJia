export type SectionId =
  | "workspace"
  | "archive"
  | "reimbursement"
  | "form-template"
  | "statistics"
  | "verify"
  | "export"
  | "settings"
  | "about"
  | "donate";

export const SECTION_ROUTE_MAP: Record<SectionId, string> = {
  workspace: "/workspace",
  archive: "/archive",
  reimbursement: "/reimbursement",
  "form-template": "/form-template",
  statistics: "/statistics",
  verify: "/verify",
  export: "/export",
  settings: "/settings",
  about: "/about",
  donate: "/donate",
};

const ROUTE_SECTION_MAP = Object.entries(SECTION_ROUTE_MAP).reduce<Record<string, SectionId>>(
  (result, [section, path]) => {
    result[path] = section as SectionId;
    return result;
  },
  {}
);

export function getPathBySection(section: SectionId): string {
  return SECTION_ROUTE_MAP[section];
}

export function getSectionByPath(pathname: string): SectionId | null {
  return ROUTE_SECTION_MAP[pathname] ?? null;
}
