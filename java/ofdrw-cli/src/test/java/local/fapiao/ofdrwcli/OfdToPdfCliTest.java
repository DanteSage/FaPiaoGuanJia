package local.fapiao.ofdrwcli;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class OfdToPdfCliTest {

    @Test
    void shouldExtractFirstMatchingValue() {
        String xml = "<InvoiceCode>123456789012</InvoiceCode>";

        String value = InvoiceXmlParser.extractValue(
            xml,
            "[",
            "<InvoiceNo>([^<]+)</InvoiceNo>",
            "<InvoiceCode>([^<]+)</InvoiceCode>"
        );

        assertEquals("123456789012", value);
    }

    @Test
    void shouldParseStandardInvoiceXml() {
        String xml = """
            <ElectronicInvoice>
              <InvoiceCode>123456789012</InvoiceCode>
              <InvoiceNo>87654321</InvoiceNo>
              <IssueDate>2026-03-19</IssueDate>
              <TaxInclusiveTotalAmount>188.66</TaxInclusiveTotalAmount>
              <TaxTotalAmount>8.66</TaxTotalAmount>
              <SellerName>测试销售方</SellerName>
              <BuyerName>测试购买方</BuyerName>
            </ElectronicInvoice>
            """;

        Map<String, String> parsed = InvoiceXmlParser.parseInvoiceXml(xml);

        assertEquals("123456789012", parsed.get("invoiceCode"));
        assertEquals("87654321", parsed.get("invoiceNumber"));
        assertEquals("2026-03-19", parsed.get("invoiceDate"));
        assertEquals("188.66", parsed.get("totalAmount"));
        assertEquals("8.66", parsed.get("taxAmount"));
        assertEquals("测试销售方", parsed.get("sellerName"));
        assertEquals("测试购买方", parsed.get("buyerName"));
    }

    @Test
    void shouldParseRailwayInvoiceXml() {
        String xml = """
            <xbrl>
              <rai:TypeOfVoucher>铁路电子客票</rai:TypeOfVoucher>
              <rai:ElectronicInvoiceRailwayETicketNumber>9900112233</rai:ElectronicInvoiceRailwayETicketNumber>
              <rai:DateOfIssue>2026-03-20</rai:DateOfIssue>
              <rai:TravelDate>2026-03-21</rai:TravelDate>
              <rai:Fare>553.00</rai:Fare>
              <rai:TaxAmount>3.00</rai:TaxAmount>
              <rai:NameOfPurchaser>测试单位</rai:NameOfPurchaser>
              <rai:Name>张三</rai:Name>
              <rai:DepartureStation>北京南</rai:DepartureStation>
              <rai:DestinationStation>上海虹桥</rai:DestinationStation>
            </xbrl>
            """;

        Map<String, String> parsed = InvoiceXmlParser.parseInvoiceXml(xml);

        assertEquals("铁路电子客票", parsed.get("invoiceType"));
        assertEquals("9900112233", parsed.get("invoiceNumber"));
        assertEquals("2026-03-20", parsed.get("invoiceDate"));
        assertEquals("2026-03-21", parsed.get("travelDate"));
        assertEquals("553.00", parsed.get("totalAmount"));
        assertEquals("3.00", parsed.get("taxAmount"));
        assertEquals("测试单位", parsed.get("buyerName"));
        assertEquals("张三", parsed.get("passengerName"));
        assertEquals("北京南", parsed.get("departureStation"));
        assertEquals("上海虹桥", parsed.get("destinationStation"));
    }

    @Test
    void shouldReturnNullWhenNoPatternMatches() {
        assertNull(InvoiceXmlParser.extractValue("<Invoice />", "<InvoiceCode>([^<]+)</InvoiceCode>"));
    }

    @Test
    void shouldFallBackToRegexForStandardInvoiceWhenDomFails() {
        String xml = "<fp:InvoiceCode>123456789012</fp:InvoiceCode>"
            + "<fp:InvoiceNo>87654321</fp:InvoiceNo>"
            + "<fp:IssueDate>2026-03-19</fp:IssueDate>"
            + "<fp:TaxInclusiveTotalAmount>188.66</fp:TaxInclusiveTotalAmount>"
            + "<fp:TaxExclusiveTotalAmount>180.00</fp:TaxExclusiveTotalAmount>"
            + "<fp:TaxTotalAmount>8.66</fp:TaxTotalAmount>"
            + "<fp:SellerName>测试销售方</fp:SellerName>"
            + "<fp:BuyerName>测试购买方</fp:BuyerName>";

        Map<String, String> parsed = InvoiceXmlParser.parseInvoiceXml(xml);

        assertEquals("123456789012", parsed.get("invoiceCode"));
        assertEquals("87654321", parsed.get("invoiceNumber"));
        assertEquals("2026-03-19", parsed.get("invoiceDate"));
        assertEquals("188.66", parsed.get("totalAmount"));
        assertEquals("180.00", parsed.get("amount"));
        assertEquals("8.66", parsed.get("taxAmount"));
        assertEquals("测试销售方", parsed.get("sellerName"));
        assertEquals("测试购买方", parsed.get("buyerName"));
    }

    @Test
    void shouldFallBackToRegexForRailwayInvoiceWhenDomFails() {
        String xml = "<rai:TypeOfVoucher>xbrl 客票</rai:TypeOfVoucher>"
            + "<rai:ElectronicInvoiceRailwayETicketNumber>9900112233</rai:ElectronicInvoiceRailwayETicketNumber>"
            + "<rai:DateOfIssue>2026-03-20</rai:DateOfIssue>"
            + "<rai:TravelDate>2026-03-21</rai:TravelDate>"
            + "<rai:Fare>553.00</rai:Fare>"
            + "<rai:TotalAmountExcludingTax>550.00</rai:TotalAmountExcludingTax>"
            + "<rai:TaxAmount>3.00</rai:TaxAmount>"
            + "<rai:TaxRate>0.01</rai:TaxRate>"
            + "<rai:NameOfPurchaser>测试单位</rai:NameOfPurchaser>"
            + "<rai:UnifiedSocialCreditCodeOfPurchaser>91500000000000000X</rai:UnifiedSocialCreditCodeOfPurchaser>"
            + "<rai:Name>张三</rai:Name>"
            + "<rai:IdNumber>110000199001011234</rai:IdNumber>"
            + "<rai:TrainNumber>G1234</rai:TrainNumber>"
            + "<rai:DepartureStation>北京南</rai:DepartureStation>"
            + "<rai:DestinationStation>上海虹桥</rai:DestinationStation>"
            + "<rai:DepartureTime>08:00</rai:DepartureTime>"
            + "<rai:SeatLevel>二等座</rai:SeatLevel>"
            + "<rai:Carriage>05</rai:Carriage>"
            + "<rai:Seat>12A</rai:Seat>";

        Map<String, String> parsed = InvoiceXmlParser.parseInvoiceXml(xml);

        assertEquals("xbrl 客票", parsed.get("invoiceType"));
        assertEquals("9900112233", parsed.get("invoiceNumber"));
        assertEquals("2026-03-20", parsed.get("invoiceDate"));
        assertEquals("2026-03-21", parsed.get("travelDate"));
        assertEquals("553.00", parsed.get("totalAmount"));
        assertEquals("550.00", parsed.get("amount"));
        assertEquals("3.00", parsed.get("taxAmount"));
        assertEquals("0.01", parsed.get("taxRate"));
        assertEquals("测试单位", parsed.get("buyerName"));
        assertEquals("91500000000000000X", parsed.get("buyerTaxId"));
        assertEquals("张三", parsed.get("passengerName"));
        assertEquals("110000199001011234", parsed.get("idNumber"));
        assertEquals("G1234", parsed.get("trainNumber"));
        assertEquals("北京南", parsed.get("departureStation"));
        assertEquals("上海虹桥", parsed.get("destinationStation"));
        assertEquals("08:00", parsed.get("departureTime"));
        assertEquals("二等座", parsed.get("seatLevel"));
        assertEquals("05", parsed.get("carriage"));
        assertEquals("12A", parsed.get("seat"));
    }

    @Test
    void shouldFallBackToLocalNameWhenPrefixedTagMissing() {
        String xml = """
            <xbrl>
              <rai:TypeOfVoucher>xbrl 客票</rai:TypeOfVoucher>
              <TravelDate>2026-03-21</TravelDate>
              <DepartureStation>北京南</DepartureStation>
            </xbrl>
            """;

        Map<String, String> parsed = InvoiceXmlParser.parseInvoiceXml(xml);

        assertEquals("xbrl 客票", parsed.get("invoiceType"));
        assertEquals("2026-03-21", parsed.get("travelDate"));
        assertEquals("北京南", parsed.get("departureStation"));
    }

    @Test
    void shouldReturnEmptyMapWhenNothingMatches() {
        Map<String, String> parsed = InvoiceXmlParser.parseInvoiceXml("plain text without any known tags");

        assertEquals(0, parsed.size());
    }
}
