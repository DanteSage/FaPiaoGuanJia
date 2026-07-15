"""发票价税合计（total_amount）提取与纠正逻辑的单元测试

覆盖场景：
1. 增值税发票：同时包含不含税“合计金额(小写)”和“价税合计(小写)”，应精准提取价税合计
2. 增值税发票：价税合计换行或带空格的 (小写)¥xxx 格式
3. 行程单/打车票：实付金额/合计金额提取
4. 普通收据：仅包含单个 (小写)¥xxx 格式，作为兜底提取
"""

from core.ocr.fields import extract_fields


class TestInvoiceTotalAmountExtraction:
    def test_vat_invoice_with_separate_amounts(self):
        text = (
            "增值税电子普通发票\n"
            "合 计 金 额 (小写) ¥100.00\n"
            "税 额 (小写) ¥13.00\n"
            "价税合计 (大写) 壹佰壹拾叁圆整  (小写) ¥113.00\n"
        )
        fields = extract_fields(text)
        assert fields.get("total_amount") == "113.00"

    def test_vat_invoice_with_newline_and_spaces(self):
        text = (
            "增值税专用发票\n"
            "合计：¥500.00  税额：¥65.00\n"
            "价税合计（大写）伍佰陆拾伍圆整\n"
            "（小写）￥565.00\n"
        )
        fields = extract_fields(text)
        assert fields.get("total_amount") == "565.00"

    def test_rideshare_invoice(self):
        text = (
            "电子行程单\n"
            "实付金额：¥85.50\n"
            "里程：12.5公里\n"
        )
        fields = extract_fields(text)
        assert fields.get("total_amount") == "85.50"

    def test_common_receipt_fallback(self):
        text = (
            "收款收据\n"
            "项目：服务费\n"
            "(小写) ¥300.00\n"
        )
        fields = extract_fields(text)
        assert fields.get("total_amount") == "300.00"

    def test_total_by_daxie_suffix(self):
        text = (
            "发票\n"
            "价税合计（大写） 叁佰元整  ￥300.00\n"
        )
        fields = extract_fields(text)
        assert fields.get("total_amount") == "300.00"
