"""火车票开票日期提取与防御逻辑的单元测试

覆盖场景：
1. 文本含"开票日期"标签：标签优先于位置靠前的乘车日期
2. 文本无标签但 date == travel_date：清空 date，避免 RPA 误用
3. 非火车票场景不受防御逻辑影响
"""

from core.ocr.fields import extract_fields


class TestInvoiceDateLabelPriority:
    def test_invoice_date_label_wins_over_travel_date(self):
        text = (
            "中国铁路电子客票\n"
            "G547 2026年03月24日 14:30 开\n"
            "郑州东 信阳东 二等座\n"
            "开票日期：2026年03月25日\n"
            "电子客票号 26419139047000074579"
        )
        fields = extract_fields(text)
        assert fields.get("date") == "2026年03月25日"
        assert fields.get("travel_date") == "2026年03月24日"

    def test_invoice_date_label_with_dash_format(self):
        text = (
            "G547 2026年03月24日 14:30 开\n"
            "开票日期 2026-03-25\n"
            "电子客票号 26419139047000074579"
        )
        fields = extract_fields(text)
        assert fields.get("date") == "2026年03月25日"

    def test_invoice_date_label_with_slash_format(self):
        text = (
            "G547 2026年03月24日 14:30 开\n"
            "开票日期：2026/03/25\n"
            "电子客票号 26419139047000074579"
        )
        fields = extract_fields(text)
        assert fields.get("date") == "2026年03月25日"

    def test_fapiao_date_label_alias(self):
        text = (
            "G547 2026年03月24日 14:30 开\n"
            "发票日期：2026年03月25日\n"
            "电子客票号 26419139047000074579"
        )
        fields = extract_fields(text)
        assert fields.get("date") == "2026年03月25日"


class TestTrainTicketDateDefense:
    def test_date_equal_travel_date_cleared(self):
        text = (
            "中国铁路电子客票\n"
            "G547 2026年03月24日 14:30 开\n"
            "郑州东 信阳东 二等座\n"
            "电子客票号 26419139047000074579"
        )
        fields = extract_fields(text)
        assert fields.get("travel_date") == "2026年03月24日"
        assert "date" not in fields

    def test_date_different_from_travel_date_preserved(self):
        text = (
            "G547 2026年03月24日 14:30 开\n"
            "开票日期：2026年03月25日\n"
            "电子客票号 26419139047000074579"
        )
        fields = extract_fields(text)
        assert fields.get("date") == "2026年03月25日"
        assert fields.get("travel_date") == "2026年03月24日"

    def test_non_train_ticket_date_preserved(self):
        text = (
            "增值税电子普通发票\n"
            "2026年03月24日\n"
            "购买方 某某公司\n"
            "销售方 北京某某科技有限公司"
        )
        fields = extract_fields(text)
        assert fields.get("date") == "2026年03月24日"
