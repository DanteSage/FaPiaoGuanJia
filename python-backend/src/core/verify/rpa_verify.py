import base64
import importlib


import os

import random

import re

import time

from pathlib import Path

from typing import Any, Dict, Optional


from .captcha_solver import solve_captcha

from ._common import (
    TAX_VERIFY_URL,
    MAX_RETRY,
    PAGE_TIMEOUT,
    VERIFY_TOTAL_TIMEOUT_SEC,
    FAST_MODE,
    _CONFIG_DIR,
    _CONFIG_FILE,
    _SCREENSHOT_DIR,
    _SCREENSHOT_WITH_URL_DIR,
    _log,
    emit_rpa_progress,
    _COLOR_MAP,
    RPA_PAGE_BLOCK_PATTERNS,
    RPA_SCREENSHOT_DIALOG_SELECTORS,
    RPA_CAPTCHA_TRIGGER_SELECTOR,
    RPA_CAPTCHA_IMAGE_SELECTORS,
    RPA_CAPTCHA_CONTAINER_SELECTORS,
    RPA_CAPTCHA_INPUT_SELECTORS,
    RPA_VERIFY_BUTTON_SELECTORS,
)

from storage.config_migration import remove_json_config_candidates

from storage.protected_config import load_protected_json_config, save_protected_json_config

from storage.secret_fields import RPA_SECRET_FIELDS

from ._browser_runtime import (
    _normalize_browser_preference,
    describe_rpa_browser_environment,
    _launch_browser,
)
from ._rpa_component import activate_rpa_component, get_rpa_component_status

from ._human_sim import (
    _random_sleep,
    _human_type,
    _human_click,
    _smooth_mouse_move,
    _robust_input,
)

from ._parser import (
    _check_popup_error,
    _find_result_iframe,
    _parse_result_frame,
    _parse_result,
    ERROR_TYPE_RESULT_MISMATCH,
)


def _normalize_rpa_chromium_executable_path(chromium_executable_path: str) -> str:

    value = str(chromium_executable_path or "").strip()

    if not value:

        return ""

    candidate = Path(value).expanduser()

    if not candidate.exists() or not candidate.is_file():

        raise ValueError("Chrome 可执行文件不存在")

    return str(candidate.resolve())


def save_rpa_config(
    captcha_app_key: Optional[str] = None,
    browser_preference: Optional[str] = None,
    chromium_executable_path: Optional[str] = None,
) -> Dict[str, Any]:

    os.makedirs(_CONFIG_DIR, exist_ok=True)

    try:
        current = _load_rpa_config()

        next_browser_preference = (
            _normalize_browser_preference(browser_preference)
            if browser_preference is not None
            else _normalize_browser_preference(str(current.get("browserPreference", "auto")))
        )
        next_chromium_executable_path = (
            _normalize_rpa_chromium_executable_path(chromium_executable_path)
            if chromium_executable_path is not None
            else str(current.get("chromiumExecutablePath", "") or "")
        )

        config = {
            "captchaAppKey": (
                str(captcha_app_key or "").strip()
                if captcha_app_key is not None
                else str(current.get("captchaAppKey", "") or "")
            ),
            "browserPreference": next_browser_preference,
            "chromiumExecutablePath": next_chromium_executable_path,
        }

        save_protected_json_config(_CONFIG_FILE, config, RPA_SECRET_FIELDS)

        if (
            str(current.get("browserPreference", "auto")) != next_browser_preference
            or str(current.get("chromiumExecutablePath", "") or "") != next_chromium_executable_path
        ):
            try:
                from ._browser_pool import close_browser_session

                close_browser_session()
            except Exception:
                pass

        return {"success": True}

    except ValueError as e:

        _log_fail("save config", e)

        return {"success": False, "error": str(e)}

    except Exception as e:

        _log_fail("save config", e)

        return {"success": False, "error": "保存 RPA 配置失败，请稍后重试"}


def get_rpa_config() -> Dict[str, Any]:

    cfg = _load_rpa_config()

    app_key = cfg.get("captchaAppKey", "")
    browser_preference = _normalize_browser_preference(str(cfg.get("browserPreference", "auto")))
    chromium_executable_path = str(cfg.get("chromiumExecutablePath", "") or "")

    return {
        "configured": bool(app_key),
        "captchaAppKey": app_key[:8] + "****" if len(app_key) > 8 else app_key,
        "browserPreference": browser_preference,
        "chromiumExecutablePath": chromium_executable_path,
        "componentStatus": get_rpa_component_status(),
        "browserStatus": describe_rpa_browser_environment(
            browser_preference=browser_preference,
            chromium_executable_path=chromium_executable_path,
        ),
    }


def clear_rpa_config() -> bool:

    try:

        current = _load_rpa_config()
        if current:
            return bool(
                save_rpa_config(
                    captcha_app_key="",
                    browser_preference=None,
                    chromium_executable_path=None,
                )
                .get("success")
            )

        return remove_json_config_candidates(_CONFIG_FILE, include_current=True)

    except Exception as e:

        _log_fail("clear config", e)

        return False


def _load_rpa_config() -> Dict[str, str]:

    try:

        cfg = load_protected_json_config(
            _CONFIG_FILE,
            lambda payload: isinstance(payload, dict),
            RPA_SECRET_FIELDS,
        )

    except Exception as e:

        _log_fail("load config", e, "fallback to defaults")

        return {}

    return cfg if isinstance(cfg, dict) else {}


def _check_playwright() -> Optional[str]:
    component_status = get_rpa_component_status()
    activate_rpa_component()

    try:

        importlib.import_module("playwright")

    except ImportError:

        return (
            "RPA 引擎未安装。\n"
            f"{component_status['message']}。\n"
            "请安装可选的 RPA 组件后再使用浏览器验真。"
        )

    return None


def _get_playwright_sync_api() -> Any:
    activate_rpa_component()
    return importlib.import_module("playwright.sync_api")


def _log_skip(action: str, error: Exception, target: Optional[str] = None) -> None:

    if target:

        _log(f"[RPA] {action} skipped ({target}): {error}")

    else:

        _log(f"[RPA] {action} skipped: {error}")


def _log_fail(action: str, error: Exception, detail: Optional[str] = None) -> None:

    if detail:

        _log(f"[RPA] {action} failed ({detail}): {error}")

    else:

        _log(f"[RPA] {action} failed: {error}")


def _error_result(error: str, **extras: Any) -> Dict[str, Any]:

    result: Dict[str, Any] = {"success": False, "error": error}

    if extras:

        result.update(extras)

    return result


def _should_retry_after_failure(last_error: str, error_type: str) -> bool:

    return "验证码" in last_error or error_type == ERROR_TYPE_RESULT_MISMATCH


def _is_browser_missing_error(err_msg: str) -> bool:

    return "Executable doesn't exist" in err_msg or "browserType.launch" in err_msg


_RPA_BROWSER_MISSING_ERROR = (
    "\u672a\u627e\u5230\u53ef\u7528\u6d4f\u89c8\u5668\u3002\n"
    "\u8bf7\u5148\u5b89\u88c5 Microsoft Edge \u6216 Chrome"
)

_RPA_EXEC_EXCEPTION_PREFIX = "\u0052\u0050\u0041 \u6267\u884c\u5f02\u5e38: "

_RPA_VERIFY_TIMEOUT_ERROR = "\u67e5\u9a8c\u8d85\u65f6"

_RPA_VERIFY_TIMEOUT_RETRY_ERROR = "\u67e5\u9a8c\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5"


def _capture_dialog_bytes(page) -> Optional[bytes]:

    try:

        dialog_el = page.locator("dialog[open]")

        if dialog_el.count() > 0 and dialog_el.first.is_visible():

            return dialog_el.first.screenshot()

        for selector in RPA_SCREENSHOT_DIALOG_SELECTORS:

            el = page.locator(selector)

            if el.count() > 0 and el.first.is_visible():

                return el.first.screenshot()

        return page.screenshot()

    except Exception as e:

        _log(f"[RPA] 捕获截图字节失败: {e}")

        return None


def _compose_with_url_banner(image_bytes: bytes, page_url: str) -> Optional[bytes]:
    """在截图上方叠加仿真地址栏（白底 + 锁标 + URL 文本）。"""

    try:

        from PIL import Image, ImageDraw, ImageFont
        import io

        src = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        src_w, src_h = src.size

        bar_h = 48
        bar_bg = (245, 246, 248)
        bar_border = (220, 222, 226)
        url_box_bg = (255, 255, 255)
        url_box_border = (210, 212, 216)
        text_color = (32, 33, 36)
        lock_color = (52, 168, 83)

        canvas = Image.new("RGB", (src_w, src_h + bar_h), bar_bg)
        canvas.paste(src, (0, bar_h))

        draw = ImageDraw.Draw(canvas)

        draw.line([(0, bar_h - 1), (src_w, bar_h - 1)], fill=bar_border, width=1)

        margin_x = 14
        box_y0 = 8
        box_y1 = bar_h - 9
        box_x0 = margin_x
        box_x1 = src_w - margin_x

        draw.rounded_rectangle(
            [(box_x0, box_y0), (box_x1, box_y1)],
            radius=6,
            fill=url_box_bg,
            outline=url_box_border,
            width=1,
        )

        lock_x = box_x0 + 12
        lock_y = (box_y0 + box_y1) // 2
        draw.rounded_rectangle(
            [(lock_x, lock_y - 5), (lock_x + 10, lock_y + 5)],
            radius=2,
            fill=lock_color,
        )
        draw.arc(
            [(lock_x + 1, lock_y - 10), (lock_x + 9, lock_y - 2)],
            start=180,
            end=360,
            fill=lock_color,
            width=2,
        )

        font = None
        for candidate in (
            r"C:\Windows\Fonts\msyh.ttc",
            r"C:\Windows\Fonts\msyh.ttf",
            r"C:\Windows\Fonts\simsun.ttc",
            r"C:\Windows\Fonts\segoeui.ttf",
            "/System/Library/Fonts/PingFang.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ):
            try:
                font = ImageFont.truetype(candidate, 16)
                break
            except Exception:
                continue
        if font is None:
            font = ImageFont.load_default()

        text_x = lock_x + 22
        text_y = lock_y - 9
        max_text_w = box_x1 - text_x - 12
        display_url = page_url or TAX_VERIFY_URL
        if hasattr(draw, "textlength"):
            while display_url and draw.textlength(display_url, font=font) > max_text_w:
                display_url = display_url[:-1]
            if display_url != (page_url or TAX_VERIFY_URL):
                display_url = display_url[: max(0, len(display_url) - 1)] + "…"
        draw.text((text_x, text_y), display_url, fill=text_color, font=font)

        out = io.BytesIO()
        canvas.save(out, format="PNG", optimize=True)
        return out.getvalue()

    except Exception as e:

        _log(f"[RPA] 合成地址栏失败: {e}")

        return None


def _save_screenshot(page, fphm: str, success: bool, mode: str = "dialog") -> Optional[str]:

    try:

        date_str = time.strftime("%Y-%m-%d")

        base_dir = _SCREENSHOT_WITH_URL_DIR if mode == "with_url" else _SCREENSHOT_DIR

        screenshot_dir = os.path.join(base_dir, date_str)

        os.makedirs(screenshot_dir, exist_ok=True)

        status = "success" if success else "fail"

        ts = time.strftime("%H%M%S")

        fphm_short = fphm[-8:] if len(fphm) > 8 else fphm

        filename = f"{status}_{fphm_short}_{ts}.png"

        filepath = os.path.join(screenshot_dir, filename)

        if mode == "with_url":

            raw_bytes = _capture_dialog_bytes(page)

            if not raw_bytes:

                _log("[RPA] 截图保存失败: 未能捕获原始截图")

                return None

            try:
                page_url = page.url or TAX_VERIFY_URL
            except Exception:
                page_url = TAX_VERIFY_URL

            composed = _compose_with_url_banner(raw_bytes, page_url)

            final_bytes = composed if composed else raw_bytes

            with open(filepath, "wb") as f:
                f.write(final_bytes)

            _log(f"[RPA] 查验截图已保存 (with_url): {filepath}")

            return filepath

        dialog_el = page.locator("dialog[open]")

        if dialog_el.count() > 0 and dialog_el.first.is_visible():

            dialog_el.first.screenshot(path=filepath)

            _log(f"[RPA] 查验截图已保存 (dialog): {filepath}")

            return filepath

        for selector in RPA_SCREENSHOT_DIALOG_SELECTORS:

            el = page.locator(selector)

            if el.count() > 0 and el.first.is_visible():

                el.first.screenshot(path=filepath)

                _log(f"[RPA] 查验截图已保存 ({selector}): {filepath}")

                return filepath

        page.screenshot(path=filepath)

        _log(f"[RPA] 查验截图已保存 (可视区域): {filepath}")

        return filepath

    except Exception as e:

        _log(f"[RPA] 截图保存失败: {e}")

        return None


_RPA_BROWSER_SMOKE_TEST_KEY = "__FAPIAO_RPA_BROWSER_SMOKE_TEST__"


def _run_rpa_browser_smoke_test(
    browser_preference: str = "auto",
    chromium_executable_path: str = "",
) -> Dict[str, Any]:
    sync_playwright = _get_playwright_sync_api().sync_playwright

    browser_status = describe_rpa_browser_environment(
        browser_preference=browser_preference,
        chromium_executable_path=chromium_executable_path,
    )

    with sync_playwright() as playwright:

        browser, context = _launch_browser(
            playwright,
            browser_preference=browser_preference,
            chromium_executable_path=chromium_executable_path,
        )

        page = context.new_page()

        page.goto(
            "data:text/html,<html><head><title>RPA Smoke</title></head><body>ok</body></html>"
        )

        title = page.title()

        page.close()

        context.close()

        browser.close()

    return {
        "success": True,
        "pageTitle": title,
        "componentStatus": get_rpa_component_status(),
        "browserStatus": browser_status,
        "effectiveBrowser": browser_status.get("effectiveBrowser", {}),
    }


def test_rpa_browser(
    browser_preference: Optional[str] = None,
    chromium_executable_path: Optional[str] = None,
) -> Dict[str, Any]:

    cfg = _load_rpa_config()
    preference = (
        _normalize_browser_preference(browser_preference)
        if browser_preference is not None
        else _normalize_browser_preference(str(cfg.get("browserPreference", "auto")))
    )
    try:
        executable_path = (
            _normalize_rpa_chromium_executable_path(chromium_executable_path)
            if chromium_executable_path is not None
            else str(cfg.get("chromiumExecutablePath", "") or "")
        )
    except ValueError as e:
        return _error_result(
            str(e),
            componentStatus=get_rpa_component_status(),
        )

    pw_err = _check_playwright()

    if pw_err:

        return _error_result(
            pw_err,
            componentStatus=get_rpa_component_status(),
        )

    try:

        return _run_rpa_browser_smoke_test(
            browser_preference=preference,
            chromium_executable_path=executable_path,
        )

    except Exception as e:

        return _map_rpa_exception(e)


def rpa_verify_invoice(
    fpdm: str,
    fphm: str,
    kprq: str,
    check_code: str = "",
    amount: str = "",
    captcha_app_key: str = "",
    screenshot_mode: str = "dialog",
) -> Dict[str, Any]:

    cfg = _load_rpa_config()
    browser_preference = _normalize_browser_preference(str(cfg.get("browserPreference", "auto")))
    chromium_executable_path = str(cfg.get("chromiumExecutablePath", "") or "")

    if captcha_app_key == _RPA_BROWSER_SMOKE_TEST_KEY:

        return _run_rpa_browser_smoke_test(
            browser_preference=browser_preference,
            chromium_executable_path=chromium_executable_path,
        )

    if not fphm:

        return _error_result("发票号码不能为空")

    if not kprq:

        return _error_result("开票日期不能为空")

    if not captcha_app_key:

        captcha_app_key = cfg.get("captchaAppKey", "")

    if not captcha_app_key:

        return _error_result("未配置验证码识别 appKey，请先配置 RPA 验真", needConfig=True)

    pw_err = _check_playwright()

    if pw_err:

        return _error_result(
            pw_err,
            componentStatus=get_rpa_component_status(),
        )

    date_formatted = kprq

    if len(kprq) == 8 and kprq.isdigit():

        date_formatted = f"{kprq[:4]}-{kprq[4:6]}-{kprq[6:8]}"

    start_time = time.time()

    last_error = ""

    emit_rpa_progress("init", "准备查验环境")

    for attempt in range(1, MAX_RETRY + 1):

        if time.time() - start_time > VERIFY_TOTAL_TIMEOUT_SEC:

            _log(f"[RPA] 查验超时（{VERIFY_TOTAL_TIMEOUT_SEC}秒），停止重试")

            return _error_result(_RPA_VERIFY_TIMEOUT_ERROR)

        if attempt > 1:
            emit_rpa_progress("retry", f"重试查验（第 {attempt} 次）", attempt=attempt)

        result = _do_rpa_verify(
            fpdm=fpdm,
            fphm=fphm,
            kprq=date_formatted,
            check_code=check_code,
            amount=amount,
            captcha_app_key=captcha_app_key,
            browser_preference=browser_preference,
            chromium_executable_path=chromium_executable_path,
            attempt=attempt,
            screenshot_mode=screenshot_mode,
        )

        if result.get("success"):

            return result

        last_error = result.get("error", "未知错误")

        error_type = result.get("errorType", "")

        can_retry = _should_retry_after_failure(last_error=last_error, error_type=error_type)

        if can_retry and attempt < MAX_RETRY:

            _log(f"[RPA] 第 {attempt} 次尝试失败（{last_error}），重试...")

            continue

        break

    return _error_result(last_error)


def _map_rpa_exception(err: Exception) -> Dict[str, Any]:

    err_msg = str(err)

    if _is_browser_missing_error(err_msg):

        return _error_result(_RPA_BROWSER_MISSING_ERROR)

    return _error_result(f"{_RPA_EXEC_EXCEPTION_PREFIX}{err_msg}")


def _attach_screenshot_path(result: Dict[str, Any], page: Any, fphm: str, screenshot_mode: str = "dialog") -> Dict[str, Any]:

    screenshot_path = _save_screenshot(page, fphm, result.get("success", False), mode=screenshot_mode)

    if screenshot_path:

        result["screenshotPath"] = screenshot_path

    return result


def _handle_rpa_verify_exception(
    error: Exception, close_browser_session: Any, timeout: bool
) -> Dict[str, Any]:

    if timeout:

        _log(f"[RPA] timeout error: {error}")

        close_browser_session()

        return _error_result(_RPA_VERIFY_TIMEOUT_RETRY_ERROR)

    _log(f"[RPA] unknown error: {error}")

    close_browser_session()

    return _map_rpa_exception(error)


def _wait_for_browser_pool_rate_limit(get_idle_time: Any, attempt: int, sleep_fn: Any) -> None:

    emit_rpa_progress("browser_ready", "浏览器已就绪")

    if attempt != 1:

        return

    idle_time = get_idle_time()

    if idle_time >= 3.0:

        return

    wait_time = 3.0 - idle_time

    _log(f"[BrowserPool] wait {wait_time:.1f}s to avoid rate limit")

    emit_rpa_progress("rate_limit", f"节流冷却，等待 {wait_time:.1f} 秒")

    sleep_fn(wait_time)


def _reset_page_if_retry(attempt: int, page: Any, reset_page_fn: Any) -> None:

    if attempt > 1:

        reset_page_fn(page)


def _load_rpa_verify_runtime_deps() -> tuple[Any, Any, Any, Any, Any]:
    PwTimeout = _get_playwright_sync_api().TimeoutError

    from ._browser_pool import (
        get_browser_session,
        reset_page,
        close_browser_session,
        get_idle_time,
    )

    return PwTimeout, get_browser_session, reset_page, close_browser_session, get_idle_time


def _execute_rpa_flow_once(
    get_browser_session: Any,
    get_idle_time: Any,
    reset_page: Any,
    attempt: int,
    fpdm: str,
    fphm: str,
    kprq: str,
    check_code: str,
    amount: str,
    captcha_app_key: str,
    browser_preference: str,
    chromium_executable_path: str,
    screenshot_mode: str = "dialog",
) -> Dict[str, Any]:

    _, _, page = get_browser_session(
        browser_preference=browser_preference,
        chromium_executable_path=chromium_executable_path,
    )

    _wait_for_browser_pool_rate_limit(
        get_idle_time=get_idle_time,
        attempt=attempt,
        sleep_fn=time.sleep,
    )

    _reset_page_if_retry(attempt=attempt, page=page, reset_page_fn=reset_page)

    result = _rpa_flow(
        page,
        fpdm,
        fphm,
        kprq,
        check_code,
        amount,
        captcha_app_key,
        attempt,
    )

    return _attach_screenshot_path(result=result, page=page, fphm=fphm, screenshot_mode=screenshot_mode)


def _do_rpa_verify(
    fpdm: str,
    fphm: str,
    kprq: str,
    check_code: str,
    amount: str,
    captcha_app_key: str,
    browser_preference: str,
    chromium_executable_path: str,
    attempt: int,
    screenshot_mode: str = "dialog",
) -> Dict[str, Any]:

    PwTimeout, get_browser_session, reset_page, close_browser_session, get_idle_time = (
        _load_rpa_verify_runtime_deps()
    )

    try:

        return _execute_rpa_flow_once(
            get_browser_session=get_browser_session,
            get_idle_time=get_idle_time,
            reset_page=reset_page,
            attempt=attempt,
            fpdm=fpdm,
            fphm=fphm,
            kprq=kprq,
            check_code=check_code,
            amount=amount,
            captcha_app_key=captcha_app_key,
            browser_preference=browser_preference,
            chromium_executable_path=chromium_executable_path,
            screenshot_mode=screenshot_mode,
        )

    except PwTimeout as e:

        return _handle_rpa_verify_exception(
            error=e,
            close_browser_session=close_browser_session,
            timeout=True,
        )

    except Exception as e:

        return _handle_rpa_verify_exception(
            error=e,
            close_browser_session=close_browser_session,
            timeout=False,
        )


def _fill_date_picker(page, year: int, month: int, day: int) -> bool:

    try:

        page.evaluate("document.getElementById('popup_overlay')?.remove()")

        _human_click(page, "#kprq")

        _random_sleep(page, 400, 800)

        page.evaluate("document.getElementById('popup_overlay')?.remove()")

        dp_days = page.locator("div.datepicker-days")

        if dp_days.count() == 0:

            return False

        switcher = page.locator("div.datepicker-days th.datepicker-switch")

        if switcher.count() == 0:

            return False

        switcher.first.click(timeout=5000, force=True)

        _random_sleep(page, 200, 500)

        switcher = page.locator("div.datepicker-months th.datepicker-switch")

        if switcher.count() == 0:

            return False

        switcher.first.click(timeout=5000, force=True)

        _random_sleep(page, 200, 500)

        year_str = str(year)

        year_spans = page.locator("div.datepicker-years span.year")

        year_found = False

        for i in range(year_spans.count()):

            if year_spans.nth(i).inner_text().strip() == year_str:

                year_spans.nth(i).click(timeout=5000, force=True)

                year_found = True

                break

        if not year_found:

            return False

        _random_sleep(page, 200, 500)

        month_spans = page.locator("div.datepicker-months span.month")

        if month_spans.count() < month:

            return False

        month_spans.nth(month - 1).click(timeout=5000, force=True)

        _random_sleep(page, 200, 500)

        day_str = str(day)

        day_cells = page.locator("div.datepicker-days td.day:not(.old):not(.new)")

        for i in range(day_cells.count()):

            if day_cells.nth(i).inner_text().strip() == day_str:

                day_cells.nth(i).click(timeout=5000, force=True)

                return True

        return False

    except Exception as e:

        _log(f"[RPA] datepicker 选择失败: {e}")

        return False


def _rpa_flow(
    page,
    fpdm: str,
    fphm: str,
    kprq: str,
    check_code: str,
    amount: str,
    captcha_app_key: str,
    attempt: int,
) -> Dict[str, Any]:

    emit_rpa_progress("navigate", "打开税务平台查验页")

    page.goto(TAX_VERIFY_URL, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)

    try:

        page.evaluate(
            """

            () => {

                const overlay = document.getElementById('popup_overlay');

                if (overlay) overlay.remove();

            }

        """
        )

    except Exception as e:

        _log_skip("overlay cleanup", e)

    if FAST_MODE:

        _random_sleep(page, 500, 800)

    else:

        _random_sleep(page, 2500, 4500)

        _smooth_mouse_move(page, random.uniform(300, 800), random.uniform(200, 500))

        _random_sleep(page, 500, 1200)

    page_check = _check_page_error(page)

    if page_check:

        return page_check

    emit_rpa_progress("fill_form", "填写发票信息")

    _fill_invoice_fields(page, fpdm, fphm, kprq, check_code, amount)

    _random_sleep(page, 500, 1200)

    emit_rpa_progress("captcha", "获取并识别验证码")

    captcha_result = _get_and_solve_captcha(page, captcha_app_key)

    if not captcha_result.get("success"):

        return captcha_result

    captcha_text = captcha_result["text"]

    _fill_captcha(page, captcha_text)

    _random_sleep(page, 300, 800)

    emit_rpa_progress("submit", "提交查验请求")

    return _click_verify_and_parse(page, expected_fphm=fphm)


def _check_page_error(page) -> Optional[Dict[str, Any]]:

    try:

        body_text = page.inner_text("body")

    except Exception as e:

        _log_fail("read page body", e)

        return _error_result("无法读取页面内容，请检查网络")

    block_patterns = RPA_PAGE_BLOCK_PATTERNS

    for pattern, msg in block_patterns:

        if re.search(pattern, body_text):

            return _error_result(msg)

    try:

        has_form = page.locator("#fphm, #fpdm, [id*='fphm']").count() > 0

        if not has_form and len(body_text.strip()) < 100:

            return _error_result("查验页面未正确加载，请检查网络连接")

    except Exception as e:

        _log_skip("page form presence check", e)

    return None


def _fill_invoice_fields(
    page, fpdm: str, fphm: str, kprq: str, check_code: str, amount: str
) -> None:

    if fpdm:

        _robust_input(page, "#fpdm", fpdm)

        _random_sleep(page, 300, 700)

    _robust_input(page, "#fphm", fphm)

    _random_sleep(page, 300, 700)

    year, month, day = _parse_date(kprq)

    date_filled = False

    if year and month and day:

        date_filled = _fill_date_picker(page, year, month, day)

        if date_filled:

            _log(f"[RPA] datepicker 日期选择成功: {year}-{month:02d}-{day:02d}")

    if not date_filled:

        kprq_raw = kprq.replace("-", "")

        _log(f"[RPA] datepicker 失败, fallback 文本输入: {kprq_raw}")

        kprq_input = page.locator("#kprq")

        if kprq_input.count() > 0:

            try:

                _human_click(page, "#kprq")

                _random_sleep(page, 100, 300)

                kprq_input.first.fill("")

                kprq_input.first.type(kprq_raw, delay=random.randint(30, 80))

            except Exception as e:

                _log(f"[RPA] kprq typing fallback triggered: {e}")

                kprq_input.first.fill(kprq_raw)

    _random_sleep(page, 300, 700)

    is_full_electronic = len(fphm) == 20 and fphm.isdigit()

    if is_full_electronic:

        if amount:

            _robust_input(page, "#kjje", amount)

            _random_sleep(page, 200, 500)

    else:

        if check_code:

            _robust_input(page, "#kjje", check_code)

            _random_sleep(page, 200, 500)

        elif amount:

            _robust_input(page, "#kjje", amount)

            _random_sleep(page, 200, 500)


def _parse_date(kprq: str):

    try:

        if "-" in kprq and len(kprq) == 10:

            parts = kprq.split("-")

            return int(parts[0]), int(parts[1]), int(parts[2])

        elif len(kprq) == 8 and kprq.isdigit():

            return int(kprq[:4]), int(kprq[4:6]), int(kprq[6:8])

    except (ValueError, IndexError) as e:

        _log_skip("parse date", e, kprq)

    return None, None, None


def _click_captcha_trigger_if_present(page: Any) -> None:
    PwTimeout = _get_playwright_sync_api().TimeoutError

    yzm_btn = page.locator(RPA_CAPTCHA_TRIGGER_SELECTOR)

    try:

        if yzm_btn.count() > 0:

            yzm_btn.first.click()

            _random_sleep(page, 1500, 2500)

    except PwTimeout:

        _log("[RPA] captcha trigger click timeout, continue")


def _capture_captcha_by_screenshot_selectors(
    page: Any,
    selectors: list[str],
    method_prefix: str,
    log_action: str,
) -> tuple[Optional[str], str]:

    for selector in selectors:

        try:

            element = page.locator(selector)

            if element.count() > 0:

                screenshot = element.first.screenshot()

                captcha_b64 = base64.b64encode(screenshot).decode("utf-8")

                return captcha_b64, f"{method_prefix}({selector})"

        except Exception as e:

            _log_skip(log_action, e, selector)

            continue

    return None, ""


def _capture_captcha_from_data_uri(page: Any) -> Optional[str]:

    try:

        return page.evaluate(
            """

            () => {

                const container = document.querySelector('#yzm_img');

                if (!container) return null;

                const img = container.querySelector('img') || container;

                if (img.tagName !== 'IMG') return null;

                if (img.src && img.src.startsWith('data:image')) {

                    return img.src.split(',')[1] || null;

                }

                return null;

            }

        """
        )

    except Exception as e:

        _log_fail("captcha img src extraction", e)

        return None


def _extract_captcha_color_hint(page: Any) -> str:

    color_hint = "\u5168\u90e8"

    try:

        font_el = page.locator("#yzminfo > font")

        if font_el.count() > 0:

            color_text = font_el.first.inner_text().strip()

            if color_text:

                color_hint = _COLOR_MAP.get(color_text, "\u5168\u90e8")

    except Exception as e:

        _log_fail("captcha color hint font read", e)

    if color_hint == "\u5168\u90e8":

        try:

            page_text = page.inner_text("body")

            color_match = re.search(
                "\u8bf7[\u8f93\u5165\u70b9\u51fb\u9009\u62e9]*(\\S{1,2})\u8272", page_text
            )

            if color_match:

                color_key = color_match.group(1)

                if not color_key.endswith("\u8272"):

                    color_key = color_key + "\u8272"

                color_hint = _COLOR_MAP.get(color_key, "\u5168\u90e8")

        except Exception as e:

            _log_fail("captcha color hint regex fallback", e)

    return color_hint


def _solve_captcha_with_retry(
    captcha_app_key: str, captcha_b64: str, color_hint: str
) -> Dict[str, Any]:

    for api_try in range(1, 3):

        _log(f"[RPA] calling captcha solve API (attempt {api_try})...")

        result = solve_captcha(captcha_app_key, captcha_b64, extra=color_hint)

        if result.get("success"):

            _log(f"[RPA] captcha solved: '{result.get('text')}'")

            return result

        _log(f"[RPA] captcha solve failed: {result.get('error')} (code={result.get('code')})")

        if result.get("needConfig"):

            break

        code = result.get("code", -1)

        if api_try < 2 and (code < 0 or code >= 90000):

            time.sleep(random.uniform(1.0, 2.5))

            continue

        break

    return result


def _should_refresh_captcha_after_solve_failure(result: Dict[str, Any]) -> bool:

    code = int(result.get("code", -1) or -1)

    if code == 9006:

        return True

    error_message = str(result.get("error", "") or "")

    return "获取内容失败" in error_message or "识别结果为空" in error_message


def _get_and_solve_captcha(page, captcha_app_key: str) -> Dict[str, Any]:

    last_result: Dict[str, Any] | None = None

    for captcha_attempt in range(1, 3):

        _click_captcha_trigger_if_present(page)

        captcha_b64 = None

        captcha_method = ""

        color_hint = "全部"

        captcha_b64, captcha_method = _capture_captcha_by_screenshot_selectors(
            page=page,
            selectors=RPA_CAPTCHA_IMAGE_SELECTORS,
            method_prefix="screenshot",
            log_action="captcha image selector",
        )

        if not captcha_b64:

            captcha_b64, captcha_method = _capture_captcha_by_screenshot_selectors(
                page=page,
                selectors=RPA_CAPTCHA_CONTAINER_SELECTORS,
                method_prefix="container_screenshot",
                log_action="captcha container selector",
            )

        if not captcha_b64:

            captcha_b64 = _capture_captcha_from_data_uri(page)

            if captcha_b64:

                captcha_method = "img_src_data_uri"

        if not captcha_b64:

            return _error_result("无法获取验证码图片，请检查网络或稍后重试")

        color_hint = _extract_captcha_color_hint(page)

        _log(
            f"[RPA] 验证码图片已获取 (方式: {captcha_method}, base64 长度: {len(captcha_b64)}), 颜色提示: {color_hint}"
        )

        result = _solve_captcha_with_retry(
            captcha_app_key=captcha_app_key,
            captcha_b64=captcha_b64,
            color_hint=color_hint,
        )

        if result.get("success") or result.get("needConfig"):

            return result

        last_result = result

        if captcha_attempt >= 2 or not _should_refresh_captcha_after_solve_failure(result):

            return result

        _log(
            f"[RPA] captcha solve returned retryable error, refresh captcha and retry (attempt {captcha_attempt + 1})"
        )
        time.sleep(random.uniform(0.6, 1.2))

    return last_result or _error_result("验证码识别失败")


def _try_fill_captcha_with_selector(page: Any, selector: str, captcha_text: str) -> bool:

    try:

        input_el = page.locator(selector)

        if input_el.count() <= 0:

            return False

        _log(f"[RPA] found captcha input: {selector}")

        _human_type(page, selector, captcha_text)

        try:

            actual = input_el.first.input_value()

            _log(f"[RPA] captcha input value: '{actual}'")

        except Exception as e:

            _log_skip("captcha input value read", e)

        return True

    except Exception as e:

        _log_skip("captcha input selector", e, selector)

        return False


def _fill_captcha(page, captcha_text: str) -> None:

    yzm_input_selectors = RPA_CAPTCHA_INPUT_SELECTORS

    for selector in yzm_input_selectors:

        if _try_fill_captcha_with_selector(page=page, selector=selector, captcha_text=captcha_text):

            return

    _log("[RPA] warning: captcha input not found")


def _wait_popup_domcontentloaded_if_needed(popup_page: Any, wait_domcontentloaded: bool) -> None:

    if not wait_domcontentloaded:

        return

    try:

        popup_page.wait_for_load_state("domcontentloaded", timeout=10000)

    except Exception as e:

        _log_skip("popup domcontentloaded wait", e)


def _close_popup_page_safely(popup_page: Any) -> None:

    try:

        popup_page.close()

    except Exception as e:

        _log_skip("popup close", e)


def _parse_popup_page_result(
    popup_page, expected_fphm: str, wait_domcontentloaded: bool
) -> Dict[str, Any]:

    _wait_popup_domcontentloaded_if_needed(
        popup_page=popup_page,
        wait_domcontentloaded=wait_domcontentloaded,
    )

    result = _parse_result(popup_page, expected_fphm=expected_fphm)

    _close_popup_page_safely(popup_page)

    return result


def _prepare_verify_click_context(page: Any) -> None:

    try:

        kjje_el = page.locator("#kjje")

        if kjje_el.count() > 0:

            kjje_el.first.click()

            _random_sleep(page, 200, 500)

    except Exception as e:

        _log_skip("pre-verify trigger click", e)

    try:

        page.evaluate(
            """

            () => {

                const fields = ['#fpdm', '#fphm', '#kprq', '#kjje', '#yzm'];

                for (const sel of fields) {

                    const el = document.querySelector(sel);

                    if (el && el.value) {

                        el.dispatchEvent(new Event('input', {bubbles: true}));

                        el.dispatchEvent(new Event('change', {bubbles: true}));

                        el.dispatchEvent(new Event('blur', {bubbles: true}));

                    }

                }

                if (typeof checkValue === 'function') checkValue();

                if (typeof check === 'function') check();

            }

            """
        )

        _random_sleep(page, 300, 600)

    except Exception as e:

        _log_fail("trigger form events", e)


def _log_verify_button_display_info(page: Any) -> None:

    try:

        display_info = page.evaluate(
            """

            () => {

                const checkfp = document.querySelector('#checkfp');

                const uncheckfp = document.querySelector('#uncheckfp');

                const info = {};

                if (checkfp) info.checkfpDisplay = getComputedStyle(checkfp).display;

                if (uncheckfp) info.uncheckfpDisplay = getComputedStyle(uncheckfp).display;

                return info;

            }

            """
        )

        if isinstance(display_info, dict):

            _log(f"[RPA] verify button display state: {display_info}")

    except Exception as e:

        _log_skip("verify button display probe", e)


def _find_verify_button_selector(page: Any) -> Optional[str]:

    for sel in RPA_VERIFY_BUTTON_SELECTORS:

        try:

            btn = page.locator(sel)

            if btn.count() > 0 and btn.first.is_visible():

                return sel

        except Exception as e:

            _log_skip("verify button selector", e, sel)

            continue

    return None


def _parse_result_frame_if_present(
    page: Any,
    expected_fphm: str,
    found_log: str,
) -> Optional[Dict[str, Any]]:

    result_frame = _find_result_iframe(page)

    if not result_frame:

        return None

    _log(found_log)

    return _parse_result_frame(result_frame, expected_fphm=expected_fphm)


def _parse_popup_result_if_present(
    page: Any,
    pages_before: int,
    expected_fphm: str,
    popup_log_prefix: str,
    wait_domcontentloaded: bool,
) -> Optional[Dict[str, Any]]:

    all_pages = page.context.pages

    if len(all_pages) <= pages_before:

        return None

    popup_page = all_pages[-1]

    _log(f"[RPA] {popup_log_prefix}: {popup_page.url}")

    return _parse_popup_page_result(
        popup_page,
        expected_fphm=expected_fphm,
        wait_domcontentloaded=wait_domcontentloaded,
    )


def _detect_result_immediate(
    page: Any,
    expected_fphm: str,
    pages_before: int,
    url_before: str,
) -> Optional[Dict[str, Any]]:

    popup_err = _check_popup_error(page)

    if popup_err:

        return popup_err

    frame_result = _parse_result_frame_if_present(
        page=page,
        expected_fphm=expected_fphm,
        found_log="[RPA] immediate result found in dialog iframe",
    )

    if frame_result:

        return frame_result

    popup_result = _parse_popup_result_if_present(
        page=page,
        pages_before=pages_before,
        expected_fphm=expected_fphm,
        popup_log_prefix="detected popup window",
        wait_domcontentloaded=True,
    )

    if popup_result:

        return popup_result

    current_url = page.url

    if current_url != url_before:

        _log(f"[RPA] page navigated: {url_before} -> {current_url}")

        return _parse_result(page, expected_fphm=expected_fphm)

    return None


def _detect_result_after_wait(
    page: Any,
    expected_fphm: str,
    pages_before: int,
    poll_attempts: int = 6,
    poll_interval_ms: int = 800,
) -> Optional[Dict[str, Any]]:

    for attempt in range(poll_attempts):

        page.wait_for_timeout(poll_interval_ms)

        if attempt > 0:

            _log(f"[RPA] result polling attempt {attempt + 1}/{poll_attempts}")

            emit_rpa_progress(
                "polling",
                f"等待查验结果（{attempt + 1}/{poll_attempts}）",
                pollAttempt=attempt + 1,
                pollTotal=poll_attempts,
            )
        elif attempt == 0:
            emit_rpa_progress("wait_result", "等待查验结果")

        frame_result = _parse_result_frame_if_present(
            page=page,
            expected_fphm=expected_fphm,
            found_log="[RPA] delayed result found in dialog iframe",
        )

        if frame_result:

            return frame_result

        popup_result = _parse_popup_result_if_present(
            page=page,
            pages_before=pages_before,
            expected_fphm=expected_fphm,
            popup_log_prefix="delayed popup window detected",
            wait_domcontentloaded=False,
        )

        if popup_result:

            return popup_result

        popup_err = _check_popup_error(page)

        if popup_err:

            return popup_err

    return None


def _capture_verify_click_state(page: Any, btn_selector: str) -> tuple[int, str]:

    pages_before = len(page.context.pages)

    url_before = page.url

    _log(f"[RPA] click verify button: {btn_selector} (pages_before={pages_before})")

    return pages_before, url_before


def _click_verify_button_once(page: Any, btn_selector: str) -> None:

    page.evaluate("document.getElementById('popup_overlay')?.remove()")

    page.locator(btn_selector).first.click(timeout=5000, force=True)


def _wait_after_verify_click(page: Any) -> None:

    if FAST_MODE:

        page.wait_for_timeout(random.randint(1500, 2200))

    else:

        page.wait_for_timeout(random.randint(3000, 5000))


def _click_verify_and_parse(page, expected_fphm: str = "") -> Dict[str, Any]:

    _prepare_verify_click_context(page)

    _log_verify_button_display_info(page)

    btn_selector = _find_verify_button_selector(page)

    if not btn_selector:

        _log("[RPA] 警告: 未找到可点击的查验按钮")

        return _error_result("未找到查验按钮")

    pages_before, url_before = _capture_verify_click_state(
        page=page,
        btn_selector=btn_selector,
    )

    _click_verify_button_once(page=page, btn_selector=btn_selector)

    _wait_after_verify_click(page)

    detection_result = _detect_result_immediate(
        page=page,
        expected_fphm=expected_fphm,
        pages_before=pages_before,
        url_before=url_before,
    )

    if detection_result:

        return detection_result

    _log("[RPA] result not detected immediately, polling for result...")

    detection_result = _detect_result_after_wait(
        page=page,
        expected_fphm=expected_fphm,
        pages_before=pages_before,
    )

    if detection_result:

        return detection_result

    _log(f"[RPA] 未检测到查验结果，URL={page.url}")

    return _error_result("查验已提交，但未检测到结果页面，请重试！")
