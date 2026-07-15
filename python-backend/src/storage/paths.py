from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Iterable, Optional


_STORAGE_ENV_VAR = "FAPIAO_TOOL_STORAGE_DIR"
_OUTPUTS_ENV_VAR = "FAPIAO_TOOL_OUTPUTS_DIR"
_APP_DIR_NAME = "FapiaoTool"

_storage_root_cache: Optional[str] = None
_outputs_dir_cache: Optional[str] = None


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _to_path(path: str | Path) -> Path:
    return Path(path).expanduser().resolve(strict=False)


def _get_project_backend_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def _get_runtime_dir() -> Path:
    if _is_frozen():
        return Path(sys.executable).resolve(strict=False).parent
    return _get_project_backend_dir()


def _normalize_dir(path: str | Path) -> str:
    return str(_to_path(path))


def _ensure_writable_dir(path: str | Path) -> str:
    normalized = _to_path(path)
    normalized.mkdir(parents=True, exist_ok=True)

    if not normalized.is_dir():
        raise OSError(f"Not a directory: {normalized}")

    probe_path = normalized / f".fapiao-write-probe-{os.getpid()}-{time.time_ns()}"
    probe_path.write_bytes(b"")
    probe_path.unlink()
    return str(normalized)


def _resolve_writable_dir(candidates: Iterable[str | Path], label: str) -> str:
    last_error: Optional[BaseException] = None
    for candidate in candidates:
        candidate_text = str(candidate or "").strip()
        if not candidate_text:
            continue
        try:
            return _ensure_writable_dir(candidate_text)
        except OSError as exc:
            last_error = exc
            print(
                f"[storage.paths] {label} unavailable: {candidate_text} ({exc})",
                file=sys.stderr,
            )

    if last_error is None:
        raise RuntimeError(f"No writable {label} directory candidates were provided")
    raise RuntimeError(f"Unable to resolve writable {label} directory") from last_error


def _has_storage_override() -> bool:
    return bool((os.environ.get(_STORAGE_ENV_VAR) or "").strip())


def _uses_managed_data_layout() -> bool:
    return _is_frozen() or _has_storage_override()


def _join_storage_path(name: str) -> str:
    directory = Path(get_storage_root()) / name
    directory.mkdir(parents=True, exist_ok=True)
    return str(directory)


def get_storage_root() -> str:
    global _storage_root_cache

    if _storage_root_cache is not None:
        return _storage_root_cache

    if not _uses_managed_data_layout():
        _storage_root_cache = str(_get_project_backend_dir())
        return _storage_root_cache

    local_app_data = (os.environ.get("LOCALAPPDATA") or "").strip()
    roaming_app_data = (os.environ.get("APPDATA") or "").strip()
    temp_dir = tempfile.gettempdir()
    runtime_dir = _get_runtime_dir()

    _storage_root_cache = _resolve_writable_dir(
        [
            os.environ.get(_STORAGE_ENV_VAR, ""),
            Path(local_app_data) / _APP_DIR_NAME if local_app_data else "",
            Path(roaming_app_data) / _APP_DIR_NAME if roaming_app_data else "",
            Path(temp_dir) / _APP_DIR_NAME if temp_dir else "",
            runtime_dir / _APP_DIR_NAME,
        ],
        "storage",
    )
    os.environ[_STORAGE_ENV_VAR] = _storage_root_cache
    return _storage_root_cache


def get_outputs_dir() -> str:
    global _outputs_dir_cache

    if _outputs_dir_cache is not None:
        return _outputs_dir_cache

    storage_root = Path(get_storage_root())
    temp_dir = tempfile.gettempdir()

    candidates: list[str | Path] = [
        os.environ.get(_OUTPUTS_ENV_VAR, ""),
        storage_root / "outputs",
    ]

    fallback_outputs = Path(temp_dir) / _APP_DIR_NAME / "outputs" if temp_dir else None
    if fallback_outputs and _normalize_dir(fallback_outputs) != _normalize_dir(candidates[1]):
        candidates.append(fallback_outputs)

    _outputs_dir_cache = _resolve_writable_dir(candidates, "outputs")
    os.environ[_OUTPUTS_ENV_VAR] = _outputs_dir_cache
    return _outputs_dir_cache


def get_db_path() -> str:
    if _uses_managed_data_layout():
        data_dir = Path(get_storage_root()) / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return str(data_dir / "fapiao_data.db")
    return str(Path(get_storage_root()) / "fapiao_data.db")


def get_reimbursement_db_path() -> str:
    if _uses_managed_data_layout():
        data_dir = Path(get_storage_root()) / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        return str(data_dir / "reimbursement_data.db")
    return str(Path(get_storage_root()) / "reimbursement_data.db")


def get_files_dir() -> str:
    return _join_storage_path("files")


def get_config_dir() -> str:
    return _join_storage_path("config")


def get_logs_dir() -> str:
    return _join_storage_path("logs")


def get_images_dir() -> str:
    return _join_storage_path("images")


def get_images_with_url_dir() -> str:
    return str(Path(_join_storage_path("images")) / "with_url")


def get_api_config_path() -> str:
    return str(Path(get_config_dir()) / "verify_config.json")


def get_rpa_config_path() -> str:
    return str(Path(get_config_dir()) / "rpa_config.json")


def get_config_migration_candidates(file_name: str) -> list[str]:
    local_app_data = (os.environ.get("LOCALAPPDATA") or "").strip()
    roaming_app_data = (os.environ.get("APPDATA") or "").strip()
    runtime_dir = _get_runtime_dir()
    project_backend_dir = _get_project_backend_dir()

    candidates: list[str] = []
    seen: set[str] = set()

    roots: list[str | Path] = [
        Path(roaming_app_data) / _APP_DIR_NAME if roaming_app_data else "",
        Path(local_app_data) / _APP_DIR_NAME if local_app_data else "",
        Path(roaming_app_data) / "fapiao-tool" / "storage" if roaming_app_data else "",
        Path(roaming_app_data) / "fapiao-tool" if roaming_app_data else "",
        runtime_dir,
        runtime_dir.parent,
        project_backend_dir,
    ]

    for root in roots:
        root_text = str(root or "").strip()
        if not root_text:
            continue
        root_path = _to_path(root_text)
        for candidate in (root_path / "config" / file_name, root_path / file_name):
            normalized = _normalize_dir(candidate)
            if normalized in seen:
                continue
            seen.add(normalized)
            candidates.append(normalized)

    return candidates
