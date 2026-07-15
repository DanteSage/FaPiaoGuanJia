from __future__ import annotations

from pathlib import Path

from core.verify import _browser_runtime as _stealth


class _FakeBrowser:
    pass


class _FakeChromium:
    def __init__(self, launch_fn):
        self._launch_fn = launch_fn
        self.calls: list[dict[str, object]] = []

    def launch(self, **kwargs):
        self.calls.append(kwargs)
        return self._launch_fn(kwargs)


class _FakePlaywright:
    def __init__(self, chromium):
        self.chromium = chromium


def test_launch_browser_prefers_msedge(monkeypatch) -> None:
    browser = _FakeBrowser()

    def launch(kwargs: dict[str, object]) -> _FakeBrowser:
        if kwargs.get("channel") == "msedge":
            return browser
        raise AssertionError(f"unexpected launch kwargs: {kwargs}")

    chromium = _FakeChromium(launch)
    monkeypatch.setattr(_stealth, "_build_browser_context", lambda *_args: "context")
    monkeypatch.setattr(
        _stealth,
        "_find_available_chrome_executable",
        lambda *_args, **_kwargs: Path("C:/optional/chrome.exe"),
    )

    launched_browser, context = _stealth._launch_browser(_FakePlaywright(chromium))

    assert launched_browser is browser
    assert context == "context"
    assert chromium.calls[0]["channel"] == "msedge"
    assert "executable_path" not in chromium.calls[0]
    assert len(chromium.calls) == 1


def test_launch_browser_uses_optional_chrome_after_msedge(monkeypatch) -> None:
    browser = _FakeBrowser()
    expected_executable = Path("C:/optional/chrome.exe")

    def launch(kwargs: dict[str, object]) -> _FakeBrowser:
        if kwargs.get("channel") == "msedge":
            raise RuntimeError("msedge not found")
        if Path(str(kwargs.get("executable_path"))) == expected_executable:
            return browser
        raise AssertionError(f"unexpected launch kwargs: {kwargs}")

    chromium = _FakeChromium(launch)
    monkeypatch.setattr(_stealth, "_build_browser_context", lambda *_args: "context")
    monkeypatch.setattr(
        _stealth,
        "_find_available_chrome_executable",
        lambda *_args, **_kwargs: expected_executable,
    )

    launched_browser, context = _stealth._launch_browser(_FakePlaywright(chromium))

    assert launched_browser is browser
    assert context == "context"
    assert chromium.calls[0]["channel"] == "msedge"
    assert Path(str(chromium.calls[1]["executable_path"])) == expected_executable
    assert len(chromium.calls) == 2


def test_normalize_browser_preference_maps_chromium_to_chrome() -> None:
    assert _stealth._normalize_browser_preference("chromium") == "chrome"
