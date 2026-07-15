const path = require("node:path");
const fsSync = require("node:fs");
const { screen } = require("electron");
const state = require("./state.cjs");

function loadThemeConfig() {
  try {
    if (fsSync.existsSync(state.THEME_FILE)) {
      const data = JSON.parse(fsSync.readFileSync(state.THEME_FILE, "utf-8"));
      if (data && data.theme && state.THEME_BG_MAP[data.theme]) return data.theme;
    }
  } catch (e) {
    console.warn("加载主题配置失败:", e);
  }
  return "light";
}

function saveThemeConfig(theme) {
  try {
    fsSync.writeFileSync(state.THEME_FILE, JSON.stringify({ theme }), "utf-8");
  } catch (e) {
    console.warn("保存主题配置失败:", e);
  }
}

function getDefaultLegalConsentStatus() {
  return {
    accepted: false,
    version: state.APP_LEGAL_CONSENT_VERSION,
  };
}

function loadLegalConsentStatus() {
  try {
    if (fsSync.existsSync(state.LEGAL_CONSENT_FILE)) {
      const data = JSON.parse(fsSync.readFileSync(state.LEGAL_CONSENT_FILE, "utf-8"));
      if (data?.version === state.APP_LEGAL_CONSENT_VERSION && typeof data.acceptedAt === "string") {
        return {
          accepted: true,
          version: state.APP_LEGAL_CONSENT_VERSION,
          acceptedAt: data.acceptedAt,
        };
      }
    }
  } catch (e) {
    console.warn("加载法律同意状态失败:", e);
  }
  return getDefaultLegalConsentStatus();
}

function saveLegalConsentStatus() {
  const acceptedAt = new Date().toISOString();
  fsSync.mkdirSync(path.dirname(state.LEGAL_CONSENT_FILE), { recursive: true });
  fsSync.writeFileSync(
    state.LEGAL_CONSENT_FILE,
    JSON.stringify(
      {
        version: state.APP_LEGAL_CONSENT_VERSION,
        acceptedAt,
      },
      null,
      2
    ),
    "utf-8"
  );
  return {
    success: true,
    accepted: true,
    version: state.APP_LEGAL_CONSENT_VERSION,
    acceptedAt,
  };
}

function loadWindowState() {
  try {
    if (fsSync.existsSync(state.WINDOW_STATE_FILE)) {
      const data = fsSync.readFileSync(state.WINDOW_STATE_FILE, "utf-8");
      const winState = JSON.parse(data);
      if (winState && typeof winState.width === "number" && typeof winState.height === "number") {
        return { ...state.DEFAULT_WINDOW_STATE, ...winState };
      }
    }
  } catch (e) {
    console.warn("加载窗口状态失败:", e);
  }
  return state.DEFAULT_WINDOW_STATE;
}

function saveWindowState(win) {
  if (!win) return;
  try {
    const bounds = win.getBounds();
    const winState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: win.isMaximized(),
    };
    fsSync.writeFileSync(state.WINDOW_STATE_FILE, JSON.stringify(winState, null, 2), "utf-8");
  } catch (e) {
    console.warn("保存窗口状态失败:", e);
  }
}

function isWindowInBounds(winState) {
  if (winState.x === undefined || winState.y === undefined) return true;
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x, y, width, height } = display.bounds;
    return (
      winState.x >= x - 100 &&
      winState.x < x + width - 100 &&
      winState.y >= y - 100 &&
      winState.y < y + height - 100
    );
  });
}

module.exports = {
  loadThemeConfig,
  saveThemeConfig,
  getDefaultLegalConsentStatus,
  loadLegalConsentStatus,
  saveLegalConsentStatus,
  loadWindowState,
  saveWindowState,
  isWindowInBounds,
};
