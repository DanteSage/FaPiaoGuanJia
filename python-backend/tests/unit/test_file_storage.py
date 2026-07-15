from __future__ import annotations

from pathlib import Path

import pytest

from storage import file_storage


def configure_storage(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    storage_root = tmp_path / "files"
    monkeypatch.setattr(file_storage, "get_files_dir", lambda: str(storage_root))
    return storage_root


def test_validate_path_safe_rejects_outside_base(tmp_path: Path) -> None:
    base = tmp_path / "base"
    base.mkdir()
    allowed = base / "child.txt"
    allowed.write_text("ok", encoding="utf-8")

    assert file_storage._validate_path_safe(str(allowed), str(base)) == str(allowed.resolve())

    with pytest.raises(ValueError):
        file_storage._validate_path_safe(str(tmp_path / "outside.txt"), str(base))


def test_validate_path_safe_wraps_commonpath_errors(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        file_storage.os.path, "commonpath", lambda _items: (_ for _ in ()).throw(ValueError)
    )

    with pytest.raises(ValueError):
        file_storage._validate_path_safe(str(tmp_path / "a.txt"), str(tmp_path))


def test_store_file_copy_move_lookup_delete_and_stats(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    storage_root = configure_storage(monkeypatch, tmp_path)
    source_copy = tmp_path / "copy-source.pdf"
    source_copy.write_bytes(b"copy-data")

    stored_copy_path, file_hash, is_new = file_storage.store_file(str(source_copy))

    assert is_new is True
    assert source_copy.exists()
    assert Path(stored_copy_path).exists()
    assert Path(stored_copy_path).read_bytes() == b"copy-data"
    assert file_hash == file_storage.compute_file_hash(str(source_copy))

    duplicate_path, duplicate_hash, duplicate_is_new = file_storage.store_file(str(source_copy))
    assert duplicate_path == stored_copy_path
    assert duplicate_hash == file_hash
    assert duplicate_is_new is False

    source_move = tmp_path / "move-source.xml"
    source_move.write_bytes(b"move-data")
    moved_path, moved_hash, moved_is_new = file_storage.store_file(str(source_move), move=True)

    assert moved_is_new is True
    assert not source_move.exists()
    assert Path(moved_path).exists()
    assert moved_hash == file_storage.compute_file_hash(str(Path(moved_path)))

    assert (
        Path(file_storage.get_file_by_hash(file_hash, ".pdf") or "").resolve()
        == Path(stored_copy_path).resolve()
    )
    assert (
        Path(file_storage.get_file_by_hash(moved_hash) or "").resolve()
        == Path(moved_path).resolve()
    )

    stats = file_storage.get_storage_stats()
    assert stats["storagePath"] == str(storage_root)
    assert stats["totalFiles"] == 2
    assert stats["totalSizeBytes"] == len(b"copy-data") + len(b"move-data")

    assert file_storage.delete_file_by_hash(file_hash) is True
    assert file_storage.delete_file_by_hash(file_hash) is False


def test_store_file_missing_source_raises(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    configure_storage(monkeypatch, tmp_path)

    with pytest.raises(FileNotFoundError):
        file_storage.store_file(str(tmp_path / "missing.pdf"))


def test_store_file_from_bytes_normalizes_extension_and_validates(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    configure_storage(monkeypatch, tmp_path)

    stored_path, file_hash, is_new = file_storage.store_file_from_bytes(b"hello", "TXT")

    assert is_new is True
    assert stored_path.endswith(".txt")
    assert Path(stored_path).read_bytes() == b"hello"
    assert file_hash == file_storage.compute_file_hash(str(Path(stored_path)))

    duplicate_path, duplicate_hash, duplicate_is_new = file_storage.store_file_from_bytes(
        b"hello", ".txt"
    )
    assert duplicate_path == stored_path
    assert duplicate_hash == file_hash
    assert duplicate_is_new is False

    with pytest.raises(ValueError):
        file_storage.store_file_from_bytes(b"x", "bad/name")

    with pytest.raises(ValueError):
        file_storage.store_file_from_bytes(b"x", ".abcdefghij")


def test_delete_file_by_hash_rejects_unsafe_target(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    configure_storage(monkeypatch, tmp_path)
    monkeypatch.setattr(
        file_storage, "get_file_by_hash", lambda _hash, ext="": str(tmp_path / "unsafe.pdf")
    )
    (tmp_path / "unsafe.pdf").write_text("x", encoding="utf-8")

    monkeypatch.setattr(
        file_storage,
        "_validate_path_safe",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError),
    )

    assert file_storage.delete_file_by_hash("unsafe-hash") is False
