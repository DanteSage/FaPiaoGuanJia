import os
import pytest
from storage import (
    init_db,
    close_db,
    init_reimbursement_db,
    close_reimbursement_db,
    insert_archived_invoice,
    get_all_archived_invoices,
)
from storage.reimbursement_db import (
    insert_reimbursement,
    insert_reimbursement_item,
    get_reimbursement,
)
from storage.database import _get_connection
from storage.reimbursement_db import _get_reimb_connection
from rpc.archive_handlers import handle_archive_delete_invoices


def test_delete_invoices_with_files(tmp_path):
    init_db()
    init_reimbursement_db()
    try:
        # Clear databases
        conn = _get_connection()
        conn.execute("DELETE FROM invoices")
        conn.commit()
        
        # Create real dummy files in tmp_path
        f1 = tmp_path / "file1.pdf"
        f2 = tmp_path / "file2.pdf"
        f3 = tmp_path / "file3.pdf"
        f1.write_text("dummy pdf 1")
        f2.write_text("dummy pdf 2")
        f3.write_text("dummy pdf 3")
        
        # Insert a few dummy invoices
        invoices = [
            {"id": "uid1", "invoiceCode": "code1", "invoiceNumber": "num1", "filePath": str(f1)},
            {"id": "uid2", "invoiceCode": "code2", "invoiceNumber": "num2", "filePath": str(f2)},
            {"id": "uid3", "invoiceCode": "code3", "invoiceNumber": "num3", "filePath": str(f3)},
        ]
        for inv in invoices:
            insert_archived_invoice(inv)
            
        # Verify files and DB
        assert f1.exists()
        assert f2.exists()
        assert f3.exists()
        all_invs = get_all_archived_invoices()
        assert len(all_invs) == 3
        
        # Test batch delete via handler
        params = {
            "ids": ["uid1", "uid2", "uid3"],
            "deleteFiles": True, # Delete files
            "cascadeMode": "remove"
        }
        res = handle_archive_delete_invoices(params)
        assert res["success"] is True
        assert res["deletedCount"] == 3
        
        # Verify files are deleted
        assert not f1.exists()
        assert not f2.exists()
        assert not f3.exists()
        
        # Verify DB is cleared
        all_invs_after = get_all_archived_invoices()
        assert len(all_invs_after) == 0
    finally:
        close_db()
        close_reimbursement_db()


def test_delete_invoices_cascade():
    init_db()
    init_reimbursement_db()
    try:
        # Clear databases
        conn = _get_connection()
        conn.execute("DELETE FROM invoices")
        conn.commit()

        reimb_conn = _get_reimb_connection()
        reimb_conn.execute("DELETE FROM reimbursement_items")
        reimb_conn.execute("DELETE FROM reimbursements")
        reimb_conn.commit()

        # 1. Insert dummy invoice
        invoice = {
            "id": "inv_cascade_1",
            "invoiceCode": "999",
            "invoiceNumber": "888",
            "filePath": "dummy_path",
        }
        insert_archived_invoice(invoice)

        # 2. Insert reimbursement
        reimb_data = {
            "id": "reimb_cascade_1",
            "code": "R-100",
            "title": "Cascade Test Reimbursement",
            "type": "business",
            "applicant": "Test User",
            "department": "R&D",
            "purpose": "Testing cascade deletion",
            "status": "draft",
            "totalAmount": 100.0,
            "totalTax": 13.0,
        }
        insert_reimbursement(reimb_data)

        # 3. Insert reimbursement item referencing the invoice
        item_data = {
            "id": "item_cascade_1",
            "invoiceId": "inv_cascade_1",
            "invoiceName": "inv_cascade_1_file",
            "amount": 100.0,
            "taxAmount": 13.0,
            "category": "travel",
        }
        insert_reimbursement_item("reimb_cascade_1", item_data)

        # Verify initial state of reimbursement
        reimb_before = get_reimbursement("reimb_cascade_1")
        assert reimb_before is not None
        assert reimb_before["totalAmount"] == 100.0
        assert reimb_before["totalTax"] == 13.0

        # Verify initial item exists
        items_count = reimb_conn.execute("SELECT COUNT(*) FROM reimbursement_items WHERE reimbursement_uid = ?", ("reimb_cascade_1",)).fetchone()[0]
        assert items_count == 1

        # 4. Perform batch delete of the invoice with cascadeMode="remove"
        params = {
            "ids": ["inv_cascade_1"],
            "deleteFiles": False,
            "cascadeMode": "remove",
        }
        res = handle_archive_delete_invoices(params)
        assert res["success"] is True
        assert res["deletedCount"] == 1

        # 5. Verify the invoice is deleted from archives
        all_invs = get_all_archived_invoices()
        assert len(all_invs) == 0

        # 6. Verify that the reimbursement item was deleted
        items_count_after = reimb_conn.execute("SELECT COUNT(*) FROM reimbursement_items WHERE reimbursement_uid = ?", ("reimb_cascade_1",)).fetchone()[0]
        assert items_count_after == 0

        # 7. Verify that the reimbursement total amounts were updated to 0
        reimb_after = get_reimbursement("reimb_cascade_1")
        assert reimb_after["totalAmount"] == 0.0
        assert reimb_after["totalTax"] == 0.0

    finally:
        close_db()
        close_reimbursement_db()
