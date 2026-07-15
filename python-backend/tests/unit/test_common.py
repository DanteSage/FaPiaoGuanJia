from __future__ import annotations

import pytest

from utils.common import ext_lower, is_pdf, is_ofd, is_image, is_xml, mm_to_pt


class TestExtLower:
    def test_pdf_extension(self) -> None:
        assert ext_lower("test.PDF") == "pdf"
        assert ext_lower("a.pdf") == "pdf"

    def test_ofd_extension(self) -> None:
        assert ext_lower("a.OFD") == "ofd"
        assert ext_lower("b.ofd") == "ofd"

    def test_image_extensions(self) -> None:
        assert ext_lower("a.PNG") == "png"
        assert ext_lower("b.jpg") == "jpg"
        assert ext_lower("c.JPEG") == "jpeg"
        assert ext_lower("d.webp") == "webp"

    def test_xml_extension(self) -> None:
        assert ext_lower("a.XML") == "xml"

    def test_no_extension(self) -> None:
        assert ext_lower("noext") == ""


class TestIsFunctions:
    def test_is_pdf(self) -> None:
        assert is_pdf("a.pdf") is True
        assert is_pdf("a.PDF") is True
        assert is_pdf("a.ofd") is False

    def test_is_ofd(self) -> None:
        assert is_ofd("a.ofd") is True
        assert is_ofd("a.OFD") is True
        assert is_ofd("a.pdf") is False

    def test_is_image(self) -> None:
        assert is_image("a.png") is True
        assert is_image("a.jpg") is True
        assert is_image("a.jpeg") is True
        assert is_image("a.bmp") is True
        assert is_image("a.webp") is True
        assert is_image("a.tif") is True
        assert is_image("a.tiff") is True
        assert is_image("a.pdf") is False
        assert is_image("a.ofd") is False

    def test_is_xml(self) -> None:
        assert is_xml("a.xml") is True
        assert is_xml("a.XML") is True
        assert is_xml("a.pdf") is False


class TestMmToPt:
    def test_conversion_factor(self) -> None:
        assert mm_to_pt(25.4) == pytest.approx(72.0)

    def test_a4_width(self) -> None:
        assert mm_to_pt(210.0) == pytest.approx(595.2755905511812)

    def test_a4_height(self) -> None:
        assert mm_to_pt(297.0) == pytest.approx(841.8897637795276)

    def test_zero(self) -> None:
        assert mm_to_pt(0) == 0.0

    def test_negative(self) -> None:
        assert mm_to_pt(-25.4) < 0
