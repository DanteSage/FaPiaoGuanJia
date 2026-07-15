from __future__ import annotations

import base64
import ctypes
import hashlib
import json
import os
import subprocess
import sys
from ctypes import wintypes
from typing import Any, Dict, Iterable

from .config_migration import (
    ConfigValidator,
    load_json_config_with_migration,
    remove_json_config_candidates,
)

_PROTECTED_PREFIX = "dpapi64:"
_KEYCHAIN_PREFIX = "keychain64:"
_PROTECTION_MARKER_KEY = "_secretProtection"
_WINDOWS_PROTECTION_MARKER_VALUE = "windows-dpapi-v1"
_MACOS_PROTECTION_MARKER_VALUE = "macos-keychain-v1"
_APP_ENTROPY = b"FapiaoTool/protected-config/v1"
_CRYPTPROTECT_UI_FORBIDDEN = 0x01
_KEYCHAIN_SERVICE_PREFIX = "FapiaoTool"


class DATA_BLOB(ctypes.Structure):
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
    ]


if sys.platform == "win32":
    _crypt32 = ctypes.windll.crypt32
    _kernel32 = ctypes.windll.kernel32

    _crypt32.CryptProtectData.argtypes = [
        ctypes.POINTER(DATA_BLOB),
        wintypes.LPCWSTR,
        ctypes.POINTER(DATA_BLOB),
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(DATA_BLOB),
    ]
    _crypt32.CryptProtectData.restype = wintypes.BOOL
    _crypt32.CryptUnprotectData.argtypes = [
        ctypes.POINTER(DATA_BLOB),
        ctypes.POINTER(wintypes.LPWSTR),
        ctypes.POINTER(DATA_BLOB),
        ctypes.c_void_p,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(DATA_BLOB),
    ]
    _crypt32.CryptUnprotectData.restype = wintypes.BOOL
    _kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    _kernel32.LocalFree.restype = ctypes.c_void_p
else:
    _crypt32 = None
    _kernel32 = None


def _is_windows() -> bool:
    return sys.platform == "win32"


def _is_macos() -> bool:
    return sys.platform == "darwin"


def _get_protection_marker_value() -> str:
    if _is_windows():
        return _WINDOWS_PROTECTION_MARKER_VALUE
    if _is_macos():
        return _MACOS_PROTECTION_MARKER_VALUE
    raise RuntimeError("Protected config storage is only supported on Windows or macOS")


def _require_windows_dpapi() -> None:
    if not _is_windows() or _crypt32 is None or _kernel32 is None:
        raise RuntimeError("Protected config storage is only supported on Windows")


def _read_existing_json_object(config_path: str) -> Dict[str, Any]:
    if not config_path or not os.path.isfile(config_path):
        return {}

    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        return {}

    return data if isinstance(data, dict) else {}


def _make_blob(data: bytes) -> tuple[DATA_BLOB, ctypes.Array[ctypes.c_char] | None]:
    if not data:
        return DATA_BLOB(0, None), None

    buffer = ctypes.create_string_buffer(data)
    blob = DATA_BLOB(
        len(data),
        ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)),
    )
    return blob, buffer


def _blob_to_bytes(blob: DATA_BLOB) -> bytes:
    if not blob.cbData or not blob.pbData:
        return b""
    return ctypes.string_at(blob.pbData, blob.cbData)


def _protect_bytes(data: bytes) -> bytes:
    _require_windows_dpapi()

    in_blob, in_buffer = _make_blob(data)
    entropy_blob, entropy_buffer = _make_blob(_APP_ENTROPY)
    del in_buffer, entropy_buffer

    out_blob = DATA_BLOB()
    ok = _crypt32.CryptProtectData(
        ctypes.byref(in_blob),
        "FapiaoTool",
        ctypes.byref(entropy_blob),
        None,
        None,
        _CRYPTPROTECT_UI_FORBIDDEN,
        ctypes.byref(out_blob),
    )
    if not ok:
        raise ctypes.WinError()

    try:
        return _blob_to_bytes(out_blob)
    finally:
        if out_blob.pbData:
            _kernel32.LocalFree(out_blob.pbData)


def _unprotect_bytes(data: bytes) -> bytes:
    _require_windows_dpapi()

    in_blob, in_buffer = _make_blob(data)
    entropy_blob, entropy_buffer = _make_blob(_APP_ENTROPY)
    del in_buffer, entropy_buffer

    out_blob = DATA_BLOB()
    description = wintypes.LPWSTR()
    ok = _crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        ctypes.byref(description),
        ctypes.byref(entropy_blob),
        None,
        None,
        _CRYPTPROTECT_UI_FORBIDDEN,
        ctypes.byref(out_blob),
    )
    if not ok:
        raise ctypes.WinError()

    try:
        return _blob_to_bytes(out_blob)
    finally:
        if description:
            _kernel32.LocalFree(description)
        if out_blob.pbData:
            _kernel32.LocalFree(out_blob.pbData)


def _run_keychain_command(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", check=False)


def _build_keychain_service(config_path: str) -> str:
    normalized = os.path.abspath(os.path.normpath(config_path))
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]
    file_name = os.path.basename(normalized) or "config.json"
    return f"{_KEYCHAIN_SERVICE_PREFIX}/{file_name}/{digest}"


def _build_keychain_account(field_name: str) -> str:
    return f"{_KEYCHAIN_SERVICE_PREFIX}/{field_name}"


def _make_keychain_reference(service: str, account: str) -> str:
    payload = json.dumps({"service": service, "account": account}, separators=(",", ":"))
    encoded = base64.b64encode(payload.encode("utf-8")).decode("ascii")
    return _KEYCHAIN_PREFIX + encoded


def _parse_keychain_reference(value: str) -> tuple[str, str]:
    if not isinstance(value, str) or not value.startswith(_KEYCHAIN_PREFIX):
        raise ValueError("Not a keychain protected secret")

    payload = value[len(_KEYCHAIN_PREFIX) :]
    decoded = base64.b64decode(payload.encode("ascii")).decode("utf-8")
    data = json.loads(decoded)
    service = str(data.get("service", "") or "")
    account = str(data.get("account", "") or "")
    if not service or not account:
        raise ValueError("Invalid keychain protected secret")
    return service, account


def _set_keychain_secret(config_path: str, field_name: str, value: str) -> str:
    if not _is_macos():
        raise RuntimeError("Keychain storage is only supported on macOS")

    service = _build_keychain_service(config_path)
    account = _build_keychain_account(field_name)
    result = _run_keychain_command(
        ["security", "add-generic-password", "-U", "-s", service, "-a", account, "-w", value]
    )
    if result.returncode != 0:
        message = (
            result.stderr.strip() or result.stdout.strip() or "Failed to write secret to Keychain"
        )
        raise RuntimeError(message)
    return _make_keychain_reference(service, account)


def _get_keychain_secret(value: str) -> str:
    if not _is_macos():
        raise RuntimeError("Keychain storage is only supported on macOS")

    service, account = _parse_keychain_reference(value)
    result = _run_keychain_command(
        ["security", "find-generic-password", "-w", "-s", service, "-a", account]
    )
    if result.returncode != 0:
        message = (
            result.stderr.strip() or result.stdout.strip() or "Failed to read secret from Keychain"
        )
        raise RuntimeError(message)
    return result.stdout.rstrip("\r\n")


def _delete_keychain_secret(value: str) -> bool:
    if not _is_macos() or not isinstance(value, str) or not value.startswith(_KEYCHAIN_PREFIX):
        return False

    try:
        service, account = _parse_keychain_reference(value)
    except ValueError:
        return False

    result = _run_keychain_command(
        ["security", "delete-generic-password", "-s", service, "-a", account]
    )
    return result.returncode == 0


def is_protected_secret(value: Any) -> bool:
    return isinstance(value, str) and (
        value.startswith(_PROTECTED_PREFIX) or value.startswith(_KEYCHAIN_PREFIX)
    )


def protect_secret(value: str, config_path: str = "", field_name: str = "") -> str:
    text = str(value or "")
    if not text:
        return ""
    if is_protected_secret(text):
        return text

    if _is_windows():
        encrypted = _protect_bytes(text.encode("utf-8"))
        return _PROTECTED_PREFIX + base64.b64encode(encrypted).decode("ascii")
    if _is_macos():
        if not config_path or not field_name:
            raise RuntimeError("config_path and field_name are required for macOS Keychain storage")
        return _set_keychain_secret(config_path, field_name, text)
    raise RuntimeError("Protected config storage is only supported on Windows or macOS")


def unprotect_secret(value: str, config_path: str = "", field_name: str = "") -> str:
    text = str(value or "")
    if not text:
        return ""
    if not is_protected_secret(text):
        return text

    if text.startswith(_KEYCHAIN_PREFIX):
        return _get_keychain_secret(text)

    payload = text[len(_PROTECTED_PREFIX) :]
    encrypted = base64.b64decode(payload.encode("ascii"))
    return _unprotect_bytes(encrypted).decode("utf-8")


def save_protected_json_config(
    config_path: str,
    payload: Dict[str, Any],
    secret_fields: Iterable[str],
) -> None:
    os.makedirs(os.path.dirname(config_path), exist_ok=True)

    stored_payload = dict(payload)
    existing_payload = _read_existing_json_object(config_path)
    has_secret = False
    for field in secret_fields:
        raw_value = str(payload.get(field, "") or "")
        if raw_value:
            stored_payload[field] = protect_secret(raw_value, config_path, field)
            has_secret = True
        else:
            _delete_keychain_secret(str(existing_payload.get(field, "") or ""))
            stored_payload[field] = ""

    if has_secret:
        stored_payload[_PROTECTION_MARKER_KEY] = _get_protection_marker_value()
    else:
        stored_payload.pop(_PROTECTION_MARKER_KEY, None)

    with open(config_path, "w", encoding="utf-8") as handle:
        json.dump(stored_payload, handle, ensure_ascii=False)


def load_protected_json_config(
    config_path: str,
    validator: ConfigValidator,
    secret_fields: Iterable[str],
) -> Dict[str, Any]:
    raw_payload = load_json_config_with_migration(config_path, validator)
    if not isinstance(raw_payload, dict):
        return {}

    secret_field_list = list(secret_fields)
    payload = dict(raw_payload)
    has_secret = False
    needs_rewrite = False

    for field in secret_field_list:
        raw_value = str(payload.get(field, "") or "")
        if not raw_value:
            payload[field] = ""
            continue

        has_secret = True
        if is_protected_secret(raw_value):
            payload[field] = unprotect_secret(raw_value, config_path, field)
            continue

        payload[field] = raw_value
        needs_rewrite = True

    if has_secret and raw_payload.get(_PROTECTION_MARKER_KEY) != _get_protection_marker_value():
        needs_rewrite = True

    if needs_rewrite:
        save_protected_json_config(config_path, payload, secret_field_list)

    if has_secret:
        remove_json_config_candidates(config_path, include_current=False)

    payload.pop(_PROTECTION_MARKER_KEY, None)
    return payload
