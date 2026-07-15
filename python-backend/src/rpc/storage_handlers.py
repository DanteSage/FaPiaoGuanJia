from __future__ import annotations

import os
from typing import Any, Dict

from rpc.dispatch import register
from rpc.response import ok
from storage.paths import get_config_dir, get_db_path, get_files_dir, get_images_dir, get_outputs_dir, get_logs_dir


@register("get_storage_paths")
def handle_get_storage_paths(params: Dict[str, Any]) -> Any:
    def _dir_size(d: str) -> tuple[int, int]:
        total = 0
        count = 0
        if os.path.isdir(d):
            for root, _dirs, files in os.walk(d):
                for f in files:
                    try:
                        total += os.path.getsize(os.path.join(root, f))
                        count += 1
                    except OSError:
                        pass
        return count, total

    def _file_size(p: str) -> int:
        try:
            return os.path.getsize(p) if os.path.exists(p) else 0
        except OSError:
            return 0

    db = get_db_path()
    files_dir = get_files_dir()
    logs_dir = get_logs_dir()
    config_dir = get_config_dir()
    images_dir = get_images_dir()
    outputs_dir = get_outputs_dir()
    fc, fs = _dir_size(files_dir)
    lc, ls = _dir_size(logs_dir)
    cc, cs = _dir_size(config_dir)
    ic, isz = _dir_size(images_dir)
    oc, osz = _dir_size(outputs_dir)
    return ok(
        database={"path": db, "sizeMB": round(_file_size(db) / 1048576, 2)},
        files={"path": files_dir, "count": fc, "sizeMB": round(fs / 1048576, 2)},
        logs={"path": logs_dir, "count": lc, "sizeMB": round(ls / 1048576, 2)},
        config={"path": config_dir, "count": cc, "sizeMB": round(cs / 1048576, 2)},
        images={"path": images_dir, "count": ic, "sizeMB": round(isz / 1048576, 2)},
        outputs={"path": outputs_dir, "count": oc, "sizeMB": round(osz / 1048576, 2)},
    )
