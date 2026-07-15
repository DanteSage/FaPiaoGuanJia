import os
import logging
from typing import Any, Dict

import fitz

logger = logging.getLogger(__name__)

from utils import ensure_outputs_dir

from engines.ocr_engine import (
    pixmap_to_numpy,
    run_ocr_rapidocr,
    run_ocr_winrt,
    is_rapidocr_available,
    is_winrt_available,
)
from .fields import extract_fields


_OCR_TARGET_SHORT_SIDE = 2400
_OCR_MIN_ZOOM = 1.0
_OCR_MAX_ZOOM = 4.0


def _compute_adaptive_zoom(page) -> float:
    rect = page.rect
    short_side = min(rect.width, rect.height)
    if short_side <= 0:
        return 2.0
    zoom = _OCR_TARGET_SHORT_SIDE / short_side
    return max(_OCR_MIN_ZOOM, min(_OCR_MAX_ZOOM, zoom))


def ocr_image(file_path: str) -> Dict[str, Any]:
    text, blocks = ("", [])

    if is_rapidocr_available():
        doc = fitz.open(file_path)
        try:
            page = doc.load_page(0)
            zoom = _compute_adaptive_zoom(page)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            img = pixmap_to_numpy(pix)
            text, blocks = run_ocr_rapidocr(img)
        finally:
            doc.close()
    elif is_winrt_available():
        doc = fitz.open(file_path)
        try:
            page = doc.load_page(0)
            zoom = _compute_adaptive_zoom(page)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            out_dir = ensure_outputs_dir()
            tmp_path = os.path.join(out_dir, f"tmp_ocr_image_{os.getpid()}.png")
            with open(tmp_path, "wb") as handle:
                handle.write(pix.tobytes("png"))
            try:
                text, blocks = run_ocr_winrt(tmp_path)
            finally:
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
        finally:
            doc.close()

    text = text.strip()
    return {
        "text": text,
        "fields": extract_fields(text),
        "blocks": [{"text": b.text, "confidence": b.confidence} for b in blocks],
    }
