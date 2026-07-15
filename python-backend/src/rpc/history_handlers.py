from __future__ import annotations

from typing import Any, Dict

from rpc.dispatch import register
from rpc.response import fail, ok


@register("verify_history_add")
def handle_verify_history_add(params: Dict[str, Any]) -> Any:
    from storage import insert_verify_history

    data = params.get("data", {})
    uid = insert_verify_history(data)
    return ok(uid=uid)


@register("verify_history_list")
def handle_verify_history_list(params: Dict[str, Any]) -> Any:
    from storage import get_all_verify_history

    limit = int(params.get("limit", 100))
    offset = int(params.get("offset", 0))
    verify_mode = params.get("verifyMode") or None
    records, total = get_all_verify_history(limit, offset, verify_mode)
    return ok(records=records, total=total)


@register("verify_history_delete")
def handle_verify_history_delete(params: Dict[str, Any]) -> Any:
    from storage import delete_verify_history

    uid = str(params.get("uid", ""))
    deleted = delete_verify_history(uid)
    if not deleted:
        return fail("查验记录不存在或删除失败")
    return ok()


@register("verify_history_batch_delete")
def handle_verify_history_batch_delete(params: Dict[str, Any]) -> Any:
    from storage import batch_delete_verify_history

    uids = params.get("uids", [])
    count = batch_delete_verify_history(uids)
    return ok(count=count)


@register("verify_history_clear")
def handle_verify_history_clear(params: Dict[str, Any]) -> Any:
    from storage import clear_verify_history

    verify_mode = params.get("verifyMode") or None
    count = clear_verify_history(verify_mode)
    return ok(count=count)
