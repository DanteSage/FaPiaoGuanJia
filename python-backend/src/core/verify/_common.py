"""RPA 共享常量与工具函数"""

import os
import sys
from pathlib import Path
from typing import Any, Callable, Dict, Optional

_src_dir = Path(__file__).resolve().parents[2]
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))

from storage.paths import get_config_dir, get_images_dir, get_images_with_url_dir, get_rpa_config_path


def _env_int(name: str, default: int, min_value: int = 0) -> int:
    """Read integer env var with safe fallback."""
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(min_value, value)


TAX_VERIFY_URL = "https://inv-veri.chinatax.gov.cn/"
MAX_RETRY = _env_int("RPA_MAX_RETRY", 2, min_value=1)
PAGE_TIMEOUT = 20000
CAPTCHA_TIMEOUT = 8000
VERIFY_TOTAL_TIMEOUT_SEC = _env_int("RPA_TOTAL_TIMEOUT_SEC", 60, min_value=1)
FAST_MODE = True

_CONFIG_DIR = get_config_dir()
_CONFIG_FILE = get_rpa_config_path()
_SCREENSHOT_DIR = get_images_dir()
_SCREENSHOT_WITH_URL_DIR = get_images_with_url_dir()


def _log(message: str) -> None:
    from utils.logger import get_logger

    try:
        get_logger("rpa").info(message)
    except Exception:
        pass


_rpa_progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None


def set_rpa_progress_callback(callback: Optional[Callable[[Dict[str, Any]], None]]) -> None:
    """注册 RPA 查验进度回调（由 RPC 入口注入，避免 verify 模块直接依赖 stdout）"""
    global _rpa_progress_callback
    _rpa_progress_callback = callback


def emit_rpa_progress(stage: str, message: str = "", **extra: Any) -> None:
    """发射 RPA 查验进度事件。
    
    Args:
        stage: 阶段标识符（如 "init"、"navigate"、"captcha_solve"）
        message: 用户可见的中文进度文案
        **extra: 附加字段（如 attempt 重试次数）
    
    任何异常都被静默吞掉，避免影响主查验流程。
    """
    callback = _rpa_progress_callback
    if callback is None:
        return
    try:
        payload: Dict[str, Any] = {"stage": stage, "message": message}
        if extra:
            payload.update(extra)
        callback(payload)
    except Exception:
        pass


_COLOR_MAP = {
    "黄": "黄色",
    "红": "红色",
    "蓝": "蓝色",
    "黄色": "黄色",
    "红色": "红色",
    "蓝色": "蓝色",
}

RPA_ERROR_TYPE_CAPTCHA_ERROR = "captcha_error"
RPA_ERROR_TYPE_NOT_FOUND = "not_found"
RPA_ERROR_TYPE_LIMIT_EXCEEDED = "limit_exceeded"
RPA_ERROR_TYPE_MISMATCH = "mismatch"
RPA_ERROR_TYPE_RESULT_MISMATCH = "result_mismatch"

ERROR_TYPE_CAPTCHA_ERROR = RPA_ERROR_TYPE_CAPTCHA_ERROR
ERROR_TYPE_NOT_FOUND = RPA_ERROR_TYPE_NOT_FOUND
ERROR_TYPE_LIMIT_EXCEEDED = RPA_ERROR_TYPE_LIMIT_EXCEEDED
ERROR_TYPE_MISMATCH = RPA_ERROR_TYPE_MISMATCH
ERROR_TYPE_RESULT_MISMATCH = RPA_ERROR_TYPE_RESULT_MISMATCH

RPA_PAGE_BLOCK_PATTERNS = [
    ("系统异常", "税局平台系统异常，请稍后重试"),
    ("系统错误", "税局平台系统错误，请稍后重试"),
    ("系统繁忙", "税局系统繁忙，请稍后重试"),
    ("服务[暂不]*可用", "税局查验服务暂不可用，请稍后重试"),
    ("访问[被已]拒绝", "访问被拒绝，可能触发了反自动化检测"),
    ("请求[被已]拦截", "请求被拦截，可能触发了反自动化检测"),
    ("非法访问", "被检测为非法访问，请稍后重试"),
    ("403|Forbidden", "访问被禁止 (403)"),
]

RPA_RESULT_ERROR_PATTERNS = [
    (r"验证码[\s]*[错误有误不正确]+", "验证码错误，正在重试"),
    ("查无此票", "查无此票，请确认发票信息是否正确"),
    ("请求过于频繁", "查验请求过于频繁，请稍后再试"),
    ("超过[该当]?[日天]?查验次数", "该发票今日查验次数已达上限（每天最多5次）"),
    ("网络异常|网络错误", "税局平台网络异常，请稍后重试"),
    ("系统异常|系统错误", "税局平台系统异常，请稍后重试"),
    ("系统繁忙", "税局系统繁忙，请稍后重试"),
    ("不一致", "发票信息不一致，请核实后重试"),
    ("访问被拒绝|Forbidden|403", "访问被禁止，可能触发了反自动化检测"),
]

RPA_RESULT_FRAME_ERROR_PATTERNS = [
    (
        r"\u9a8c\u8bc1\u7801[\s]*[\u9519\u8bef\u6709\u8bef\u4e0d\u6b63\u786e!]+",
        RPA_ERROR_TYPE_CAPTCHA_ERROR,
    ),
    (r"\u67e5\u65e0\u6b64\u7968", RPA_ERROR_TYPE_NOT_FOUND),
    (
        r"\u8d85\u8fc7[\u8be5\u5f53]?\u67e5\u9a8c\u6b21\u6570|\u67e5\u9a8c\u6b21\u6570.*\u6b21\u65e5",
        RPA_ERROR_TYPE_LIMIT_EXCEEDED,
    ),
    (r"\u4e0d\u4e00\u81f4", RPA_ERROR_TYPE_MISMATCH),
]

RPA_SCREENSHOT_DIALOG_SELECTORS = [
    ".layui-layer",
    ".layer-content",
    ".modal-dialog",
    ".result-dialog",
]

RPA_POPUP_SELECTORS = [
    "#popup_message",
    ".layui-layer-content",
    ".layer-content",
    ".modal-body",
    ".el-message-box__message",
    ".ant-modal-body",
    "dialog[open]",
    ".dialog-content",
    ".alert-content",
    "[role='alertdialog']",
    "[role='dialog'] [class*='content']",
    ".popup-content",
    ".message-box",
    ".tips-content",
]

RPA_RESULT_IFRAME_SELECTORS = [
    "dialog[open] iframe#dialog-body",
    "dialog iframe#dialog-body",
    "iframe#dialog-body",
]

RPA_CAPTCHA_TRIGGER_SELECTOR = "#yzm_img, .yzm_img, #yzmSj, .yzmSj"

RPA_CAPTCHA_IMAGE_SELECTORS = [
    "#yzm_img img",
    ".yzm_img img",
    "#yzmSj img",
    "img[id*='yzm']",
    "img[class*='yzm']",
]

RPA_CAPTCHA_CONTAINER_SELECTORS = [
    "#yzm_img",
    ".yzm_img",
    "#yzmSj",
    ".yzmSj",
]

RPA_CAPTCHA_INPUT_SELECTORS = [
    "#yzm",
    "#yzmSj_input",
    "input[id*='yzm']",
    "input[name*='yzm']",
    "input[placeholder*='验证码']",
]

RPA_VERIFY_BUTTON_SELECTORS = [
    "#checkfp",
    "#uncheckfp",
    "button:has-text('查验')",
    "input[value*='查验'][type='button']",
    "button[onclick*='check']",
]

RPA_POPUP_EXCLUDE_KEYWORDS = [
    "支持",
    "增值税专用发票",
    "电子发票",
    "普通发票",
    "卷票",
    "折叠票",
    "通行费",
    "机动车",
    "二手车",
]

RPA_POPUP_ERROR_KEYWORDS = [
    "验证码",
    "查验次数",
    "次日",
    "查无此票",
    "不一致",
    "错误",
    "失败",
    "上限",
]

RPA_POPUP_ERROR_TYPE_RULES = [
    ("验证码", RPA_ERROR_TYPE_CAPTCHA_ERROR),
    ("查验次数", RPA_ERROR_TYPE_LIMIT_EXCEEDED),
    ("次日", RPA_ERROR_TYPE_LIMIT_EXCEEDED),
    ("查无此票", RPA_ERROR_TYPE_NOT_FOUND),
    ("不一致", RPA_ERROR_TYPE_MISMATCH),
]

RPA_POPUP_TEXT_MIN_LEN = 4
RPA_POPUP_TEXT_MAX_LEN = 150
RPA_POPUP_JS_TEXT_MIN_LEN = 4
RPA_POPUP_JS_TEXT_MAX_LEN = 100

RPA_POPUP_JS_SELECTORS = [
    "dialog[open]",
    "[class*='layer-content']",
    "[class*='popup'][style*='display: block']",
    "[class*='modal'][class*='show']",
]

RPA_POPUP_JS_EXCLUDE_KEYWORDS = [
    "支持",
    "增值税专用",
    "电子发票",
    "普通发票",
    "卷票",
    "折叠票",
    "通行费",
    "机动车",
    "二手车",
]

RPA_POPUP_JS_ERROR_KEYWORDS = [
    "验证码错误",
    "查验次数",
    "次日再次",
    "查无此票",
    "不一致",
    "请重试",
    "请核实",
]
