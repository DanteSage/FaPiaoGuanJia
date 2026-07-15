import importlib
import time
from typing import Any, Optional, Tuple

from ._common import _log
from ._browser_runtime import _launch_browser, _normalize_browser_preference
from ._rpa_component import activate_rpa_component
from ._stealth import _STEALTH_JS

Browser = Any
BrowserContext = Any
Page = Any

_browser_instance: Optional[Browser] = None
_browser_context: Optional[BrowserContext] = None
_browser_page: Optional[Page] = None
_last_use_time: float = 0
_playwright_instance = None
_browser_runtime_key: tuple[str, str] = ("auto", "")

BROWSER_IDLE_TIMEOUT = 300


def get_browser_session(
    browser_preference: str = "auto",
    chromium_executable_path: str = "",
) -> Tuple[Browser, BrowserContext, Page]:
    global _browser_instance
    global _browser_context
    global _browser_page
    global _last_use_time
    global _playwright_instance
    global _browser_runtime_key

    current_time = time.time()
    next_runtime_key = (
        _normalize_browser_preference(browser_preference),
        str(chromium_executable_path or "").strip(),
    )

    need_recreate = False
    if _browser_instance is None:
        need_recreate = True
    elif _browser_runtime_key != next_runtime_key:
        _log("[BrowserPool] browser runtime config changed, recreating browser")
        need_recreate = True
    elif current_time - _last_use_time > BROWSER_IDLE_TIMEOUT:
        _log("[BrowserPool] browser idle timeout, recreating browser")
        need_recreate = True
    else:
        try:
            if _browser_page:
                _browser_page.evaluate("1 + 1")
        except Exception:
            _log("[BrowserPool] browser instance is no longer healthy, recreating browser")
            need_recreate = True

    if need_recreate:
        close_browser_session()
        activate_rpa_component()
        sync_playwright = importlib.import_module("playwright.sync_api").sync_playwright

        _playwright_instance = sync_playwright().start()
        _browser_instance, _browser_context = _launch_browser(
            _playwright_instance,
            browser_preference=next_runtime_key[0],
            chromium_executable_path=next_runtime_key[1],
        )
        _browser_page = _browser_context.new_page()
        _browser_page.add_init_script(_STEALTH_JS)
        _browser_runtime_key = next_runtime_key
        _log("[BrowserPool] browser instance created")

    _last_use_time = current_time
    return _browser_instance, _browser_context, _browser_page


def reset_page(page: Page) -> None:
    try:
        page.evaluate(
            """
            () => {
                document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
            }
        """
        )
        page.evaluate(
            """
            () => {
                const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
                inputs.forEach((input) => {
                    input.value = '';
                });
            }
        """
        )
        _log("[BrowserPool] page reset")
    except Exception as e:
        _log(f"[BrowserPool] reset page failed: {e}")


def close_browser_session() -> None:
    global _browser_instance
    global _browser_context
    global _browser_page
    global _playwright_instance
    global _browser_runtime_key

    try:
        if _browser_page:
            _browser_page.close()
        if _browser_context:
            _browser_context.close()
        if _browser_instance:
            _browser_instance.close()
        if _playwright_instance:
            _playwright_instance.stop()
        _log("[BrowserPool] browser closed")
    except Exception as e:
        _log(f"[BrowserPool] close browser failed: {e}")
    finally:
        _browser_instance = None
        _browser_context = None
        _browser_page = None
        _playwright_instance = None
        _browser_runtime_key = ("auto", "")


def get_idle_time() -> float:
    if _browser_instance is None:
        return 0
    return time.time() - _last_use_time
