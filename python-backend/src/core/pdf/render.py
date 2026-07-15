"""PDF页面渲染模块"""

import base64
import io
import os
import sys
import time
from typing import Any, Dict, Optional

import fitz

try:
    from pdf2image import convert_from_path

    _HAS_POPPLER = True
except ImportError:
    _HAS_POPPLER = False
    convert_from_path = None

from core.ocr.ofd import ensure_pdf_for_ofd, ofd_render_page_png
from utils import is_ofd, is_pdf


def _has_unembedded_fonts(file_path: str) -> bool:
    """检查 PDF 是否有未嵌入的字体"""
    try:
        doc = fitz.open(file_path)
        for page_num in range(min(doc.page_count, 3)):
            page = doc.load_page(page_num)
            fonts = page.get_fonts(full=True)
            for font in fonts:
                if font[1] == "n/a":
                    doc.close()
                    return True
        doc.close()
    except Exception:
        pass
    return False


def _render_with_poppler(file_path: str, page_index: int, scale: float) -> Optional[Dict[str, Any]]:
    """使用 poppler 渲染 PDF 页面"""
    if not _HAS_POPPLER or convert_from_path is None:
        return None

    try:
        dpi = int(72 * scale)
        images = convert_from_path(
            file_path,
            dpi=dpi,
            first_page=page_index,
            last_page=page_index,
            fmt="png",
        )
        if not images:
            return None

        img = images[0]
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()
        png_b64 = base64.b64encode(png_bytes).decode("ascii")

        doc = fitz.open(file_path)
        page_count = int(doc.page_count)
        doc.close()

        return {
            "pageCount": page_count,
            "pageIndex": page_index,
            "width": img.width,
            "height": img.height,
            "pngBase64": png_b64,
        }
    except Exception:
        return None


def _render_with_fitz(file_path: str, page_index: int, scale: float) -> Dict[str, Any]:
    """使用 PyMuPDF (fitz) 渲染 PDF 页面"""
    doc = fitz.open(file_path)
    try:
        page_count = int(doc.page_count)
        if page_count <= 0:
            raise RuntimeError("PDF无页面")
        if page_index <= 0:
            page_index = 1
        if page_index > page_count:
            page_index = page_count
        page = doc.load_page(page_index - 1)
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        png_bytes = pix.tobytes("png")
        png_b64 = base64.b64encode(png_bytes).decode("ascii")
        return {
            "pageCount": page_count,
            "pageIndex": page_index,
            "width": int(pix.width),
            "height": int(pix.height),
            "pngBase64": png_b64,
        }
    finally:
        doc.close()


def render_pdf_page(file_path: str, page_index: int, scale: float) -> Dict[str, Any]:
    """渲染PDF/OFD页面为PNG"""
    if not os.path.exists(file_path):
        raise RuntimeError("文件不存在")

    if is_ofd(file_path):
        start_time = time.time()
        pdf_path = ensure_pdf_for_ofd(file_path)
        try:
            with fitz.open(pdf_path) as pdf_doc:
                page_count = int(pdf_doc.page_count)
        except Exception:
            page_count = 1
        if page_index <= 0:
            page_index = 1
        if page_index > page_count:
            page_index = page_count
        ppm = max(5.0, min(80.0, 15.0 * float(scale)))
        png_path = ofd_render_page_png(file_path, page_index, ppm)
        with open(png_path, "rb") as file:
            png_b64 = base64.b64encode(file.read()).decode("ascii")
        img_doc = fitz.open(png_path)
        try:
            page = img_doc.load_page(0)
            rect = page.rect
            width = int(rect.width)
            height = int(rect.height)
        finally:
            img_doc.close()
        elapsed = time.time() - start_time
        print(
            f"[render_pdf_page] OFD 渲染完成: {os.path.basename(file_path)} (总耗时: {elapsed:.2f}s)",
            file=sys.stderr,
        )
        return {
            "pageCount": page_count,
            "pageIndex": page_index,
            "width": width,
            "height": height,
            "pngBase64": png_b64,
        }

    if not is_pdf(file_path):
        raise RuntimeError("不支持的预览格式")

    scale = float(scale)
    if scale <= 0:
        scale = 2.0
    scale = max(0.5, min(8.0, scale))
    page_index = int(page_index)

    if _HAS_POPPLER and _has_unembedded_fonts(file_path):
        result = _render_with_poppler(file_path, page_index, scale)
        if result:
            return result

    return _render_with_fitz(file_path, page_index, scale)
