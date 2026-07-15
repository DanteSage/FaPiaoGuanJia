from __future__ import annotations

import builtins
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from engines import ocr_engine
from storage import config_migration, protected_config
from utils import common


def test_common_helpers_and_base_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(common, "get_outputs_dir", lambda: str(tmp_path / "outputs"))

    assert common.ensure_outputs_dir() == str(tmp_path / "outputs")
    assert common.ext_lower("A.BMP") == "bmp"
    assert common.is_pdf("a.pdf") is True
    assert common.is_ofd("a.ofd") is True
    assert common.is_image("a.jpeg") is True
    assert common.is_xml("a.xml") is True
    assert common.mm_to_pt(25.4) == pytest.approx(72.0)

    monkeypatch.setattr(common.sys, "frozen", True, raising=False)
    monkeypatch.setattr(common.sys, "executable", str(tmp_path / "dist" / "service.exe"))
    assert common.get_base_path() == str((tmp_path / "dist").resolve())


def test_stat_fingerprint_uses_cache_and_evicts(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    file_one = tmp_path / "one.bin"
    file_two = tmp_path / "two.bin"
    file_one.write_bytes(b"one")
    file_two.write_bytes(b"two")

    common._STAT_FINGERPRINT_CACHE.clear()
    monkeypatch.setattr(common, "_MAX_STAT_FINGERPRINT_CACHE_SIZE", 1)
    original_open = builtins.open

    first = common.stat_fingerprint(str(file_one))

    def fail_open(*_args, **_kwargs):
        raise AssertionError("cache should avoid reopening the same file")

    monkeypatch.setattr("builtins.open", fail_open)
    assert common.stat_fingerprint(str(file_one)) == first

    monkeypatch.setattr("builtins.open", original_open)
    first = common.stat_fingerprint(str(file_one))
    second = common.stat_fingerprint(str(file_two))
    assert first != second

    common._STAT_FINGERPRINT_CACHE.clear()
    recomputed = common.stat_fingerprint(str(file_one))
    assert recomputed == first


def test_config_migration_reads_migrates_lists_and_removes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    current_path = tmp_path / "config" / "verify.json"
    current_path.parent.mkdir(parents=True, exist_ok=True)
    candidate_path = tmp_path / "legacy" / "verify.json"
    candidate_path.parent.mkdir(parents=True, exist_ok=True)
    invalid_path = tmp_path / "legacy-invalid" / "verify.json"
    invalid_path.parent.mkdir(parents=True, exist_ok=True)

    current_path.write_text("{bad json", encoding="utf-8")
    candidate_path.write_text(json.dumps({"enabled": True}, ensure_ascii=False), encoding="utf-8")
    invalid_path.write_text(json.dumps(["not-a-dict"], ensure_ascii=False), encoding="utf-8")

    monkeypatch.setattr(
        config_migration,
        "get_config_migration_candidates",
        lambda _file_name: [str(candidate_path), str(candidate_path), str(invalid_path)],
    )

    def validator(data: dict[str, object]) -> bool:
        return bool(data.get("enabled"))

    loaded = config_migration.load_json_config_with_migration(str(current_path), validator)

    assert loaded == {"enabled": True}
    assert json.loads(current_path.read_text(encoding="utf-8")) == {"enabled": True}

    listed = config_migration.list_json_config_candidates(str(current_path))
    assert listed[0] == str(current_path.resolve())
    assert len(listed) == len(set(listed))

    assert (
        config_migration.remove_json_config_candidates(str(current_path), include_current=False)
        is True
    )
    assert current_path.exists()
    assert not candidate_path.exists()

    candidate_path.write_text(json.dumps({"enabled": True}, ensure_ascii=False), encoding="utf-8")

    removed: list[str] = []
    original_remove = config_migration.os.remove

    def wrapped_remove(path: str) -> None:
        removed.append(path)
        original_remove(path)

    monkeypatch.setattr(config_migration.os, "remove", wrapped_remove)
    assert (
        config_migration.remove_json_config_candidates(str(current_path), include_current=True)
        is True
    )
    assert str(current_path.resolve()) in {str(Path(path).resolve()) for path in removed}


def test_protected_config_roundtrip_and_plaintext_upgrade(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    config_path = tmp_path / "config" / "protected.json"
    payload = {"appKey": "secret-value", "appCode": "visible"}

    protected_config.save_protected_json_config(str(config_path), payload, ["appKey"])
    raw = json.loads(config_path.read_text(encoding="utf-8"))

    assert protected_config.is_protected_secret(raw["appKey"]) is True
    assert (
        raw[protected_config._PROTECTION_MARKER_KEY]
        == protected_config._get_protection_marker_value()
    )
    assert protected_config.unprotect_secret(raw["appKey"]) == "secret-value"

    removed_args: list[tuple[str, bool]] = []
    monkeypatch.setattr(
        protected_config,
        "remove_json_config_candidates",
        lambda path, include_current=False: removed_args.append((path, include_current)),
    )

    loaded = protected_config.load_protected_json_config(
        str(config_path),
        lambda data: "appCode" in data,
        ["appKey"],
    )
    assert loaded == payload
    assert removed_args == [(str(config_path), False)]

    config_path.write_text(
        json.dumps({"appKey": "plain-secret", "appCode": "plain"}, ensure_ascii=False),
        encoding="utf-8",
    )
    loaded_plain = protected_config.load_protected_json_config(
        str(config_path),
        lambda data: "appCode" in data,
        ["appKey"],
    )
    rewritten = json.loads(config_path.read_text(encoding="utf-8"))

    assert loaded_plain == {"appKey": "plain-secret", "appCode": "plain"}
    assert protected_config.is_protected_secret(rewritten["appKey"]) is True
    assert (
        rewritten[protected_config._PROTECTION_MARKER_KEY]
        == protected_config._get_protection_marker_value()
    )


def test_protected_config_low_level_helpers_and_empty_secret(tmp_path: Path) -> None:
    blob, buffer = protected_config._make_blob(b"abc")
    assert buffer is not None
    assert protected_config._blob_to_bytes(blob) == b"abc"

    empty_blob, empty_buffer = protected_config._make_blob(b"")
    assert empty_buffer is None
    assert protected_config._blob_to_bytes(empty_blob) == b""

    config_path = tmp_path / "config" / "empty.json"
    protected_config.save_protected_json_config(str(config_path), {"appKey": ""}, ["appKey"])
    raw = json.loads(config_path.read_text(encoding="utf-8"))
    assert protected_config._PROTECTION_MARKER_KEY not in raw
    assert protected_config.protect_secret("") == ""
    assert protected_config.unprotect_secret("") == ""


def test_protected_config_macos_keychain_roundtrip_and_upgrade(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(protected_config.sys, "platform", "darwin", raising=False)

    stored_secrets: dict[tuple[str, str], str] = {}

    def fake_run_keychain_command(args: list[str]) -> SimpleNamespace:
        command = args[:2]
        service = args[args.index("-s") + 1]
        account = args[args.index("-a") + 1]

        if command == ["security", "add-generic-password"]:
            value = args[args.index("-w") + 1]
            stored_secrets[(service, account)] = value
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        if command == ["security", "find-generic-password"]:
            value = stored_secrets.get((service, account), "")
            if not value:
                return SimpleNamespace(returncode=44, stdout="", stderr="missing")
            return SimpleNamespace(returncode=0, stdout=value + "\n", stderr="")

        if command == ["security", "delete-generic-password"]:
            stored_secrets.pop((service, account), None)
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        raise AssertionError(f"unexpected keychain command: {args}")

    monkeypatch.setattr(protected_config, "_run_keychain_command", fake_run_keychain_command)

    config_path = tmp_path / "config" / "verify.json"
    payload = {"appKey": "mac-secret", "appCode": "visible"}

    protected_config.save_protected_json_config(str(config_path), payload, ["appKey"])
    raw = json.loads(config_path.read_text(encoding="utf-8"))

    assert raw[protected_config._PROTECTION_MARKER_KEY] == "macos-keychain-v1"
    assert raw["appKey"].startswith("keychain64:")
    assert protected_config.unprotect_secret(raw["appKey"]) == "mac-secret"
    assert (
        protected_config.load_protected_json_config(
            str(config_path),
            lambda data: "appCode" in data,
            ["appKey"],
        )
        == payload
    )

    config_path.write_text(
        json.dumps({"appKey": "plain-secret", "appCode": "plain"}, ensure_ascii=False),
        encoding="utf-8",
    )
    loaded = protected_config.load_protected_json_config(
        str(config_path),
        lambda data: "appCode" in data,
        ["appKey"],
    )
    rewritten = json.loads(config_path.read_text(encoding="utf-8"))

    assert loaded == {"appKey": "plain-secret", "appCode": "plain"}
    assert rewritten[protected_config._PROTECTION_MARKER_KEY] == "macos-keychain-v1"
    assert rewritten["appKey"].startswith("keychain64:")
    assert protected_config.unprotect_secret(rewritten["appKey"]) == "plain-secret"

    protected_config.save_protected_json_config(
        str(config_path),
        {"appKey": "", "appCode": "plain"},
        ["appKey"],
    )
    assert stored_secrets == {}


def test_ocr_engine_helpers(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    class FakeRapidOCR:
        instances = 0

        def __init__(self) -> None:
            type(self).instances += 1

        def __call__(self, _img):
            return (
                [
                    [None, "line-1", 0.9],
                    [None, "line-2", None],
                ],
                None,
            )

    monkeypatch.setattr(ocr_engine, "RapidOCR", FakeRapidOCR)
    monkeypatch.setattr(ocr_engine, "_ocr_engine", None)

    engine = ocr_engine._get_ocr_engine()
    assert engine is ocr_engine._get_ocr_engine()
    assert FakeRapidOCR.instances == 1

    text, blocks = ocr_engine.run_ocr_rapidocr("ignored")
    assert text == "line-1\nline-2"
    assert blocks[0].text == "line-1"
    assert blocks[0].confidence == pytest.approx(0.9)
    assert blocks[1].confidence is None

    monkeypatch.setattr(ocr_engine, "_get_ocr_engine", lambda: None)
    with pytest.raises(RuntimeError, match="OCR 引擎未安装"):
        ocr_engine.run_ocr_rapidocr("ignored")

    if ocr_engine.np is None:
        pytest.skip("numpy unavailable")

    class FakePixmap:
        def __init__(
            self, samples: bytes, width: int, height: int, channels: int, alpha: bool = False
        ) -> None:
            self.samples = samples
            self.width = width
            self.height = height
            self.n = channels
            self.alpha = alpha

    mono_pix = FakePixmap(b"\x01\x02", 2, 1, 1)
    rgb_from_gray = ocr_engine.pixmap_to_numpy(mono_pix)
    assert tuple(rgb_from_gray.shape) == (1, 2, 1)

    monkeypatch.setattr(
        ocr_engine.fitz, "Pixmap", lambda _path: FakePixmap(b"\x00" * 8, 2, 1, 4, alpha=True)
    )
    rgba_pixels = ocr_engine.pixmap_file_to_numpy(str(tmp_path / "sample.png"))
    assert tuple(rgba_pixels.shape) == (1, 2, 3)

    monkeypatch.setattr(ocr_engine, "np", None)
    with pytest.raises(RuntimeError, match="缺少numpy"):
        ocr_engine.pixmap_to_numpy(mono_pix)


def test_ocr_engine_winrt_path_and_availability(monkeypatch: pytest.MonkeyPatch) -> None:
    class AsyncValue:
        def __init__(self, value):
            self._value = value

        def get(self):
            return self._value

    class FakeFile:
        def open_async(self, _mode):
            return AsyncValue("stream")

    class FakeStorageFile:
        @staticmethod
        def get_file_from_path_async(_file_path):
            return AsyncValue(FakeFile())

    class FakeDecoder:
        def get_software_bitmap_async(self):
            return AsyncValue("bitmap")

        @staticmethod
        def create_async(_stream):
            return AsyncValue(FakeDecoder())

    class FakeEngine:
        def recognize_async(self, _bitmap):
            return AsyncValue(
                SimpleNamespace(lines=[SimpleNamespace(text="a"), SimpleNamespace(text="b")])
            )

    class FakeOcrEngine:
        @staticmethod
        def try_create_from_user_profile_languages():
            return FakeEngine()

    monkeypatch.setattr(ocr_engine, "StorageFile", FakeStorageFile)
    monkeypatch.setattr(ocr_engine, "BitmapDecoder", FakeDecoder)
    monkeypatch.setattr(ocr_engine, "FileAccessMode", SimpleNamespace(READ="read"))
    monkeypatch.setattr(ocr_engine, "OcrEngine", FakeOcrEngine)

    text, blocks = ocr_engine.run_ocr_winrt("sample.png")
    assert text == "a\nb"
    assert [block.text for block in blocks] == ["a", "b"]
    assert ocr_engine.is_winrt_available() is True

    monkeypatch.setattr(ocr_engine, "RapidOCR", object())
    monkeypatch.setattr(ocr_engine, "np", object())
    assert ocr_engine.is_rapidocr_available() is True

    monkeypatch.setattr(ocr_engine, "OcrEngine", None)
    monkeypatch.setattr(ocr_engine, "BitmapDecoder", None)
    monkeypatch.setattr(ocr_engine, "StorageFile", None)
    monkeypatch.setattr(ocr_engine, "FileAccessMode", None)
    with pytest.raises(RuntimeError, match="WinRT OCR"):
        ocr_engine.run_ocr_winrt("sample.png")
