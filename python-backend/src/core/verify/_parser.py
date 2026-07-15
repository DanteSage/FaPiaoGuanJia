"""结果解析与弹窗检测模块"""

import re
from typing import Any, Callable, Dict, Optional, Sequence, TypedDict

from ._common import (
    _log,
    RPA_RESULT_ERROR_PATTERNS,
    RPA_RESULT_FRAME_ERROR_PATTERNS,
    RPA_POPUP_SELECTORS,
    RPA_RESULT_IFRAME_SELECTORS,
    RPA_POPUP_EXCLUDE_KEYWORDS,
    RPA_POPUP_ERROR_KEYWORDS,
    RPA_POPUP_ERROR_TYPE_RULES,
    RPA_POPUP_TEXT_MIN_LEN,
    RPA_POPUP_TEXT_MAX_LEN,
    RPA_POPUP_JS_TEXT_MIN_LEN,
    RPA_POPUP_JS_TEXT_MAX_LEN,
    RPA_POPUP_JS_SELECTORS,
    RPA_POPUP_JS_EXCLUDE_KEYWORDS,
    RPA_POPUP_JS_ERROR_KEYWORDS,
    ERROR_TYPE_RESULT_MISMATCH,
)


class PopupErrorInfo(TypedDict):
    selector: str
    text: str


PopupDetector = Callable[[Any], Optional[PopupErrorInfo]]


__all__ = [
    "_check_popup_error",
    "_find_result_iframe",
    "_parse_result_frame",
    "_parse_result",
    "ERROR_TYPE_RESULT_MISMATCH",
]


ParserResult = Dict[str, Any]


def _error_result(error: str, **extras: Any) -> ParserResult:
    """Build a standardized simple error result payload."""
    result: ParserResult = {"success": False, "error": error}
    if extras:
        result.update(extras)
    return result


def _success_result(data: Dict[str, Any], **extras: Any) -> ParserResult:
    """Build a standardized success result payload."""
    result: ParserResult = {"success": True, "data": data}
    if extras:
        result.update(extras)
    return result


def _log_text_snapshot(
    length_label: str, preview_label: str, text: str, preview_len: int = 500
) -> None:
    """Log text length and preview in a consistent format."""
    _log(f"[RPA] {length_label}: {len(text)}")
    _log(f"[RPA] {preview_label}: {text[:preview_len]}")


def _has_verification_fields(data: Dict[str, Any]) -> bool:
    return bool(data.get("fphm") or data.get("sumamount") or data.get("goodsamount"))


def _finalize_parsed_result(
    data: Dict[str, Any],
    raw_text: str,
    expected_fphm: str,
    data_log_label: str,
    mismatch_log_label: str,
    unparsed_error: str,
    empty_error: str,
) -> ParserResult:
    if data:
        _log(f"[RPA] {data_log_label}: {data}")

    if _has_verification_fields(data):
        if expected_fphm and data.get("fphm") and data["fphm"] != expected_fphm:
            _log(
                f"[RPA] ❗ {mismatch_log_label} fphm 不匹配! 期望={expected_fphm}, 实际={data['fphm']}"
            )
            return _error_result(
                "查验结果与请求不匹配，可能是税局返回了缓存数据，请重试",
                errorType=ERROR_TYPE_RESULT_MISMATCH,
            )
        return _success_result(data)

    if len(raw_text.strip()) > 50:
        return _error_result(unparsed_error)
    return _error_result(empty_error)


def _popup_error_type(msg_text: str) -> Optional[str]:
    """Map popup text to a stable errorType code."""
    for keyword, error_type in RPA_POPUP_ERROR_TYPE_RULES:
        if keyword in msg_text:
            return error_type
    return None


def _build_popup_error(msg_text: str) -> ParserResult:
    """Build a standardized popup error result payload."""
    result = _error_result(msg_text)
    error_type = _popup_error_type(msg_text)
    if error_type:
        result["errorType"] = error_type
    return result


def _popup_info_to_error_result(popup_info: Optional[PopupErrorInfo]) -> Optional[ParserResult]:
    """Convert popup info object into unified error result."""
    if not popup_info or not popup_info.get("text"):
        return None
    return _build_popup_error(popup_info["text"])


def _first_popup_error_info(
    page: Any, detectors: Sequence[PopupDetector]
) -> Optional[PopupErrorInfo]:
    """Run detectors in order and return first matched popup info."""
    for detector in detectors:
        popup_info = detector(page)
        if popup_info and popup_info.get("text"):
            return popup_info
    return None


def _is_valid_popup_text(
    msg_text: str, exclude_keywords: Sequence[str], min_len: int, max_len: int
) -> bool:
    """Validate popup text length and exclude-keyword constraints."""
    if not msg_text or len(msg_text) < min_len or len(msg_text) > max_len:
        return False
    return not any(kw in msg_text for kw in exclude_keywords)


def _log_skip(action: str, error: Exception, target: Optional[str] = None) -> None:
    """Log non-fatal skipped steps in a consistent format."""
    if target:
        _log(f"[RPA] {action} skipped ({target}): {error}")
    else:
        _log(f"[RPA] {action} skipped: {error}")


def _log_fail(action: str, error: Exception, detail: Optional[str] = None) -> None:
    """Log non-fatal failed steps in a consistent format."""
    if detail:
        _log(f"[RPA] {action} failed ({detail}): {error}")
    else:
        _log(f"[RPA] {action} failed: {error}")


def _find_visible_popup_error(
    page: Any,
    popup_selectors: Sequence[str],
    exclude_keywords: Sequence[str],
    error_keywords: Sequence[str],
) -> Optional[PopupErrorInfo]:
    """Detect popup errors from visible DOM popup elements."""
    for selector in popup_selectors:
        try:
            popup_el = page.locator(selector)
            if popup_el.count() <= 0 or not popup_el.first.is_visible():
                continue

            if selector == "dialog[open]":
                has_iframe = page.locator("dialog[open] iframe").count() > 0
                if has_iframe:
                    continue

            msg_text = popup_el.first.inner_text().strip()
            if not _is_valid_popup_text(
                msg_text,
                exclude_keywords,
                min_len=RPA_POPUP_TEXT_MIN_LEN,
                max_len=RPA_POPUP_TEXT_MAX_LEN,
            ):
                continue

            if any(kw in msg_text for kw in error_keywords):
                _log(f"[RPA] \u68c0\u6d4b\u5230\u5f39\u7a97\u9519\u8bef ({selector}): {msg_text}")
                return {"selector": selector, "text": msg_text}
        except Exception as e:
            _log_skip("popup detector", e, selector)
            continue

    return None


def _find_default_visible_popup_error(page: Any) -> Optional[PopupErrorInfo]:
    """Detect popup errors using default visible-popup settings."""
    return _find_visible_popup_error(
        page=page,
        popup_selectors=RPA_POPUP_SELECTORS,
        exclude_keywords=RPA_POPUP_EXCLUDE_KEYWORDS,
        error_keywords=RPA_POPUP_ERROR_KEYWORDS,
    )


def _find_js_popup_error(page: Any) -> Optional[PopupErrorInfo]:
    """Detect popup errors via JS fallback strategy."""
    js_payload = {
        "excludeKeywords": RPA_POPUP_JS_EXCLUDE_KEYWORDS,
        "errorKeywords": RPA_POPUP_JS_ERROR_KEYWORDS,
        "popupSelectors": RPA_POPUP_JS_SELECTORS,
        "minLen": RPA_POPUP_JS_TEXT_MIN_LEN,
        "maxLen": RPA_POPUP_JS_TEXT_MAX_LEN,
    }

    try:
        popup_info = page.evaluate(
            """\n            ({excludeKeywords, errorKeywords, popupSelectors, minLen, maxLen}) => {\n                for (const sel of popupSelectors) {\n                    const els = document.querySelectorAll(sel);\n                    for (const el of els) {\n                        if (sel === "dialog[open]" && el.querySelector("iframe")) continue;\n\n                        const text = el.innerText?.trim();\n                        if (!text || text.length < minLen || text.length > maxLen) continue;\n                        if (excludeKeywords.some(kw => text.includes(kw))) continue;\n                        if (errorKeywords.some(kw => text.includes(kw))) {\n                            return {selector: sel, text: text};\n                        }\n                    }\n                }\n                return null;\n            }\n            """,
            js_payload,
        )

        if popup_info and popup_info.get("text"):
            msg_text = popup_info["text"].strip()
            _log(f"[RPA] JS\u68c0\u6d4b\u5230\u5f39\u7a97: {msg_text}")
            return {"selector": popup_info.get("selector", ""), "text": msg_text}
    except Exception as e:
        _log(f"[RPA] JS\u68c0\u6d4b\u5f39\u7a97\u5f02\u5e38: {e}")

    return None


_POPUP_ERROR_DETECTORS: Sequence[PopupDetector] = (
    _find_default_visible_popup_error,
    _find_js_popup_error,
)


def _detect_popup_error_info(page: Any) -> Optional[PopupErrorInfo]:
    """Run configured popup detectors and return first matched info."""
    return _first_popup_error_info(
        page=page,
        detectors=_POPUP_ERROR_DETECTORS,
    )


def _check_popup_error(page: Any) -> Optional[ParserResult]:
    """\u68c0\u67e5\u7a0e\u5c40\u5e73\u53f0\u7684\u5f39\u7a97\u9519\u8bef\u63d0\u793a\n\n    \u7a0e\u5c40\u5e73\u53f0\u53ef\u80fd\u4f7f\u7528\u591a\u79cd\u5f39\u7a97\u65b9\u5f0f\u663e\u793a\u9519\u8bef\uff08\u9a8c\u8bc1\u7801\u9519\u8bef\u3001\u67e5\u9a8c\u6b21\u6570\u8d85\u9650\u7b49\uff09\n"""
    popup_info = _detect_popup_error_info(page)

    return _popup_info_to_error_result(popup_info)


def _extract_frame_error_message(frame_text: str, pattern: str, match: Any) -> str:
    """Extract the most readable error text around a regex match."""
    start = max(0, match.start() - 20)
    end = min(len(frame_text), match.end() + 50)
    context = frame_text[start:end]
    err_match = re.search(r"([^\n\r]{0,30}" + pattern + r"[^\n\r!]*!?)", context)
    if err_match:
        return err_match.group(1).strip()
    return match.group(0)


def _match_result_frame_error(frame_text: str) -> Optional[ParserResult]:
    """Match frame error patterns and build standardized payload."""
    for pattern, error_type in RPA_RESULT_FRAME_ERROR_PATTERNS:
        match = re.search(pattern, frame_text)
        if not match:
            continue

        actual_error = _extract_frame_error_message(frame_text, pattern, match)
        return _error_result(actual_error, errorType=error_type)

    return None


def _match_result_page_error(page_text: str) -> Optional[ParserResult]:
    """Match top-level result page errors and build standardized payload."""
    for pattern, msg in RPA_RESULT_ERROR_PATTERNS:
        if re.search(pattern, page_text):
            return _error_result(msg)

    return None


def _detect_matched_error(
    text: str,
    matcher: Callable[[str], Optional[ParserResult]],
    log_label: str,
) -> Optional[ParserResult]:
    """Run a matcher and log detected business errors in a uniform way."""
    matched = matcher(text)
    if matched:
        _log(f"[RPA] {log_label}: {matched.get('error', '')}")
    return matched


def _fill_missing_by_regex_patterns(
    data: Dict[str, Any],
    source_text: str,
    patterns: Dict[str, str],
) -> None:
    """Fill missing fields from text using regex pattern map."""
    for key, pattern in patterns.items():
        if key in data:
            continue
        match = re.search(pattern, source_text)
        if match:
            data[key] = match.group(1).strip()


def _fill_missing_by_css_selectors(
    page: Any,
    data: Dict[str, Any],
    selectors_map: Dict[str, Sequence[str]],
) -> None:
    """Fill missing fields from page via candidate CSS selectors."""
    for key, selectors in selectors_map.items():
        if key in data:
            continue
        for sel in selectors:
            try:
                el = page.locator(sel)
                if el.count() <= 0:
                    continue

                val = el.first.inner_text().strip()
                if not val:
                    val = (el.first.get_attribute("value") or "").strip()
                if val:
                    data[key] = val
                    break
            except Exception as e:
                _log_skip("css selector extraction", e, f"{key}, {sel}")
                continue


def _wait_frame_domcontentloaded(frame: Any, timeout_ms: int = 8000) -> None:
    """Best-effort wait until frame DOM is loaded."""
    try:
        frame.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
    except Exception as e:
        _log_skip("frame domcontentloaded wait", e)


def _wait_page_for_result_parse(
    page: Any,
    networkidle_timeout_ms: int = 10000,
    domcontentloaded_timeout_ms: int = 5000,
) -> None:
    """Best-effort wait for result page readiness before parsing."""
    try:
        page.wait_for_load_state("networkidle", timeout=networkidle_timeout_ms)
    except Exception as e:
        _log(f"[RPA] networkidle wait failed, fallback to domcontentloaded: {e}")
        try:
            page.wait_for_load_state("domcontentloaded", timeout=domcontentloaded_timeout_ms)
        except Exception as fallback_error:
            _log(f"[RPA] domcontentloaded wait failed: {fallback_error}")


def _find_result_iframe_by_src(page: Any) -> Optional[Any]:
    """Locate result iframe by iframe element src value."""
    for selector in RPA_RESULT_IFRAME_SELECTORS:
        try:
            iframe_el = page.locator(selector)
            if iframe_el.count() <= 0:
                continue

            src = iframe_el.first.get_attribute("src") or ""
            if not (src and "cyjg" in src):
                continue

            for frame in page.frames:
                if frame.url and src in frame.url:
                    _log(
                        f"[RPA] \u901a\u8fc7 iframe src \u627e\u5230\u7ed3\u679c Frame: {frame.url}"
                    )
                    _wait_frame_domcontentloaded(frame)
                    return frame
        except Exception as e:
            _log(f"[RPA] \u67e5\u627e iframe ({selector}) \u5f02\u5e38: {e}")

    return None


def _find_result_iframe_by_url(page: Any) -> Optional[Any]:
    """Locate result iframe by frame url pattern fallback."""
    try:
        for frame in page.frames:
            if frame.url and "cyjg" in frame.url:
                _log(f"[RPA] \u901a\u8fc7 URL \u627e\u5230\u7ed3\u679c iframe: {frame.url}")
                _wait_frame_domcontentloaded(frame)
                return frame
    except Exception as e:
        _log_fail("iterate frame urls", e)

    return None


def _find_result_iframe(page: Any) -> Optional[Any]:
    """\u67e5\u627e\u7a0e\u5c40\u7ed3\u679c\u9875\u7684 dialog iframe\n\n    \u7a0e\u5c40\u5e73\u53f0\u67e5\u9a8c\u7ed3\u679c\u901a\u8fc7 <dialog open><iframe id="dialog-body" src="xdp_cyjg*.html">\n    \u663e\u793a\u5728\u5f53\u524d\u9875\u9762\u4e0a\uff0c\u7ed3\u679c\u5185\u5bb9\u5728 iframe \u5185\u90e8\u3002\n\n    Returns:\n        Playwright Frame \u5bf9\u8c61\uff0c\u6216 None\n"""
    result_frame = _find_result_iframe_by_src(page)
    if result_frame:
        return result_frame

    return _find_result_iframe_by_url(page)


def _fill_result_frame_fallback_fields(data: Dict[str, Any], frame_text: str) -> None:
    """Fill missing key fields from frame text using fallback regex rules."""
    fallback_patterns = {
        "fphm": r"\u53d1\u7968\u53f7\u7801[\uFF1A:\s]*([A-Za-z0-9]+)",
        "kprq": r"\u5f00\u7968\u65e5\u671f[\uFF1A:\s]*([\d\-/\u5e74\u6708\u65e5]+)",
        "sumamount": r"[\(\uFF08]?\u4ef7\u7a0e\u5408\u8ba1[\)\uFF09]?[\s]*[\u00A5\uFFE5]?\s*([\d,.]+)",
    }

    if "sumamount" not in data:
        ticket_price_match = re.search(r"\u7968\u4ef7[\uFF1A:\s]*([\d,.]+)", frame_text)
        if ticket_price_match:
            data["sumamount"] = ticket_price_match.group(1).strip()

    _fill_missing_by_regex_patterns(
        data=data,
        source_text=frame_text,
        patterns=fallback_patterns,
    )


def _evaluate_dom_data(
    target: Any,
    script: str,
    error_log_label: str,
    success_log_prefix: str = "",
) -> Dict[str, Any]:
    """Evaluate DOM extraction script with safe fallback and optional success log."""
    try:
        dom_data = target.evaluate(script)
        if not isinstance(dom_data, dict):
            return {}

        if success_log_prefix and dom_data:
            _log(f"[RPA] {success_log_prefix} {len(dom_data)} fields: {list(dom_data.keys())[:20]}")
        return dom_data
    except Exception as e:
        _log(f"[RPA] {error_log_label}: {e}")
        return {}


def _evaluate_result_frame_dom_data(frame: Any, script: str) -> Dict[str, Any]:
    """Evaluate iframe DOM extraction script with safe fallback."""
    return _evaluate_dom_data(
        target=frame,
        script=script,
        error_log_label="iframe JS extraction error",
    )


def _read_body_text(
    target: Any,
    length_label: str,
    preview_label: str,
    error_handler: Callable[[Exception], None],
) -> Optional[str]:
    """Read `body` text and delegate failure handling to caller."""
    try:
        body_text = target.inner_text("body")
        _log_text_snapshot(
            length_label=length_label,
            preview_label=preview_label,
            text=body_text,
        )
        return body_text
    except Exception as e:
        error_handler(e)
        return None


def _log_read_result_frame_text_error(error: Exception) -> None:
    """Log iframe body text read failure."""
    _log(f"[RPA] read iframe body text failed: {error}")


def _log_read_result_page_text_error(error: Exception) -> None:
    """Log result page body text read failure."""
    _log_fail("read result page text", error)


def _read_result_frame_text(frame: Any) -> Optional[str]:
    """Read iframe body text with consistent diagnostics."""
    return _read_body_text(
        target=frame,
        length_label="iframe content length",
        preview_label="iframe preview",
        error_handler=_log_read_result_frame_text_error,
    )


def _detect_result_frame_error(frame_text: str) -> Optional[ParserResult]:
    """Return known business error parsed from iframe text."""
    return _detect_matched_error(
        text=frame_text,
        matcher=_match_result_frame_error,
        log_label="frame error",
    )


def _parse_result_frame(frame: Any, expected_fphm: str = "") -> ParserResult:
    """\u4ece\u7ed3\u679c iframe (Frame \u5bf9\u8c61) \u89e3\u6790\u53d1\u7968\u67e5\u9a8c\u7ed3\u679c\n\n    Args:\n        frame: Playwright Frame \u5bf9\u8c61\n        expected_fphm: \u9884\u671f\u7684\u53d1\u7968\u53f7\u7801\uff0c\u7528\u4e8e\u7ed3\u679c\u9a8c\u8bc1\n"""
    frame_text = _read_result_frame_text(frame)
    if frame_text is None:
        return _error_result("无法读取查验结果 iframe")

    frame_error = _detect_result_frame_error(frame_text)
    if frame_error:
        return frame_error

    # ---- \u7528\u4e00\u4e2a\u7efc\u5408 JS \u4ece iframe DOM \u63d0\u53d6\u5168\u90e8\u53d1\u7968\u6570\u636e ----
    data = _evaluate_result_frame_dom_data(
        frame=frame,
        script=r"""
            () => {
                const data = {};
                const bodyText = document.body.innerText || '';
                const tds = document.querySelectorAll('td');

                // 辅助: 从标签 td 查找对应值 (同行右侧 → 同列下一行)
                const _fv = (td, allTds, idx) => {
                    // 同行右侧 cell
                    if (idx + 1 < allTds.length && td.closest('tr') === allTds[idx + 1].closest('tr')) {
                        const nt = (allTds[idx + 1].innerText || '').trim();
                        if (!/^(?:购买方|销售方|购方|销方)/.test(nt.replace(/\s+/g, ''))) return nt;
                    }
                    // 同列下一行
                    const tr = td.closest('tr');
                    if (tr) {
                        const cs = Array.from(tr.querySelectorAll(':scope > td, :scope > th'));
                        const ci = cs.indexOf(td);
                        const nr = tr.nextElementSibling;
                        if (nr && ci >= 0) {
                            const nc = Array.from(nr.querySelectorAll(':scope > td, :scope > th'));
                            if (ci < nc.length) return (nc[ci].innerText || '').trim();
                        }
                    }
                    return '';
                };

                // === 1. 发票类型标题 ===
                // 查找如 "电子发票（普通发票）" 或 "电子发票（铁路电子客票）" 样式的文本
                const typeEls = document.querySelectorAll('td, th, h1, h2, h3, div, span, p');
                for (const el of typeEls) {
                    const t = (el.innerText || '').trim();
                    if (/^[\u4e00-\u9fa5]+[\uff08(][\u4e00-\u9fa5]+[\uff09)]$/.test(t) && (t.includes('发票') || t.includes('客票'))) {
                        data.fplxName = t;
                        break;
                    }
                }

                // === 2. 遍历所有 td，提取 "标签：值" 格式 ===
                const kvPairs = {};  // 原始中文键值对
                for (let i = 0; i < tds.length; i++) {
                    const raw = (tds[i].innerText || '').trim();
                    // 单个 td 内匹配 "标签：值"
                    const inlineMatch = raw.match(/^([^\uff1a:]{2,20})[\uff1a:]\s*(.+)$/s);
                    if (inlineMatch) {
                        const k = inlineMatch[1].trim().replace(/\s+/g, '');
                        const v = inlineMatch[2].trim();
                        if (v && !kvPairs[k]) kvPairs[k] = v;
                    }
                    // 相邻 td: label + value，但跳过 label 本身是另一个字段的值的情况
                    if (i < tds.length - 1) {
                        const label = raw.replace(/[\uff1a:]/g, '').replace(/^\s*\*\s*/, '').replace(/\s+/g, '');
                        const value = (tds[i + 1].innerText || '').trim();
                        // 排除: label 是纯数字/编号（它是上一个字段的值）
                        if (label && value && label.length >= 2 && label.length <= 20
                            && !/^[\d]{4,}$/.test(label) && !kvPairs[label]
                            && !/^[\u4e00-\u9fa5]+[\uff1a:]\s*$/.test(value)
                            && !/(?:购买方|销售方|购方|销方)/.test(label)) {
                            kvPairs[label] = value;
                        }
                    }
                }

                // === 3. 映射常见字段 ===
                const fieldMap = {
                    '发票代码': 'fpdm', '发票号码': 'fphm',
                    '开票日期': 'kprq', '发票日期': 'kprq',
                    '发票类型': 'fplxName', '发票种类': 'fplxName',
                    '发票状态': 'fpzt',
                    '校验码': 'jym', '机器编号': 'jqbh',
                    '备注': 'remark', '收款人': 'skr', '复核': 'fhr', '开票人': 'kpr',
                    // 铁路电子客票 / 航空 / 特殊票种
                    '票价': 'sumamount',
                    '姓名': 'passenger', '证件号': 'idNumber',
                    '出发站': 'departure', '到达站': 'arrival',
                    '乘车日期': 'travelDate', '出发时间': 'departureTime',
                    '车次': 'trainNo', '席别': 'seatType', '席位': 'seatNo',
                    '车厢': 'carriage', '票种': 'ticketType',
                    '电子客票号': 'eTicketNo',
                    '购买方名称': 'gfMc', '购方名称': 'gfMc',
                    '销售方名称': 'xfMc', '销方名称': 'xfMc',
                    '购买方统一社会信用代码': 'gfNsrsbh', '购买方纳税人识别号': 'gfNsrsbh',
                    '销售方统一社会信用代码': 'xfNsrsbh', '销售方纳税人识别号': 'xfNsrsbh',
                    '业务类型': 'businessType',
                    '空调特征': 'acFeature',
                };
                // 金额类字段，需要去除货币符号
                const amountFields = new Set(['sumamount', 'goodsamount', 'taxamount']);
                for (const [cn, en] of Object.entries(fieldMap)) {
                    if (kvPairs[cn] && !data[en]) {
                        let v = kvPairs[cn];
                        if (v !== '--' && v !== '-') {
                            // 去除金额字段的货币符号
                            if (amountFields.has(en)) {
                                v = v.replace(/[\u00a5\uffe5,]/g, '');
                            }
                            data[en] = v;
                        }
                    }
                }

                // === 4. 购买方/销售方 ===
                // 两种税局页面布局：
                //   A) 左右分栏: [购买方信息] [名称：] [值] [销售方信息] [名称：] [值]
                //   B) 复合标签: [购买方名称] [值] ... [销售方名称] [值]
                //
                // Pass 1: 复合标签（含购买方/销售方前缀 → 确定性分配）
                // 查找值策略: 同行右侧 cell → 同列下一行 (避免跨行误配)
                for (let i = 0; i < tds.length; i++) {
                    const raw = (tds[i].innerText || '').trim().replace(/\s+/g, '');
                    // 购买方名称 / 销售方名称
                    const cnm = raw.match(/^(购买方|销售方|购方|销方)[\s]*名[\s]*称[\uff1a:]*(.*)$/s);
                    if (cnm) {
                        const who = /购/.test(cnm[1]) ? 'gf' : 'xf';
                        let val = (cnm[2] || '').trim();
                        if (!val) val = _fv(tds[i], tds, i);
                        if (val && val.length >= 2 && !/^[\u4e00-\u9fa5]+[\uff1a:]/.test(val)
                            && !/^(?:购买方|销售方|购方|销方)/.test(val.replace(/\s+/g, ''))) {
                            const key = who + 'Mc';
                            if (!data[key]) data[key] = val;
                        }
                    }
                    // 购买方/销售方 纳税人识别号/统一社会信用代码
                    const ctx = raw.match(/^(购买方|销售方|购方|销方).*(统一社会信用代码|纳税人识别号)[\s\uff1a:]*([A-Za-z0-9]*)/s);
                    if (ctx) {
                        const who = /购/.test(ctx[1]) ? 'gf' : 'xf';
                        let taxNo = (ctx[3] || '').trim();
                        if (!taxNo) {
                            const nv = _fv(tds[i], tds, i);
                            const tm = nv.match(/([A-Za-z0-9]{15,20})/);
                            if (tm) taxNo = tm[1];
                        }
                        if (taxNo) {
                            const key = who + 'Nsrsbh';
                            if (!data[key]) data[key] = taxNo;
                        }
                    }
                }
                //
                // Pass 2: 裸标签 + 顺序分配（只补充 Pass 1 没找到的）
                // 税局页面左右分栏布局中，两个 zone 标记（购买方/销售方）在同一行，
                // 名称和税号在下面的行。状态机遍历到名称时 zone 已被覆盖。
                // 因此改用数组收集，最后按 firstZone 顺序分配（与税号逻辑一致）。
                {
                    let firstZone = '';
                    const bareNames = [];
                    const bareTaxIds = [];
                    for (let i = 0; i < tds.length; i++) {
                        const raw = (tds[i].innerText || '').trim().replace(/\s+/g, '');
                        if (/购买方|购方/.test(raw) && !firstZone) firstZone = 'buyer';
                        if (/销售方|销方/.test(raw) && !firstZone) firstZone = 'seller';

                        // 裸 "名称" 标签
                        if (!data.gfMc || !data.xfMc) {
                            let nameVal = '';
                            const nm = raw.match(/^名[\s]*称[\uff1a:]\s*(.+)/s);
                            if (nm && nm[1].trim()) {
                                nameVal = nm[1].trim();
                            } else if (/^名[\s]*称[\uff1a:\uff1a]*$/.test(raw) && i + 1 < tds.length) {
                                nameVal = (tds[i + 1].innerText || '').trim();
                            }
                            if (nameVal && nameVal.length >= 2 && !/^[\u4e00-\u9fa5]+[\uff1a:]/.test(nameVal)) {
                                bareNames.push(nameVal);
                            }
                        }

                        // 裸 "纳税人识别号" 标签
                        if (!data.gfNsrsbh || !data.xfNsrsbh) {
                            let taxNo = '';
                            const tax = raw.match(/^(?:统一社会信用代码|纳税人识别号)[^\uff1a:]*[\uff1a:]\s*([A-Za-z0-9]+)/s);
                            if (tax) {
                                taxNo = tax[1];
                            } else if (/^(?:统一社会信用代码|纳税人识别号)/.test(raw) && i + 1 < tds.length) {
                                const nextVal = (tds[i + 1].innerText || '').trim();
                                const tm = nextVal.match(/([A-Za-z0-9]{15,20})/);
                                if (tm) taxNo = tm[1];
                            }
                            if (taxNo) bareTaxIds.push(taxNo);
                        }
                    }
                    // 按区域出现顺序分配（谁先出现就先分配给谁）
                    if (bareNames.length >= 1) {
                        const k1 = firstZone === 'seller' ? 'xfMc' : 'gfMc';
                        if (!data[k1]) data[k1] = bareNames[0];
                    }
                    if (bareNames.length >= 2) {
                        const k2 = firstZone === 'seller' ? 'gfMc' : 'xfMc';
                        if (!data[k2]) data[k2] = bareNames[1];
                    }
                    if (bareTaxIds.length >= 1) {
                        const k1 = firstZone === 'seller' ? 'xfNsrsbh' : 'gfNsrsbh';
                        if (!data[k1]) data[k1] = bareTaxIds[0];
                    }
                    if (bareTaxIds.length >= 2) {
                        const k2 = firstZone === 'seller' ? 'gfNsrsbh' : 'xfNsrsbh';
                        if (!data[k2]) data[k2] = bareTaxIds[1];
                    }
                }

                // === 5. 金额提取 ===
                // 价税合计（小写）
                const sumMatch = bodyText.match(/[\(\uff08]小写[\)\uff09][\s]*[\u00a5\uffe5]?\s*([\d,]+\.?\d*)/);
                if (sumMatch) data.sumamount = sumMatch[1].replace(/,/g, '');

                // 合计行
                for (let i = 0; i < tds.length; i++) {
                    const t = (tds[i].innerText || '').trim().replace(/\s+/g, '');
                    if (t === '合计') {
                        const amounts = [];
                        for (let j = i + 1; j < Math.min(i + 10, tds.length); j++) {
                            const val = (tds[j].innerText || '').trim();
                            const am = val.match(/[\u00a5\uffe5]\s*([\d,]+\.?\d*)/);
                            if (am) amounts.push(am[1].replace(/,/g, ''));
                            if (/价税合计/.test(val)) break;
                        }
                        if (amounts.length >= 1 && !data.goodsamount) data.goodsamount = amounts[0];
                        if (amounts.length >= 2 && !data.taxamount) data.taxamount = amounts[1];
                        break;
                    }
                }

                // === 6. 查验次数 & 时间 ===
                const qcMatch = bodyText.match(/查验次数[\uff1a:]?\s*第?\s*(\d+)\s*次/);
                if (qcMatch) data.queryCount = qcMatch[1];
                const qtMatch = bodyText.match(/查验时间[\uff1a:]?\s*([\d\- :]+)/);
                if (qtMatch) data.updateTime = qtMatch[1].trim();

                // === 7. 商品明细 (goodsData) ===
                const goodsData = [];
                const rows = document.querySelectorAll('tr');
                let headerFound = false;
                const headerKeywords = ['项目名称', '规格型号', '单位', '数量', '单价', '金额', '税率', '税额'];
                for (const row of rows) {
                    const cells = row.querySelectorAll('td, th');
                    const texts = Array.from(cells).map(c => (c.innerText || '').trim());
                    if (!headerFound) {
                        if (texts.some(t => t.includes('项目名称'))) {
                            headerFound = true;
                            continue;
                        }
                    } else {
                        if (texts.some(t => /^合\s*计$/.test(t))) break;
                        if (texts.length < 4) continue;
                        // 跳过表头行（td 渲染的表头）
                        if (headerKeywords.includes(texts[0])) continue;
                        const item = {
                            name:  texts[0] || '',
                            spec:  texts[1] || '',
                            unit:  texts[2] || '',
                            amount: texts[3] || '',
                            priceUnit: texts[4] || '',
                            priceSum: (texts[5] || '').replace(/[\u00a5\uffe5,]/g, ''),
                            taxRate: texts[6] || '',
                            taxSum: (texts[7] || '').replace(/[\u00a5\uffe5,]/g, ''),
                        };
                        if (item.name && item.name !== '-') goodsData.push(item);
                    }
                }
                if (goodsData.length > 0) data.goodsData = goodsData;

                // === 8. 清理 ===
                // 发票代码不应包含中文
                if (data.fpdm && /[\u4e00-\u9fa5]/.test(data.fpdm)) delete data.fpdm;
                // fpzt 不应包含 "打印"/"关闭" 等按钮文本
                if (data.fpzt && (/打印|关闭/.test(data.fpzt))) delete data.fpzt;
                // 校验码不应与发票号码相同
                if (data.jym && data.jym === data.fphm) delete data.jym;
                // 名称/税号字段不应是标签文本（如 "销售方名称："）
                for (const k of ['gfMc', 'xfMc']) {
                    if (data[k] && /^[\u4e00-\u9fa5]+[\uff1a:]\s*$/.test(data[k])) delete data[k];
                }

                // === 9. 交通票种自动计算不含税金额和税额 ===
                // 铁路客运 9%, 公路/水路 3%
                if (data.sumamount && !data.goodsamount && !data.taxamount) {
                    const sum = parseFloat(data.sumamount);
                    if (!isNaN(sum) && sum > 0) {
                        const typeName = (data.fplxName || '').toLowerCase();
                        let taxRate = 0;
                        if (/铁路/.test(typeName)) taxRate = 0.09;
                        else if (/航空/.test(typeName)) taxRate = 0.09;
                        else if (data.departure || data.arrival || data.trainNo) taxRate = 0.09;
                        if (taxRate > 0) {
                            const goodsAmt = sum / (1 + taxRate);
                            data.goodsamount = goodsAmt.toFixed(2);
                            data.taxamount = (sum - goodsAmt).toFixed(2);
                        }
                    }
                }

                return data;
            }
            """,
    )

    _fill_result_frame_fallback_fields(
        data=data,
        frame_text=frame_text,
    )

    return _finalize_parsed_result(
        data=data,
        raw_text=frame_text,
        expected_fphm=expected_fphm,
        data_log_label="\u89e3\u6790\u7ed3\u679c",
        mismatch_log_label="\u7ed3\u679c",
        unparsed_error="\u67e5\u9a8c\u5df2\u63d0\u4ea4\uff0c\u4f46\u65e0\u6cd5\u89e3\u6790\u7ed3\u679c\u3002",
        empty_error="\u67e5\u9a8c\u7ed3\u679c\u4e3a\u7a7a",
    )


_RESULT_DOM_CN_TO_KEY_MAP: Dict[str, str] = {
    "发票代码": "fpdm",
    "发票号码": "fphm",
    "开票日期": "kprq",
    "发票类型": "fplxName",
    "发票种类": "fplxName",
    "发票类型名称": "fplxName",
    "校验码": "jym",
    "机器编号": "jqbh",
    "发票状态": "fpzt",
    "状态": "fpzt",
    "销售方名称": "xfMc",
    "销方名称": "xfMc",
    "开票方": "xfMc",
    "销售方": "xfMc",
    "销方": "xfMc",
    "销售方纳税人识别号": "xfNsrsbh",
    "销方纳税人识别号": "xfNsrsbh",
    "销售方识别号": "xfNsrsbh",
    "销方识别号": "xfNsrsbh",
    "购买方名称": "gfMc",
    "购方名称": "gfMc",
    "受票方": "gfMc",
    "购买方": "gfMc",
    "购方": "gfMc",
    "购买方纳税人识别号": "gfNsrsbh",
    "购方纳税人识别号": "gfNsrsbh",
    "购买方识别号": "gfNsrsbh",
    "购方识别号": "gfNsrsbh",
    "金额": "goodsamount",
    "合计金额": "goodsamount",
    "不含税金额": "goodsamount",
    "税额": "taxamount",
    "合计税额": "taxamount",
    "价税合计": "sumamount",
    "合计": "sumamount",
    "价税合计(小写)": "sumamount",
    "价税合计（小写）": "sumamount",
    "备注": "bz",
    "收款人": "skr",
    "复核": "fhr",
    "开票人": "kpr",
}


def _merge_result_dom_data(data: Dict[str, Any], dom_data: Dict[str, Any]) -> None:
    """Merge mapped DOM extraction fields into normalized result payload."""
    for cn_label, std_key in _RESULT_DOM_CN_TO_KEY_MAP.items():
        if cn_label in dom_data and dom_data[cn_label]:
            val = dom_data[cn_label].strip()
            if val and val != "--" and val != "-":
                data[std_key] = val


def _clean_result_data_fields(data: Dict[str, Any]) -> None:
    """Apply normalized cleanup rules to parsed result fields."""
    if data.get("fpdm") and re.search(r"[一-龥]", data["fpdm"]):
        del data["fpdm"]

    if data.get("fpzt") and re.search(r"打印|关闭", data["fpzt"]):
        del data["fpzt"]

    if data.get("jym") and data.get("fphm") and data["jym"] == data["fphm"]:
        del data["jym"]

    for amt_key in ("goodsamount", "taxamount", "sumamount"):
        if amt_key in data:
            data[amt_key] = re.sub(r"[¥￥,]", "", data[amt_key])

    if data.get("sumamount") and not data.get("goodsamount") and not data.get("taxamount"):
        try:
            sum_amt = float(data["sumamount"])
            if sum_amt > 0:
                type_name = data.get("fplxName", "").lower()
                tax_rate = 0
                if "铁路" in type_name or "航空" in type_name:
                    tax_rate = 0.09
                if tax_rate > 0:
                    goods_amt = sum_amt / (1 + tax_rate)
                    data["goodsamount"] = f"{goods_amt:.2f}"
                    data["taxamount"] = f"{sum_amt - goods_amt:.2f}"
        except (ValueError, TypeError) as e:
            _log_skip("derive transport tax fields", e)


_RESULT_PAGE_FIELD_PATTERNS: Dict[str, str] = {
    "fpdm": r"发票代码[：:\s]*([A-Za-z0-9]+)",
    "fphm": r"\u53d1\u7968\u53f7\u7801[\uFF1A:\s]*([A-Za-z0-9]+)",
    "kprq": r"开票日期[：:\s]*([\d\-/年月日]+)",
    "fplxName": r"发票[类种][型类][名称]*[：:\s]*([^\n\r]+?)(?:\s{2,}|\n|$)",
    "goodsamount": r"(?:合计)?(?:不含税)?金额[（(合计)）]*[：:\s]*[¥￥]?([\d,.]+)",
    "taxamount": r"(?:合计)?税额[（(合计)）]*[：:\s]*[¥￥]?([\d,.]+)",
    "sumamount": r"价税合计[（(小写)）]*[：:\s]*[¥￥]?([\d,.]+)",
    "xfMc": r"销[售方][方名称]*[：:\s]*([^\n\r]{2,50}?)(?:\s{2,}|\n|$)",
    "gfMc": r"购[买方][方名称]*[：:\s]*([^\n\r]{2,50}?)(?:\s{2,}|\n|$)",
    "xfNsrsbh": r"销[售方][方纳税人]*识别号[：:\s]*([A-Za-z0-9]+)",
    "gfNsrsbh": r"购[买方][方纳税人]*识别号[：:\s]*([A-Za-z0-9]+)",
}

_RESULT_PAGE_CSS_SELECTORS: Dict[str, Sequence[str]] = {
    "fpdm": ["#fpdm", "[name='fpdm']", ".fpdm"],
    "fphm": ["#fphm", "[name='fphm']", ".fphm"],
    "kprq": ["#kprq", "[name='kprq']", ".kprq"],
}


def _read_result_page_text(page: Any) -> Optional[str]:
    """Read result page body text with consistent diagnostics."""
    return _read_body_text(
        target=page,
        length_label="page text length",
        preview_label="page text preview",
        error_handler=_log_read_result_page_text_error,
    )


def _detect_result_page_error(page_text: str) -> Optional[ParserResult]:
    """Return known business error parsed from result page text."""
    return _detect_matched_error(
        text=page_text,
        matcher=_match_result_page_error,
        log_label="page error detected",
    )


def _evaluate_result_dom_data(page: Any, script: str) -> Dict[str, Any]:
    """Evaluate result-page DOM extraction script with safe fallback."""
    return _evaluate_dom_data(
        target=page,
        script=script,
        error_log_label="JS DOM extraction error",
        success_log_prefix="DOM extracted",
    )


def _parse_result(page: Any, expected_fphm: str = "") -> ParserResult:
    """解析查验结果页面\n\n    税局平台在表单 POST 后跳转到 xdp_cyjg83.html 结果页，\n    结果页是完整 HTML 文档，包含发票信息的表格/表单。\n    策略：\n      1. 先检查是否在结果页\n      2. 用 JS 从 DOM 提取所有 label:value 对\n      3. 用 regex 从 inner_text 补充\n"""
    current_url = page.url
    _log(f"[RPA] 解析结果页, 当前URL: {current_url}")

    # ensure page load completed
    _wait_page_for_result_parse(page)

    # 读取页面文本
    page_text = _read_result_page_text(page)
    if page_text is None:
        return _error_result("无法读取查验结果页面")

    page_error = _detect_result_page_error(page_text)
    if page_error:
        return page_error

    # ---- 策略A: JS 从 DOM 提取键值对 ----
    data = {}
    dom_data = _evaluate_result_dom_data(
        page=page,
        script=r"""
            () => {
                const result = {};

                // 方式1: 查找所有 table 中 label-value 对
                // 税局结果页常用 <td class="...label...">标签</td><td>值</td>
                const tds = document.querySelectorAll('td');

                // 辅助: 同行右侧 → 同列下一行
                const _fv = (td, allTds, idx) => {
                    if (idx + 1 < allTds.length && td.closest('tr') === allTds[idx + 1].closest('tr')) {
                        const nt = (allTds[idx + 1].innerText || '').trim();
                        if (!/^(?:购买方|销售方|购方|销方)/.test(nt.replace(/\s+/g, ''))) return nt;
                    }
                    const tr = td.closest('tr');
                    if (tr) {
                        const cs = Array.from(tr.querySelectorAll(':scope > td, :scope > th'));
                        const ci = cs.indexOf(td);
                        const nr = tr.nextElementSibling;
                        if (nr && ci >= 0) {
                            const nc = Array.from(nr.querySelectorAll(':scope > td, :scope > th'));
                            if (ci < nc.length) return (nc[ci].innerText || '').trim();
                        }
                    }
                    return '';
                };

                for (let i = 0; i < tds.length - 1; i++) {
                    const labelTd = tds[i];
                    const valueTd = tds[i + 1];
                    const labelText = (labelTd.innerText || '').trim().replace(/[：:]/g, '');
                    const valueText = (valueTd.innerText || '').trim();
                    if (labelText && valueText && labelText.length < 20
                        && !/(?:购买方|销售方|购方|销方)/.test(labelText)) {
                        result[labelText] = valueText;
                    }
                }

                // 方式2: 查找 class/id 含 label 的元素及其兄弟/后续元素
                const labels = document.querySelectorAll('[class*="label"], [class*="name"], .title-td, .content-td');
                labels.forEach(el => {
                    const label = (el.innerText || '').trim().replace(/[：:]/g, '');
                    const next = el.nextElementSibling;
                    if (label && next) {
                        const val = (next.innerText || '').trim();
                        if (val && label.length < 20) result[label] = val;
                    }
                });

                // 方式3: 查找 <span> 或 <div> 中的键值结构
                const spans = document.querySelectorAll('span, div, p');
                spans.forEach(el => {
                    const text = (el.innerText || '').trim();
                    // 匹配 "标签：值" 或 "标签:值" 格式
                    const m = text.match(/^([^：:]{2,15})[：:]\s*(.+)$/s);
                    if (m) {
                        const k = m[1].trim();
                        const v = m[2].trim();
                        if (v && !result[k]) result[k] = v;
                    }
                });

                // 方式4: 购买方/销售方 区域感知
                // Pass 1: 复合标签（同行右侧 → 同列下一行）
                for (let i = 0; i < tds.length; i++) {
                    const r4 = (tds[i].innerText || '').trim().replace(/\s+/g, '');
                    const cnm = r4.match(/^(购买方|销售方|购方|销方)[\s]*名[\s]*称[\uff1a:]*(.*)$/s);
                    if (cnm) {
                        const pfx = /购/.test(cnm[1]) ? '购买方名称' : '销售方名称';
                        let val = (cnm[2] || '').trim();
                        if (!val) val = _fv(tds[i], tds, i);
                        if (val && val.length >= 2 && !/^[\u4e00-\u9fa5]+[\uff1a:]/.test(val)
                            && !/^(?:购买方|销售方|购方|销方)/.test(val.replace(/\s+/g, ''))
                            && !result[pfx]) result[pfx] = val;
                    }
                    const ctx = r4.match(/^(购买方|销售方|购方|销方).*(统一社会信用代码|纳税人识别号)[\s\uff1a:]*([A-Za-z0-9]*)/s);
                    if (ctx) {
                        const pfx = /购/.test(ctx[1]) ? '购买方纳税人识别号' : '销售方纳税人识别号';
                        let taxNo = (ctx[3] || '').trim();
                        if (!taxNo) {
                            const nv = _fv(tds[i], tds, i);
                            const tm = nv.match(/([A-Za-z0-9]{15,20})/);
                            if (tm) taxNo = tm[1];
                        }
                        if (taxNo && !result[pfx]) result[pfx] = taxNo;
                    }
                }
                // Pass 2: 裸标签 + 顺序分配
                {
                    let fz4 = '';
                    const bn4 = [];
                    const bt4 = [];
                    for (let i = 0; i < tds.length; i++) {
                        const r4 = (tds[i].innerText || '').trim().replace(/\s+/g, '');
                        if (/购买方|购方/.test(r4) && !fz4) fz4 = 'buyer';
                        if (/销售方|销方/.test(r4) && !fz4) fz4 = 'seller';
                        if (!result['购买方名称'] || !result['销售方名称']) {
                            let nv = '';
                            const nm4 = r4.match(/^名[\s]*称[\uff1a:]\s*(.+)/s);
                            if (nm4 && nm4[1].trim()) nv = nm4[1].trim();
                            else if (/^名[\s]*称[\uff1a:\uff1a]*$/.test(r4) && i + 1 < tds.length) nv = (tds[i + 1].innerText || '').trim();
                            if (nv && nv.length >= 2 && !/^[\u4e00-\u9fa5]+[\uff1a:]/.test(nv)) {
                                bn4.push(nv);
                            }
                        }
                        if (!result['购买方纳税人识别号'] || !result['销售方纳税人识别号']) {
                            let tv = '';
                            const tx4 = r4.match(/^(?:统一社会信用代码|纳税人识别号)[^\uff1a:]*[\uff1a:]\s*([A-Za-z0-9]+)/s);
                            if (tx4) tv = tx4[1];
                            else if (/^(?:统一社会信用代码|纳税人识别号)/.test(r4) && i + 1 < tds.length) {
                                const nxt = (tds[i + 1].innerText || '').trim();
                                const tm = nxt.match(/([A-Za-z0-9]{15,20})/);
                                if (tm) tv = tm[1];
                            }
                            if (tv) bt4.push(tv);
                        }
                    }
                    if (bn4.length >= 1) { const k = fz4 === 'seller' ? '销售方名称' : '购买方名称'; if (!result[k]) result[k] = bn4[0]; }
                    if (bn4.length >= 2) { const k = fz4 === 'seller' ? '购买方名称' : '销售方名称'; if (!result[k]) result[k] = bn4[1]; }
                    if (bt4.length >= 1) { const k = fz4 === 'seller' ? '销售方纳税人识别号' : '购买方纳税人识别号'; if (!result[k]) result[k] = bt4[0]; }
                    if (bt4.length >= 2) { const k = fz4 === 'seller' ? '购买方纳税人识别号' : '销售方纳税人识别号'; if (!result[k]) result[k] = bt4[1]; }
                }

                return result;
            }
            """,
    )
    if dom_data:
        _merge_result_dom_data(data=data, dom_data=dom_data)
    _clean_result_data_fields(data=data)

    _fill_missing_by_regex_patterns(
        data=data,
        source_text=page_text,
        patterns=_RESULT_PAGE_FIELD_PATTERNS,
    )

    # ---- 策略C: 用 CSS 选择器直接提取特定元素 ----
    _fill_missing_by_css_selectors(
        page=page,
        data=data,
        selectors_map=_RESULT_PAGE_CSS_SELECTORS,
    )

    return _finalize_parsed_result(
        data=data,
        raw_text=page_text,
        expected_fphm=expected_fphm,
        data_log_label="\u89e3\u6790\u5230\u5b57\u6bb5",
        mismatch_log_label="\u7ed3\u679c\u9875",
        unparsed_error="\u67e5\u9a8c\u5df2\u63d0\u4ea4\uff0c\u4f46\u65e0\u6cd5\u89e3\u6790\u7ed3\u679c\u3002\u9875\u9762\u53ef\u80fd\u9700\u8981\u4eba\u5de5\u786e\u8ba4\u3002",
        empty_error="\u67e5\u9a8c\u7ed3\u679c\u4e3a\u7a7a\uff0c\u53ef\u80fd\u67e5\u9a8c\u672a\u6210\u529f\u63d0\u4ea4",
    )
