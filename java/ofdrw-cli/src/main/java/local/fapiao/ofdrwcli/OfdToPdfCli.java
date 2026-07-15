package local.fapiao.ofdrwcli;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.ofdrw.converter.export.ImageExporter;
import org.ofdrw.converter.export.OFDExporter;
import org.ofdrw.converter.export.PDFExporterPDFBox;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

public class OfdToPdfCli {
    private static final Gson GSON = new GsonBuilder().create();

    public static void main(String[] args) throws Exception {
        if (args.length >= 1 && "--stdio".equalsIgnoreCase(args[0])) {
            runStdioService();
            return;
        }

        if (args.length < 1) {
            System.err.println("Usage:\n  java -jar ofdrw-cli.jar --stdio\n  java -jar ofdrw-cli.jar <input.ofd> <output.pdf>\n  java -jar ofdrw-cli.jar render <input.ofd> <output.png> [pageIndex(1-based)] [ppm]\n  java -jar ofdrw-cli.jar extract <input.ofd>");
            System.exit(2);
            return;
        }

        if ("extract".equalsIgnoreCase(args[0])) {
            if (args.length < 2) {
                System.err.println("Usage: java -jar ofdrw-cli.jar extract <input.ofd>");
                System.exit(2);
                return;
            }
            Path input = Paths.get(args[1]).toAbsolutePath().normalize();
            if (!Files.exists(input)) {
                System.err.println("Input OFD not found: " + input);
                System.exit(3);
                return;
            }
            extractInvoiceData(input);
            return;
        }

        if ("render".equalsIgnoreCase(args[0])) {
            if (args.length < 3) {
                System.err.println("Usage: java -jar ofdrw-cli.jar render <input.ofd> <output.png> [pageIndex(1-based)] [ppm]");
                System.exit(2);
                return;
            }
            Path input = Paths.get(args[1]).toAbsolutePath().normalize();
            Path output = Paths.get(args[2]).toAbsolutePath().normalize();
            int pageIndex = args.length >= 4 ? Integer.parseInt(args[3]) : 1;
            if (pageIndex <= 0) {
                pageIndex = 1;
            }
            double ppm = args.length >= 5 ? Double.parseDouble(args[4]) : 20d;
            ppm = Math.max(5d, Math.min(80d, ppm));

            if (!Files.exists(input)) {
                System.err.println("Input OFD not found: " + input);
                System.exit(3);
                return;
            }

            renderOfd(input, output, pageIndex, ppm);
            System.out.println(output);
            return;
        }

        if (args.length < 2) {
            System.err.println("Usage: java -jar ofdrw-cli.jar <input.ofd> <output.pdf>");
            System.exit(2);
            return;
        }

        Path input = Paths.get(args[0]).toAbsolutePath().normalize();
        Path output = Paths.get(args[1]).toAbsolutePath().normalize();
        if (!Files.exists(input)) {
            System.err.println("Input OFD not found: " + input);
            System.exit(3);
            return;
        }

        convertOfdToPdf(input, output);
        System.out.println(output);
    }

    private static void runStdioService() throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        PrintWriter writer = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8), true);

        writer.println(GSON.toJson(OfdServiceResponse.ready()));

        String line;
        while ((line = reader.readLine()) != null) {
            String trimmedLine = line.trim();
            if (trimmedLine.isEmpty()) {
                continue;
            }

            String requestId = null;
            Map<String, Object> response;
            try {
                JsonObject request = JsonParser.parseString(trimmedLine).getAsJsonObject();
                requestId = request.has("id") ? request.get("id").getAsString() : null;
                String method = request.has("method") ? request.get("method").getAsString() : "";
                JsonObject params = request.has("params") ? request.getAsJsonObject("params") : new JsonObject();
                Object result = handleMethod(method, params);
                response = OfdServiceResponse.success(requestId, result);
            } catch (Exception exception) {
                response = OfdServiceResponse.failure(requestId, exception);
            }

            writer.println(GSON.toJson(response));
        }
    }

    private static Object handleMethod(String method, JsonObject params) throws Exception {
        switch (method) {
            case "ofd_to_pdf": {
                Path input = Paths.get(params.get("input").getAsString()).toAbsolutePath().normalize();
                Path output = Paths.get(params.get("output").getAsString()).toAbsolutePath().normalize();
                if (!Files.exists(input)) {
                    throw new IllegalArgumentException("Input OFD not found: " + input);
                }
                convertOfdToPdf(input, output);
                return Map.of("outputPath", output.toString());
            }
            case "render": {
                Path input = Paths.get(params.get("input").getAsString()).toAbsolutePath().normalize();
                Path output = Paths.get(params.get("output").getAsString()).toAbsolutePath().normalize();
                int pageIndex = params.has("pageIndex") ? params.get("pageIndex").getAsInt() : 1;
                double ppm = params.has("ppm") ? params.get("ppm").getAsDouble() : 20d;
                if (pageIndex <= 0) {
                    pageIndex = 1;
                }
                ppm = Math.max(5d, Math.min(80d, ppm));
                if (!Files.exists(input)) {
                    throw new IllegalArgumentException("Input OFD not found: " + input);
                }
                renderOfd(input, output, pageIndex, ppm);
                return Map.of("outputPath", output.toString());
            }
            case "extract": {
                Path input = Paths.get(params.get("input").getAsString()).toAbsolutePath().normalize();
                if (!Files.exists(input)) {
                    throw new IllegalArgumentException("Input OFD not found: " + input);
                }
                return extractInvoiceDataMap(input);
            }
            default:
                throw new IllegalArgumentException("Unknown method: " + method);
        }
    }

    private static void convertOfdToPdf(Path input, Path output) throws Exception {
        Path parent = output.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        try (OFDExporter exporter = new PDFExporterPDFBox(input, output)) {
            exporter.export();
        }

        if (!Files.exists(output) || Files.size(output) == 0) {
            throw new IllegalArgumentException("Output PDF not generated or empty");
        }
    }

    private static void renderOfd(Path input, Path output, int pageIndex, double ppm) throws Exception {
        Path parent = output.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }

        String format = resolveImageFormat(output);
        Path tempDir = Files.createTempDirectory("ofdrw_img_");
        try {
            try (ImageExporter exporter = new ImageExporter(input, tempDir, format, ppm)) {
                exporter.export(pageIndex - 1);
            }

            String extension = format.toLowerCase();
            Path generated = tempDir.resolve((pageIndex - 1) + "." + extension);
            if (!Files.exists(generated)) {
                try (var stream = Files.newDirectoryStream(tempDir)) {
                    for (Path candidate : stream) {
                        generated = candidate;
                        break;
                    }
                }
            }

            if (!Files.exists(generated) || Files.size(generated) == 0) {
                throw new IllegalArgumentException("Output image not generated or empty");
            }

            Files.copy(generated, output, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            deleteDirectoryRecursive(tempDir);
        }
    }

    private static void deleteDirectoryRecursive(Path dir) {
        try {
            Files.walkFileTree(dir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.delete(file);
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                    Files.delete(d);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignored) {
        }
    }

    private static String resolveImageFormat(Path output) {
        String name = output.getFileName().toString().toLowerCase();
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
            return "JPG";
        }
        if (name.endsWith(".bmp")) {
            return "BMP";
        }
        return "PNG";
    }

    private static Map<String, Object> extractInvoiceDataMap(Path ofdPath) throws Exception {
        Map<String, Object> result = new HashMap<>();
        result.put("success", false);

        try (ZipFile zipFile = new ZipFile(ofdPath.toFile())) {
            String invoiceXml = findInvoiceXml(zipFile);
            if (invoiceXml != null) {
                Map<String, String> data = InvoiceXmlParser.parseInvoiceXml(invoiceXml);
                if (!data.isEmpty()) {
                    result.put("success", true);
                    result.put("data", data);
                } else {
                    result.put("error", "Failed to parse invoice data from XML");
                }
            } else {
                result.put("error", "No invoice data found in OFD file");
            }
        } catch (Exception exception) {
            result.put("error", exception.getMessage());
        }

        return result;
    }

    private static String findInvoiceXml(ZipFile zipFile) throws Exception {
        String[] possibleNames = {
            "Doc_0/Attachs/original_invoice.xml",
            "Doc_0/Attachs/Invoice.xml",
            "Doc_0/Attachs/invoice.xml",
            "Doc_0/Attachs/原始发票.xml",
            "original_invoice.xml",
            "Invoice.xml"
        };

        for (String name : possibleNames) {
            ZipEntry entry = zipFile.getEntry(name);
            if (entry != null) {
                try (InputStream inputStream = zipFile.getInputStream(entry)) {
                    return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }

        var entries = zipFile.entries();
        while (entries.hasMoreElements()) {
            ZipEntry entry = entries.nextElement();
            String entryName = entry.getName().toLowerCase();
            if (entryName.contains("attach") && entryName.endsWith(".xml") && !entryName.endsWith("attachments.xml")) {
                try (InputStream inputStream = zipFile.getInputStream(entry)) {
                    String content = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
                    if (content.contains("发票代码")
                        || content.contains("InvoiceCode")
                        || content.contains("发票号码")
                        || content.contains("InvoiceNo")
                        || content.contains("xbrl")
                        || content.contains("rai:")
                        || content.contains("ElectronicInvoice")
                        || content.contains("DateOfIssue")) {
                        return content;
                    }
                }
            }
        }

        return null;
    }

    private static void extractInvoiceData(Path ofdPath) throws Exception {
        String json = toJsonWithUnicodeEscape(extractInvoiceDataMap(ofdPath));
        System.out.println(json);
    }

    private static String toJsonWithUnicodeEscape(Object obj) {
        Gson gson = new GsonBuilder().setPrettyPrinting().create();
        String json = gson.toJson(obj);
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < json.length(); index++) {
            char character = json.charAt(index);
            if (character > 127) {
                builder.append(String.format("\\u%04x", (int) character));
            } else {
                builder.append(character);
            }
        }
        return builder.toString();
    }

    static Map<String, String> parseInvoiceXml(String xml) {
        return InvoiceXmlParser.parseInvoiceXml(xml);
    }

    static String extractValue(String xml, String... patterns) {
        return InvoiceXmlParser.extractValue(xml, patterns);
    }
}
