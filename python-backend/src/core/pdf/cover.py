import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import fitz

from utils import ensure_outputs_dir, mm_to_pt


_REIMBURSEMENT_TYPE_LABELS: Dict[str, str] = {
    "travel": "差旅费",
    "transportation": "交通费",
    "accommodation": "住宿费",
    "office": "办公费",
    "entertainment": "招待费",
    "meal": "餐饮费",
    "training": "培训费",
    "communication": "通讯费",
    "medical": "医疗费",
    "other": "其他",
}

_STATUS_LABELS: Dict[str, str] = {
    "draft": "草稿",
    "pending_payment": "待支付",
    "paid": "已支付",
}


def _aggregate_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """按 category 合并同类票据，汇总数量和金额。"""
    from collections import OrderedDict
    groups: OrderedDict[str, Dict[str, Any]] = OrderedDict()
    for item in items:
        cat = str(item.get("category") or "其他").strip()
        if cat not in groups:
            groups[cat] = {
                "subject": cat,
                "category": cat,
                "quantity": 0,
                "amount": 0.0,
                "taxAmount": 0.0,
                "notes": "",
            }
        g = groups[cat]
        g["quantity"] += 1
        g["amount"] += float(item.get("amount") or 0)
        g["taxAmount"] += float(item.get("taxAmount") or 0)
        note = str(item.get("notes") or item.get("remark") or item.get("memo") or "").strip()
        if note and note not in g["notes"]:
            g["notes"] = (g["notes"] + "；" + note).strip("；") if g["notes"] else note
    return list(groups.values())

def _find_cjk_font_file() -> Optional[str]:
    candidates: List[str] = []
    if sys.platform.startswith("win"):
        win_fonts = os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts")
        candidates.extend([
            os.path.join(win_fonts, "msyh.ttc"),
            os.path.join(win_fonts, "msyh.ttf"),
            os.path.join(win_fonts, "msyhbd.ttc"),
            os.path.join(win_fonts, "simsun.ttc"),
            os.path.join(win_fonts, "simhei.ttf"),
        ])
    elif sys.platform == "darwin":
        candidates.extend([
            "/System/Library/Fonts/PingFang.ttc",
            "/Library/Fonts/Songti.ttc",
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/System/Library/Fonts/STHeiti Medium.ttc",
        ])
    else:
        candidates.extend([
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
            "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        ])
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


def _format_date(ts: Any) -> str:
    if not ts:
        return ""
    if isinstance(ts, str):
        return ts
    try:
        return time.strftime("%Y-%m-%d", time.localtime(float(ts) / 1000.0))
    except (TypeError, ValueError):
        return ""


def _format_amount(value: Any) -> str:
    try:
        n = float(value or 0)
    except (TypeError, ValueError):
        return "0.00"
    return f"{n:,.2f}"


_DEFAULT_TEMPLATE: Dict[str, Any] = {
    "title": "费用报销单",
    "companyName": "",
    "themeColor": "#1f2937",
    "footerNotes": "",
    "pageSize": "A4",
    "itemRows": 4,
    "sections": {
        "baseInfo": True,
        "itemsTable": True,
        "purposeBlock": True,
        "signatureBlock": True,
    },
    "fieldLabels": {
        "applicant": "申请人",
        "department": "所属部门",
        "type": "报销类型",
        "date": "申请日期",
        "purpose": "起点",
        "endpoint": "终点",
    },
    "signatures": {
        "columns": 1,
        "slots": ["申请人签字", "部门负责人", "财务审核", "总经理批准"],
    },
}

_PAGE_PRESETS: Dict[str, Dict[str, Any]] = {
    # A4 整页：封面独占一整张 A4
    "A4": {"w": 210.0, "h": 297.0, "margin": 16.0, "scale": 1.0, "halfPage": False},
    # A4 半页贴单：封面只占 A4 上半，下半部留给第一张发票（中间虚线分隔）
    "half": {"w": 210.0, "h": 297.0, "margin": 12.0, "scale": 0.78, "halfPage": True},
}

# A4 半页贴单：上半部底部位置（含分隔虚线）
_HALF_PAGE_DIVIDER_MM = 148.5


def _parse_hex_color(hex_str: Any) -> Tuple[float, float, float]:
    """HEX 颜色转 fitz 0~1 RGB。失败返回默认深灰。"""
    default = (0.12, 0.16, 0.22)
    if not isinstance(hex_str, str):
        return default
    s = hex_str.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) != 6:
        return default
    try:
        r = int(s[0:2], 16) / 255.0
        g = int(s[2:4], 16) / 255.0
        b = int(s[4:6], 16) / 255.0
        return (r, g, b)
    except ValueError:
        return default


def _mix_with_white(rgb: Tuple[float, float, float], ratio: float) -> Tuple[float, float, float]:
    """与白色混合，ratio=0 原色，ratio=1 白色。用于生成浅色表头底。"""
    ratio = max(0.0, min(1.0, float(ratio)))
    return (
        rgb[0] + (1.0 - rgb[0]) * ratio,
        rgb[1] + (1.0 - rgb[1]) * ratio,
        rgb[2] + (1.0 - rgb[2]) * ratio,
    )


def _merge_template(template: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """将用户模板与默认模板深合并。"""
    merged: Dict[str, Any] = {
        "title": _DEFAULT_TEMPLATE["title"],
        "companyName": _DEFAULT_TEMPLATE["companyName"],
        "themeColor": _DEFAULT_TEMPLATE["themeColor"],
        "footerNotes": _DEFAULT_TEMPLATE["footerNotes"],
        "pageSize": _DEFAULT_TEMPLATE["pageSize"],
        "itemRows": _DEFAULT_TEMPLATE["itemRows"],
        "sections": dict(_DEFAULT_TEMPLATE["sections"]),
        "fieldLabels": dict(_DEFAULT_TEMPLATE["fieldLabels"]),
        "signatures": {
            "columns": _DEFAULT_TEMPLATE["signatures"]["columns"],
            "slots": list(_DEFAULT_TEMPLATE["signatures"]["slots"]),
        },
    }
    if not isinstance(template, dict):
        return merged
    for key in ("title", "companyName", "themeColor", "footerNotes"):
        val = template.get(key)
        if isinstance(val, str):
            merged[key] = val
    page_size = template.get("pageSize")
    if isinstance(page_size, str):
        ps = page_size.strip()
        if ps in _PAGE_PRESETS:
            merged["pageSize"] = ps
        elif ps.upper() in _PAGE_PRESETS:
            merged["pageSize"] = ps.upper()
        elif ps.lower() in _PAGE_PRESETS:
            merged["pageSize"] = ps.lower()
    item_rows = template.get("itemRows")
    if isinstance(item_rows, (int, float)) and 1 <= int(item_rows) <= 50:
        merged["itemRows"] = int(item_rows)
    sections = template.get("sections")
    if isinstance(sections, dict):
        for k in merged["sections"].keys():
            if k in sections and isinstance(sections[k], bool):
                merged["sections"][k] = sections[k]
    labels = template.get("fieldLabels")
    if isinstance(labels, dict):
        for k in merged["fieldLabels"].keys():
            val = labels.get(k)
            if isinstance(val, str) and val.strip():
                merged["fieldLabels"][k] = val.strip()
    sigs = template.get("signatures")
    if isinstance(sigs, dict):
        cols = sigs.get("columns")
        if isinstance(cols, int) and cols in (1, 2, 3, 4):
            merged["signatures"]["columns"] = cols
        slots = sigs.get("slots")
        if isinstance(slots, list) and slots:
            valid = [str(s).strip() for s in slots if isinstance(s, (str,)) and str(s).strip()]
            if valid:
                merged["signatures"]["slots"] = valid[:6]
    return merged


class _CoverDrawer:
    """报销单封面绘制器，支持 A4 / A5 等纸张规格"""

    def __init__(self, template: Optional[Dict[str, Any]] = None) -> None:
        self.template = _merge_template(template)
        self.theme_rgb = _parse_hex_color(self.template["themeColor"])
        self.header_fill = _mix_with_white(self.theme_rgb, 0.82)
        self.total_fill = _mix_with_white(self.theme_rgb, 0.92)

        preset = _PAGE_PRESETS.get(str(self.template.get("pageSize") or "A4"), _PAGE_PRESETS["A4"])
        self.page_w_mm: float = float(preset["w"])
        self.page_h_mm: float = float(preset["h"])
        self.margin_mm: float = float(preset["margin"])
        self.scale: float = float(preset["scale"])
        self.half_page: bool = bool(preset.get("halfPage", False))

        self.doc = fitz.open()
        self.page = self.doc.new_page(width=mm_to_pt(self.page_w_mm), height=mm_to_pt(self.page_h_mm))
        self.font_name = "helv"
        self.font_path = _find_cjk_font_file()
        if self.font_path:
            try:
                self.page.insert_font(fontname="cn", fontfile=self.font_path)
                self.font_name = "cn"
            except Exception:
                self.font_name = "helv"
        self.cursor_y = mm_to_pt(self.margin_mm)
        self.left = mm_to_pt(self.margin_mm)
        self.right = mm_to_pt(self.page_w_mm - self.margin_mm)
        # half 模式下绘制底部受限于 A4 上半部；其余模式用页面底部减边距
        if self.half_page:
            self.bottom = mm_to_pt(_HALF_PAGE_DIVIDER_MM - 4.0)
        else:
            self.bottom = mm_to_pt(self.page_h_mm - self.margin_mm)
        self.usable_w = self.right - self.left

    def _s(self, base: float) -> float:
        """按页面规格缩放尺寸（mm 或字号）"""
        return base * self.scale

    def _new_page(self) -> None:
        self.page = self.doc.new_page(width=mm_to_pt(self.page_w_mm), height=mm_to_pt(self.page_h_mm))
        if self.font_path:
            try:
                self.page.insert_font(fontname="cn", fontfile=self.font_path)
            except Exception:
                pass
        self.cursor_y = mm_to_pt(self.margin_mm)

    def _ensure_space(self, needed_pt: float) -> None:
        if self.cursor_y + needed_pt > self.bottom:
            self._new_page()

    def _draw_text(self, x: float, y: float, text: str, size: float = 10.0, color: Tuple[float, float, float] = (0, 0, 0)) -> None:
        if not text:
            return
        try:
            self.page.insert_text(
                (x, y),
                str(text),
                fontname=self.font_name,
                fontsize=size,
                color=color,
            )
        except Exception:
            try:
                self.page.insert_text((x, y), str(text), fontname="helv", fontsize=size, color=color)
            except Exception:
                pass

    def _draw_rect(self, x0: float, y0: float, x1: float, y1: float, fill: Optional[Tuple[float, float, float]] = None, stroke: Optional[Tuple[float, float, float]] = (0.7, 0.7, 0.7), width: float = 0.5) -> None:
        rect = fitz.Rect(x0, y0, x1, y1)
        self.page.draw_rect(rect, color=stroke, fill=fill, width=width)

    def draw_title(self, data_title: str) -> None:
        # 主标题优先使用 data.title（单据实例标题，如「2026 年 3 月差旅」），其次回退到 template.title
        company = str(self.template.get("companyName") or "").strip()
        data_title_clean = str(data_title or "").strip()
        template_title = str(self.template.get("title") or "").strip()
        main_title = data_title_clean or template_title or "费用报销单"

        extra_top = mm_to_pt(self._s(6)) if company else 0
        self._ensure_space(mm_to_pt(self._s(20)) + extra_top)

        center_x = (self.left + self.right) / 2

        def _text_w(text: str, size: float) -> float:
            return sum((size if ord(ch) > 127 else size * 0.5) for ch in text)

        if company:
            company_size = self._s(11)
            self._draw_text(
                center_x - _text_w(company, company_size) / 2,
                self.cursor_y + mm_to_pt(self._s(4.5)),
                company,
                size=company_size,
                color=(0.45, 0.45, 0.45),
            )
            self.cursor_y += mm_to_pt(self._s(6))

        title_size = self._s(20)
        self._draw_text(
            center_x - _text_w(main_title, title_size) / 2,
            self.cursor_y + mm_to_pt(self._s(8)),
            main_title,
            size=title_size,
            color=self.theme_rgb,
        )
        self.cursor_y += mm_to_pt(self._s(14))
        self.page.draw_line(
            (self.left, self.cursor_y),
            (self.right, self.cursor_y),
            color=self.theme_rgb,
            width=0.8,
        )
        self.cursor_y += mm_to_pt(self._s(4))

    def draw_basic_info(self, data: Dict[str, Any]) -> None:
        """基础信息：申请人/所属部门/报销类型/申请日期 两列布局"""
        labels = self.template["fieldLabels"]
        rows: List[Tuple[str, str]] = [
            (labels["applicant"], str(data.get("applicant") or "")),
            (labels["department"], str(data.get("department") or "")),
            (labels["type"], _REIMBURSEMENT_TYPE_LABELS.get(str(data.get("type") or ""), str(data.get("type") or ""))),
            (labels["date"], _format_date(data.get("createdAt"))),
        ]

        cols = 2
        col_w = self.usable_w / cols
        row_h = mm_to_pt(self._s(12))
        rows_count = (len(rows) + cols - 1) // cols
        block_h = row_h * rows_count
        self._ensure_space(block_h + mm_to_pt(self._s(3)))

        for idx, (label, value) in enumerate(rows):
            r = idx // cols
            c = idx % cols
            x = self.left + c * col_w
            y = self.cursor_y + r * row_h
            self._draw_text(x, y + mm_to_pt(self._s(3.5)), label, size=self._s(8.5), color=(0.45, 0.45, 0.45))
            if value:
                self._draw_text(x, y + mm_to_pt(self._s(8.2)), value, size=self._s(10.5))

        self.cursor_y += block_h + mm_to_pt(self._s(4))

    def draw_items_table(self, items: List[Dict[str, Any]], total_amount: float, total_tax: float) -> None:
        """费用明细表格"""
        self._ensure_space(mm_to_pt(self._s(14)))
        self._draw_text(self.left, self.cursor_y + mm_to_pt(self._s(4)), "费用明细", size=self._s(12), color=self.theme_rgb)
        self.cursor_y += mm_to_pt(self._s(6))

        header = ["序号", "报销事项", "票据数量", "票据类别", "金额(元)", "备注"]
        col_ratios = [0.07, 0.30, 0.11, 0.14, 0.15, 0.23]
        col_widths = [r * self.usable_w for r in col_ratios]
        row_h = mm_to_pt(self._s(7))
        pad_x = mm_to_pt(self._s(1.5))
        text_y_off = mm_to_pt(self._s(4.8))

        def x_offset(col_idx: int) -> float:
            return self.left + sum(col_widths[:col_idx])

        def _subject_of(item: Dict[str, Any]) -> str:
            for key in ("subject", "itemName", "description"):
                v = item.get(key)
                if isinstance(v, str) and v.strip():
                    return v.strip()
            cat = item.get("category")
            if isinstance(cat, str) and cat.strip():
                return cat.strip()
            return "—"

        def _quantity_of(item: Dict[str, Any]) -> str:
            q = item.get("quantity")
            if isinstance(q, (int, float)) and q:
                return str(int(q))
            return "1"

        def _note_of(item: Dict[str, Any]) -> str:
            for key in ("notes", "remark", "memo"):
                v = item.get(key)
                if isinstance(v, str) and v.strip():
                    return v.strip()
            return ""

        grid_color = (0.72, 0.72, 0.72)
        line_w = 0.4

        def _text_w(text: str, size: float) -> float:
            return sum((size if ord(ch) > 127 else size * 0.5) for ch in text)

        def _draw_centered_at(col_idx: int, y_top: float, text: str, size: float, color: Tuple[float, float, float] = (0, 0, 0)) -> None:
            cell_center = x_offset(col_idx) + col_widths[col_idx] / 2
            self._draw_text(cell_center - _text_w(text, size) / 2, y_top + text_y_off, text, size=size, color=color)

        min_rows = int(self.template.get("itemRows") or 4)
        n_data = max(len(items), min_rows)
        total_rows = 2 + n_data  # 表头 + 数据行（含空行补位） + 合计
        table_top = self.cursor_y
        self._ensure_space(row_h * total_rows)

        head_y = table_top
        data_y0 = table_top + row_h
        total_y = table_top + (1 + n_data) * row_h
        table_bot = table_top + total_rows * row_h

        # 1) 填充表头与合计背景（不描边，避免与统一网格线重叠）
        self._draw_rect(self.left, head_y, self.right, head_y + row_h, fill=self.header_fill, stroke=None)
        self._draw_rect(self.left, total_y, self.right, total_y + row_h, fill=self.total_fill, stroke=None)

        # 2) 统一网格线：外框 + 内部横线 + 内部竖线（同色同宽）
        self._draw_rect(self.left, table_top, self.right, table_bot, stroke=grid_color, width=line_w)
        for i in range(1, total_rows):
            y = table_top + i * row_h
            self.page.draw_line((self.left, y), (self.right, y), color=grid_color, width=line_w)
        for c in range(1, len(col_widths)):
            x = x_offset(c)
            self.page.draw_line((x, table_top), (x, table_bot), color=grid_color, width=line_w)

        # 3) 表头文字
        head_size = self._s(9.5)
        for c, head in enumerate(header):
            _draw_centered_at(c, head_y, head, head_size, color=self.theme_rgb)

        # 4) 数据行文字
        total_qty = 0
        cell_size = self._s(9)
        for idx, item in enumerate(items, start=1):
            qty_str = _quantity_of(item)
            try:
                total_qty += int(qty_str)
            except ValueError:
                total_qty += 1
            row_y = data_y0 + (idx - 1) * row_h
            values = [
                str(idx),
                _subject_of(item),
                qty_str,
                str(item.get("category") or ""),
                _format_amount(item.get("amount")),
                _note_of(item),
            ]
            for c, val in enumerate(values):
                text = val if len(val) <= 30 else val[:28] + "…"
                _draw_centered_at(c, row_y, text, cell_size)

        # 5) 合计行文字（items 为空时仅画"合计"标签，数字单元格留空）
        total_size = self._s(10)
        _draw_centered_at(0, total_y, "合计", total_size, color=self.theme_rgb)
        if len(items) > 0:
            _draw_centered_at(2, total_y, str(total_qty), total_size, color=self.theme_rgb)
            _draw_centered_at(4, total_y, _format_amount(total_amount), total_size, color=self.theme_rgb)

        self.cursor_y = table_bot + mm_to_pt(self._s(3))

    def draw_purpose_and_notes(self, data: Dict[str, Any]) -> None:
        """报销用途与备注块"""
        purpose = str(data.get("purpose") or "")
        sales = str(data.get("sales") or "")
        cost_per_day = str(data.get("costPerDay") or "")
        notes = str(data.get("notes") or "")

        purpose_label = self.template["fieldLabels"].get("purpose", "起点")
        endpoint_label = self.template["fieldLabels"].get("endpoint", "终点")
        endpoint = str(data.get("endpoint") or "")
        rows: List[Tuple[str, str]] = []
        if purpose:
            rows.append((purpose_label, purpose))
        if endpoint:
            rows.append((endpoint_label, endpoint))
        if sales:
            rows.append(("销售人/顾客", sales))
        if cost_per_day:
            rows.append(("报销说明", cost_per_day))
        if notes:
            rows.append(("备注", notes))

        if not rows:
            return

        self._ensure_space(mm_to_pt(self._s(6 + 8 * len(rows))))
        self._draw_text(self.left, self.cursor_y + mm_to_pt(self._s(4)), "报销说明", size=self._s(12), color=self.theme_rgb)
        self.cursor_y += mm_to_pt(self._s(6))

        label_w = mm_to_pt(self._s(28))
        line_h = mm_to_pt(self._s(7))
        text_y_off = mm_to_pt(self._s(4.8))
        for label, value in rows:
            self._ensure_space(line_h)
            self._draw_text(self.left, self.cursor_y + text_y_off, label, size=self._s(9.5), color=(0.45, 0.45, 0.45))
            self._draw_text(self.left + label_w, self.cursor_y + text_y_off, value, size=self._s(10))
            self.cursor_y += line_h

        self.cursor_y += mm_to_pt(self._s(2))

    def draw_signature_area(self) -> None:
        """批准与签名区（简约样式：无标题、无边框，仅「{标签}：」）"""
        sigs = self.template["signatures"]
        slot_names: List[str] = list(sigs.get("slots") or [])
        cols = int(sigs.get("columns") or 2)
        if cols not in (1, 2, 3, 4):
            cols = 2
        if not slot_names:
            return

        self._ensure_space(mm_to_pt(self._s(16)))
        self.cursor_y += mm_to_pt(self._s(4))

        rows_count = (len(slot_names) + cols - 1) // cols
        col_w = self.usable_w / cols
        row_h = mm_to_pt(self._s(14))
        label_size = self._s(10)

        for idx, label in enumerate(slot_names):
            r = idx // cols
            c = idx % cols
            x0 = self.left + c * col_w
            baseline_y = self.cursor_y + r * row_h + mm_to_pt(self._s(8))

            self._draw_text(x0, baseline_y, f"{label}：", size=label_size, color=(0.25, 0.25, 0.28))

        self.cursor_y += row_h * rows_count + mm_to_pt(self._s(3))

    def draw_half_page_divider(self) -> None:
        """A4 半页模式：在上下半页交界处绘制虚线分隔"""
        if not self.half_page:
            return
        divider_y = mm_to_pt(_HALF_PAGE_DIVIDER_MM)
        margin_x = mm_to_pt(8.0)
        x0 = margin_x
        x1 = mm_to_pt(self.page_w_mm) - margin_x

        # 绘制虚线（手动用多段短线模拟）
        dash_len = mm_to_pt(3.0)
        gap_len = mm_to_pt(2.0)
        x = x0
        while x < x1:
            x_end = min(x + dash_len, x1)
            self.page.draw_line(
                (x, divider_y),
                (x_end, divider_y),
                color=(0.35, 0.35, 0.35),
                width=0.8,
            )
            x = x_end + gap_len

    def draw_footer_notes(self) -> None:
        """底部备注文本块"""
        text = str(self.template.get("footerNotes") or "").strip()
        if not text:
            return
        # 按换行符分多行
        lines = [ln for ln in text.splitlines() if ln.strip()]
        if not lines:
            return
        self._ensure_space(mm_to_pt(self._s(6 + 5 * len(lines))))
        line_h = mm_to_pt(self._s(4.8))
        for line in lines:
            self._draw_text(self.left, self.cursor_y + mm_to_pt(self._s(3.5)), line, size=self._s(9), color=(0.45, 0.45, 0.45))
            self.cursor_y += line_h
        self.cursor_y += mm_to_pt(self._s(2))

    def save(self, output_path: str) -> str:
        out_parent = os.path.dirname(output_path)
        if out_parent:
            os.makedirs(out_parent, exist_ok=True)
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except Exception:
                pass
        self.doc.save(output_path, deflate=True, garbage=4)
        self.doc.close()
        return output_path


def build_reimbursement_cover_pdf(
    data: Dict[str, Any],
    output_path: Optional[str] = None,
    template: Optional[Dict[str, Any]] = None,
) -> str:
    """根据报销单数据生成封面 PDF，返回输出路径。

    data 必备/可选字段对齐前端 Reimbursement 类型：
      - code, title, type, applicant, department, status, createdAt, purpose
      - items: [{invoiceNumber, invoiceDate, category, amount, taxAmount}]
      - totalAmount, totalTax
      - sales, costPerDay, paymentMethod, bankName, bankAccount, notes

    template 为可选的表单定制配置，支持字段：
      - title, companyName, themeColor, footerNotes
      - sections: {baseInfo, itemsTable, purposeBlock, signatureBlock}
      - fieldLabels: {applicant, department, type, date, purpose, endpoint}
      - signatures: {columns: 1|2|3|4, slots: [str, ...]}
    """
    if not isinstance(data, dict):
        raise RuntimeError("报销单数据必须为对象")

    if not output_path:
        out_dir = ensure_outputs_dir()
        stamp = time.strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(out_dir, f"reimbursement_cover_{stamp}.pdf")

    items_raw = data.get("items")
    items_flat: List[Dict[str, Any]] = [i for i in (items_raw or []) if isinstance(i, dict)]
    items: List[Dict[str, Any]] = _aggregate_items(items_flat) if items_flat else []

    total_amount = data.get("totalAmount")
    if total_amount is None:
        total_amount = sum(float(i.get("amount") or 0) for i in items)
    total_tax = data.get("totalTax")
    if total_tax is None:
        total_tax = sum(float(i.get("taxAmount") or 0) for i in items)

    drawer = _CoverDrawer(template=template)
    sections = drawer.template["sections"]
    try:
        drawer.draw_title(str(data.get("title") or ""))
        if sections.get("baseInfo", True):
            drawer.draw_basic_info(data)
        if sections.get("itemsTable", True):
            drawer.draw_items_table(items, float(total_amount or 0), float(total_tax or 0))
        if sections.get("purposeBlock", True):
            drawer.draw_purpose_and_notes(data)
        if sections.get("signatureBlock", True):
            drawer.draw_signature_area()
        drawer.draw_footer_notes()
        drawer.draw_half_page_divider()
        return drawer.save(output_path)
    except Exception:
        try:
            drawer.doc.close()
        except Exception:
            pass
        raise
