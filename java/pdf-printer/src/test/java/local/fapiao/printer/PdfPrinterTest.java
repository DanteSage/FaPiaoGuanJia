package local.fapiao.printer;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PdfPrinterTest {

    @Test
    void shouldDefaultCopiesToOneWhenInputMissing() {
        assertEquals(1, PrintOptionNormalizer.normalizeCopies(null));
        assertEquals(1, PrintOptionNormalizer.normalizeCopies(""));
        assertEquals(1, PrintOptionNormalizer.normalizeCopies("abc"));
    }

    @Test
    void shouldClampCopiesIntoSupportedRange() {
        assertEquals(1, PrintOptionNormalizer.normalizeCopies("0"));
        assertEquals(5, PrintOptionNormalizer.normalizeCopies("5"));
        assertEquals(99, PrintOptionNormalizer.normalizeCopies("120"));
    }

    @Test
    void shouldMatchPrinterNamesIgnoringCaseAndAllowSubstringMatch() {
        assertTrue(PrintOptionNormalizer.matchesPrinterName("HP LaserJet MFP", "hp laserjet mfp"));
        assertTrue(PrintOptionNormalizer.matchesPrinterName("HP LaserJet MFP", "laserjet"));
        assertFalse(PrintOptionNormalizer.matchesPrinterName("HP LaserJet MFP", "epson"));
        assertFalse(PrintOptionNormalizer.matchesPrinterName("", "laserjet"));
    }
}
