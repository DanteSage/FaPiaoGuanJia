import os
from typing import Any, Dict, List

import fitz

from utils import ensure_outputs_dir

from engines.ocr_engine import (
    OcrBlock,
    is_rapidocr_available,
    is_winrt_available,
    pixmap_to_numpy,
    run_ocr_rapidocr,
    run_ocr_winrt,
)
from .fields import extract_fields


def ocr_pdf(file_path: str) -> Dict[str, Any]:

    doc = fitz.open(file_path)
    pages_text: List[str] = []
    blocks_all: List[OcrBlock] = []

    for i in range(doc.page_count):
        page = doc.load_page(i)
        digital_text = (page.get_text("text") or "").strip()
        if digital_text:
            pages_text.append(digital_text)
            continue

        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        text, blocks = ("", [])

        if is_rapidocr_available():
            img = pixmap_to_numpy(pix)
            text, blocks = run_ocr_rapidocr(img)
        elif is_winrt_available():
            out_dir = ensure_outputs_dir()
            tmp_path = os.path.join(out_dir, f"tmp_page_{os.getpid()}_{i}.png")
            with open(tmp_path, "wb") as handle:
                handle.write(pix.tobytes("png"))
            try:
                text, blocks = run_ocr_winrt(tmp_path)
            finally:
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

        if text.strip():
            pages_text.append(text)
        blocks_all.extend(blocks)

    doc.close()
    text = "\n\n".join(pages_text).strip()

    return {
        "text": text,
        "fields": extract_fields(text),
        "blocks": [{"text": block.text, "confidence": block.confidence} for block in blocks_all],
    }
