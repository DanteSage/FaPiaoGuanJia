"""发票处理服务主入口。"""

import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional

from core.verify._common import set_rpa_progress_callback
from rpc.dispatch import get_handler
from rpc.handlers import *  # noqa: F401,F403
from rpc.archive_handlers import *  # noqa: F401,F403
from rpc.file_handlers import *  # noqa: F401,F403
from rpc.history_handlers import *  # noqa: F401,F403
from rpc.reimbursement_handlers import *  # noqa: F401,F403
from rpc.storage_handlers import *  # noqa: F401,F403
from rpc.verify_handlers import *  # noqa: F401,F403
from rpc.response import BusinessError, RPC_CODE_BUSINESS_ERROR, RPC_CODE_SYSTEM_ERROR
from storage import close_db, close_reimbursement_db, init_db, init_reimbursement_db


_stdout_lock = threading.Lock()


def _is_ofd_path(file_path: Any) -> bool:
    if not isinstance(file_path, str):
        return False
    return file_path.lower().endswith(".ofd")


def _safe_delete_file(file_path: str) -> bool:
    if not file_path or not isinstance(file_path, str):
        return False
    try:
        abs_path = os.path.abspath(os.path.normpath(file_path))
        if os.path.exists(abs_path):
            os.remove(abs_path)
            return True
    except OSError:
        pass
    return False


def _read_json_line() -> Optional[Dict[str, Any]]:
    """从标准输入读取一行 JSON。"""
    line = sys.stdin.readline()
    if not line:
        return None
    line = line.strip()
    if not line:
        return {}
    return json.loads(line)


def _write_json_line(obj: Dict[str, Any]) -> None:
    """向标准输出写入一行 JSON（线程安全）。"""
    line = json.dumps(obj, ensure_ascii=False) + "\n"
    with _stdout_lock:
        sys.stdout.write(line)
        sys.stdout.flush()


def handle(method: str, params: Dict[str, Any]) -> Any:
    """处理 RPC 请求。"""
    handler = get_handler(method)
    if handler is None:
        raise BusinessError(f"未知 RPC 方法: {method}")
    return handler(params)


def _dispatch_message(msg: Dict[str, Any]) -> None:
    """分发并处理单条消息，将结果写回 stdout。"""
    req_id = msg.get("id")
    try:
        res = handle(str(msg["method"]), msg.get("params") or {})
        _write_json_line({"id": req_id, "ok": True, "code": 0, "result": res})
    except BusinessError as e:
        _write_json_line({"id": req_id, "ok": False, "code": RPC_CODE_BUSINESS_ERROR, "error": str(e)})
    except Exception as e:
        _write_json_line({"id": req_id, "ok": False, "code": RPC_CODE_SYSTEM_ERROR, "error": str(e)})


def _emit_rpa_progress_to_stdout(payload: Dict[str, Any]) -> None:
    """将 RPA 进度事件通过 stdout 推送给 Electron 主进程（每行一个 JSON）。"""
    out = {"type": "rpa_progress"}
    out.update(payload)
    _write_json_line(out)


def main() -> None:
    """主函数。"""
    try:
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    init_reimbursement_db()
    init_db()
    set_rpa_progress_callback(_emit_rpa_progress_to_stdout)

    if len(sys.argv) >= 2 and sys.argv[1] == "--stdio":
        _write_json_line({"type": "ready"})
        pdf_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="rpc-pdf")
        ofd_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rpc-ofd")
        try:
            while True:
                msg = _read_json_line()
                if msg is None:
                    break
                if not msg or "method" not in msg:
                    continue
                method = str(msg["method"])
                if method == "pdf_render_page":
                    params = msg.get("params") or {}
                    file_path = params.get("filePath", "")
                    if _is_ofd_path(file_path):
                        ofd_executor.submit(_dispatch_message, msg)
                    else:
                        pdf_executor.submit(_dispatch_message, msg)
                else:
                    _dispatch_message(msg)
        finally:
            pdf_executor.shutdown(wait=False)
            ofd_executor.shutdown(wait=False)
            close_db()
            close_reimbursement_db()
        return

    _write_json_line({"type": "ready"})


if __name__ == "__main__":
    main()
