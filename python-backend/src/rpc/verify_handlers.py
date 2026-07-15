from __future__ import annotations

from typing import Any, Dict

from rpc.dispatch import register
from rpc.response import fail, ok


@register("verify_invoice")
def handle_verify_invoice(params: Dict[str, Any]) -> Any:
    from core.verify import verify_invoice

    fpdm = str(params.get("fpdm", ""))
    fphm = str(params.get("fphm", ""))
    kprq = str(params.get("kprq", ""))
    check_code = params.get("checkCode", "") or ""
    amount = params.get("amount", "") or ""
    result = verify_invoice(fpdm, fphm, kprq, str(check_code), str(amount))
    return result


@register("verify_invoice_by_file")
def handle_verify_invoice_by_file(params: Dict[str, Any]) -> Any:
    from core.verify import verify_invoice_by_file

    file_path = str(params.get("filePath", ""))
    result = verify_invoice_by_file(file_path)
    return result


@register("set_verify_config")
def handle_set_verify_config(params: Dict[str, Any]) -> Any:
    from core.verify import save_config

    auth_type = str(params.get("authType", "direct"))
    app_key = str(params.get("appKey", ""))
    app_secret = str(params.get("appSecret", ""))
    app_code = str(params.get("appCode", ""))
    saved = save_config(app_key=app_key, app_secret=app_secret, auth_type=auth_type, app_code=app_code)
    if not saved:
        return fail("保存 API 配置失败")
    return ok()


@register("get_verify_config")
def handle_get_verify_config(params: Dict[str, Any]) -> Any:
    from core.verify import get_config_status

    return ok(**get_config_status())


@register("clear_verify_config")
def handle_clear_verify_config(params: Dict[str, Any]) -> Any:
    from core.verify import clear_config

    ok_result = clear_config()
    if not ok_result:
        return fail("清除验真配置失败")
    return ok()


@register("rpa_verify_invoice")
def handle_rpa_verify_invoice(params: Dict[str, Any]) -> Any:
    from core.verify import rpa_verify_invoice

    fpdm = str(params.get("fpdm", ""))
    fphm = str(params.get("fphm", ""))
    kprq = str(params.get("kprq", ""))
    check_code = params.get("checkCode", "") or ""
    amount = params.get("amount", "") or ""
    captcha_app_key = params.get("captchaAppKey", "") or ""
    screenshot_mode = str(params.get("screenshotMode", "dialog") or "dialog")
    if screenshot_mode not in ("dialog", "with_url"):
        screenshot_mode = "dialog"
    result = rpa_verify_invoice(
        fpdm=fpdm,
        fphm=fphm,
        kprq=kprq,
        check_code=str(check_code),
        amount=str(amount),
        captcha_app_key=captcha_app_key,
        screenshot_mode=screenshot_mode,
    )
    return result


@register("set_rpa_config")
def handle_set_rpa_config(params: Dict[str, Any]) -> Any:
    from core.verify import save_rpa_config

    saved = save_rpa_config(
        captcha_app_key=params.get("captchaAppKey"),
        browser_preference=params.get("browserPreference"),
        chromium_executable_path=params.get("chromiumExecutablePath"),
    )
    return saved


@register("get_rpa_config")
def handle_get_rpa_config(params: Dict[str, Any]) -> Any:
    from core.verify import get_rpa_config

    return ok(**get_rpa_config())


@register("clear_rpa_config")
def handle_clear_rpa_config(params: Dict[str, Any]) -> Any:
    from core.verify import clear_rpa_config

    ok_result = clear_rpa_config()
    if not ok_result:
        return fail("清除 RPA 配置失败")
    return ok()


@register("test_rpa_browser")
def handle_test_rpa_browser(params: Dict[str, Any]) -> Any:
    from core.verify import test_rpa_browser

    result = test_rpa_browser(
        browser_preference=params.get("browserPreference"),
        chromium_executable_path=params.get("chromiumExecutablePath"),
    )
    return result
