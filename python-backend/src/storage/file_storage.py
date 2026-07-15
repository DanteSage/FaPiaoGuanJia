import hashlib

import os

import shutil

import time

from typing import Optional, Tuple


from .paths import get_files_dir


def _validate_path_safe(file_path: str, allowed_base: Optional[str] = None) -> str:

    abs_path = os.path.abspath(os.path.normpath(file_path))

    if allowed_base is not None:

        abs_base = os.path.abspath(os.path.normpath(allowed_base))

        try:

            common = os.path.commonpath([abs_path, abs_base])

            if common != abs_base:

                raise ValueError(f"璺緞瓒呭嚭鍏佽鑼冨洿: {file_path}")

        except ValueError:

            raise ValueError(f"璺緞鏃犳晥鎴栬秴鍑哄厑璁歌寖鍥? {file_path}")

    return abs_path


def _get_storage_base() -> str:

    return get_files_dir()


def compute_file_hash(file_path: str) -> str:

    h = hashlib.sha256()

    with open(file_path, "rb") as f:

        while chunk := f.read(8192):

            h.update(chunk)

    return h.hexdigest()


def get_stored_path(file_hash: str, ext: str) -> str:

    base = _get_storage_base()

    year_month = time.strftime("%Y/%m")

    sub_dir = file_hash[:2]

    dir_path = os.path.join(base, year_month, sub_dir)

    os.makedirs(dir_path, exist_ok=True)

    return os.path.join(dir_path, f"{file_hash}{ext}")


def store_file(source_path: str, move: bool = False) -> Tuple[str, str, bool]:

    safe_source = _validate_path_safe(source_path)

    if not os.path.exists(safe_source):

        raise FileNotFoundError(f"鏂囦欢涓嶅瓨鍦? {source_path}")

    file_hash = compute_file_hash(safe_source)

    _, ext = os.path.splitext(safe_source)

    ext = ext.lower()

    target_path = get_stored_path(file_hash, ext)

    is_new = not os.path.exists(target_path)

    if is_new:

        if move:

            shutil.move(safe_source, target_path)

        else:

            shutil.copy2(safe_source, target_path)

    return target_path, file_hash, is_new


def store_file_from_bytes(data: bytes, ext: str) -> Tuple[str, str, bool]:

    file_hash = hashlib.sha256(data).hexdigest()

    if not ext.startswith("."):

        ext = "." + ext

    ext = ext.lower()

    ext_chars = ext[1:]

    if not ext_chars.isalnum():

        raise ValueError(f"涓嶅畨鍏ㄧ殑鎵╁睍鍚? {ext}")

    if len(ext) > 10:

        raise ValueError(f"鎵╁睍鍚嶈繃闀? {ext}")

    target_path = get_stored_path(file_hash, ext)

    is_new = not os.path.exists(target_path)

    if is_new:

        with open(target_path, "wb") as f:

            f.write(data)

    return target_path, file_hash, is_new


def get_file_by_hash(file_hash: str, ext: str = "") -> Optional[str]:

    base = _get_storage_base()

    if ext:

        if not ext.startswith("."):

            ext = "." + ext

        for root, dirs, files in os.walk(base):

            target = f"{file_hash}{ext}"

            if target in files:

                return os.path.join(root, target)

    else:

        for root, dirs, files in os.walk(base):

            for f in files:

                if f.startswith(file_hash):

                    return os.path.join(root, f)

    return None


def delete_file_by_hash(file_hash: str) -> bool:

    file_path = get_file_by_hash(file_hash)

    if file_path and os.path.exists(file_path):

        try:

            _validate_path_safe(file_path, _get_storage_base())

            os.remove(file_path)

            return True

        except ValueError:

            return False

    return False


def get_storage_stats() -> dict:

    base = _get_storage_base()

    total_files = 0

    total_size = 0

    if os.path.exists(base):

        for root, dirs, files in os.walk(base):

            total_files += len(files)

            for f in files:

                total_size += os.path.getsize(os.path.join(root, f))

    return {
        "storagePath": base,
        "totalFiles": total_files,
        "totalSizeBytes": total_size,
        "totalSizeMB": round(total_size / (1024 * 1024), 2),
    }
