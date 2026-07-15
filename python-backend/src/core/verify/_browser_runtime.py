import os
import random
import shutil
import sys
from pathlib import Path
from typing import Any, Optional

from ._common import _log
from ._rpa_component import get_rpa_component_status
from ._stealth import _USER_AGENTS, _VIEWPORTS

_VALID_BROWSER_PREFERENCES = ("auto", "edge", "chrome")


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


def _find_system_chrome_executable() -> Optional[Path]:
    candidates: list[Path] = []

    for candidate in (
        shutil.which("chrome"),
        shutil.which("chrome.exe"),
        shutil.which("google-chrome"),
        shutil.which("google-chrome-stable"),
    ):
        if candidate:
            candidates.append(Path(candidate))

    if sys.platform == "win32":
        for env_key in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
            base_dir = (os.environ.get(env_key) or "").strip()
            if not base_dir:
                continue
            candidates.append(Path(base_dir) / "Google" / "Chrome" / "Application" / "chrome.exe")
    elif sys.platform == "darwin":
        candidates.append(Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"))
    else:
        candidates.extend(
            [
                Path("/usr/bin/google-chrome"),
                Path("/usr/bin/google-chrome-stable"),
                Path("/usr/bin/chromium"),
                Path("/snap/bin/chromium"),
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


def _find_available_chrome_executable(configured_executable_path: str = "") -> Optional[Path]:
    configured_executable = _resolve_existing_executable(configured_executable_path)
    if configured_executable:
        return configured_executable

    explicit_executable = _resolve_existing_executable(
        os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "")
    )
    if explicit_executable:
        return explicit_executable

    return _find_system_chrome_executable()


def _get_browser_launch_plan(
    browser_preference: str = "auto",
    chromium_executable_path: str = "",
) -> list[dict[str, str]]:
    preference = _normalize_browser_preference(browser_preference)
    chrome_candidate = _find_available_chrome_executable(chromium_executable_path)

    if preference == "edge":
        return [{"kind": "channel", "value": "msedge", "label": "Microsoft Edge"}]

    if preference == "chrome":
        if chrome_candidate:
            return [{"kind": "executable", "value": str(chrome_candidate), "label": "Chrome"}]
        return []

    plan = [{"kind": "channel", "value": "msedge", "label": "Microsoft Edge"}]
    if chrome_candidate:
        plan.append({"kind": "executable", "value": str(chrome_candidate), "label": "Chrome"})
    return plan


def describe_rpa_browser_environment(
    browser_preference: str = "auto",
    chromium_executable_path: str = "",
) -> dict[str, Any]:
    component_status = get_rpa_component_status()
    preference = _normalize_browser_preference(browser_preference)
    configured_chrome = _resolve_existing_executable(chromium_executable_path)
    edge_executable = _find_system_msedge_executable()
    chrome_executable = _find_available_chrome_executable(chromium_executable_path)

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
        if item["kind"] == "executable" and chrome_executable:
            effective_browser = {
                "value": "chrome",
                "label": "Chrome",
                "path": str(chrome_executable),
            }
            break

    return {
        "playwrightInstalled": bool(component_status["installed"]),
        "browserPreference": preference,
        "configuredChromePath": str(configured_chrome) if configured_chrome else "",
        "configuredChromiumPath": str(configured_chrome) if configured_chrome else "",
        "canLaunch": bool(effective_browser["value"]),
        "edge": {
            "available": bool(edge_executable),
            "path": str(edge_executable) if edge_executable else "",
        },
        "chrome": {
            "available": bool(chrome_executable),
            "path": str(chrome_executable) if chrome_executable else "",
            "configured": bool(configured_chrome),
        },
        "chromium": {
            "available": bool(chrome_executable),
            "path": str(chrome_executable) if chrome_executable else "",
            "configured": bool(configured_chrome),
        },
        "playwrightChromium": {
            "available": False,
            "path": "",
        },
        "componentStatus": component_status,
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
            else:
                browser = p.chromium.launch(
                    executable_path=item["value"],
                    headless=True,
                    args=common_args,
                )
                _log(f"[RPA] using browser executable: {item['value']}")

            return browser, _build_browser_context(browser, viewport, user_agent)
        except Exception as exc:
            if item["kind"] == "channel":
                _log(f"[RPA] browser channel unavailable: {item['value']} ({exc})")
            else:
                _log(f"[RPA] browser executable unavailable: {item['value']} ({exc})")

    raise RuntimeError(
        "未找到可用浏览器。\n" "请在设置中检查浏览器环境，并确保 Microsoft Edge 或 Chrome 存在"
    )
