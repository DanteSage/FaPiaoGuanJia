from __future__ import annotations

from rpc import verify_handlers


def test_handle_verify_invoice_returns_core_result(monkeypatch) -> None:
    expected = {
        "success": False,
        "error": "未配置 API 密钥",
        "needConfig": True,
    }

    def fake_verify_invoice(
        fpdm: str, fphm: str, kprq: str, check_code: str, amount: str
    ) -> dict[str, object]:
        assert fpdm == "012345678901"
        assert fphm == "12345678"
        assert kprq == "20260428"
        assert check_code == "123456"
        assert amount == "100.00"
        return expected

    monkeypatch.setattr(
        "core.verify.verify_invoice",
        fake_verify_invoice,
    )

    result = verify_handlers.handle_verify_invoice(
        {
            "fpdm": "012345678901",
            "fphm": "12345678",
            "kprq": "20260428",
            "checkCode": "123456",
            "amount": "100.00",
        }
    )

    assert result == expected
    assert "result" not in result


def test_handle_verify_invoice_by_file_returns_core_result(monkeypatch) -> None:
    expected = {
        "success": False,
        "error": "文件不存在",
    }

    def fake_verify_invoice_by_file(file_path: str) -> dict[str, object]:
        assert file_path == "missing.ofd"
        return expected

    monkeypatch.setattr(
        "core.verify.verify_invoice_by_file",
        fake_verify_invoice_by_file,
    )

    result = verify_handlers.handle_verify_invoice_by_file(
        {
            "filePath": "missing.ofd",
        }
    )

    assert result == expected
    assert "result" not in result


def test_handle_rpa_verify_invoice_returns_core_result(monkeypatch) -> None:
    expected = {
        "success": False,
        "error": "未配置验证码识别 appKey",
        "needConfig": True,
    }

    def fake_rpa_verify_invoice(
        fpdm: str,
        fphm: str,
        kprq: str,
        check_code: str,
        amount: str,
        captcha_app_key: str,
        **kwargs: object,
    ) -> dict[str, object]:
        assert fphm == "12345678"
        assert captcha_app_key == ""
        return expected

    monkeypatch.setattr(
        "core.verify.rpa_verify_invoice",
        fake_rpa_verify_invoice,
    )

    result = verify_handlers.handle_rpa_verify_invoice(
        {
            "fphm": "12345678",
            "kprq": "20260428",
        }
    )

    assert result == expected
    assert "result" not in result


def test_handle_set_rpa_config_preserves_validation_failure(monkeypatch) -> None:
    expected = {
        "success": False,
        "error": "Chrome 可执行文件不存在",
    }

    def fake_save_rpa_config(
        captcha_app_key: object = None,
        browser_preference: object = None,
        chromium_executable_path: object = None,
    ) -> dict[str, object]:
        assert chromium_executable_path == "missing.exe"
        return expected

    monkeypatch.setattr(
        "core.verify.save_rpa_config",
        fake_save_rpa_config,
    )

    result = verify_handlers.handle_set_rpa_config(
        {
            "chromiumExecutablePath": "missing.exe",
        }
    )

    assert result == expected
    assert result["success"] is False


def test_handle_test_rpa_browser_returns_core_result(monkeypatch) -> None:
    expected = {
        "success": False,
        "error": "RPA 引擎未安装",
        "componentStatus": {"installed": False},
    }

    def fake_test_rpa_browser(
        browser_preference: object = None,
        chromium_executable_path: object = None,
    ) -> dict[str, object]:
        assert browser_preference == "auto"
        return expected

    monkeypatch.setattr(
        "core.verify.test_rpa_browser",
        fake_test_rpa_browser,
    )

    result = verify_handlers.handle_test_rpa_browser(
        {
            "browserPreference": "auto",
        }
    )

    assert result == expected
    assert "result" not in result
