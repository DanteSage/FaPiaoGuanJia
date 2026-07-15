import base64

import hashlib

import hmac

import json

import os

import sys

import time

import uuid
from pathlib import Path

from typing import Any, Dict, Optional

from urllib import error, parse, request


_src_dir = Path(__file__).resolve().parents[2]

if str(_src_dir) not in sys.path:

    sys.path.insert(0, str(_src_dir))

from storage.paths import get_api_config_path, get_config_dir

from storage.config_migration import remove_json_config_candidates

from storage.protected_config import load_protected_json_config, save_protected_json_config


from storage.secret_fields import API_SECRET_FIELDS, API_DEBUG_SENSITIVE_FIELDS

_CONFIG_DIR = get_config_dir()

_CONFIG_FILE = get_api_config_path()


API_BASE_DIRECT = "https://open.cs.zbj.com"

API_BASE_ALIYUN = "https://fapiao.market.alicloudapi.com"

_DEBUG_API_ENABLED = str(os.environ.get("FAPIAO_API_DEBUG", "")).strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


_HTTP_ERROR_MESSAGES = {
    400: "请求参数错误，请检查发票信息是否填写正确",
    401: "认证失败，请检查 API 配置是否正确",
    403: "没有访问权限，请检查 API 配置或套餐是否支持此功能",
    404: "接口不存在，当前 API 套餐可能不支持此查验方式",
    429: "请求过于频繁，请稍后再试",
    500: "服务器内部错误，请稍后再试",
    502: "服务暂时不可用，请稍后再试",
    503: "服务维护中，请稍后再试",
}

def _mask_middle(value: Any, prefix: int = 3, suffix: int = 2) -> str:

    text = str(value or "")

    if not text:

        return ""

    if len(text) <= prefix + suffix:

        return "*" * len(text)

    masked_length = max(4, min(12, len(text) - prefix - suffix))

    return f"{text[:prefix]}{'*' * masked_length}{text[-suffix:]}"


def _sanitize_debug_payload(payload: Any, field_name: str = "") -> Any:

    normalized_field_name = str(field_name or "").strip().lower()

    if isinstance(payload, dict):

        return {
            key: _sanitize_debug_payload(value, str(key))
            for key, value in payload.items()
        }

    if isinstance(payload, list):

        return [_sanitize_debug_payload(item, field_name) for item in payload]

    if normalized_field_name in API_DEBUG_SENSITIVE_FIELDS:

        return _mask_middle(payload)

    return payload


def _format_debug_request_body(auth_type: str, body: bytes) -> str:

    body_text = body.decode("utf-8", errors="replace")

    try:

        if auth_type == "aliyun":

            payload = dict(parse.parse_qsl(body_text, keep_blank_values=True))

        else:

            payload = json.loads(body_text)

    except Exception:

        return _mask_middle(body_text, prefix=24, suffix=12)

    return json.dumps(_sanitize_debug_payload(payload), ensure_ascii=False)


def _format_debug_response_body(body_text: str) -> str:

    try:

        payload = json.loads(body_text)

    except Exception:

        return _mask_middle(body_text, prefix=24, suffix=12)

    return json.dumps(_sanitize_debug_payload(payload), ensure_ascii=False)


def _debug_log(label: str, payload: str) -> None:
    if not _DEBUG_API_ENABLED:
        return
    try:
        from utils.logger import get_logger

        get_logger("verify_api").debug("%s %s", label, payload)
    except Exception:
        pass


def _has_saved_config(cfg: Dict[str, Any]) -> bool:

    auth_type = str(cfg.get("auth_type", "direct") or "direct").strip().lower()

    if auth_type == "aliyun":

        return bool(str(cfg.get("app_code", "")).strip())

    return bool(str(cfg.get("app_key", "")).strip() and str(cfg.get("app_secret", "")).strip())


def _load_config() -> Dict[str, str]:

    try:

        cfg = load_protected_json_config(_CONFIG_FILE, _has_saved_config, API_SECRET_FIELDS)

    except Exception:

        return {}

    return cfg if isinstance(cfg, dict) else {}


def save_config(
    app_key: str = "", app_secret: str = "", auth_type: str = "direct", app_code: str = ""
) -> bool:

    os.makedirs(_CONFIG_DIR, exist_ok=True)

    config = {
        "auth_type": auth_type,
        "app_key": app_key,
        "app_secret": app_secret,
        "app_code": app_code,
    }

    try:

        save_protected_json_config(_CONFIG_FILE, config, API_SECRET_FIELDS)

        return True

    except Exception:

        return False


def get_config_status() -> Dict[str, Any]:

    cfg = _load_config()

    auth_type = cfg.get("auth_type", "direct")

    app_key = cfg.get("app_key", "")

    app_secret = cfg.get("app_secret", "")

    app_code = cfg.get("app_code", "")

    if auth_type == "aliyun":

        configured = bool(app_code)

        return {
            "configured": configured,
            "authType": "aliyun",
            "appCode": app_code[:8] + "****" if len(app_code) > 8 else app_code,
            "appKey": "",
            "appSecret": "",
        }

    else:

        has_secret = bool(app_secret)

        return {
            "configured": bool(app_key and has_secret),
            "authType": "direct",
            "appKey": app_key[:8] + "****" if len(app_key) > 8 else app_key,
            "appSecret": "*" * 6 if has_secret else "",
            "appCode": "",
        }


def clear_config() -> bool:

    try:

        return remove_json_config_candidates(_CONFIG_FILE, include_current=True)

    except Exception:

        return False


def _build_headers_direct(app_key: str, app_secret: str) -> Dict[str, str]:

    headers = {
        "X-CS-Authorization": "HMAC-SHA256",
        "X-CS-Key": app_key,
        "X-CS-Nonce": str(uuid.uuid4()),
        "X-CS-Timestamp": str(int(time.time())),
        "X-CS-Version": "v2",
    }

    sign_list = ["POST"]

    for key in sorted(headers.keys()):

        sign_list.append(f"{key}={headers[key]}")

    sign_str = "|".join(sign_list)

    signature = base64.b64encode(
        hmac.new(
            app_secret.encode("utf-8"),
            sign_str.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")

    headers["X-CS-Signature"] = signature

    headers["Content-Type"] = "application/json;charset=utf-8"

    return headers


def _build_headers_aliyun(app_code: str) -> Dict[str, str]:

    try:

        app_code.encode("ascii")

    except UnicodeEncodeError:

        raise ValueError("AppCode 格式错误：包含非 ASCII 字符，请检查是否粘贴正确")

    return {
        "Authorization": f"APPCODE {app_code}",
        "Content-Type": "application/x-www-form-urlencoded",
    }


def _do_request(endpoint: str, params: Dict[str, Any]) -> Dict[str, Any]:

    cfg = _load_config()

    auth_type = cfg.get("auth_type", "direct")

    if auth_type == "aliyun":

        app_code = cfg.get("app_code", "")

        if not app_code:

            return {
                "success": False,
                "error": "未配置阿里云市场 AppCode，请先在设置中配置",
                "needConfig": True,
            }

        try:

            headers = _build_headers_aliyun(app_code)

        except ValueError as e:

            return {"success": False, "error": str(e), "needConfig": True}

        url = f"{API_BASE_ALIYUN}/v2/{endpoint}"

    else:

        app_key = cfg.get("app_key", "")

        app_secret = cfg.get("app_secret", "")

        if not app_key or not app_secret:

            return {
                "success": False,
                "error": "未配置 API 密钥，请先在设置中配置 AppKey 和 AppSecret",
                "needConfig": True,
            }

        headers = _build_headers_direct(app_key, app_secret)

        url = f"{API_BASE_DIRECT}/v2/{endpoint}"

    if auth_type == "aliyun":

        body = parse.urlencode(params).encode("utf-8")

    else:

        body = json.dumps(params, ensure_ascii=False).encode("utf-8")

    try:

        req = request.Request(url, data=body, headers=headers, method="POST")
        _debug_log(
            "[DEBUG _do_request]",
            json.dumps(
                {
                    "url": url,
                    "body": _format_debug_request_body(auth_type, body),
                },
                ensure_ascii=False,
            ),
        )

    except (UnicodeEncodeError, ValueError) as e:

        return {
            "success": False,
            "error": f"请求编码错误: {e}\n请检查 API 配置是否包含非法字符",
            "needConfig": True,
        }

    try:

        with request.urlopen(req, timeout=30) as resp:

            resp_text = resp.read().decode("utf-8")

            result = json.loads(resp_text)
            _debug_log("[DEBUG API resp 200]", _format_debug_response_body(resp_text))

            if "success" in result:

                if not result.get("success") and not result.get("error"):

                    msg = result.get("message") or result.get("msg") or ""

                    desc = result.get("description") or ""

                    code = result.get("code")

                    parts = [p for p in [msg, desc] if p]

                    result["error"] = (
                        " — ".join(parts)
                        if parts
                        else (
                            f"查验失败（错误码: {code}）"
                            if code is not None
                            else "查验失败（API 未返回详细原因）"
                        )
                    )

                    if code is not None:

                        result["code"] = code

                return result

            if result.get("data") and isinstance(result.get("data"), dict):

                return {"success": True, "data": result["data"], "code": result.get("code")}

            code = result.get("code")

            msg = result.get("message") or result.get("msg") or ""

            desc = result.get("description") or ""

            parts = [p for p in [msg, desc] if p and p != msg]

            error_str = msg

            if desc and desc != msg:

                error_str = f"{msg} — {desc}" if msg else desc

            if not error_str:

                error_str = (
                    f"查验失败（错误码: {code}）" if code is not None else "查验未返回有效数据"
                )

            return {"success": False, "error": error_str, "code": code, "description": desc}

    except error.HTTPError as e:

        err_body = e.read().decode("utf-8", errors="replace")
        _debug_log(f"[DEBUG API HTTP {e.code}]", _format_debug_response_body(err_body))

        gw_err = e.headers.get("X-Ca-Error-Message", "")

        try:

            err_json = json.loads(err_body)

            msg = err_json.get("message") or err_json.get("msg") or "请求失败"

            if gw_err:

                msg = f"{msg} (网关: {gw_err})"

            return {
                "success": False,
                "error": msg,
                "description": err_json.get("description", ""),
                "code": err_json.get("code", e.code),
            }

        except Exception:

            http_msg = _HTTP_ERROR_MESSAGES.get(e.code)

            if http_msg:

                if e.code == 404 and endpoint == "invoice/pdf":

                    return {
                        "success": False,
                        "error": "当前 API 套餐不支持文件查验（PDF/OFD 直接查验），请使用手动输入发票信息查验",
                        "code": e.code,
                    }

                return {
                    "success": False,
                    "error": http_msg,
                    "code": e.code,
                }

            detail = gw_err or err_body[:200]

            return {
                "success": False,
                "error": f"请求失败（HTTP {e.code}）: {detail}",
                "code": e.code,
            }

    except error.URLError as e:

        reason = str(e.reason)

        if "timed out" in reason or "timeout" in reason.lower():

            return {"success": False, "error": "请求超时，请检查网络连接后重试"}

        if "getaddrinfo" in reason or "Name or service not known" in reason:

            return {"success": False, "error": "无法连接到服务器，请检查网络连接"}

        return {"success": False, "error": f"网络错误: {reason}"}

    except Exception as e:

        return {"success": False, "error": f"请求异常: {str(e)}"}


def verify_invoice(
    fpdm: str,
    fphm: str,
    kprq: str,
    check_code: Optional[str] = None,
    amount: Optional[str] = None,
) -> Dict[str, Any]:

    # API 要求金额保留两位小数
    def _fmt_amount(val: str) -> str:
        try:
            return f"{float(val):.2f}"
        except (ValueError, TypeError):
            return val

    params: Dict[str, Any] = {
        "fphm": fphm,
        "kprq": kprq,
    }

    # 全电发票 (20位数字发票号码，含铁路电子客票、航空电子客票等)
    # API 要求使用 jshj (价税合计)，不需要 fpdm 和 checkCode
    is_full_electronic = len(fphm) == 20 and fphm.isdigit()

    if is_full_electronic:

        if amount:

            params["jshj"] = _fmt_amount(amount)

    else:

        if fpdm:

            params["fpdm"] = fpdm

        if check_code:

            params["checkCode"] = check_code

        if amount:

            params["noTaxAmount"] = _fmt_amount(amount)

    return _do_request("invoice/query", params)


def verify_invoice_by_file(
    file_path: str,
) -> Dict[str, Any]:

    if not os.path.exists(file_path):

        return {"success": False, "error": f"文件不存在: {file_path}"}

    file_size = os.path.getsize(file_path)

    if file_size > 1 * 1024 * 1024:

        return {"success": False, "error": "文件大小超过 1MB 限制"}

    with open(file_path, "rb") as f:

        file_bytes = f.read()

    file_base64 = base64.b64encode(file_bytes).decode("utf-8")

    ext = os.path.splitext(file_path)[1].lower()

    if ext not in {".pdf", ".ofd"}:

        return {"success": False, "error": f"不支持的文件类型: {ext}"}

    return _do_request("invoice/pdf", {"pdfBase64": file_base64})
