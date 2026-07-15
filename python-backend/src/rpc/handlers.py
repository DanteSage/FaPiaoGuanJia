from __future__ import annotations

import os
import sys
import threading
import time
from typing import Any, Dict, Set

from rpc.dispatch import register
from rpc.response import BusinessError, ok
from storage import (
    batch_insert_invoices,
    get_invoice,
    get_invoices,
    insert_invoice,
    search_invoices,
)
from utils import ensure_outputs_dir


@register("ocr")
def handle_ocr(params: Dict[str, Any]) -> Any:
    from core.ocr import ocr_file

    return ocr_file(str(params.get("filePath", "")))


@register("ocr_get_engine_status")
def handle_ocr_get_engine_status(params: Dict[str, Any]) -> Any:
    from engines.ocr_engine import is_rapidocr_available, is_winrt_available
    active = "none"
    if is_rapidocr_available():
        active = "rapidocr"
    elif is_winrt_available():
        active = "winrt"
    return ok(
        active=active,
        rapidocr=is_rapidocr_available(),
        winrt=is_winrt_available()
    )


@register("merge_pdf")
def handle_merge_pdf(params: Dict[str, Any]) -> Any:
    from core.pdf import merge_to_pdf

    fps = params.get("filePaths", [])
    if not isinstance(fps, list):
        raise BusinessError("filePaths必须为数组")
    cfg = params.get("config")
    if cfg is not None and not isinstance(cfg, dict):
        raise BusinessError("config必须为对象")
    output_path = merge_to_pdf([str(x) for x in fps], cfg)
    return {"outputPath": output_path}


@register("build_reimbursement_cover_pdf")
def handle_build_reimbursement_cover_pdf(params: Dict[str, Any]) -> Any:
    """根据报销单数据生成封面 PDF，返回 outputPath。"""
    from core.pdf.cover import build_reimbursement_cover_pdf

    data = params.get("data")
    if not isinstance(data, dict):
        raise BusinessError("data必须为对象")
    output_path = params.get("outputPath") or None
    if output_path is not None:
        output_path = str(output_path)
    template = params.get("template")
    if template is not None and not isinstance(template, dict):
        raise BusinessError("template必须为对象")
    result_path = build_reimbursement_cover_pdf(data, output_path, template)
    return {"outputPath": result_path}


def _affix_first_invoice_to_half_page(cover_path: str, invoice_path: str) -> str:
    """把第一张发票贴到半页贴单封面 PDF 的第 1 页下半部，返回新的 PDF 路径。

    支持：PDF（show_pdf_page 矢量贴入）、OFD（先转 PDF）、图片（insert_image）。
    成功后会删除原封面文件，返回贴入发票后的新文件路径。
    """
    import fitz

    from utils import is_image, is_ofd, is_pdf, mm_to_pt
    from core.ocr.ofd import ensure_pdf_for_ofd

    # A4 下半部矩形（mm）：上 = 分隔线 + 留白；下、左、右各保留 4mm/12mm 边距
    DIVIDER_MM = 148.5
    PAGE_W_MM = 210.0
    PAGE_H_MM = 297.0
    PAD_TOP_MM = 4.0
    PAD_BOTTOM_MM = 4.0
    SIDE_MARGIN_MM = 12.0

    rect = fitz.Rect(
        mm_to_pt(SIDE_MARGIN_MM),
        mm_to_pt(DIVIDER_MM + PAD_TOP_MM),
        mm_to_pt(PAGE_W_MM - SIDE_MARGIN_MM),
        mm_to_pt(PAGE_H_MM - PAD_BOTTOM_MM),
    )

    # 解析发票实际可用源（OFD 转 PDF）
    src_path = invoice_path
    if is_ofd(src_path):
        src_path = ensure_pdf_for_ofd(src_path)

    # 输出新文件名：在原封面同目录加 `_affixed` 后缀
    base, ext = os.path.splitext(cover_path)
    new_path = f"{base}_affixed{ext or '.pdf'}"

    cover_doc = fitz.open(cover_path)
    try:
        if cover_doc.page_count == 0:
            raise RuntimeError("封面 PDF 为空")
        first_page = cover_doc[0]

        if is_pdf(src_path) or src_path.lower().endswith(".pdf"):
            with fitz.open(src_path) as inv_doc:
                if inv_doc.page_count == 0:
                    raise RuntimeError("发票 PDF 为空")
                first_page.show_pdf_page(rect, inv_doc, 0, keep_proportion=True)
        elif is_image(src_path):
            first_page.insert_image(rect, filename=src_path, keep_proportion=True)
        else:
            raise RuntimeError(f"不支持的发票格式：{src_path}")

        out_parent = os.path.dirname(new_path)
        if out_parent:
            os.makedirs(out_parent, exist_ok=True)
        if os.path.exists(new_path):
            try:
                os.remove(new_path)
            except Exception:
                pass
        cover_doc.save(new_path, deflate=True, garbage=4)
    finally:
        cover_doc.close()

    # 替换原封面：删除旧文件
    try:
        if os.path.exists(cover_path) and cover_path != new_path:
            os.remove(cover_path)
    except Exception:
        pass

    return new_path


@register("build_reimbursement_pdf")
def handle_build_reimbursement_pdf(params: Dict[str, Any]) -> Any:
    """一站式：生成报销单封面 + 合并所有关联发票为单个 PDF。

    入参：
      - data: 报销单数据（同 build_reimbursement_cover_pdf）
      - invoiceFilePaths: 关联发票文件路径数组（按顺序追加在封面之后）
      - config: 可选合并配置（同 merge_pdf 的 config，coverPdfPath 会被本函数覆盖）
      - outputPath: 可选最终 PDF 输出路径
    返回：
      - outputPath: 最终合并后 PDF 路径
      - coverPath: 临时封面 PDF 路径（已被合并消费）
    """
    from core.pdf import merge_to_pdf
    from core.pdf.cover import build_reimbursement_cover_pdf

    data = params.get("data")
    if not isinstance(data, dict):
        raise BusinessError("data必须为对象")

    invoice_paths = params.get("invoiceFilePaths") or []
    if not isinstance(invoice_paths, list):
        raise BusinessError("invoiceFilePaths必须为数组")

    cfg_input = params.get("config")
    if cfg_input is not None and not isinstance(cfg_input, dict):
        raise BusinessError("config必须为对象")
    cfg: Dict[str, Any] = dict(cfg_input or {})

    template = params.get("template")
    if template is not None and not isinstance(template, dict):
        raise BusinessError("template必须为对象")

    output_path = params.get("outputPath")
    if output_path:
        cfg["outputPath"] = str(output_path)
    elif not cfg.get("outputPath"):
        stamp = time.strftime("%Y%m%d_%H%M%S")
        cfg["outputPath"] = os.path.join(ensure_outputs_dir(), f"reimbursement_{stamp}.pdf")

    # 生成封面 PDF（临时文件）
    cover_path = build_reimbursement_cover_pdf(data, None, template)
    cfg["coverPdfPath"] = cover_path

    valid_paths = [str(p) for p in invoice_paths if isinstance(p, str) and p and os.path.exists(p)]

    # 半页贴单模式：把第一张发票贴到封面下半部，剩余发票继续追加
    is_half_page = bool(isinstance(template, dict) and str(template.get("pageSize") or "").lower() == "half")
    if is_half_page and valid_paths:
        try:
            cover_path = _affix_first_invoice_to_half_page(cover_path, valid_paths[0])
            valid_paths = valid_paths[1:]
            cfg["coverPdfPath"] = cover_path
        except Exception as exc:
            # 贴单失败时降级为普通模式
            print(f"[reimbursement] half-page affix failed: {exc}", flush=True)

    if not valid_paths:
        # 没有有效发票时，直接把封面作为最终产物输出
        final_path = str(cfg["outputPath"])
        out_parent = os.path.dirname(final_path)
        if out_parent:
            os.makedirs(out_parent, exist_ok=True)
        try:
            if os.path.exists(final_path):
                os.remove(final_path)
        except Exception:
            pass
        try:
            import shutil

            shutil.move(cover_path, final_path)
        except Exception:
            # 移动失败时退回到 copy
            import shutil

            shutil.copyfile(cover_path, final_path)
        return {"outputPath": final_path, "coverPath": cover_path}

    final_path = merge_to_pdf(valid_paths, cfg)

    # 清理临时封面文件（已合并到最终 PDF 中）
    try:
        if os.path.exists(cover_path) and cover_path != final_path:
            os.remove(cover_path)
    except Exception:
        pass

    return {"outputPath": final_path, "coverPath": cover_path}


@register("merge_pngs_to_pdf")
def handle_merge_pngs_to_pdf(params: Dict[str, Any]) -> Any:
    from core.pdf import merge_pngs_to_pdf

    png_data_urls = params.get("pngDataUrls", [])
    if not isinstance(png_data_urls, list):
        raise BusinessError("pngDataUrls必须为数组")
    output_path = params.get("outputPath", "")
    if not output_path:
        out_dir = ensure_outputs_dir()
        stamp = time.strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(out_dir, f"merged_{stamp}.pdf")
    paper_width_mm = float(params.get("paperWidthMm", 210))
    paper_height_mm = float(params.get("paperHeightMm", 297))
    result_path = merge_pngs_to_pdf(
        [str(x) for x in png_data_urls], str(output_path), paper_width_mm, paper_height_mm
    )
    return {"outputPath": result_path}


@register("pdf_render_page")
def handle_pdf_render_page(params: Dict[str, Any]) -> Any:
    from core.pdf import render_pdf_page

    file_path = str(params.get("filePath", ""))
    page_index = int(params.get("pageIndex", 1))
    scale = float(params.get("scale", 2.0))
    return render_pdf_page(file_path, page_index, scale)


@register("print_pdf")
def handle_print_pdf(params: Dict[str, Any]) -> Any:
    from core.printer import print_pdf

    file_path = str(params.get("filePath", ""))
    printer_name = str(params.get("printerName", ""))
    copies = int(params.get("copies", 1))
    return print_pdf(file_path, printer_name, copies)


@register("list_printers")
def handle_list_printers(params: Dict[str, Any]) -> Any:
    from core.printer import list_printers

    return list_printers()


@register("db_insert")
def handle_db_insert(params: Dict[str, Any]) -> Any:
    data = params.get("data", {})
    invoice_id = insert_invoice(data)
    return {"id": invoice_id}


@register("db_batch_insert")
def handle_db_batch_insert(params: Dict[str, Any]) -> Any:
    data_list = params.get("dataList", [])
    batch_size = int(params.get("batchSize", 1000))
    count = batch_insert_invoices(data_list, batch_size)
    return {"insertedCount": count}


@register("db_get")
def handle_db_get(params: Dict[str, Any]) -> Any:
    invoice_id = int(params.get("id", 0))
    invoice = get_invoice(invoice_id)
    return {"data": invoice}


@register("db_list")
def handle_db_list(params: Dict[str, Any]) -> Any:
    offset = int(params.get("offset", 0))
    limit = int(params.get("limit", 100))
    status = params.get("status")
    if status is not None:
        status = int(status)
    order_by = str(params.get("orderBy", "id"))
    desc = bool(params.get("desc", True))
    data, total = get_invoices(offset, limit, status, order_by, desc)
    return {"data": data, "total": total}


@register("db_search")
def handle_db_search(params: Dict[str, Any]) -> Any:
    result, total = search_invoices(
        keyword=params.get("keyword"),
        invoice_code=params.get("invoiceCode"),
        invoice_number=params.get("invoiceNumber"),
        date_from=params.get("dateFrom"),
        date_to=params.get("dateTo"),
        amount_min=params.get("amountMin"),
        amount_max=params.get("amountMax"),
        buyer_name=params.get("buyerName"),
        seller_name=params.get("sellerName"),
        status=params.get("status"),
        offset=int(params.get("offset", 0)),
        limit=int(params.get("limit", 100)),
    )
    return {"data": result, "total": total}


@register("ofd_extract")
def handle_ofd_extract(params: Dict[str, Any]) -> Any:
    from core.ocr.ofd import extract_ofd_invoice_data, _generate_text_from_fields, _generate_labeled_fields

    file_path = str(params.get("filePath", ""))
    if not file_path or not os.path.exists(file_path):
        return {"success": False, "error": "文件不存在"}

    fields = extract_ofd_invoice_data(file_path)
    if not fields:
        print(f"[RPC ofd_extract] Java提取失败，走fallback", file=sys.stderr)
        return {"success": False, "error": "无法提取OFD数据"}

    text = _generate_text_from_fields(fields)
    labeled = _generate_labeled_fields(fields)
    print(f"[RPC ofd_extract] labeled keys={list(labeled.keys())}, 税额={labeled.get('税额','<NONE>')}, 税率={labeled.get('税率','<NONE>')}", file=sys.stderr)
    return {"success": True, "data": fields, "labeledFields": labeled, "text": text}


@register("ofd_ocr_fallback")
def handle_ofd_ocr_fallback(params: Dict[str, Any]) -> Any:
    from core.ocr.ofd import ocr_ofd_fallback

    file_path = str(params.get("filePath", ""))
    if not file_path or not os.path.exists(file_path):
        return {"success": False, "error": "文件不存在", "text": "", "fields": {}}

    result = ocr_ofd_fallback(file_path)
    lf = result.get("labeledFields", {})
    print(f"[RPC ofd_ocr_fallback] labeled keys={list(lf.keys())}, 税额={lf.get('税额','<NONE>')}, 税率={lf.get('税率','<NONE>')}", file=sys.stderr)
    return {"success": True, **result}


_preload_ofd_inflight: Set[str] = set()
_preload_ofd_lock = threading.Lock()


def _run_preload_ofd_background(file_path: str) -> None:
    from core.ocr.ofd import extract_ofd_invoice_data, ofd_render_page_png

    try:
        try:
            extract_ofd_invoice_data(file_path)
        except Exception as extract_err:
            print(f"[OFD] 后台字段提取失败: {file_path} - {extract_err}", file=sys.stderr)
        try:
            ofd_render_page_png(file_path, 1, 48.0)
        except Exception as render_err:
            print(f"[OFD] 后台预渲染失败: {file_path} - {render_err}", file=sys.stderr)
    finally:
        with _preload_ofd_lock:
            _preload_ofd_inflight.discard(file_path)


@register("preload_ofd")
def handle_preload_ofd(params: Dict[str, Any]) -> Any:
    from core.ocr.ofd import start_java_warmup

    file_path = str(params.get("filePath", ""))
    if not file_path or not os.path.exists(file_path):
        return {"success": False, "error": "文件不存在"}

    abs_path = os.path.abspath(file_path)

    with _preload_ofd_lock:
        if abs_path in _preload_ofd_inflight:
            return {"success": True, "queued": True, "skipped": "already_inflight"}
        _preload_ofd_inflight.add(abs_path)

    try:
        start_java_warmup()
    except Exception as warmup_err:
        print(f"[OFD] Java 预热触发失败: {warmup_err}", file=sys.stderr)

    threading.Thread(
        target=_run_preload_ofd_background,
        args=(abs_path,),
        name=f"ofd-preload-{os.path.basename(abs_path)}",
        daemon=True,
    ).start()

    return {"success": True, "queued": True}
