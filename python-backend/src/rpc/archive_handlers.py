from __future__ import annotations

from typing import Any, Dict, List

from rpc.dispatch import register
from rpc.response import fail, ok
from storage import (
    add_tags_to_invoices,
    batch_delete_archived_invoices,
    check_invoice_duplicate,
    delete_archived_invoice,
    delete_folder,
    delete_tag,
    get_all_archived_invoices,
    get_all_folders,
    get_all_tags,
    get_archive_statistics,
    get_archived_invoice,
    get_reimbursements_by_invoice_ids,
    insert_archived_invoice,
    insert_folder,
    insert_tag,
    mark_invoice_references_deleted,
    move_invoices_to_folder,
    remove_invoice_references,
    remove_tags_from_invoices,
    update_archived_invoice,
    update_folder,
    update_tag,
)


def _safe_delete_archived_file(uid: str) -> None:
    invoice = get_archived_invoice(uid)
    if invoice and invoice.get("filePath"):
        from rpc.service import _safe_delete_file

        _safe_delete_file(invoice["filePath"])


@register("archive_load")
def handle_archive_load(params: Dict[str, Any]) -> Any:
    return ok(invoices=get_all_archived_invoices(), folders=get_all_folders(), tags=get_all_tags())


@register("archive_add_invoice")
def handle_archive_add_invoice(params: Dict[str, Any]) -> Any:
    data = params.get("data", {})
    dup = check_invoice_duplicate(
        file_path=data.get("filePath"),
        invoice_code=data.get("invoiceCode"),
        invoice_number=data.get("invoiceNumber"),
    )
    if dup:
        return fail("发票已存在", duplicate=dup)
    uid = insert_archived_invoice(data)
    invoice = get_archived_invoice(uid)
    return ok(invoice=invoice)


@register("archive_update_invoice")
def handle_archive_update_invoice(params: Dict[str, Any]) -> Any:
    uid = str(params.get("id", ""))
    data = params.get("data", {})
    success = update_archived_invoice(uid, data)
    return ok(success=success)


def _normalize_cascade_mode(value: Any) -> str:
    mode = str(value or "remove").lower()
    if mode not in ("keep", "remove"):
        mode = "remove"
    return mode


def _apply_reimbursement_cascade(invoice_ids: List[str], cascade_mode: str) -> Dict[str, int]:
    if not invoice_ids:
        return {"removedItems": 0, "affectedReimbursements": 0, "markedItems": 0}
    if cascade_mode == "keep":
        marked = mark_invoice_references_deleted(invoice_ids)
        return {"removedItems": 0, "affectedReimbursements": 0, "markedItems": marked}
    result = remove_invoice_references(invoice_ids)
    return {
        "removedItems": int(result.get("removedItems", 0)),
        "affectedReimbursements": int(result.get("affectedReimbursements", 0)),
        "markedItems": 0,
    }


@register("archive_check_reimbursement_refs")
def handle_archive_check_reimbursement_refs(params: Dict[str, Any]) -> Any:
    raw_ids = params.get("ids")
    if raw_ids is None and params.get("id") is not None:
        raw_ids = [params.get("id")]
    if not isinstance(raw_ids, list):
        return ok(refs={})
    invoice_ids = [str(x) for x in raw_ids if x]
    refs = get_reimbursements_by_invoice_ids(invoice_ids)
    return ok(refs=refs)


@register("archive_delete_invoice")
def handle_archive_delete_invoice(params: Dict[str, Any]) -> Any:
    uid = str(params.get("id", ""))
    delete_file = bool(params.get("deleteFile", True))
    cascade_mode = _normalize_cascade_mode(params.get("cascadeMode"))
    cascade = _apply_reimbursement_cascade([uid], cascade_mode)
    if delete_file:
        _safe_delete_archived_file(uid)
    success = delete_archived_invoice(uid)
    return ok(success=success, cascadeMode=cascade_mode, cascade=cascade)


@register("archive_delete_invoices")
def handle_archive_delete_invoices(params: Dict[str, Any]) -> Any:
    uids = params.get("ids", [])
    delete_files = bool(params.get("deleteFiles", True))
    cascade_mode = _normalize_cascade_mode(params.get("cascadeMode"))
    str_uids = [str(uid) for uid in uids]
    cascade = _apply_reimbursement_cascade(str_uids, cascade_mode)
    if delete_files:
        for uid in str_uids:
            _safe_delete_archived_file(uid)
    count = batch_delete_archived_invoices(str_uids)
    return ok(deletedCount=count, cascadeMode=cascade_mode, cascade=cascade)


@register("archive_check_duplicate")
def handle_archive_check_duplicate(params: Dict[str, Any]) -> Any:
    dup = check_invoice_duplicate(
        file_path=params.get("filePath"),
        invoice_code=params.get("invoiceCode"),
        invoice_number=params.get("invoiceNumber"),
    )
    return ok(duplicate=dup)


@register("archive_statistics")
def handle_archive_statistics(params: Dict[str, Any]) -> Any:
    return ok(**get_archive_statistics())


@register("folder_add")
def handle_folder_add(params: Dict[str, Any]) -> Any:
    data = params.get("data", {})
    uid = insert_folder(data)
    folders = get_all_folders()
    folder = next((f for f in folders if f["id"] == uid), None)
    return ok(folder=folder)


@register("folder_update")
def handle_folder_update(params: Dict[str, Any]) -> Any:
    uid = str(params.get("id", ""))
    data = params.get("data", {})
    success = update_folder(uid, data)
    return ok(success=success)


@register("folder_delete")
def handle_folder_delete(params: Dict[str, Any]) -> Any:
    uid = str(params.get("id", ""))
    success = delete_folder(uid)
    return ok(success=success)


@register("folder_list")
def handle_folder_list(params: Dict[str, Any]) -> Any:
    return ok(folders=get_all_folders())


@register("tag_add")
def handle_tag_add(params: Dict[str, Any]) -> Any:
    data = params.get("data", {})
    uid = insert_tag(data)
    tags = get_all_tags()
    tag = next((t for t in tags if t["id"] == uid), None)
    return ok(tag=tag)


@register("tag_update")
def handle_tag_update(params: Dict[str, Any]) -> Any:
    uid = str(params.get("id", ""))
    data = params.get("data", {})
    success = update_tag(uid, data)
    return ok(success=success)


@register("tag_delete")
def handle_tag_delete(params: Dict[str, Any]) -> Any:
    uid = str(params.get("id", ""))
    success = delete_tag(uid)
    return ok(success=success)


@register("tag_list")
def handle_tag_list(params: Dict[str, Any]) -> Any:
    return ok(tags=get_all_tags())


@register("archive_move_to_folder")
def handle_archive_move_to_folder(params: Dict[str, Any]) -> Any:
    invoice_ids = params.get("invoiceIds", [])
    folder_id = params.get("folderId")
    count = move_invoices_to_folder(invoice_ids, folder_id)
    return ok(updatedCount=count)


@register("archive_add_tags")
def handle_archive_add_tags(params: Dict[str, Any]) -> Any:
    invoice_ids = params.get("invoiceIds", [])
    tag_ids = params.get("tagIds", [])
    count = add_tags_to_invoices(invoice_ids, tag_ids)
    return ok(updatedCount=count)


@register("archive_remove_tags")
def handle_archive_remove_tags(params: Dict[str, Any]) -> Any:
    invoice_ids = params.get("invoiceIds", [])
    tag_ids = params.get("tagIds", [])
    count = remove_tags_from_invoices(invoice_ids, tag_ids)
    return ok(updatedCount=count)
