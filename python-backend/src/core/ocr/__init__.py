"""OCR识别模块"""

import os
from typing import Any, Dict

from utils import is_pdf, is_ofd, is_image, is_xml

from .image import ocr_image
from .pdf import ocr_pdf
from .ofd import ocr_ofd, ensure_pdf_for_ofd, ofd_render_page_png, start_java_warmup
from .xml import parse_xml_invoice


def ocr_file(file_path: str) -> Dict[str, Any]:
    """OCR识别入口函数，根据文件类型分发到对应的处理模块"""
    if not os.path.exists(file_path):
        raise RuntimeError("文件不存在")

    if is_ofd(file_path):
        return ocr_ofd(file_path)

    if is_pdf(file_path):
        return ocr_pdf(file_path)

    if is_image(file_path):
        return ocr_image(file_path)

    if is_xml(file_path):
        return parse_xml_invoice(file_path)

    raise RuntimeError("不支持的文件格式")


# 导出主要函数
__all__ = [
    "ocr_file",
    "ocr_image",
    "ocr_pdf",
    "ocr_ofd",
    "parse_xml_invoice",
    "ensure_pdf_for_ofd",
    "ofd_render_page_png",
    "start_java_warmup",
]
