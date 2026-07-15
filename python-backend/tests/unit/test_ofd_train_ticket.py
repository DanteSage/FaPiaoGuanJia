"""OFD 路径火车票销方默认值补全的单元测试"""

from core.ocr.ofd import (
    _apply_train_ticket_defaults,
    _is_train_ticket_from_fields,
)


class TestIsTrainTicketFromFields:
    def test_train_no_detected(self):
        assert _is_train_ticket_from_fields({"train_no": "G547"}) is True

    def test_from_station_detected(self):
        assert _is_train_ticket_from_fields({"from_station": "郑州东"}) is True

    def test_to_station_detected(self):
        assert _is_train_ticket_from_fields({"to_station": "信阳东"}) is True

    def test_seat_level_detected(self):
        assert _is_train_ticket_from_fields({"seat_level": "二等座"}) is True

    def test_seat_detected(self):
        assert _is_train_ticket_from_fields({"seat": "05车12A号"}) is True

    def test_invoice_type_with_keyword_railway(self):
        assert _is_train_ticket_from_fields({"invoice_type": "铁路电子客票"}) is True

    def test_invoice_type_with_keyword_train(self):
        assert _is_train_ticket_from_fields({"invoice_type": "火车票"}) is True

    def test_invoice_type_with_keyword_high_speed(self):
        assert _is_train_ticket_from_fields({"invoice_type": "高铁票"}) is True

    def test_non_train_invoice(self):
        assert _is_train_ticket_from_fields({"invoice_type": "增值税专用发票"}) is False

    def test_empty_fields(self):
        assert _is_train_ticket_from_fields({}) is False


class TestApplyTrainTicketDefaults:
    def test_empty_seller_name_filled_for_train_ticket(self):
        fields = {"train_no": "G547", "from_station": "郑州东"}
        result = _apply_train_ticket_defaults(fields)
        assert result["seller_name"] == "中国铁路"

    def test_missing_seller_name_filled_for_train_ticket(self):
        fields = {"invoice_type": "铁路电子客票"}
        result = _apply_train_ticket_defaults(fields)
        assert result["seller_name"] == "中国铁路"

    def test_existing_seller_name_preserved(self):
        fields = {"train_no": "G547", "seller_name": "中国铁路总公司"}
        result = _apply_train_ticket_defaults(fields)
        assert result["seller_name"] == "中国铁路总公司"

    def test_non_train_with_empty_seller_not_filled(self):
        fields = {"invoice_type": "增值税专用发票"}
        result = _apply_train_ticket_defaults(fields)
        assert "seller_name" not in result

    def test_non_train_with_existing_seller_preserved(self):
        fields = {"invoice_type": "增值税专用发票", "seller_name": "某某公司"}
        result = _apply_train_ticket_defaults(fields)
        assert result["seller_name"] == "某某公司"


class TestApplyTrainTicketTaxBackfill:
    def test_tax_back_calc_when_missing(self):
        fields = {"train_no": "G547", "total_amount": "121.50"}
        result = _apply_train_ticket_defaults(fields)
        assert result["amount"] == "111.47"
        assert result["tax"] == "10.03"
        assert result["tax_rate"] == "9%"

    def test_tax_back_calc_when_zero(self):
        fields = {"train_no": "G547", "total_amount": "121.50", "tax": "0.00"}
        result = _apply_train_ticket_defaults(fields)
        assert result["tax"] == "10.03"
        assert result["amount"] == "111.47"

    def test_existing_nonzero_tax_preserved(self):
        fields = {
            "train_no": "G547",
            "total_amount": "121.50",
            "amount": "115.00",
            "tax": "6.50",
        }
        result = _apply_train_ticket_defaults(fields)
        assert result["tax"] == "6.50"
        assert result["amount"] == "115.00"

    def test_no_total_amount_no_backfill(self):
        fields = {"train_no": "G547"}
        result = _apply_train_ticket_defaults(fields)
        assert "amount" not in result
        assert "tax" not in result

    def test_non_train_with_zero_tax_not_backfilled(self):
        fields = {
            "invoice_type": "增值税专用发票",
            "total_amount": "100.00",
            "tax": "0.00",
        }
        result = _apply_train_ticket_defaults(fields)
        assert result["tax"] == "0.00"
