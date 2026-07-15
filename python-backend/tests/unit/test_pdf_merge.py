from __future__ import annotations

from core.pdf.merge import _paper_mm, _grid_for_nup


class TestPaperMm:
    def test_a4(self) -> None:
        assert _paper_mm("A4") == (210.0, 297.0)

    def test_a5(self) -> None:
        assert _paper_mm("A5") == (148.0, 210.0)

    def test_letter(self) -> None:
        assert _paper_mm("letter") == (216.0, 279.0)

    def test_case_insensitive(self) -> None:
        assert _paper_mm("a4") == (210.0, 297.0)
        assert _paper_mm("A5") == (148.0, 210.0)

    def test_unknown_defaults_to_a4(self) -> None:
        assert _paper_mm("B3") == (210.0, 297.0)

    def test_none_defaults_to_a4(self) -> None:
        assert _paper_mm(None) == (210.0, 297.0)


class TestGridForNup:
    def test_nup_1(self) -> None:
        assert _grid_for_nup(1, "portrait") == (1, 1)

    def test_nup_2_portrait(self) -> None:
        assert _grid_for_nup(2, "portrait") == (1, 2)

    def test_nup_2_landscape(self) -> None:
        assert _grid_for_nup(2, "landscape") == (2, 1)

    def test_nup_4(self) -> None:
        assert _grid_for_nup(4, "portrait") == (2, 2)
        assert _grid_for_nup(4, "landscape") == (2, 2)

    def test_nup_6_portrait(self) -> None:
        assert _grid_for_nup(6, "portrait") == (2, 3)

    def test_nup_6_landscape(self) -> None:
        assert _grid_for_nup(6, "landscape") == (3, 2)

    def test_nup_3_default(self) -> None:
        result = _grid_for_nup(3, "portrait")
        assert result == (2, 2)

    def test_case_insensitive_orientation(self) -> None:
        assert _grid_for_nup(2, "PORTRAIT") == (1, 2)
        assert _grid_for_nup(2, "LANDSCAPE") == (2, 1)
