from __future__ import annotations

from pathlib import Path

from core.verify import rpa_verify


def test_save_rpa_config_returns_validation_error_for_missing_chrome_path(
    monkeypatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(rpa_verify, "_CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(rpa_verify, "_CONFIG_FILE", str(tmp_path / "rpa_config.json"))

    result = rpa_verify.save_rpa_config(
        chromium_executable_path=str(tmp_path / "missing" / "chrome.exe")
    )

    assert result == {
        "success": False,
        "error": "Chrome 可执行文件不存在",
    }
