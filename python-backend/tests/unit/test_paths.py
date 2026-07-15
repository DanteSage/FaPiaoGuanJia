from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from storage import paths


def reset_path_caches() -> None:
    paths._storage_root_cache = None
    paths._outputs_dir_cache = None


def test_reimbursement_db_path_is_separated(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("FAPIAO_TOOL_STORAGE_DIR", str(tmp_path))
    reset_path_caches()

    invoice_db_path = Path(paths.get_db_path())
    reimbursement_db_path = Path(paths.get_reimbursement_db_path())

    assert invoice_db_path.name == "fapiao_data.db"
    assert reimbursement_db_path.name == "reimbursement_data.db"
    assert invoice_db_path != reimbursement_db_path
    assert invoice_db_path.parent == reimbursement_db_path.parent


def test_outputs_dir_is_created_under_storage_root(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("FAPIAO_TOOL_STORAGE_DIR", str(tmp_path))
    reset_path_caches()

    outputs_dir = Path(paths.get_outputs_dir())

    assert outputs_dir.exists()
    assert outputs_dir.is_dir()
    assert outputs_dir.parent == tmp_path


def test_unmanaged_layout_and_resource_directories(monkeypatch) -> None:
    monkeypatch.delenv("FAPIAO_TOOL_STORAGE_DIR", raising=False)
    monkeypatch.delenv("FAPIAO_TOOL_OUTPUTS_DIR", raising=False)
    monkeypatch.setattr(paths, "_is_frozen", lambda: False)
    reset_path_caches()

    backend_dir = Path(paths._get_project_backend_dir())

    assert Path(paths.get_storage_root()) == backend_dir
    assert Path(paths.get_db_path()) == backend_dir / "fapiao_data.db"
    assert Path(paths.get_reimbursement_db_path()) == backend_dir / "reimbursement_data.db"
    assert Path(paths.get_files_dir()) == backend_dir / "files"
    assert Path(paths.get_config_dir()) == backend_dir / "config"
    assert Path(paths.get_logs_dir()) == backend_dir / "logs"
    assert Path(paths.get_images_dir()) == backend_dir / "images"
    assert Path(paths.get_api_config_path()) == backend_dir / "config" / "verify_config.json"
    assert Path(paths.get_rpa_config_path()) == backend_dir / "config" / "rpa_config.json"


def test_resolve_writable_dir_reports_failures(monkeypatch, tmp_path: Path) -> None:
    blocked_file = tmp_path / "blocked"
    blocked_file.write_text("x", encoding="utf-8")

    with pytest.raises(RuntimeError, match="Unable to resolve writable storage directory"):
        paths._resolve_writable_dir([blocked_file], "storage")

    with pytest.raises(
        RuntimeError, match="No writable outputs directory candidates were provided"
    ):
        paths._resolve_writable_dir([], "outputs")

    monkeypatch.setenv("FAPIAO_TOOL_STORAGE_DIR", str(tmp_path))
    monkeypatch.delenv("FAPIAO_TOOL_OUTPUTS_DIR", raising=False)
    monkeypatch.setattr(tempfile, "gettempdir", lambda: str(tmp_path / "temp-root"))
    reset_path_caches()

    outputs_dir = Path(paths.get_outputs_dir())

    assert outputs_dir == tmp_path / "outputs"


def test_config_migration_candidates_are_normalized_and_unique(monkeypatch, tmp_path: Path) -> None:
    roaming = tmp_path / "roaming"
    local = tmp_path / "local"
    runtime = tmp_path / "runtime"
    project = tmp_path / "project-backend"

    monkeypatch.setenv("APPDATA", str(roaming))
    monkeypatch.setenv("LOCALAPPDATA", str(local))
    monkeypatch.setattr(paths, "_get_runtime_dir", lambda: runtime)
    monkeypatch.setattr(paths, "_get_project_backend_dir", lambda: project)

    candidates = paths.get_config_migration_candidates("verify_config.json")

    assert len(candidates) == len(set(candidates))
    assert str(roaming / "FapiaoTool" / "config" / "verify_config.json") in candidates
    assert str(local / "FapiaoTool" / "verify_config.json") in candidates
    assert str(runtime / "config" / "verify_config.json") in candidates
    assert str(project / "verify_config.json") in candidates
