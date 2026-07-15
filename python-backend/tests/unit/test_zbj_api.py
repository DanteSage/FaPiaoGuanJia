from __future__ import annotations

import base64
import json
from pathlib import Path

from core.verify import zbj_api


def test_verify_invoice_by_file_uses_pdf_endpoint_and_pdf_base64(
    monkeypatch, tmp_path: Path
) -> None:
    sample_file = tmp_path / "ticket.ofd"
    sample_bytes = b"sample-ofd-content"
    sample_file.write_bytes(sample_bytes)

    captured: dict[str, object] = {}

    def fake_do_request(endpoint: str, params: dict[str, str]) -> dict[str, object]:
        captured["endpoint"] = endpoint
        captured["params"] = params
        return {"success": True, "data": {"fphm": "26419165785000111413"}}

    monkeypatch.setattr(zbj_api, "_do_request", fake_do_request)

    result = zbj_api.verify_invoice_by_file(str(sample_file))

    assert result["success"] is True
    assert captured["endpoint"] == "invoice/pdf"
    assert captured["params"] == {"pdfBase64": base64.b64encode(sample_bytes).decode("utf-8")}


def test_format_debug_request_body_masks_sensitive_fields() -> None:
    body = json.dumps(
        {
            "fphm": "26419165785000111413",
            "kprq": "2026-04-07",
            "jshj": "108.66",
            "pdfBase64": "abcdefghijklmnopqrstuvwxyz0123456789",
        },
        ensure_ascii=False,
    ).encode("utf-8")

    masked = zbj_api._format_debug_request_body("direct", body)

    assert "26419165785000111413" not in masked
    assert "2026-04-07" not in masked
    assert "108.66" not in masked
    assert "abcdefghijklmnopqrstuvwxyz0123456789" not in masked
    assert "264" in masked
    assert "13" in masked


def test_format_debug_response_body_masks_sensitive_fields() -> None:
    body = json.dumps(
        {
            "success": True,
            "data": {
                "fpdm": "012345678901",
                "fphm": "26419165785000111413",
                "checkCode": "998877665544332211",
            },
        },
        ensure_ascii=False,
    )

    masked = zbj_api._format_debug_response_body(body)

    assert "012345678901" not in masked
    assert "26419165785000111413" not in masked
    assert "998877665544332211" not in masked
    assert "012" in masked
    assert "01" in masked
