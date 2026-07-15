from __future__ import annotations

import sqlite3
from pathlib import Path

from storage import paths
from storage.reimbursement_db import (
    batch_delete_reimbursements,
    close_reimbursement_db,
    delete_reimbursement,
    delete_reimbursement_item,
    get_all_reimbursements,
    get_reimbursement,
    get_reimbursement_statistics,
    init_reimbursement_db,
    insert_approval_record,
    insert_reimbursement,
    insert_reimbursement_item,
    set_reimb_db_path,
    update_reimbursement,
    update_reimbursement_item,
)


def reset_path_caches() -> None:
    paths._storage_root_cache = None
    paths._outputs_dir_cache = None


def init_test_db(monkeypatch, tmp_path: Path) -> Path:
    monkeypatch.setenv("FAPIAO_TOOL_STORAGE_DIR", str(tmp_path))
    reset_path_caches()

    db_path = Path(paths.get_reimbursement_db_path())
    set_reimb_db_path(str(db_path))
    init_reimbursement_db()
    return db_path


def test_reimbursement_roundtrip(monkeypatch, tmp_path: Path) -> None:
    init_test_db(monkeypatch, tmp_path)

    payload = {
        "code": "BX202603190001",
        "title": "三月差旅报销",
        "type": "travel",
        "applicant": "测试用户",
        "department": "研发部",
        "purpose": "项目出差",
        "status": "draft",
    }

    reimbursement_uid = insert_reimbursement(payload)
    reimbursement = get_reimbursement(reimbursement_uid)

    assert reimbursement is not None
    assert reimbursement["code"] == payload["code"]
    assert reimbursement["title"] == payload["title"]

    close_reimbursement_db()


def test_reimbursement_crud_and_statistics(monkeypatch, tmp_path: Path) -> None:
    init_test_db(monkeypatch, tmp_path)

    reimb_uid = insert_reimbursement(
        {
            "id": "reimb-primary",
            "code": "BX202603200001",
            "title": "四月差旅报销",
            "type": "travel",
            "applicant": "测试用户",
            "applicantId": "u-1",
            "department": "研发部",
            "sales": "华东区",
            "costPerDay": "300",
            "purpose": "客户拜访",
            "status": "pending_payment",
            "totalAmount": 1200.5,
            "totalTax": 66.3,
            "tags": ["差旅", "四月"],
            "notes": "待付款",
        }
    )

    item_uid = insert_reimbursement_item(
        reimb_uid,
        {
            "id": "item-1",
            "invoiceId": "inv-1",
            "invoiceName": "hotel.pdf",
            "invoiceCode": "044001",
            "invoiceNumber": "10001",
            "invoiceDate": "2026-03-20",
            "amount": 800,
            "taxAmount": 48,
            "category": "hotel",
            "purpose": "住宿",
            "notes": "两晚",
            "attachments": ["hotel.png"],
        },
    )
    insert_reimbursement_item(
        reimb_uid,
        {
            "id": "item-2",
            "invoiceId": "inv-2",
            "invoiceName": "taxi.pdf",
            "amount": 400.5,
            "category": "taxi",
        },
    )
    insert_approval_record(
        reimb_uid,
        {
            "id": "record-1",
            "approver": "经理",
            "action": "submit",
            "comment": "提交审批",
        },
    )

    assert update_reimbursement(
        reimb_uid,
        {
            "status": "paid",
            "approvedAmount": 1188.0,
            "paymentMethod": "bank",
            "bankAccount": "6222",
            "bankName": "中国银行",
            "approver": "财务",
            "submittedAt": 100,
            "approvedAt": 200,
            "paidAt": 300,
            "tags": ["差旅", "已付款"],
        },
    )
    assert not update_reimbursement(reimb_uid, {})

    assert update_reimbursement_item(
        item_uid,
        {
            "notes": "酒店住宿",
            "attachments": ["hotel.png", "hotel-invoice.pdf"],
        },
    )
    assert not update_reimbursement_item(item_uid, {})

    reimbursement = get_reimbursement(reimb_uid)

    assert reimbursement is not None
    assert reimbursement["status"] == "paid"
    assert reimbursement["approvedAmount"] == 1188.0
    assert reimbursement["tags"] == ["差旅", "已付款"]
    assert len(reimbursement["items"]) == 2
    assert reimbursement["items"][0]["attachments"] == ["hotel.png", "hotel-invoice.pdf"]
    assert reimbursement["approvalRecords"][0]["action"] == "submit"

    all_reimbursements = get_all_reimbursements()
    assert len(all_reimbursements) == 1
    assert all_reimbursements[0]["id"] == reimb_uid

    statistics = get_reimbursement_statistics()
    assert statistics["count"] == 1
    assert statistics["total"] == 1200.5
    assert statistics["byStatus"]["paid"]["count"] == 1
    assert statistics["byType"]["travel"] == 1
    assert statistics["pendingCount"] == 0
    assert statistics["avgAmount"] == 1200.5

    assert delete_reimbursement_item(item_uid)
    assert not delete_reimbursement_item(item_uid)
    assert delete_reimbursement(reimb_uid)
    assert not delete_reimbursement(reimb_uid)
    assert get_reimbursement(reimb_uid) is None

    close_reimbursement_db()


def test_batch_delete_and_invalid_json_fallback(monkeypatch, tmp_path: Path) -> None:
    db_path = init_test_db(monkeypatch, tmp_path)

    uid_one = insert_reimbursement(
        {
            "id": "reimb-a",
            "code": "BX202603200011",
            "title": "一号报销单",
            "type": "travel",
            "applicant": "A",
            "department": "研发部",
            "purpose": "出差",
            "status": "draft",
            "tags": ["原始标签"],
        }
    )
    insert_reimbursement_item(
        uid_one,
        {
            "id": "item-a",
            "invoiceId": "inv-a",
            "invoiceName": "a.pdf",
            "amount": 88,
            "category": "other",
            "attachments": ["a.png"],
        },
    )

    uid_two = insert_reimbursement(
        {
            "id": "reimb-b",
            "code": "BX202603200012",
            "title": "二号报销单",
            "type": "office",
            "applicant": "B",
            "department": "财务部",
            "purpose": "采购",
            "status": "draft",
        }
    )

    sqlite_conn = sqlite3.connect(db_path)
    sqlite_conn.execute("UPDATE reimbursements SET tags = ? WHERE uid = ?", ("{bad json", uid_one))
    sqlite_conn.execute(
        "UPDATE reimbursement_items SET attachments = ? WHERE reimbursement_uid = ?",
        ("{bad json", uid_one),
    )
    sqlite_conn.commit()
    sqlite_conn.close()

    close_reimbursement_db()
    init_reimbursement_db()

    reimbursement = get_reimbursement(uid_one)
    assert reimbursement is not None
    assert reimbursement["tags"] == []
    assert reimbursement["items"][0]["attachments"] == []

    assert batch_delete_reimbursements([]) == 0
    assert batch_delete_reimbursements([uid_one, uid_two]) == 2
    assert get_all_reimbursements() == []

    close_reimbursement_db()
