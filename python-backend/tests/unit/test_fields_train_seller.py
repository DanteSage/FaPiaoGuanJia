"""火车票销方识别的单元测试

覆盖场景：
1. OCR 把站名（如"郑州东站驻马店"）误识别为公司名时，销方仍应为"中国铁路"
2. OCR 仅识别到购方公司名时，销方仍应为"中国铁路"，购方不受影响
3. 非火车票场景不受影响（防止回归）
"""

from core.ocr.fields import extract_fields


class TestTrainSellerName:
    def test_station_name_misidentified_as_company_seller_overridden(self):
        """站名'驻马店'以'店'结尾被误匹配为公司名，但销方仍应为'中国铁路'"""
        text = (
            "电子发票（铁路电子客票）\n"
            "发票号码：26419165785000108161\n"
            "开票日期：2026年03月25日\n"
            "郑州东站驻马店\n"
            "G547 2026年03月27日 14:30 开\n"
            "票价 ¥100.00\n"
            "购买方名称：佳友同创(河南)信息技术有限公司\n"
            "电子客票号 26419165785000108161"
        )
        fields = extract_fields(text)
        assert fields.get("seller_name") == "中国铁路"
        assert fields.get("buyer_name") == "佳友同创(河南)信息技术有限公司"

    def test_only_buyer_company_present(self):
        """仅识别到购方公司名时，销方应为'中国铁路'"""
        text = (
            "电子发票（铁路电子客票）\n"
            "G547 2026年03月27日 14:30 开\n"
            "票价 ¥100.00\n"
            "购买方名称：佳友同创(河南)信息技术有限公司\n"
            "电子客票号 26419165785000108161"
        )
        fields = extract_fields(text)
        assert fields.get("seller_name") == "中国铁路"
        assert fields.get("buyer_name") == "佳友同创(河南)信息技术有限公司"

    def test_no_company_only_train_ticket(self):
        """票面无任何公司名（个人购票）时销方仍为'中国铁路'"""
        text = (
            "电子发票（铁路电子客票）\n"
            "G547 2026年03月27日 14:30 开\n"
            "郑州东 信阳东\n"
            "票价 ¥100.00\n"
            "电子客票号 26419165785000108161"
        )
        fields = extract_fields(text)
        assert fields.get("seller_name") == "中国铁路"

    def test_explicit_seller_label_overridden_by_china_railway(self):
        """即使 OCR 识别到错误的销售方标签，火车票仍强制覆盖为'中国铁路'"""
        text = (
            "电子发票（铁路电子客票）\n"
            "G547 2026年03月27日 14:30 开\n"
            "销售方：某假销售方有限公司\n"
            "票价 ¥100.00\n"
            "电子客票号 26419165785000108161"
        )
        fields = extract_fields(text)
        assert fields.get("seller_name") == "中国铁路"


class TestNonTrainSellerNotAffected:
    def test_normal_invoice_seller_preserved(self):
        """非火车票场景不受火车票销方覆盖逻辑影响"""
        text = (
            "增值税电子普通发票\n"
            "2026年03月24日\n"
            "购买方 名称：某某科技有限公司\n"
            "销售方 名称：北京某某商贸有限公司"
        )
        fields = extract_fields(text)
        assert fields.get("seller_name") == "北京某某商贸有限公司"
        assert fields.get("buyer_name") == "某某科技有限公司"

    def test_normal_invoice_with_dianzi_in_text_not_train(self):
        """文本含'店'但非火车票时正常匹配商店类公司名"""
        text = (
            "增值税电子普通发票\n"
            "2026年03月24日\n"
            "购买方 名称：某某科技有限公司\n"
            "销售方 名称：北京老字号烤鸭店"
        )
        fields = extract_fields(text)
        assert fields.get("seller_name") == "北京老字号烤鸭店"
