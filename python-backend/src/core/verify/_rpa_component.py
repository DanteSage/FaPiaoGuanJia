import importlib.util
import os
import sys
from pathlib import Path
from typing import Any

_ACTIVATED_PYTHON_PATHS: set[str] = set()


def _candidate_component_roots() -> list[Path]:
    roots: list[Path] = []

    runtime_dir = str(os.environ.get("FAPIAO_RPA_RUNTIME_DIR", "") or "").strip()
    if runtime_dir:
        roots.append(Path(runtime_dir))

    storage_dir = str(os.environ.get("FAPIAO_TOOL_STORAGE_DIR", "") or "").strip()
    if storage_dir:
        roots.append(Path(storage_dir) / "rpa-runtime")

    if getattr(sys, "frozen", False):
        service_dir = Path(sys.executable).resolve().parent
        roots.append(service_dir / "rpa-runtime")
        roots.append(service_dir / "_internal" / "rpa-runtime")

    project_dir = Path(__file__).resolve().parents[3]
    roots.append(project_dir / "vendor" / "rpa-runtime")

    deduped: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        normalized = str(root.resolve(strict=False)).lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(root)
    return deduped


def _find_component_python_path() -> Path | None:
    for root in _candidate_component_roots():
        python_path = root / "python"
        if (python_path / "playwright").exists():
            return python_path
    return None


def _find_component_root() -> Path | None:
    python_path = _find_component_python_path()
    if not python_path:
        return None
    return python_path.parent


def activate_rpa_component() -> None:
    python_path = _find_component_python_path()
    if not python_path:
        return

    normalized = str(python_path.resolve(strict=False))
    if normalized not in _ACTIVATED_PYTHON_PATHS:
        sys.path.insert(0, normalized)
        _ACTIVATED_PYTHON_PATHS.add(normalized)

    browser_path = python_path.parent / "ms-playwright"
    if browser_path.exists():
        os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(browser_path))


def get_rpa_component_status() -> dict[str, Any]:
    activate_rpa_component()

    component_root = _find_component_root()
    python_path = _find_component_python_path()
    installed = importlib.util.find_spec("playwright") is not None

    if installed:
        message = "RPA 引擎已安装"
    elif component_root:
        message = "检测到 RPA 组件目录，但引擎未加载成功"
    else:
        message = "RPA 引擎未安装"

    return {
        "installed": installed,
        "componentRoot": str(component_root) if component_root else "",
        "pythonPath": str(python_path) if python_path else "",
        "message": message,
    }
