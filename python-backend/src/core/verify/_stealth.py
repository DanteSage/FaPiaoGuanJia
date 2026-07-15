import importlib
import os
import shutil
import sys
from pathlib import Path
from typing import Any, Optional

from ._common import _log

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
]

_VIEWPORTS = [
    (1920, 1080),
    (1366, 768),
    (1536, 864),
    (1440, 900),
    (1280, 800),
    (1600, 900),
    (1280, 720),
    (1920, 1200),
]

_VALID_BROWSER_PREFERENCES = ("auto", "edge", "chrome")

_STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
try { delete navigator.__proto__.webdriver; } catch(e) {}

Object.defineProperty(navigator, 'plugins', {
    get: () => {
        const p = {
            0: { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
            1: { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
            2: { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 },
            length: 3,
            item: function(i) { return this[i] || null; },
            namedItem: function(n) { for(let i=0;i<this.length;i++) if(this[i].name===n) return this[i]; return null; },
            refresh: function() {}
        };
        return p;
    }
});

Object.defineProperty(navigator, 'mimeTypes', {
    get: () => ({
        0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: navigator.plugins[0] },
        1: { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: navigator.plugins[0] },
        length: 2,
        item: function(i) { return this[i] || null; },
        namedItem: function(n) { for(let i=0;i<this.length;i++) if(this[i].type===n) return this[i]; return null; }
    })
});

Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
Object.defineProperty(navigator, 'language',  { get: () => 'zh-CN' });
Object.defineProperty(navigator, 'platform',  { get: () => 'Win32' });

window.chrome = {
    app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
    runtime: { OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }, OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }, PlatformArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }, PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }, PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' }, RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }, connect: function() {}, sendMessage: function() {} },
    loadTimes: function() { return { commitLoadTime: Date.now()/1000, connectionInfo: 'http/1.1', finishDocumentLoadTime: Date.now()/1000, finishLoadTime: Date.now()/1000, firstPaintAfterLoadTime: 0, firstPaintTime: Date.now()/1000, navigationType: 'Other', npnNegotiatedProtocol: 'unknown', requestTime: Date.now()/1000, startLoadTime: Date.now()/1000, wasAlternateProtocolAvailable: false, wasFetchedViaSpdy: false, wasNpnNegotiated: false }; },
    csi: function() { return { onloadT: Date.now(), pageT: Date.now()/1000, startE: Date.now(), tran: 15 }; }
};

(() => {
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
})();

Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
Object.defineProperty(navigator, 'deviceMemory',        { get: () => 8 });
Object.defineProperty(navigator, 'maxTouchPoints',      { get: () => 0 });

if (!navigator.connection) {
    Object.defineProperty(navigator, 'connection', {
        get: () => ({ effectiveType: '4g', rtt: 50, downlink: 10, saveData: false })
    });
}

(() => {
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p) {
        if (p === 37445) return 'Google Inc. (Intel)';
        if (p === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return getParam.call(this, p);
    };
    if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParam2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(p) {
            if (p === 37445) return 'Google Inc. (Intel)';
            if (p === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return getParam2.call(this, p);
        };
    }
})();

(() => {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
        const ctx = this.getContext('2d');
        if (ctx) {
            const style = ctx.fillStyle;
            ctx.fillStyle = 'rgba(0,0,' + (Math.random()*0.02).toFixed(4) + ',0.01)';
            ctx.fillRect(0, 0, 1, 1);
            ctx.fillStyle = style;
        }
        return origToDataURL.apply(this, arguments);
    };
    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function() {
        const ctx = this.getContext('2d');
        if (ctx) {
            const style = ctx.fillStyle;
            ctx.fillStyle = 'rgba(0,0,' + (Math.random()*0.02).toFixed(4) + ',0.01)';
            ctx.fillRect(0, 0, 1, 1);
            ctx.fillStyle = style;
        }
        return origToBlob.apply(this, arguments);
    };
})();

(() => {
    const props = ['__playwright', '__pw_manual', '_selenium', '__nightmare',
                   '_Recaptcha', 'callPhantom', '_phantom', 'phantom',
                   'domAutomation', 'domAutomationController'];
    for (const p of props) {
        try { delete window[p]; } catch(e) {}
        Object.defineProperty(window, p, { get: () => undefined, configurable: true });
    }
})();

(() => {
    try {
        const origContentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
        if (origContentWindow) {
            Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
                get: function() {
                    const w = origContentWindow.get.call(this);
                    if (w) {
                        try { Object.defineProperty(w.navigator, 'webdriver', { get: () => undefined }); } catch(e) {}
                    }
                    return w;
                }
            });
        }
    } catch(e) {}
})();

(() => {
    const w = window.innerWidth || 1920;
    const h = window.innerHeight || 1080;
    Object.defineProperty(screen, 'width',      { get: () => w + (window.outerWidth - window.innerWidth) });
    Object.defineProperty(screen, 'height',     { get: () => h + 140 });
    Object.defineProperty(screen, 'availWidth',  { get: () => w + (window.outerWidth - window.innerWidth) });
    Object.defineProperty(screen, 'availHeight', { get: () => h + 100 });
    Object.defineProperty(screen, 'colorDepth',  { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth',  { get: () => 24 });
})();
"""


def _normalize_browser_preference(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized == "chromium":
        return "chrome"
    if normalized in _VALID_BROWSER_PREFERENCES:
        return normalized
    return "auto"


def _resolve_existing_executable(file_path: str) -> Optional[Path]:
    candidate_text = str(file_path or "").strip()
    if not candidate_text:
        return None

    candidate = Path(candidate_text).expanduser()
    if not candidate.exists() or not candidate.is_file():
        return None

    return candidate.resolve()


def _get_runtime_search_roots() -> list[Path]:
    roots: list[Path] = []

    explicit_browsers_path = (os.environ.get("PLAYWRIGHT_BROWSERS_PATH") or "").strip()
    if explicit_browsers_path:
        roots.append(Path(explicit_browsers_path))

    explicit_executable = (os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH") or "").strip()
    if explicit_executable:
        roots.append(Path(explicit_executable))

    backend_dir = Path(__file__).resolve().parents[1]
    roots.append(backend_dir / "vendor" / "ms-playwright")

    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", "")
        if meipass:
            roots.append(Path(meipass) / "ms-playwright")

        exe_dir = Path(sys.executable).resolve().parent
        roots.append(exe_dir / "_internal" / "ms-playwright")
        roots.append(exe_dir / "ms-playwright")

    deduped: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        normalized = str(root.resolve(strict=False)).lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(root)
    return deduped


def _iter_chromium_dirs(root: Path) -> list[Path]:
    if root.is_file():
        return []

    if (
        root.is_dir()
        and root.name.startswith("chromium-")
        and not root.name.startswith("chromium_headless_shell-")
    ):
        return [root]

    if not root.exists():
        return []

    return sorted(
        [
            child
            for child in root.iterdir()
            if child.is_dir()
            and child.name.startswith("chromium-")
            and not child.name.startswith("chromium_headless_shell-")
        ],
        key=lambda child: child.name,
        reverse=True,
    )


def _find_chromium_executable_in_dir(chromium_dir: Path) -> Optional[Path]:
    for relative_path in (
        "chrome-win64/chrome.exe",
        "chrome-win/chrome.exe",
        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-linux/chrome",
    ):
        candidate = chromium_dir / relative_path
        if candidate.exists():
            return candidate.resolve()
    return None


def _find_system_msedge_executable() -> Optional[Path]:
    candidates: list[Path] = []

    for candidate in (
        shutil.which("msedge"),
        shutil.which("msedge.exe"),
        shutil.which("microsoft-edge"),
        shutil.which("microsoft-edge-stable"),
    ):
        if candidate:
            candidates.append(Path(candidate))

    if sys.platform == "win32":
        for env_key in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            base_dir = (os.environ.get(env_key) or "").strip()
            if not base_dir:
                continue
            candidates.append(Path(base_dir) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    elif sys.platform == "darwin":
        candidates.append(Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"))
    else:
        candidates.extend(
            [
                Path("/usr/bin/microsoft-edge"),
                Path("/usr/bin/microsoft-edge-stable"),
                Path("/snap/bin/microsoft-edge"),
            ]
        )

    seen: set[str] = set()
    for candidate in candidates:
        normalized = str(candidate.resolve(strict=False)).lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        if candidate.exists() and candidate.is_file():
            return candidate.resolve()

    return None


def _find_bundled_chromium_executable(configured_executable_path: str = "") -> Optional[Path]:
    configured_executable = _resolve_existing_executable(configured_executable_path)
    if configured_executable:
        return configured_executable

    explicit_executable = _resolve_existing_executable(
        os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "")
    )
    if explicit_executable:
        return explicit_executable

    for root in _get_runtime_search_roots():
        if root.is_file() and root.exists():
            return root.resolve()

        for chromium_dir in _iter_chromium_dirs(root):
            executable = _find_chromium_executable_in_dir(chromium_dir)
            if executable:
                return executable

    return None


def _find_playwright_chromium_executable() -> Optional[Path]:
    if importlib.util.find_spec("playwright") is None:
        return None

    try:
        sync_playwright = importlib.import_module("playwright.sync_api").sync_playwright
    except ImportError:
        return None

    try:
        with sync_playwright() as playwright:
            executable_path = str(getattr(playwright.chromium, "executable_path", "") or "")
    except Exception:
        return None

    return _resolve_existing_executable(executable_path)


def _get_browser_launch_plan(
    browser_preference: str = "auto",
    chromium_executable_path: str = "",
) -> list[dict[str, str]]:
    preference = _normalize_browser_preference(browser_preference)
    chromium_candidate = _find_bundled_chromium_executable(chromium_executable_path)

    if preference == "edge":
        return [{"kind": "channel", "value": "msedge", "label": "Microsoft Edge"}]

    if preference == "chromium":
        plan: list[dict[str, str]] = []
        if chromium_candidate:
            plan.append(
                {
                    "kind": "executable",
                    "value": str(chromium_candidate),
                    "label": "Chromium 可执行文件",
                }
            )
        plan.append({"kind": "playwright", "value": "", "label": "Playwright Chromium"})
        return plan

    plan = [{"kind": "channel", "value": "msedge", "label": "Microsoft Edge"}]
    if chromium_candidate:
        plan.append(
            {
                "kind": "executable",
                "value": str(chromium_candidate),
                "label": "Chromium 可执行文件",
            }
        )
    plan.append({"kind": "playwright", "value": "", "label": "Playwright Chromium"})
    return plan


def describe_rpa_browser_environment(
    browser_preference: str = "auto",
    chromium_executable_path: str = "",
) -> dict[str, Any]:
    preference = _normalize_browser_preference(browser_preference)
    configured_chromium = _resolve_existing_executable(chromium_executable_path)
    edge_executable = _find_system_msedge_executable()
    chromium_executable = _find_bundled_chromium_executable(chromium_executable_path)
    playwright_chromium = _find_playwright_chromium_executable()

    effective_browser = {"value": "", "label": "", "path": ""}
    for item in _get_browser_launch_plan(
        browser_preference=preference,
        chromium_executable_path=chromium_executable_path,
    ):
        if item["kind"] == "channel" and edge_executable:
            effective_browser = {
                "value": "edge",
                "label": "Microsoft Edge",
                "path": str(edge_executable),
            }
            break
        if item["kind"] == "executable" and chromium_executable:
            effective_browser = {
                "value": "chromium",
                "label": "Chromium 可执行文件",
                "path": str(chromium_executable),
            }
            break
        if item["kind"] == "playwright" and playwright_chromium:
            effective_browser = {
                "value": "playwrightChromium",
                "label": "Playwright Chromium",
                "path": str(playwright_chromium),
            }
            break

    return {
        "playwrightInstalled": importlib.util.find_spec("playwright") is not None,
        "browserPreference": preference,
        "configuredChromiumPath": str(configured_chromium) if configured_chromium else "",
        "canLaunch": bool(effective_browser["value"]),
        "edge": {
            "available": bool(edge_executable),
            "path": str(edge_executable) if edge_executable else "",
        },
        "chromium": {
            "available": bool(chromium_executable),
            "path": str(chromium_executable) if chromium_executable else "",
            "configured": bool(configured_chromium),
        },
        "playwrightChromium": {
            "available": bool(playwright_chromium),
            "path": str(playwright_chromium) if playwright_chromium else "",
        },
        "effectiveBrowser": effective_browser,
    }


def _build_browser_context(browser, viewport, user_agent):
    vp_w, vp_h = viewport
    return browser.new_context(
        ignore_https_errors=True,
        locale="zh-CN",
        viewport={"width": vp_w, "height": vp_h},
        user_agent=user_agent,
        screen={"width": vp_w, "height": vp_h},
        color_scheme="light",
        timezone_id="Asia/Shanghai",
    )


def _launch_browser(
    p,
    browser_preference: str = "auto",
    chromium_executable_path: str = "",
):
    import random

    common_args = [
        "--headless=new",
        "--ignore-certificate-errors",
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-hang-monitor",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-first-run",
        "--password-store=basic",
        "--use-mock-keychain",
        "--disable-automation",
        "--excludeSwitches=enable-automation",
    ]

    viewport = random.choice(_VIEWPORTS)
    user_agent = random.choice(_USER_AGENTS)

    for item in _get_browser_launch_plan(
        browser_preference=browser_preference,
        chromium_executable_path=chromium_executable_path,
    ):
        try:
            if item["kind"] == "channel":
                browser = p.chromium.launch(
                    channel=item["value"],
                    headless=True,
                    args=common_args,
                )
                _log(f"[RPA] using browser channel: {item['value']}")
            elif item["kind"] == "executable":
                browser = p.chromium.launch(
                    executable_path=item["value"],
                    headless=True,
                    args=common_args,
                )
                _log(f"[RPA] using Chromium executable: {item['value']}")
            else:
                browser = p.chromium.launch(
                    headless=True,
                    args=common_args,
                )
                _log("[RPA] using Playwright Chromium resolution")

            return browser, _build_browser_context(browser, viewport, user_agent)
        except Exception as exc:
            if item["kind"] == "channel":
                _log(f"[RPA] browser channel unavailable: {item['value']} ({exc})")
            elif item["kind"] == "executable":
                _log(f"[RPA] Chromium executable unavailable: {item['value']} ({exc})")
            else:
                _log(f"[RPA] Playwright Chromium unavailable ({exc})")

    raise RuntimeError(
        "未找到可用浏览器。\n"
        "请在设置中检查浏览器环境，并确保 Microsoft Edge 或可用的 Chromium 运行时存在"
    )
