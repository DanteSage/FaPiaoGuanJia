package local.fapiao.ofdrwcli;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class InvoiceXmlParser {
    private InvoiceXmlParser() {
    }

    private static final Map<String, String[]> STANDARD_TAG_MAP = new LinkedHashMap<>();

    static {
        STANDARD_TAG_MAP.put("invoiceCode", new String[]{
            "InvoiceCode", "fp:InvoiceCode"
        });
        STANDARD_TAG_MAP.put("invoiceNumber", new String[]{
            "InvoiceNo", "InvoiceNumber", "fp:InvoiceNo", "fp:InvoiceNumber"
        });
        STANDARD_TAG_MAP.put("invoiceDate", new String[]{
            "IssueDate", "InvoiceDate", "fp:IssueDate", "fp:InvoiceDate"
        });
        STANDARD_TAG_MAP.put("totalAmount", new String[]{
            "TaxInclusiveTotalAmount", "TotalAmount",
            "fp:TaxInclusiveTotalAmount", "fp:TotalAmount"
        });
        STANDARD_TAG_MAP.put("amount", new String[]{
            "TaxExclusiveTotalAmount", "Amount",
            "fp:TaxExclusiveTotalAmount", "fp:Amount"
        });
        STANDARD_TAG_MAP.put("taxAmount", new String[]{
            "TaxTotalAmount", "TaxAmount",
            "fp:TaxTotalAmount", "fp:TaxAmount"
        });
        STANDARD_TAG_MAP.put("taxRate", new String[]{
            "TaxRate", "fp:TaxRate"
        });
        STANDARD_TAG_MAP.put("sellerName", new String[]{
            "SellerName", "fp:SellerName"
        });
        STANDARD_TAG_MAP.put("buyerName", new String[]{
            "BuyerName", "fp:BuyerName"
        });
    }

    private static final Map<String, String[]> RAILWAY_TAG_MAP = new LinkedHashMap<>();

    static {
        RAILWAY_TAG_MAP.put("invoiceType", new String[]{"rai:TypeOfVoucher"});
        RAILWAY_TAG_MAP.put("invoiceNumber", new String[]{
            "rai:ElectronicInvoiceRailwayETicketNumber", "rai:ETicketNumber"
        });
        RAILWAY_TAG_MAP.put("invoiceDate", new String[]{"rai:DateOfIssue"});
        RAILWAY_TAG_MAP.put("travelDate", new String[]{"rai:TravelDate"});
        RAILWAY_TAG_MAP.put("totalAmount", new String[]{"rai:Fare"});
        RAILWAY_TAG_MAP.put("amount", new String[]{"rai:TotalAmountExcludingTax"});
        RAILWAY_TAG_MAP.put("taxAmount", new String[]{"rai:TaxAmount"});
        RAILWAY_TAG_MAP.put("taxRate", new String[]{"rai:TaxRate"});
        RAILWAY_TAG_MAP.put("buyerName", new String[]{"rai:NameOfPurchaser"});
        RAILWAY_TAG_MAP.put("buyerTaxId", new String[]{"rai:UnifiedSocialCreditCodeOfPurchaser"});
        RAILWAY_TAG_MAP.put("passengerName", new String[]{"rai:Name"});
        RAILWAY_TAG_MAP.put("idNumber", new String[]{"rai:IdNumber"});
        RAILWAY_TAG_MAP.put("trainNumber", new String[]{"rai:TrainNumber"});
        RAILWAY_TAG_MAP.put("departureStation", new String[]{"rai:DepartureStation"});
        RAILWAY_TAG_MAP.put("destinationStation", new String[]{"rai:DestinationStation"});
        RAILWAY_TAG_MAP.put("departureTime", new String[]{"rai:DepartureTime"});
        RAILWAY_TAG_MAP.put("seatLevel", new String[]{"rai:SeatLevel"});
        RAILWAY_TAG_MAP.put("carriage", new String[]{"rai:Carriage"});
        RAILWAY_TAG_MAP.put("seat", new String[]{"rai:Seat"});
    }

    static Map<String, String> parseInvoiceXml(String xml) {
        Map<String, String> data = parseWithDom(xml);
        if (data != null && !data.isEmpty()) {
            return data;
        }
        return parseWithRegex(xml);
    }

    private static Map<String, String> parseWithDom(String xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(false);
            factory.setFeature("http://javax.xml.XMLConstants/feature/secure-processing", true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new InputSource(new StringReader(xml)));
            Element root = doc.getDocumentElement();

            boolean isXbrlRailway = "xbrl".equalsIgnoreCase(root.getLocalName())
                || root.getNamespaceURI() != null && root.getNamespaceURI().contains("xbrl")
                || hasChildWithPrefix(root, "rai:");

            Map<String, String[]> tagMap = isXbrlRailway ? RAILWAY_TAG_MAP : STANDARD_TAG_MAP;
            Map<String, String> data = new HashMap<>();

            for (Map.Entry<String, String[]> entry : tagMap.entrySet()) {
                for (String tag : entry.getValue()) {
                    String value = findElementText(root, tag);
                    if (value != null && !value.isEmpty()) {
                        data.put(entry.getKey(), value);
                        break;
                    }
                }
            }

            return data;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean hasChildWithPrefix(Element root, String prefix) {
        NodeList children = root.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() == Node.ELEMENT_NODE) {
                String name = child.getNodeName();
                if (name != null && name.startsWith(prefix)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static String findElementText(Element root, String tagName) {
        NodeList nodes = root.getElementsByTagName(tagName);
        if (nodes.getLength() > 0) {
            String text = nodes.item(0).getTextContent();
            if (text != null) {
                text = text.trim();
                if (!text.isEmpty()) {
                    return text;
                }
            }
        }

        String localName = tagName.contains(":") ? tagName.substring(tagName.indexOf(':') + 1) : tagName;
        NodeList localNodes = root.getElementsByTagName(localName);
        if (localNodes.getLength() > 0) {
            String text = localNodes.item(0).getTextContent();
            if (text != null) {
                text = text.trim();
                if (!text.isEmpty()) {
                    return text;
                }
            }
        }

        return null;
    }

    private static Map<String, String> parseWithRegex(String xml) {
        Map<String, String> data = new HashMap<>();
        boolean isXbrlRailway = xml.contains("xbrl") && xml.contains("rai:");

        if (isXbrlRailway) {
            data.put("invoiceType", extractValue(xml,
                "<rai:TypeOfVoucher[^>]*>([^<]+)</rai:TypeOfVoucher>"));
            data.put("invoiceNumber", extractValue(xml,
                "<rai:ElectronicInvoiceRailwayETicketNumber[^>]*>([^<]+)</rai:ElectronicInvoiceRailwayETicketNumber>",
                "<rai:ETicketNumber[^>]*>([^<]+)</rai:ETicketNumber>"));
            data.put("invoiceDate", extractValue(xml,
                "<rai:DateOfIssue[^>]*>([^<]+)</rai:DateOfIssue>"));
            data.put("travelDate", extractValue(xml,
                "<rai:TravelDate[^>]*>([^<]+)</rai:TravelDate>"));
            data.put("totalAmount", extractValue(xml,
                "<rai:Fare[^>]*>([^<]+)</rai:Fare>"));
            data.put("amount", extractValue(xml,
                "<rai:TotalAmountExcludingTax[^>]*>([^<]+)</rai:TotalAmountExcludingTax>"));
            data.put("taxAmount", extractValue(xml,
                "<rai:TaxAmount[^>]*>([^<]+)</rai:TaxAmount>"));
            data.put("taxRate", extractValue(xml,
                "<rai:TaxRate[^>]*>([^<]+)</rai:TaxRate>"));
            data.put("buyerName", extractValue(xml,
                "<rai:NameOfPurchaser[^>]*>([^<]+)</rai:NameOfPurchaser>"));
            data.put("buyerTaxId", extractValue(xml,
                "<rai:UnifiedSocialCreditCodeOfPurchaser[^>]*>([^<]+)</rai:UnifiedSocialCreditCodeOfPurchaser>"));
            data.put("passengerName", extractValue(xml,
                "<rai:Name[^>]*>([^<]+)</rai:Name>"));
            data.put("idNumber", extractValue(xml,
                "<rai:IdNumber[^>]*>([^<]+)</rai:IdNumber>"));
            data.put("trainNumber", extractValue(xml,
                "<rai:TrainNumber[^>]*>([^<]+)</rai:TrainNumber>"));
            data.put("departureStation", extractValue(xml,
                "<rai:DepartureStation[^>]*>([^<]+)</rai:DepartureStation>"));
            data.put("destinationStation", extractValue(xml,
                "<rai:DestinationStation[^>]*>([^<]+)</rai:DestinationStation>"));
            data.put("departureTime", extractValue(xml,
                "<rai:DepartureTime[^>]*>([^<]+)</rai:DepartureTime>"));
            data.put("seatLevel", extractValue(xml,
                "<rai:SeatLevel[^>]*>([^<]+)</rai:SeatLevel>"));
            data.put("carriage", extractValue(xml,
                "<rai:Carriage[^>]*>([^<]+)</rai:Carriage>"));
            data.put("seat", extractValue(xml,
                "<rai:Seat[^>]*>([^<]+)</rai:Seat>"));
        } else {
            data.put("invoiceCode", extractValue(xml,
                "<fp:InvoiceCode>([^<]+)</fp:InvoiceCode>",
                "<InvoiceCode>([^<]+)</InvoiceCode>",
                "\u53D1\u7968\u4EE3\u7801[\\s\\S]*?>([^<]+)<"));
            data.put("invoiceNumber", extractValue(xml,
                "<fp:InvoiceNo>([^<]+)</fp:InvoiceNo>",
                "<InvoiceNo>([^<]+)</InvoiceNo>",
                "<fp:InvoiceNumber>([^<]+)</fp:InvoiceNumber>",
                "\u53D1\u7968\u53F7\u7801[\\s\\S]*?>([^<]+)<"));
            data.put("invoiceDate", extractValue(xml,
                "<fp:IssueDate>([^<]+)</fp:IssueDate>",
                "<IssueDate>([^<]+)</IssueDate>",
                "<fp:InvoiceDate>([^<]+)</fp:InvoiceDate>",
                "\u5F00\u7968\u65E5\u671F[\\s\\S]*?>([^<]+)<"));
            data.put("totalAmount", extractValue(xml,
                "<fp:TaxInclusiveTotalAmount>([^<]+)</fp:TaxInclusiveTotalAmount>",
                "<TaxInclusiveTotalAmount>([^<]+)</TaxInclusiveTotalAmount>",
                "<fp:TotalAmount>([^<]+)</fp:TotalAmount>",
                "\u4EF7\u7A0E\u5408\u8BA1[\\s\\S]*?>([^<]+)<",
                "\u5408\u8BA1\u91D1\u989D[\\s\\S]*?>([^<]+)<"));
            data.put("amount", extractValue(xml,
                "<fp:TaxExclusiveTotalAmount>([^<]+)</fp:TaxExclusiveTotalAmount>",
                "<TaxExclusiveTotalAmount>([^<]+)</TaxExclusiveTotalAmount>",
                "<fp:Amount>([^<]+)</fp:Amount>"));
            data.put("taxAmount", extractValue(xml,
                "<fp:TaxTotalAmount>([^<]+)</fp:TaxTotalAmount>",
                "<TaxTotalAmount>([^<]+)</TaxTotalAmount>",
                "<fp:TaxAmount>([^<]+)</fp:TaxAmount>"));
            data.put("sellerName", extractValue(xml,
                "<fp:SellerName>([^<]+)</fp:SellerName>",
                "<SellerName>([^<]+)</SellerName>",
                "\u9500\u552E\u65B9\u540D\u79F0[\\s\\S]*?>([^<]+)<"));
            data.put("buyerName", extractValue(xml,
                "<fp:BuyerName>([^<]+)</fp:BuyerName>",
                "<BuyerName>([^<]+)</BuyerName>",
                "\u8D2D\u4E70\u65B9\u540D\u79F0[\\s\\S]*?>([^<]+)<"));
        }

        data.entrySet().removeIf((entry) -> entry.getValue() == null || entry.getValue().isEmpty());
        return data;
    }

    static String extractValue(String xml, String... patterns) {
        for (String pattern : patterns) {
            try {
                Matcher matcher = Pattern.compile(pattern).matcher(xml);
                if (matcher.find()) {
                    String value = matcher.group(1).trim();
                    if (!value.isEmpty()) {
                        return value;
                    }
                }
            } catch (Exception ignored) {
            }
        }

        return null;
    }
}
