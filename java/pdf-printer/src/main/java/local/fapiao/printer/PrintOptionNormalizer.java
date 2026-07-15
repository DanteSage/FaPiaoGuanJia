package local.fapiao.printer;

import java.util.Locale;

final class PrintOptionNormalizer {
    private PrintOptionNormalizer() {
    }

    static int normalizeCopies(String rawValue) {
        if (rawValue == null || rawValue.isEmpty()) {
            return 1;
        }
        try {
            return Math.max(1, Math.min(99, Integer.parseInt(rawValue)));
        } catch (NumberFormatException e) {
            return 1;
        }
    }

    static boolean matchesPrinterName(String candidateName, String requestedName) {
        if (candidateName == null || candidateName.isBlank() || requestedName == null || requestedName.isBlank()) {
            return false;
        }

        String normalizedCandidate = candidateName.toLowerCase(Locale.ROOT);
        String normalizedRequested = requestedName.toLowerCase(Locale.ROOT);
        return normalizedCandidate.equals(normalizedRequested) || normalizedCandidate.contains(normalizedRequested);
    }
}
