"""验证码识别模块 - 对接 amam (easysu.cn) API

API 文档: https://amam.easysu.cn/#/singleDoc?typeNo=10201
请求地址: https://amam.easysu.cn/consumer/api/commonIdentify
请求方式: POST (Content-Type: application/json)

参数:
    appKey  - 系统颁发的 appKey (必填)
    type    - 10201 (必填)
    extra   - '全部'/'黄色'/'红色'/'蓝色' (必填)
    image   - 验证码图片 base64 (必填)

响应 (code=200 成功):
    {"code": 200, "msg": "成功", "data": {"data": "识别文本", "uniqueCode": "..."}}
"""

import json
from typing import Any, Dict
from urllib import error, request

CAPTCHA_API_URL = "https://amam.easysu.cn/consumer/api/commonIdentify"
CAPTCHA_TYPE = "10201"


def _is_app_key_error(code: int, message: str) -> bool:
    normalized = (message or "").replace(" ", "").lower()
    return code == 9002 or "appkey" in normalized or "app_key" in normalized


def solve_captcha(
    app_key: str,
    image_base64: str,
    extra: str = "全部",
) -> Dict[str, Any]:
    """识别验证码图片

    Args:
        app_key:      amam 平台 appKey
        image_base64: 验证码图片 base64 编码（不含 data:image/... 前缀）
        extra:        颜色筛选 ('全部'/'黄色'/'红色'/'蓝色')

    Returns:
        {
            "success": bool,
            "text": str,       # 识别结果文本
            "error": str,      # 错误信息（仅失败时）
            "code": int,       # 原始业务码
        }
    """
    if not app_key:
        return {"success": False, "error": "未配置验证码识别 appKey", "code": -1}
    if not image_base64:
        return {"success": False, "error": "验证码图片为空", "code": -1}

    # 去除可能的 data URI 前缀
    if "," in image_base64 and image_base64.startswith("data:"):
        image_base64 = image_base64.split(",", 1)[1]

    payload = {
        "appKey": app_key,
        "type": CAPTCHA_TYPE,
        "extra": extra,
        "image": image_base64,
    }

    body = json.dumps(payload).encode("utf-8")

    try:
        req = request.Request(CAPTCHA_API_URL, data=body, method="POST")
        req.add_header("Content-Type", "application/json")

        with request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))

            code = result.get("code", -1)
            msg = result.get("msg", "")
            success = result.get("success", False)

            if code == 200 and success:
                # 新版 API: {"code":200, "data":{"data":"EET5","uniqueCode":"..."}}
                data = result.get("data")
                if isinstance(data, dict):
                    text = str(data.get("data", "")).strip()
                    if text:
                        return {"success": True, "text": text, "code": 200}
                # 兼容旧版 API: {"code":10000, "data":[{"code":10000,"data":"..."}]}
                elif isinstance(data, list) and len(data) > 0:
                    item = data[0]
                    text = str(item.get("data", "")).strip()
                    if text:
                        return {"success": True, "text": text, "code": 200}
                return {"success": False, "error": "识别结果为空", "code": code}

            # 兼容旧版 code=10000
            if code == 10000:
                data_list = result.get("data", [])
                if isinstance(data_list, list) and len(data_list) > 0:
                    item = data_list[0]
                    inner_code = item.get("code", -1)
                    if inner_code == 10000:
                        text = str(item.get("data", "")).strip()
                        if text:
                            return {"success": True, "text": text, "code": 10000}

            # 失败
            if _is_app_key_error(code, msg):
                return {
                    "success": False,
                    "error": "验证码识别 AppKey 无效或不存在，请重新配置",
                    "code": code,
                    "needConfig": True,
                }
            return {
                "success": False,
                "error": msg or f"验证码识别失败（错误码: {code}）",
                "code": code,
            }

    except error.HTTPError as e:
        return {"success": False, "error": f"验证码识别服务请求失败（HTTP {e.code}）", "code": -1}
    except error.URLError as e:
        reason = str(e.reason)
        if "timed out" in reason or "timeout" in reason.lower():
            return {"success": False, "error": "验证码识别服务请求超时", "code": -1}
        return {"success": False, "error": f"验证码识别服务连接失败: {reason}", "code": -1}
    except Exception as e:
        return {"success": False, "error": f"验证码识别异常: {str(e)}", "code": -1}
