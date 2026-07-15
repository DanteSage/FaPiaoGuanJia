from __future__ import annotations

import json
import os
from typing import Any, Callable, Dict, Optional

from .paths import get_config_migration_candidates


ConfigValidator = Callable[[Dict[str, Any]], bool]


def _normalize_path(path: str) -> str:
    return os.path.abspath(os.path.normpath(path))


def _read_json_object(path: str) -> Optional[Dict[str, Any]]:
    if not path or not os.path.isfile(path):
        return None

    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        return None

    return data if isinstance(data, dict) else None


def load_json_config_with_migration(config_path: str, validator: ConfigValidator) -> Dict[str, Any]:
    current = _read_json_object(config_path)
    if current and validator(current):
        return current

    target = _normalize_path(config_path)
    file_name = os.path.basename(target)

    for candidate in get_config_migration_candidates(file_name):
        if _normalize_path(candidate) == target:
            continue

        migrated = _read_json_object(candidate)
        if not migrated or not validator(migrated):
            continue

        try:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, "w", encoding="utf-8") as handle:
                json.dump(migrated, handle, ensure_ascii=False)
        except Exception:
            return migrated

        return migrated

    return current or {}


def list_json_config_candidates(config_path: str) -> list[str]:
    target = _normalize_path(config_path)
    file_name = os.path.basename(target)

    candidates: list[str] = []
    seen: set[str] = set()
    for candidate in [target, *get_config_migration_candidates(file_name)]:
        normalized = _normalize_path(candidate)
        if normalized in seen:
            continue
        seen.add(normalized)
        candidates.append(normalized)

    return candidates


def remove_json_config_candidates(config_path: str, include_current: bool = True) -> bool:
    target = _normalize_path(config_path)
    success = True

    for candidate in list_json_config_candidates(config_path):
        if not include_current and candidate == target:
            continue
        try:
            if os.path.exists(candidate):
                os.remove(candidate)
        except Exception:
            success = False

    return success
