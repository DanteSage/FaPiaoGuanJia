from __future__ import annotations

import base64
from typing import Any, Dict

from rpc.dispatch import register
from rpc.response import fail, ok
from storage import insert_invoice, store_file, store_file_from_bytes, get_storage_stats


@register("file_store")
def handle_file_store(params: Dict[str, Any]) -> Any:
    source_path = str(params.get("filePath", ""))
    move = bool(params.get("move", False))
    stored_path, file_hash, is_new = store_file(source_path, move)
    return ok(storedPath=stored_path, fileHash=file_hash, isNew=is_new)


@register("file_store_base64")
def handle_file_store_base64(params: Dict[str, Any]) -> Any:
    data_b64 = str(params.get("data", ""))
    ext = str(params.get("ext", ".pdf"))
    data = base64.b64decode(data_b64)
    stored_path, file_hash, is_new = store_file_from_bytes(data, ext)
    return ok(storedPath=stored_path, fileHash=file_hash, isNew=is_new)


@register("file_store_and_save")
def handle_file_store_and_save(params: Dict[str, Any]) -> Any:
    source_path = str(params.get("filePath", ""))
    move = bool(params.get("move", False))
    invoice_data = params.get("data", {})
    stored_path, file_hash, is_new = store_file(source_path, move)
    invoice_data["file_path"] = stored_path
    invoice_data["file_hash"] = file_hash
    invoice_id = insert_invoice(invoice_data)
    return ok(id=invoice_id, storedPath=stored_path, fileHash=file_hash, isNew=is_new)


@register("file_stats")
def handle_file_stats(params: Dict[str, Any]) -> Any:
    return ok(**get_storage_stats())


@register("file_delete")
def handle_file_delete(params: Dict[str, Any]) -> Any:
    from rpc.service import _safe_delete_file

    file_path = str(params.get("filePath", ""))
    if _safe_delete_file(file_path):
        return ok()
    return fail("文件不存在或无权删除")
