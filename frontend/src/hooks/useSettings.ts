import { useState, useCallback } from "react";

const STORAGE_KEY = "app_settings_v1";

export type ReimbursementDefaults = {
  applicant: string;
  department: string;
  sales: string;
};

export type FormTemplateSections = {
  baseInfo: boolean;
  itemsTable: boolean;
  purposeBlock: boolean;
  signatureBlock: boolean;
};

export type FormTemplateFieldLabels = {
  applicant: string;
  department: string;
  type: string;
  date: string;
  purpose: string;
  endpoint: string;
};

export type FormTemplateSignatures = {
  columns: 1 | 2 | 3 | 4;
  slots: string[];
};

export type FormTemplatePageSize = "A4" | "half";

export type FormTemplate = {
  title: string;
  companyName: string;
  themeColor: string;
  footerNotes: string;
  pageSize: FormTemplatePageSize;
  itemRows: number;
  sections: FormTemplateSections;
  fieldLabels: FormTemplateFieldLabels;
  signatures: FormTemplateSignatures;
};

export function defaultFormTemplate(): FormTemplate {
  return {
    title: "费用报销单",
    companyName: "",
    themeColor: "#1f2937",
    footerNotes: "",
    pageSize: "A4",
    itemRows: 4,
    sections: {
      baseInfo: true,
      itemsTable: true,
      purposeBlock: true,
      signatureBlock: true,
    },
    fieldLabels: {
      applicant: "申请人",
      department: "所属部门",
      type: "报销类型",
      date: "申请日期",
      purpose: "起点",
      endpoint: "终点",
    },
    signatures: {
      columns: 1,
      slots: ["申请人签字", "部门负责人", "财务审核", "总经理批准"],
    },
  };
}

export const FORM_TEMPLATE_PRESETS: Record<string, FormTemplate> = {
  general: defaultFormTemplate(),
  default: {
    ...defaultFormTemplate(),
    sections: {
      baseInfo: true,
      itemsTable: true,
      purposeBlock: false,
      signatureBlock: true,
    },
  },
  minimal: {
    title: "费用报销单",
    companyName: "",
    themeColor: "#475569",
    footerNotes: "",
    pageSize: "A4",
    itemRows: 4,
    sections: {
      baseInfo: false,
      itemsTable: true,
      purposeBlock: false,
      signatureBlock: true,
    },
    fieldLabels: {
      applicant: "申请人",
      department: "部门",
      type: "类型",
      date: "日期",
      purpose: "起点",
      endpoint: "终点",
    },
    signatures: {
      columns: 1,
      slots: ["申请人", "审批"],
    },
  },
};

export type ThemeMode = "dark" | "light" | "one-dark" | "monokai" | "dracula" | "solarized-light" | "github-light";

export const THEME_FAMILY: Record<ThemeMode, "dark" | "light"> = {
  dark: "dark",
  "one-dark": "dark",
  monokai: "dark",
  dracula: "dark",
  light: "light",
  "solarized-light": "light",
  "github-light": "light",
};

export type RpaScreenshotMode = "dialog" | "with_url";

export type AppSettings = {
  reimbursementDefaults: ReimbursementDefaults;
  theme: ThemeMode;
  formTemplate: FormTemplate;
  rpaScreenshotMode: RpaScreenshotMode;
};

function defaultSettings(): AppSettings {
  return {
    reimbursementDefaults: { applicant: "", department: "", sales: "" },
    theme: "light",
    formTemplate: defaultFormTemplate(),
    rpaScreenshotMode: "dialog",
  };
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    const merged: AppSettings = { ...defaultSettings(), ...parsed };
    const ft = merged.formTemplate;
    if (ft && (ft.pageSize as string) !== "A4" && (ft.pageSize as string) !== "half") {
      merged.formTemplate = { ...ft, pageSize: "A4" };
    }
    if (ft && (!ft.itemRows || ft.itemRows < 1 || ft.itemRows > 25)) {
      merged.formTemplate = { ...merged.formTemplate, itemRows: 4 };
    }
    if (ft?.fieldLabels) {
      const def = defaultFormTemplate().fieldLabels;
      const cleaned: FormTemplateFieldLabels = {
        applicant: ft.fieldLabels.applicant ?? def.applicant,
        department: ft.fieldLabels.department ?? def.department,
        type: ft.fieldLabels.type ?? def.type,
        date: ft.fieldLabels.date ?? def.date,
        purpose: ft.fieldLabels.purpose ?? def.purpose,
        endpoint: ft.fieldLabels.endpoint ?? def.endpoint,
      };
      merged.formTemplate = { ...merged.formTemplate, fieldLabels: cleaned };
    }
    return merged;
  } catch {
    return defaultSettings();
  }
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings);

  const setSettings = useCallback((next: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSettingsState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      saveSettings(value);
      return value;
    });
  }, []);

  const setReimbursementDefaults = useCallback((defaults: Partial<ReimbursementDefaults>) => {
    setSettings((prev) => ({
      ...prev,
      reimbursementDefaults: { ...prev.reimbursementDefaults, ...defaults },
    }));
  }, [setSettings]);

  const setTheme = useCallback((theme: ThemeMode) => {
    setSettings((prev) => ({ ...prev, theme }));
    if (theme === "dark") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    document.documentElement.setAttribute("data-theme-family", THEME_FAMILY[theme]);

    window.invoiceApi?.saveTheme?.(theme);
  }, [setSettings]);

  const setFormTemplate = useCallback((next: FormTemplate | ((prev: FormTemplate) => FormTemplate)) => {
    setSettings((prev) => ({
      ...prev,
      formTemplate: typeof next === "function" ? next(prev.formTemplate) : next,
    }));
  }, [setSettings]);

  const resetFormTemplate = useCallback(() => {
    setSettings((prev) => ({ ...prev, formTemplate: defaultFormTemplate() }));
  }, [setSettings]);

  const setRpaScreenshotMode = useCallback((mode: RpaScreenshotMode) => {
    setSettings((prev) => ({ ...prev, rpaScreenshotMode: mode }));
  }, [setSettings]);

  const resetAll = useCallback(() => {
    const d = defaultSettings();
    setSettingsState(d);
    saveSettings(d);
  }, []);

  if (typeof document !== "undefined") {
    const current = document.documentElement.getAttribute("data-theme");
    if (settings.theme === "dark") {
      if (current) document.documentElement.removeAttribute("data-theme");
    } else if (current !== settings.theme) {
      document.documentElement.setAttribute("data-theme", settings.theme);
    }
    document.documentElement.setAttribute("data-theme-family", THEME_FAMILY[settings.theme]);
  }

  return { settings, setSettings, setReimbursementDefaults, setTheme, setFormTemplate, resetFormTemplate, setRpaScreenshotMode, resetAll };
}

export type UseSettingsReturn = ReturnType<typeof useSettings>;
