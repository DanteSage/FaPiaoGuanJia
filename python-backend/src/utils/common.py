import hashlib
import os
import sys
from typing import Dict, Tuple

from storage.paths import get_outputs_dir


_STAT_FINGERPRINT_CACHE: Dict[Tuple[str, int, int], str] = {}
_MAX_STAT_FINGERPRINT_CACHE_SIZE = 128


def get_base_path() -> str:

    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(__file__))


def ensure_outputs_dir() -> str:

    return get_outputs_dir()


def stat_fingerprint(file_path: str) -> str:

    st = os.stat(file_path)
    abs_path = os.path.abspath(file_path)
    cache_key = (abs_path, int(st.st_size), int(st.st_mtime_ns))
    cached = _STAT_FINGERPRINT_CACHE.get(cache_key)
    if cached:
        return cached

    fingerprint = hashlib.sha1(
        f"{abs_path}:{st.st_size}:{st.st_mtime_ns}".encode("utf-8")
    ).hexdigest()
    _STAT_FINGERPRINT_CACHE[cache_key] = fingerprint

    if len(_STAT_FINGERPRINT_CACHE) > _MAX_STAT_FINGERPRINT_CACHE_SIZE:
        oldest_key = next(iter(_STAT_FINGERPRINT_CACHE))
        _STAT_FINGERPRINT_CACHE.pop(oldest_key, None)

    return fingerprint


def ext_lower(file_path: str) -> str:

    _, ext = os.path.splitext(file_path)
    return ext.lower().lstrip(".")


def is_pdf(file_path: str) -> bool:
    return ext_lower(file_path) == "pdf"


def is_ofd(file_path: str) -> bool:
    return ext_lower(file_path) == "ofd"


def is_image(file_path: str) -> bool:
    return ext_lower(file_path) in {"png", "jpg", "jpeg", "bmp", "webp", "tif", "tiff"}


def is_xml(file_path: str) -> bool:
    return ext_lower(file_path) == "xml"


def mm_to_pt(mm: float) -> float:

    return float(mm) * 72.0 / 25.4
