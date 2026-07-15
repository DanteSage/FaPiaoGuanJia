from __future__ import annotations

from typing import Any, Dict

from rpc.dispatch import register
from rpc.response import fail, ok


@register("reimbursement_load")
def handle_reimbursement_load(params: Dict[str, Any]) -> Any:
    from storage import get_all_reimbursements

    return ok(reimbursements=get_all_reimbursements())


@register("reimbursement_create")
def handle_reimbursement_create(params: Dict[str, Any]) -> Any:
    from storage import get_reimbursement, insert_reimbursement

    data = params.get("data", {})
    uid = insert_reimbursement(data)
    reimbursement = get_reimbursement(uid)
    return ok(reimbursement=reimbursement)


@register("reimbursement_get")
def handle_reimbursement_get(params: Dict[str, Any]) -> Any:
    from storage import get_reimbursement

    uid = str(params.get("id", ""))
    reimbursement = get_reimbursement(uid)
    if reimbursement is None:
        return fail("报销单不存在")
    return ok(reimbursement=reimbursement)


@register("reimbursement_update")
def handle_reimbursement_update(params: Dict[str, Any]) -> Any:
    from storage import update_reimbursement

    uid = str(params.get("id", ""))
    data = params.get("data", {})
    success = update_reimbursement(uid, data)
    return ok(success=success)


@register("reimbursement_delete")
def handle_reimbursement_delete(params: Dict[str, Any]) -> Any:
    from storage import delete_reimbursement

    uid = str(params.get("id", ""))
    success = delete_reimbursement(uid)
    return ok(success=success)


@register("reimbursement_batch_delete")
def handle_reimbursement_batch_delete(params: Dict[str, Any]) -> Any:
    from storage import batch_delete_reimbursements

    uids = params.get("ids", [])
    count = batch_delete_reimbursements(uids)
    return ok(deletedCount=count)


@register("reimbursement_add_item")
def handle_reimbursement_add_item(params: Dict[str, Any]) -> Any:
    import logging
    logger = logging.getLogger("reimbursement")
    from storage import get_reimbursement, insert_reimbursement_item, update_reimbursement

    reimb_uid = str(params.get("reimbursementId", ""))
    item_data = params.get("item", {})

    logger.info("[add_item] reimb_uid=%s, item_id=%s, keys=%s",
                reimb_uid, item_data.get("id", "N/A"), list(item_data.keys()))

    if not reimb_uid:
        logger.error("[add_item] reimbursementId 为空")
        return fail("reimbursementId 不能为空")

    required_fields = ["invoiceId", "invoiceName", "amount", "category"]
    missing = [f for f in required_fields if f not in item_data]
    if missing:
        logger.error("[add_item] 缺少必填字段: %s, 实际数据: %s", missing, item_data)
        return fail(f"报销项目缺少必填字段: {', '.join(missing)}")

    reimb = get_reimbursement(reimb_uid)
    if reimb is None:
        logger.error("[add_item] 报销单不存在: %s", reimb_uid)
        return fail(f"报销单不存在: {reimb_uid}")

    try:
        item_uid = insert_reimbursement_item(reimb_uid, item_data)
    except Exception as e:
        logger.exception("[add_item] insert_reimbursement_item 异常: reimb=%s, item=%s",
                         reimb_uid, item_data.get("id", "N/A"))
        return fail(f"报销项目插入失败: {e}")

    reimbursement = get_reimbursement(reimb_uid)
    if reimbursement:
        total_amount = sum((item.get("amount") or 0) for item in reimbursement["items"])
        total_tax = sum((item.get("taxAmount") or 0) for item in reimbursement["items"])
        update_reimbursement(reimb_uid, {"totalAmount": total_amount, "totalTax": total_tax})
    return ok(itemId=item_uid)


@register("reimbursement_update_item")
def handle_reimbursement_update_item(params: Dict[str, Any]) -> Any:
    from storage import get_reimbursement, update_reimbursement, update_reimbursement_item

    item_uid = str(params.get("itemId", ""))
    item_data = params.get("item", {})
    success = update_reimbursement_item(item_uid, item_data)
    reimb_uid = str(params.get("reimbursementId", ""))
    if reimb_uid:
        reimbursement = get_reimbursement(reimb_uid)
        if reimbursement:
            total_amount = sum((item.get("amount") or 0) for item in reimbursement["items"])
            total_tax = sum((item.get("taxAmount") or 0) for item in reimbursement["items"])
            update_reimbursement(reimb_uid, {"totalAmount": total_amount, "totalTax": total_tax})
    return ok(success=success)


@register("reimbursement_remove_item")
def handle_reimbursement_remove_item(params: Dict[str, Any]) -> Any:
    from storage import delete_reimbursement_item, get_reimbursement, update_reimbursement

    item_uid = str(params.get("itemId", ""))
    reimb_uid = str(params.get("reimbursementId", ""))
    success = delete_reimbursement_item(item_uid)
    if success and reimb_uid:
        reimbursement = get_reimbursement(reimb_uid)
        if reimbursement:
            total_amount = sum((item.get("amount") or 0) for item in reimbursement["items"])
            total_tax = sum((item.get("taxAmount") or 0) for item in reimbursement["items"])
            update_reimbursement(reimb_uid, {"totalAmount": total_amount, "totalTax": total_tax})
    return ok(success=success)


@register("reimbursement_add_approval")
def handle_reimbursement_add_approval(params: Dict[str, Any]) -> Any:
    from storage import insert_approval_record

    reimb_uid = str(params.get("reimbursementId", ""))
    record_data = params.get("record", {})
    record_uid = insert_approval_record(reimb_uid, record_data)
    return ok(recordId=record_uid)


@register("reimbursement_statistics")
def handle_reimbursement_statistics(params: Dict[str, Any]) -> Any:
    from storage import get_reimbursement_statistics

    return ok(**get_reimbursement_statistics())
