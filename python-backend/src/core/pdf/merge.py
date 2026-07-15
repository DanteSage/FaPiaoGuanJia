import os

import time

import base64

from typing import Any, Dict, List, Optional, Tuple


import fitz


from utils import ensure_outputs_dir, is_pdf, is_ofd, is_image, mm_to_pt

from core.ocr.ofd import ensure_pdf_for_ofd


def _paper_mm(paper_size: str) -> Tuple[float, float]:

    p = str(paper_size or "A4").lower()

    if p == "a4":

        return (210.0, 297.0)

    if p == "a5":

        return (148.0, 210.0)

    if p == "letter":

        return (216.0, 279.0)

    return (210.0, 297.0)


def _grid_for_nup(n_up: int, orientation: str) -> Tuple[int, int]:

    o = str(orientation or "portrait").lower()

    is_landscape = o == "landscape"

    n = int(n_up or 1)

    if n <= 1:

        return (1, 1)

    if n == 2:

        return (2, 1) if is_landscape else (1, 2)

    if n == 4:

        return (2, 2)

    if n == 6:

        return (3, 2) if is_landscape else (2, 3)

    if n == 8:

        return (4, 2) if is_landscape else (2, 4)

    cols = 2 if not is_landscape else 3

    rows = max(1, int((n + cols - 1) / cols))

    return (cols, rows)


def _iter_source_pages(file_paths: List[str]):

    for fp in file_paths:

        if not os.path.exists(fp):

            raise RuntimeError(f"鏂囦欢涓嶅瓨鍦? {fp}")

        src_path = fp

        if is_ofd(src_path):

            src_path = ensure_pdf_for_ofd(src_path)

        if is_pdf(src_path):

            doc = fitz.open(src_path)

            try:

                for i in range(int(doc.page_count)):

                    yield doc, i

            finally:

                doc.close()

            continue

        if is_image(src_path):

            doc = fitz.open()

            try:

                pix = fitz.Pixmap(src_path)

                page = doc.new_page(width=float(pix.width), height=float(pix.height))

                page.insert_image(page.rect, filename=src_path)

                yield doc, 0

            finally:

                doc.close()

            continue

        raise RuntimeError(f"涓嶆敮鎸佺殑鏂囦欢鏍煎紡: {fp}")


def merge_to_pdf(file_paths: List[str], config: Optional[Dict[str, Any]] = None) -> str:

    if not file_paths:

        raise RuntimeError("鏂囦欢鍒楄〃涓虹┖")

    out_dir = ensure_outputs_dir()

    stamp = time.strftime("%Y%m%d_%H%M%S")

    output_path = os.path.join(out_dir, f"merged_{stamp}.pdf")

    if config and isinstance(config, dict) and config.get("outputPath"):

        output_path = str(config.get("outputPath"))

    out_parent = os.path.dirname(output_path)

    if out_parent:

        os.makedirs(out_parent, exist_ok=True)

    use_layout = False

    if config and isinstance(config, dict):

        n_up = int(config.get("nUp") or 1)

        cols = config.get("cols")

        rows = config.get("rows")

        if (isinstance(cols, int) and isinstance(rows, int) and cols > 0 and rows > 0) or n_up > 1:

            use_layout = True

    cover_pdf_path: Optional[str] = None
    if config and isinstance(config, dict):
        cv = config.get("coverPdfPath")
        if isinstance(cv, str) and cv and os.path.exists(cv):
            cover_pdf_path = cv

    out = fitz.open()

    try:

        if cover_pdf_path:
            cover_doc = fitz.open(cover_pdf_path)
            try:
                out.insert_pdf(cover_doc)
            finally:
                cover_doc.close()

        if not use_layout:

            for fp in file_paths:

                if not os.path.exists(fp):

                    raise RuntimeError(f"鏂囦欢涓嶅瓨鍦? {fp}")

                src_path = fp

                if is_ofd(src_path):

                    src_path = ensure_pdf_for_ofd(src_path)

                if is_pdf(src_path):

                    src = fitz.open(src_path)

                    try:

                        out.insert_pdf(src)

                    finally:

                        src.close()

                    continue

                if is_image(src_path):

                    pix = fitz.Pixmap(src_path)

                    page = out.new_page(width=float(pix.width), height=float(pix.height))

                    page.insert_image(page.rect, filename=src_path)

                    continue

                raise RuntimeError(f"涓嶆敮鎸佺殑鏂囦欢鏍煎紡: {fp}")

        else:

            paper_w_mm, paper_h_mm = _paper_mm((config or {}).get("paperSize", "A4"))

            orientation = str((config or {}).get("orientation", "portrait"))

            if orientation.lower() == "landscape":

                paper_w_mm, paper_h_mm = paper_h_mm, paper_w_mm

            page_w = mm_to_pt(paper_w_mm)

            page_h = mm_to_pt(paper_h_mm)

            margin = (config or {}).get("marginMm") or {}

            mt = mm_to_pt(float(margin.get("top", 12)))

            mr = mm_to_pt(float(margin.get("right", 12)))

            mb = mm_to_pt(float(margin.get("bottom", 12)))

            ml = mm_to_pt(float(margin.get("left", 12)))

            cols = int((config or {}).get("cols") or 0)

            rows = int((config or {}).get("rows") or 0)

            if cols <= 0 or rows <= 0:

                cols, rows = _grid_for_nup(int((config or {}).get("nUp") or 1), orientation)

            cols = max(1, cols)

            rows = max(1, rows)

            usable_w = max(1.0, page_w - ml - mr)

            usable_h = max(1.0, page_h - mt - mb)

            cell_w = usable_w / float(cols)

            cell_h = usable_h / float(rows)

            per_page = cols * rows

            slot = 0

            page = out.new_page(width=page_w, height=page_h)

            for src_doc, src_index in _iter_source_pages(file_paths):

                if slot >= per_page:

                    page = out.new_page(width=page_w, height=page_h)

                    slot = 0

                c = int(slot % cols)

                r = int(slot // cols)

                rect = fitz.Rect(
                    ml + c * cell_w, mt + r * cell_h, ml + (c + 1) * cell_w, mt + (r + 1) * cell_h
                )

                try:

                    page.show_pdf_page(rect, src_doc, src_index, keep_proportion=True)

                except TypeError:

                    page.show_pdf_page(rect, src_doc, src_index)

                slot += 1

        if os.path.exists(output_path):

            try:

                os.remove(output_path)

            except Exception:

                pass

        out.save(output_path, deflate=True, garbage=4)

        return output_path

    finally:

        out.close()


def merge_pngs_to_pdf(
    png_data_urls: List[str],
    output_path: str,
    paper_width_mm: float = 210,
    paper_height_mm: float = 297,
) -> str:

    if not png_data_urls:

        raise RuntimeError("PNG鍒楄〃涓虹┖")

    out_dir = os.path.dirname(output_path)

    if out_dir:

        os.makedirs(out_dir, exist_ok=True)

    page_width_pt = paper_width_mm * 72.0 / 25.4

    page_height_pt = paper_height_mm * 72.0 / 25.4

    out = fitz.open()

    try:

        for i, data_url in enumerate(png_data_urls):

            if data_url.startswith("data:image/png;base64,"):

                b64 = data_url[len("data:image/png;base64,") :]

            elif data_url.startswith("data:image/jpeg;base64,"):

                b64 = data_url[len("data:image/jpeg;base64,") :]

            elif data_url.startswith("data:image/jpg;base64,"):

                b64 = data_url[len("data:image/jpg;base64,") :]

            else:

                b64 = data_url

            img_bytes = base64.b64decode(b64)

            page = out.new_page(width=page_width_pt, height=page_height_pt)

            page.insert_image(page.rect, stream=img_bytes)

            img_bytes = None

        if os.path.exists(output_path):

            try:

                os.remove(output_path)

            except Exception:

                pass

        out.save(output_path, deflate=True, garbage=4)

        return output_path

    finally:

        out.close()
