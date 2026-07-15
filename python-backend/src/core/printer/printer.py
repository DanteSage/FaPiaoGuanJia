from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

try:
    import win32api
    import win32print
except Exception:
    win32api = None
    win32print = None


CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _python_backend_root() -> Path:
    if _is_frozen():
        return Path(sys.executable).resolve().parent.parent
    return Path(__file__).resolve().parents[3]


def _project_root() -> Path:
    return _python_backend_root().parent


def _first_existing(paths: Iterable[Optional[Path]]) -> Optional[Path]:
    for path in paths:
        if path is None:
            continue
        if path.exists():
            return path
    return None


def _find_matching_jar(directory: Path, pattern: str) -> Optional[Path]:
    if not directory.exists():
        return None
    jars = sorted(directory.glob(pattern))
    return jars[-1] if jars else None


def _get_java_printer_jar() -> str:
    if _is_frozen():
        candidates = [
            _find_matching_jar(_project_root() / "java", "pdf-printer-*.jar"),
        ]
    else:
        candidates = [
            _find_matching_jar(_project_root() / "java" / "target", "pdf-printer-*.jar"),
            _find_matching_jar(_project_root() / "java", "pdf-printer-*.jar"),
        ]

    jar_path = _first_existing(candidates)
    return str(jar_path) if jar_path else ""


def _iter_java_candidates() -> Iterable[Path]:
    project_root = _project_root()
    backend_root = _python_backend_root()
    java_executable = "java.exe" if os.name == "nt" else "java"
    platform_dir = "win32" if os.name == "nt" else sys.platform

    if _is_frozen():
        yield project_root / "jre" / platform_dir / "bin" / java_executable
        yield project_root / "jre" / "bin" / java_executable
        yield project_root / "jre-min" / platform_dir / "bin" / java_executable
        yield project_root / "jre-min" / "bin" / java_executable
    else:
        yield project_root / "jre-min" / platform_dir / "bin" / java_executable
        yield project_root / "jre-min" / "bin" / java_executable
        yield project_root / "jre" / "bin" / java_executable
        yield backend_root / "jre-min" / platform_dir / "bin" / java_executable
        yield backend_root / "jre-min" / "bin" / java_executable
        yield backend_root / "jre" / "bin" / java_executable

    java_home = os.environ.get("JAVA_HOME", "").strip()
    if java_home:
        yield Path(java_home) / "bin" / java_executable

    if os.name == "nt":
        install_roots = [
            os.environ.get("ProgramFiles", "").strip(),
            os.environ.get("ProgramFiles(x86)", "").strip(),
        ]
        vendor_dirs = ["Java", "Eclipse Adoptium"]
        for root in install_roots:
            if not root:
                continue
            for vendor_dir in vendor_dirs:
                base = Path(root) / vendor_dir
                if not base.is_dir():
                    continue
                try:
                    children = sorted(
                        (child for child in base.iterdir() if child.is_dir()),
                        reverse=True,
                    )
                except OSError:
                    children = []
                for child in children:
                    yield child / "bin" / java_executable


def _get_java_cmd() -> str:
    java_path = _first_existing(_iter_java_candidates())
    return str(java_path) if java_path else "java"


def list_printers() -> Dict[str, Any]:
    if win32print is None:
        raise RuntimeError("win32print 妯″潡涓嶅彲鐢紝璇峰厛瀹夎 pywin32")

    printers = []
    default_printer = ""

    try:
        default_printer = win32print.GetDefaultPrinter()
    except Exception:
        default_printer = ""

    try:
        printer_list = win32print.EnumPrinters(
            win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
        )
        for printer in printer_list:
            name = printer[2]
            printers.append({"name": name, "isDefault": name == default_printer})
    except Exception as exc:
        raise RuntimeError(f"鑾峰彇鎵撳嵃鏈哄垪琛ㄥけ璐? {exc}") from exc

    return {"printers": printers}


def _run_java_printer(
    jar_path: str, file_path: str, printer_name: str, copies: int
) -> Dict[str, Any]:
    result = subprocess.run(
        [_get_java_cmd(), "-jar", jar_path, file_path, printer_name or "", str(copies)],
        capture_output=True,
        text=True,
        timeout=300,
        creationflags=CREATE_NO_WINDOW,
    )

    if result.returncode == 0:
        return {"success": True, "message": "打印完成（原生清晰度）"}
    if result.returncode == 4:
        return {"success": False, "message": "用户取消打印", "cancelled": True}

    raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "Java 打印失败")


def print_pdf(
    file_path: str, printer_name: str, copies: int = 1, use_java: bool = True
) -> Dict[str, Any]:
    if not file_path or not os.path.exists(file_path):
        raise RuntimeError(f"文件不存在: {file_path}")
    if sys.platform != "win32":
        raise RuntimeError("当前平台暂不支持打印")

    abs_path = os.path.abspath(file_path)
    copies = max(1, min(99, int(copies)))

    if use_java:
        jar_path = _get_java_printer_jar()
        if jar_path:
            try:
                return _run_java_printer(jar_path, abs_path, printer_name, copies)
            except subprocess.TimeoutExpired:
                return {"success": False, "message": "打印超时"}
            except (FileNotFoundError, RuntimeError):
                pass
            except Exception:
                pass

    try:
        os.startfile(abs_path)
        return {
            "success": True,
            "fallback": True,
            "message": "已打开 PDF 文件，请在打开的程序中完成打印",
        }
    except OSError as exc:
        raise RuntimeError(f"打开文件失败: {exc}") from exc
