import json

import os

import sqlite3

import threading

import time

from contextlib import contextmanager

from typing import Any, Dict, List, Optional


from .paths import get_reimbursement_db_path


_REIMB_DB_PATH: Optional[str] = None

_REIMB_DB_LOCK = threading.Lock()


_reimb_thread_local = threading.local()


def _get_reimb_db_path() -> str:
    global _REIMB_DB_PATH
    if _REIMB_DB_PATH is None:
        _REIMB_DB_PATH = get_reimbursement_db_path()
    return _REIMB_DB_PATH


def set_reimb_db_path(path: str) -> None:

    global _REIMB_DB_PATH

    _REIMB_DB_PATH = path


def _get_reimb_connection() -> sqlite3.Connection:

    if not hasattr(_reimb_thread_local, "conn") or _reimb_thread_local.conn is None:

        conn = sqlite3.connect(_get_reimb_db_path(), check_same_thread=False)

        conn.row_factory = sqlite3.Row

        conn.execute("PRAGMA journal_mode=WAL")

        conn.execute("PRAGMA synchronous=NORMAL")

        conn.execute("PRAGMA cache_size=-8000")

        conn.execute("PRAGMA temp_store=MEMORY")

        conn.execute("PRAGMA mmap_size=33554432")

        _reimb_thread_local.conn = conn

    return _reimb_thread_local.conn


@contextmanager
def _reimb_transaction():

    conn = _get_reimb_connection()

    try:

        yield conn

        conn.commit()

    except Exception:

        conn.rollback()

        raise


def init_reimbursement_db() -> None:

    conn = _get_reimb_connection()

    conn.executescript(
        """

        CREATE TABLE IF NOT EXISTS reimbursements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            code TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            applicant TEXT NOT NULL,
            applicant_id TEXT,
            department TEXT NOT NULL,
            sales TEXT,
            cost_per_day TEXT,
            purpose TEXT NOT NULL,
            status TEXT NOT NULL,
            total_amount REAL DEFAULT 0,
            total_tax REAL DEFAULT 0,
            approved_amount REAL,
            payment_method TEXT,
            bank_account TEXT,
            bank_name TEXT,
            approver TEXT,
            reject_reason TEXT,
            notes TEXT,
            tags TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            submitted_at INTEGER,
            approved_at INTEGER,
            paid_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS reimbursement_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            reimbursement_uid TEXT NOT NULL,
            invoice_id TEXT NOT NULL,
            invoice_name TEXT NOT NULL,
            invoice_code TEXT,
            invoice_number TEXT,
            invoice_date TEXT,
            amount REAL NOT NULL,
            tax_amount REAL,
            category TEXT NOT NULL,
            purpose TEXT,
            notes TEXT,
            attachments TEXT,
            invoice_deleted INTEGER DEFAULT 0,
            FOREIGN KEY (reimbursement_uid) REFERENCES reimbursements(uid) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS approval_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT UNIQUE NOT NULL,
            reimbursement_uid TEXT NOT NULL,
            approver TEXT NOT NULL,
            action TEXT NOT NULL,
            comment TEXT,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (reimbursement_uid) REFERENCES reimbursements(uid) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reimb_code ON reimbursements(code);
        CREATE INDEX IF NOT EXISTS idx_reimb_status ON reimbursements(status);
        CREATE INDEX IF NOT EXISTS idx_reimb_applicant ON reimbursements(applicant);
        CREATE INDEX IF NOT EXISTS idx_reimb_department ON reimbursements(department);
        CREATE INDEX IF NOT EXISTS idx_reimb_created ON reimbursements(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_reimb_updated ON reimbursements(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_reimb_uid ON reimbursements(uid);
        CREATE INDEX IF NOT EXISTS idx_item_reimb_uid ON reimbursement_items(reimbursement_uid);
        CREATE INDEX IF NOT EXISTS idx_item_invoice_id ON reimbursement_items(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_approval_reimb_uid ON approval_records(reimbursement_uid);
    """
    )

    cursor = conn.execute("PRAGMA table_info(reimbursement_items)")
    columns = {row["name"] for row in cursor.fetchall()}
    if "invoice_deleted" not in columns:
        conn.execute("ALTER TABLE reimbursement_items ADD COLUMN invoice_deleted INTEGER DEFAULT 0")

    cursor2 = conn.execute("PRAGMA table_info(reimbursements)")
    reimb_columns = {row["name"] for row in cursor2.fetchall()}
    if "folder_id" not in reimb_columns:
        conn.execute("ALTER TABLE reimbursements ADD COLUMN folder_id TEXT")

    conn.commit()


def close_reimbursement_db() -> None:

    if hasattr(_reimb_thread_local, "conn") and _reimb_thread_local.conn is not None:

        _reimb_thread_local.conn.close()

        _reimb_thread_local.conn = None


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:

    d = dict(row)

    if d.get("tags"):

        try:

            d["tags"] = json.loads(d["tags"])

        except (json.JSONDecodeError, TypeError):

            d["tags"] = []

    else:

        d["tags"] = []

    if d.get("attachments"):

        try:

            d["attachments"] = json.loads(d["attachments"])

        except (json.JSONDecodeError, TypeError):

            d["attachments"] = []

    else:

        d["attachments"] = []

    return d


def _reimbursement_to_frontend(
    row: sqlite3.Row, items: List[Dict], records: List[Dict]
) -> Dict[str, Any]:

    d = _row_to_dict(row)

    return {
        "id": d["uid"],
        "code": d["code"],
        "title": d["title"],
        "type": d["type"],
        "applicant": d["applicant"],
        "applicantId": d.get("applicant_id"),
        "department": d["department"],
        "sales": d.get("sales"),
        "costPerDay": d.get("cost_per_day"),
        "purpose": d["purpose"],
        "status": d["status"],
        "items": items,
        "totalAmount": d.get("total_amount", 0),
        "totalTax": d.get("total_tax", 0),
        "approvedAmount": d.get("approved_amount"),
        "paymentMethod": d.get("payment_method"),
        "bankAccount": d.get("bank_account"),
        "bankName": d.get("bank_name"),
        "createdAt": d["created_at"],
        "updatedAt": d["updated_at"],
        "submittedAt": d.get("submitted_at"),
        "approvedAt": d.get("approved_at"),
        "paidAt": d.get("paid_at"),
        "approver": d.get("approver"),
        "rejectReason": d.get("reject_reason"),
        "approvalRecords": records,
        "notes": d.get("notes"),
        "tags": d.get("tags", []),
        "folderId": d.get("folder_id"),
    }


def _item_to_frontend(row: sqlite3.Row) -> Dict[str, Any]:

    d = _row_to_dict(row)

    return {
        "id": d["uid"],
        "invoiceId": d["invoice_id"],
        "invoiceName": d["invoice_name"],
        "invoiceCode": d.get("invoice_code"),
        "invoiceNumber": d.get("invoice_number"),
        "invoiceDate": d.get("invoice_date"),
        "amount": d["amount"],
        "taxAmount": d.get("tax_amount"),
        "category": d["category"],
        "purpose": d.get("purpose"),
        "notes": d.get("notes"),
        "attachments": d.get("attachments", []),
        "invoiceDeleted": bool(d.get("invoice_deleted", 0)),
    }


def _record_to_frontend(row: sqlite3.Row) -> Dict[str, Any]:

    d = _row_to_dict(row)

    return {
        "id": d["uid"],
        "approver": d["approver"],
        "action": d["action"],
        "comment": d.get("comment"),
        "timestamp": d["timestamp"],
    }


def insert_reimbursement(data: Dict[str, Any]) -> str:

    now = int(time.time() * 1000)

    uid = data.get("id") or f"reimb_{now}_{os.urandom(4).hex()}"

    tags = data.get("tags", [])

    if isinstance(tags, list):

        tags = json.dumps(tags, ensure_ascii=False)

    with _reimb_transaction() as conn:

        conn.execute(
            """

            INSERT INTO reimbursements (

                uid, code, title, type, applicant, applicant_id, department,

                sales, cost_per_day, purpose, status, total_amount, total_tax,

                approved_amount, payment_method, bank_account, bank_name,

                approver, reject_reason, notes, tags,

                created_at, updated_at, submitted_at, approved_at, paid_at

            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        """,
            (
                uid,
                data["code"],
                data["title"],
                data["type"],
                data["applicant"],
                data.get("applicantId"),
                data["department"],
                data.get("sales"),
                data.get("costPerDay"),
                data["purpose"],
                data["status"],
                data.get("totalAmount", 0),
                data.get("totalTax", 0),
                data.get("approvedAmount"),
                data.get("paymentMethod"),
                data.get("bankAccount"),
                data.get("bankName"),
                data.get("approver"),
                data.get("rejectReason"),
                data.get("notes"),
                tags,
                data.get("createdAt", now),
                data.get("updatedAt", now),
                data.get("submittedAt"),
                data.get("approvedAt"),
                data.get("paidAt"),
            ),
        )

    return uid


def get_reimbursement(uid: str) -> Optional[Dict[str, Any]]:

    conn = _get_reimb_connection()

    row = conn.execute("SELECT * FROM reimbursements WHERE uid = ?", (uid,)).fetchone()

    if not row:

        return None

    item_rows = conn.execute(
        "SELECT * FROM reimbursement_items WHERE reimbursement_uid = ?", (uid,)
    ).fetchall()

    items = [_item_to_frontend(r) for r in item_rows]

    record_rows = conn.execute(
        "SELECT * FROM approval_records WHERE reimbursement_uid = ? ORDER BY timestamp ASC", (uid,)
    ).fetchall()

    records = [_record_to_frontend(r) for r in record_rows]

    return _reimbursement_to_frontend(row, items, records)


def get_all_reimbursements() -> List[Dict[str, Any]]:

    conn = _get_reimb_connection()

    rows = conn.execute("SELECT * FROM reimbursements ORDER BY created_at DESC").fetchall()

    result = []

    for row in rows:

        uid = row["uid"]

        item_rows = conn.execute(
            "SELECT * FROM reimbursement_items WHERE reimbursement_uid = ?", (uid,)
        ).fetchall()

        items = [_item_to_frontend(r) for r in item_rows]

        record_rows = conn.execute(
            "SELECT * FROM approval_records WHERE reimbursement_uid = ? ORDER BY timestamp ASC",
            (uid,),
        ).fetchall()

        records = [_record_to_frontend(r) for r in record_rows]

        result.append(_reimbursement_to_frontend(row, items, records))

    return result


def update_reimbursement(uid: str, data: Dict[str, Any]) -> bool:

    now = int(time.time() * 1000)

    field_map = {
        "title": "title",
        "type": "type",
        "applicant": "applicant",
        "applicantId": "applicant_id",
        "department": "department",
        "sales": "sales",
        "costPerDay": "cost_per_day",
        "purpose": "purpose",
        "status": "status",
        "totalAmount": "total_amount",
        "totalTax": "total_tax",
        "approvedAmount": "approved_amount",
        "paymentMethod": "payment_method",
        "bankAccount": "bank_account",
        "bankName": "bank_name",
        "approver": "approver",
        "rejectReason": "reject_reason",
        "notes": "notes",
        "submittedAt": "submitted_at",
        "approvedAt": "approved_at",
        "paidAt": "paid_at",
        "folderId": "folder_id",
    }

    updates = []

    params = []

    for js_key, db_key in field_map.items():

        if js_key in data:

            updates.append(f"{db_key} = ?")

            params.append(data[js_key])

    if "tags" in data:

        tags = data["tags"]

        if isinstance(tags, list):

            tags = json.dumps(tags, ensure_ascii=False)

        updates.append("tags = ?")

        params.append(tags)

    if not updates:

        return False

    updates.append("updated_at = ?")

    params.append(now)

    params.append(uid)

    with _reimb_transaction() as conn:

        cursor = conn.execute(
            f"UPDATE reimbursements SET {', '.join(updates)} WHERE uid = ?", params
        )

        return cursor.rowcount > 0


def delete_reimbursement(uid: str) -> bool:

    with _reimb_transaction() as conn:

        cursor = conn.execute("DELETE FROM reimbursements WHERE uid = ?", (uid,))

        return cursor.rowcount > 0


def batch_delete_reimbursements(uids: List[str]) -> int:

    if not uids:

        return 0

    placeholders = ",".join("?" * len(uids))

    with _reimb_transaction() as conn:

        cursor = conn.execute(f"DELETE FROM reimbursements WHERE uid IN ({placeholders})", uids)

        return cursor.rowcount


def insert_reimbursement_item(reimb_uid: str, data: Dict[str, Any]) -> str:

    now = int(time.time() * 1000)

    uid = data.get("id") or f"item_{now}_{os.urandom(4).hex()}"

    attachments = data.get("attachments", [])

    if isinstance(attachments, list):

        attachments = json.dumps(attachments, ensure_ascii=False)

    with _reimb_transaction() as conn:

        conn.execute(
            """

            INSERT INTO reimbursement_items (

                uid, reimbursement_uid, invoice_id, invoice_name,

                invoice_code, invoice_number, invoice_date,

                amount, tax_amount, category, purpose, notes, attachments

            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        """,
            (
                uid,
                reimb_uid,
                data["invoiceId"],
                data["invoiceName"],
                data.get("invoiceCode"),
                data.get("invoiceNumber"),
                data.get("invoiceDate"),
                data["amount"],
                data.get("taxAmount"),
                data["category"],
                data.get("purpose"),
                data.get("notes"),
                attachments,
            ),
        )

    return uid


def update_reimbursement_item(item_uid: str, data: Dict[str, Any]) -> bool:

    field_map = {
        "invoiceId": "invoice_id",
        "invoiceName": "invoice_name",
        "invoiceCode": "invoice_code",
        "invoiceNumber": "invoice_number",
        "invoiceDate": "invoice_date",
        "amount": "amount",
        "taxAmount": "tax_amount",
        "category": "category",
        "purpose": "purpose",
        "notes": "notes",
    }

    updates = []

    params = []

    for js_key, db_key in field_map.items():

        if js_key in data:

            updates.append(f"{db_key} = ?")

            params.append(data[js_key])

    if "attachments" in data:

        attachments = data["attachments"]

        if isinstance(attachments, list):

            attachments = json.dumps(attachments, ensure_ascii=False)

        updates.append("attachments = ?")

        params.append(attachments)

    if not updates:

        return False

    params.append(item_uid)

    with _reimb_transaction() as conn:

        cursor = conn.execute(
            f"UPDATE reimbursement_items SET {', '.join(updates)} WHERE uid = ?", params
        )

        return cursor.rowcount > 0


def delete_reimbursement_item(item_uid: str) -> bool:

    with _reimb_transaction() as conn:

        cursor = conn.execute("DELETE FROM reimbursement_items WHERE uid = ?", (item_uid,))

        return cursor.rowcount > 0


def insert_approval_record(reimb_uid: str, data: Dict[str, Any]) -> str:

    now = int(time.time() * 1000)

    uid = data.get("id") or f"record_{now}_{os.urandom(4).hex()}"

    with _reimb_transaction() as conn:

        conn.execute(
            """

            INSERT INTO approval_records (

                uid, reimbursement_uid, approver, action, comment, timestamp

            ) VALUES (?, ?, ?, ?, ?, ?)

        """,
            (
                uid,
                reimb_uid,
                data["approver"],
                data["action"],
                data.get("comment"),
                data.get("timestamp", now),
            ),
        )

    return uid


def get_reimbursements_by_invoice_ids(invoice_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    """批量查询：每个 invoice_id 被哪些报销单引用（仅返回未失效的引用）。"""

    if not invoice_ids:
        return {}

    conn = _get_reimb_connection()

    placeholders = ",".join("?" * len(invoice_ids))
    rows = conn.execute(
        f"""
        SELECT DISTINCT i.invoice_id, r.uid AS reimb_uid, r.code, r.title, r.status
        FROM reimbursement_items i
        JOIN reimbursements r ON i.reimbursement_uid = r.uid
        WHERE i.invoice_id IN ({placeholders}) AND COALESCE(i.invoice_deleted, 0) = 0
        ORDER BY r.created_at DESC
        """,
        invoice_ids,
    ).fetchall()

    refs: Dict[str, List[Dict[str, Any]]] = {iid: [] for iid in invoice_ids}
    for row in rows:
        refs[row["invoice_id"]].append(
            {
                "id": row["reimb_uid"],
                "code": row["code"],
                "title": row["title"],
                "status": row["status"],
            }
        )
    return refs


def mark_invoice_references_deleted(invoice_ids: List[str]) -> int:
    """标记指定 invoice_id 关联的报销单 items 为失效（不删除条目，保留金额）。"""

    if not invoice_ids:
        return 0

    placeholders = ",".join("?" * len(invoice_ids))
    with _reimb_transaction() as conn:
        cursor = conn.execute(
            f"UPDATE reimbursement_items SET invoice_deleted = 1 "
            f"WHERE invoice_id IN ({placeholders}) AND COALESCE(invoice_deleted, 0) = 0",
            invoice_ids,
        )
        return cursor.rowcount


def remove_invoice_references(invoice_ids: List[str]) -> Dict[str, int]:
    """从报销单 items 中删除对指定 invoice_id 的引用，并重算所属报销单总额。"""

    if not invoice_ids:
        return {"removedItems": 0, "affectedReimbursements": 0}

    placeholders = ",".join("?" * len(invoice_ids))
    now = int(time.time() * 1000)

    with _reimb_transaction() as conn:
        related_rows = conn.execute(
            f"SELECT DISTINCT reimbursement_uid FROM reimbursement_items "
            f"WHERE invoice_id IN ({placeholders})",
            invoice_ids,
        ).fetchall()
        related_uids = [row["reimbursement_uid"] for row in related_rows]

        cursor = conn.execute(
            f"DELETE FROM reimbursement_items WHERE invoice_id IN ({placeholders})",
            invoice_ids,
        )
        removed_items = cursor.rowcount

        for reimb_uid in related_uids:
            agg = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) AS total_amount, "
                "COALESCE(SUM(tax_amount), 0) AS total_tax "
                "FROM reimbursement_items WHERE reimbursement_uid = ?",
                (reimb_uid,),
            ).fetchone()
            conn.execute(
                "UPDATE reimbursements SET total_amount = ?, total_tax = ?, updated_at = ? "
                "WHERE uid = ?",
                (agg["total_amount"], agg["total_tax"], now, reimb_uid),
            )

        return {"removedItems": removed_items, "affectedReimbursements": len(related_uids)}


def get_reimbursement_statistics() -> Dict[str, Any]:

    conn = _get_reimb_connection()

    total_count = conn.execute("SELECT COUNT(*) FROM reimbursements").fetchone()[0]

    total_amount = conn.execute(
        "SELECT COALESCE(SUM(total_amount), 0) FROM reimbursements"
    ).fetchone()[0]

    status_rows = conn.execute(
        "SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as amt FROM reimbursements GROUP BY status"
    ).fetchall()

    by_status = {row["status"]: {"count": row["cnt"], "amount": row["amt"]} for row in status_rows}

    type_rows = conn.execute(
        "SELECT type, COUNT(*) as cnt FROM reimbursements GROUP BY type"
    ).fetchall()

    by_type = {row["type"]: row["cnt"] for row in type_rows}

    pending = conn.execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as amt FROM reimbursements WHERE status = 'pending_payment'"
    ).fetchone()

    pending_count = pending["cnt"]

    pending_amount = pending["amt"]

    avg_amount = total_amount / total_count if total_count > 0 else 0

    return {
        "total": total_amount,
        "count": total_count,
        "byStatus": by_status,
        "byType": by_type,
        "avgAmount": avg_amount,
        "pendingCount": pending_count,
        "pendingAmount": pending_amount,
    }
