"""XML格式电子发票解析模块"""

from typing import Any, Dict, List

try:
    from lxml import etree  # type: ignore
except Exception:
    etree = None


def parse_xml_invoice(file_path: str) -> Dict[str, Any]:
    """解析XML格式的电子发票"""
    if etree is None:
        raise RuntimeError("未安装 lxml 库，请执行: pip install lxml")

    with open(file_path, "rb") as f:
        content = f.read()

    try:
        root = etree.fromstring(content)
    except Exception as e:
        raise RuntimeError(f"XML 解析失败: {e}")

    fields: Dict[str, str] = {}
    text_parts: List[str] = []

    nsmap = root.nsmap if hasattr(root, "nsmap") else {}
    default_ns = nsmap.get(None, "")

    def get_text(elem) -> str:
        if elem is None:
            return ""
        return (elem.text or "").strip()

    def find_elem(parent, *tags):
        for tag in tags:
            elem = parent.find(f".//{tag}", namespaces=nsmap)
            if elem is not None:
                return elem
            if default_ns:
                elem = parent.find(f".//{{{default_ns}}}{tag}")
                if elem is not None:
                    return elem
            for child in parent.iter():
                local_name = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                if local_name == tag:
                    return child
        return None

    def find_all_text(parent, *tags) -> List[str]:
        results = []
        for tag in tags:
            for child in parent.iter():
                local_name = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                if local_name == tag and child.text:
                    results.append(child.text.strip())
        return results

    # 定义字段映射
    field_mappings = [
        ("invoice_code", ["InvoiceCode", "FaPiaoHaoMa", "发票代码", "fpdm"], "发票代码"),
        (
            "invoice_number",
            ["InvoiceNumber", "InvoiceNo", "FaPiaoDaiMa", "发票号码", "fphm"],
            "发票号码",
        ),
        ("date", ["InvoiceDate", "IssueDate", "KaiPiaoRiQi", "开票日期", "kprq"], "开票日期"),
        (
            "amount",
            ["TotalAmount", "TaxInclusiveAmount", "Amount", "JinE", "金额", "jshj", "hjje"],
            "金额",
        ),
        ("tax", ["TotalTax", "TaxAmount", "ShuiE", "税额", "hjse"], "税额"),
        ("buyer_name", ["BuyerName", "GouMaiFangMingCheng", "购买方名称", "gfmc"], "购买方名称"),
        (
            "buyer_tax_id",
            ["BuyerTaxID", "BuyerTaxNo", "GouMaiFangShiBieHao", "购买方识别号", "gfsbh"],
            "购买方识别号",
        ),
        (
            "seller_name",
            ["SellerName", "XiaoShouFangMingCheng", "销售方名称", "xfmc"],
            "销售方名称",
        ),
        (
            "seller_tax_id",
            ["SellerTaxID", "SellerTaxNo", "XiaoShouFangShiBieHao", "销售方识别号", "xfsbh"],
            "销售方识别号",
        ),
    ]

    for field_key, tags, label in field_mappings:
        elem = find_elem(root, *tags)
        if elem is not None and get_text(elem):
            fields[field_key] = get_text(elem)
            text_parts.append(f"{label}: {fields[field_key]}")

    # 商品明细
    item_names = find_all_text(root, "GoodsName", "ItemName", "商品名称", "spmc", "hwmc")
    if item_names:
        fields["items"] = "; ".join(item_names)
        text_parts.append(f"商品明细: {fields['items']}")

    # 备注
    remark_tags = ["Remark", "BeiZhu", "备注", "bz"]
    elem = find_elem(root, *remark_tags)
    if elem is not None and get_text(elem):
        fields["remark"] = get_text(elem)
        text_parts.append(f"备注: {fields['remark']}")

    # 如果没有解析到任何字段，遍历所有元素
    if not text_parts:
        for elem in root.iter():
            if elem.text and elem.text.strip():
                local_name = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
                text_parts.append(f"{local_name}: {elem.text.strip()}")

    text = "\n".join(text_parts)

    return {"text": text, "fields": fields, "blocks": []}
