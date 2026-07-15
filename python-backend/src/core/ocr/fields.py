"""发票字段提取和文本规范化"""

import re
import logging
from typing import Dict, Tuple

logger = logging.getLogger(__name__)


def is_flight_ticket(fields: Dict[str, str], text: str) -> bool:
    return (
        fields.get("invoice_type", "") in ("航空运输电子客票行程单", "航空客票行程单")
        or "航空运输电子客票行程单" in text
        or "客票行程单" in text
        or ("航班号" in text and ("票价" in text or "燃油附加费" in text))
        or ("电子客票号码" in text and "承运人" in text)
        or (fields.get("flight_no") and "承运人" in text)
    )


def is_train_ticket(fields: Dict[str, str], text: str) -> bool:
    """判断是否为火车票/高铁票

    条件（满足其一）：
    1. 已识别到车次号(G/D/C/Z/T开头)
    2. 明确包含"火车票"字样
    3. 包含"电子客票号"
    4. 同时包含"车次"+("座"或"票价")
    5. 同时包含"高铁"+"车次"
    """
    if is_flight_ticket(fields, text):
        return False
    return bool(
        fields.get("train_no")
        or ("火车票" in text)
        or ("电子客票号" in text and "电子客票号码" not in text)
        or ("车次" in text and ("座" in text or "票价" in text) and "航班" not in text)
        or ("高铁" in text and "车次" in text)
    )


def normalize_ocr_text(text: str) -> str:
    """规范化OCR文本，处理CJK字符间的空格和标点"""
    result = text
    # 移除CJK字符之间的空格（重复直到无变化）
    prev = ""
    while prev != result:
        prev = result
        result = re.sub(r"([\u4e00-\u9fff])\s+([\u4e00-\u9fff])", r"\1\2", result)
    # 移除常见标点周围的空格
    result = re.sub(r"\s*([\uff1a\uff0c\u3002\uff01\uff1f：:])\s*", r"\1", result)
    result = re.sub(r"(?<![A-Za-z])Y\s*(?=\d)", "¥", result)
    result = re.sub(r"(?<![A-Za-z])丫\s*(?=\d)", "¥", result)
    # 规范化数字格式，如 "33 . 20" -> "33.20"
    result = re.sub(r"(\d)\s*[\uff0e.\u00b7\u2024\u2027]\s*(\d)", r"\1.\2", result)
    result = re.sub(r"(\d)\s*[，,、]\s*(\d)", r"\1.\2", result)
    result = re.sub(r"％", "%", result)
    result = re.sub(r"(?<=[¥￥\s])&\s*(\d{2})(?=\s|$|\n)", r"8.\1", result)
    result = re.sub(r"\b&\s*(\d{2})(?=\s|$|\n)", r"8.\1", result)
    # 修复金额中小数点丢失的情况，如 "¥ 28 50" -> "¥ 28.50"
    # 仅在 ¥ 符号后、且末尾恰好2位数字时触发（分角格式）
    result = re.sub(r"([¥￥]\s*\d+)\s+(\d{2})(?=\s|$|\n)", r"\1.\2", result)
    # 规范化年月日格式，如 "2026 年 01 月 30 日" -> "2026年01月30日"
    result = re.sub(r"(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日?", r"\1年\2月\3日", result)
    # 移除多余空格（保留换行）
    result = re.sub(r" +", " ", result)
    return result


def extract_fields(text: str) -> Dict[str, str]:
    """从OCR文本中提取发票字段"""
    fields: Dict[str, str] = {}
    normalized = normalize_ocr_text(text)

    _invoice_type_patterns = [
        (r"增值税电子专用发票", "增值税电子专用发票"),
        (r"增值税专用发票", "增值税专用发票"),
        (r"增值税电子普通发票", "增值税电子普通发票"),
        (r"增值税普通发票", "增值税普通发票"),
        (r"电子发票\s*[（(]\s*普通发票\s*[)）]", "电子发票(普通发票)"),
        (r"电子发票\s*[（(]\s*专用发票\s*[)）]", "电子发票(专用发票)"),
        (r"铁路电子客票", "铁路电子客票"),
        (r"航空运输电子客票行程单", "航空运输电子客票行程单"),
        (r"航空.*?客票.*?行程单", "航空客票行程单"),
        (r"客票行程单", "航空客票行程单"),
        (r"通行费.*?(?:电子票据|发票)", "通行费发票"),
    ]
    for _pat, _label in _invoice_type_patterns:
        if re.search(_pat, normalized):
            fields["invoice_type"] = _label
            break

    patterns: Dict[str, Tuple[str, int]] = {
        "invoice_code": (r"(发票代码|代码)\s*[::：]?\s*([0-9]{10,12})", 2),
        "train_no": (r"\b([GDCZT]\d{1,4})\b", 1),
        # 火车票/高铁票专用字段
        "seat_class": (r"(一等座|二等座|商务座|特等座|软卧|硬卧|软座|硬座|无座)", 1),
        "seat_number": (r"(\d{1,2}车\d{1,3}[A-F]号?)", 1),
        "e_ticket_no": (r"(电子客票号|电子客票)[::：]?\s*([0-9]{20,30})", 2),
        "id_card": (r"(\d{6,14}\*{4,6}\d{4})", 1),  # 身份证号前缀可能更长
        # passenger_name 移至火车票专用提取逻辑，避免匹配大写金额
    }
    for key, (pat, group_index) in patterns.items():
        m = re.search(pat, normalized)
        if m:
            fields[key] = m.group(group_index).strip()

    # 电子发票字段独立提取（处理标签和值分离的情况）
    # 发票号码：通常是15-20位数字
    logger.warning("[DEBUG] normalized text: %s", repr(normalized))
    if "invoice_number" not in fields:
        inv_label_match = re.search(
            r"(?:发票号码|号码)[\s\S]{0,500}?([0-9][0-9\s]{14,25}[0-9])", normalized
        )
        if inv_label_match:
            candidate = re.sub(r"\D", "", inv_label_match.group(1))
            if 15 <= len(candidate) <= 20:
                fields["invoice_number"] = candidate
        if "invoice_number" not in fields:
            already_used = {
                fields.get("invoice_code", ""),
                fields.get("e_ticket_no", ""),
                fields.get("id_card", ""),
            }
            for m in re.finditer(r"\b([0-9]{15,20})\b", normalized):
                val = m.group(1)
                if val in already_used:
                    continue
                fields["invoice_number"] = val
                break

    # 开票日期/行程日期：支持多种格式
    # 优先级：明确"开票日期/发票日期"标签 > 通用"YYYY年MM月DD日" > "行程日期"等标签 > 纯日期"YYYY-MM-DD"
    # 火车票场景：标签优先可避免把"乘车日期"（位置靠前）误识别为"开票日期"
    if "date" not in fields:
        # 格式0（最优先）: "开票日期"/"发票日期"标签后的明确日期
        label_match = re.search(
            r"(?:开票日期|发票日期)[\s::：]*([0-9]{4})[\s年\-/.]+([0-9]{1,2})[\s月\-/.]+([0-9]{1,2})\s*日?",
            normalized,
        )
        if label_match:
            fields["date"] = (
                f"{label_match.group(1)}年{label_match.group(2)}月{label_match.group(3)}日"
            )

    # 开票日期/行程日期：支持多种格式
    if "date" not in fields:
        # 格式1: XXXX年XX月XX日
        date_match = re.search(r"([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日", normalized)
        if date_match:
            fields["date"] = (
                f"{date_match.group(1)}年{date_match.group(2)}月{date_match.group(3)}日"
            )
        else:
            # 格式2: YYYY-MM-DD 或 YYYY/MM/DD（行程单常用）
            date_match2 = re.search(
                r"(?:行程日期|打印日期|生成日期|日期)[::：\s]*([0-9]{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})",
                normalized,
            )
            if date_match2:
                fields["date"] = (
                    f"{date_match2.group(1)}年{date_match2.group(2)}月{date_match2.group(3)}日"
                )
            else:
                # 格式3: 纯日期 YYYY-MM-DD
                date_match3 = re.search(
                    r"\b([0-9]{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})\b", normalized
                )
                if date_match3:
                    fields["date"] = (
                        f"{date_match3.group(1)}年{date_match3.group(2)}月{date_match3.group(3)}日"
                    )

    # 价税合计/合计金额：支持多种格式
    if "total_amount" not in fields:
        # 优先匹配带有“价税合计”前缀的（小写）金额
        total_match = re.search(
            r"价税合计[\s\S]{0,100}?[（(]\s*小写\s*[）)][\s\n]*[¥￥]?\s*([0-9]{1,8}\.[0-9]{2})",
            normalized,
        )
        if not total_match:
            total_match = re.search(
                r"[（(]\s*小写\s*[）)][\s\n]*[¥￥]?\s*([0-9]{1,8}\.[0-9]{2})",
                normalized,
            )
        if total_match:
            fields["total_amount"] = total_match.group(1)
        else:
            # 格式2: 大写金额后的小写金额
            daxie_match = re.search(
                r"[壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分圆整][\s\n]*[¥￥]\s*([0-9]{1,8}\.[0-9]{2})",
                normalized,
            )
            if daxie_match:
                fields["total_amount"] = daxie_match.group(1)
            else:
                # 格式3: 行程单常用的合计金额格式
                rideshare_patterns = [
                    r"(?:合计金额|总金额|费用合计|实付金额|合计)[::：\s]*[¥￥]?\s*([0-9]+\.?[0-9]*)",
                    r"[¥￥]\s*([0-9]+\.[0-9]{2})\s*(?:元|合计)",
                ]
                for pat in rideshare_patterns:
                    m = re.search(pat, normalized)
                    if m:
                        fields["total_amount"] = m.group(1)
                        break

    if "tax_rate" not in fields:
        tax_rate_match = re.search(r"([0-9]{1,2}(?:\.[0-9]+)?)\s*%", normalized)
        if tax_rate_match:
            fields["tax_rate"] = f"{tax_rate_match.group(1)}%"

    # 仅在先前未提取出价税合计时进行小写备用匹配，且优先考虑有“价税合计”上下文的金额
    if "total_amount" not in fields:
        total_by_lowercase_match = re.search(
            r"价税合计[\s\S]{0,100}?[（(]\s*小写\s*[）)][\s\n]*[¥￥]?\s*([0-9]{1,8}\.[0-9]{2})",
            normalized,
        )
        if not total_by_lowercase_match:
            total_by_lowercase_match = re.search(
                r"[（(]\s*小写\s*[）)][\s\n]*[¥￥]?\s*([0-9]{1,8}\.[0-9]{2})",
                normalized,
            )
        if total_by_lowercase_match:
            fields["total_amount"] = total_by_lowercase_match.group(1)

    # 纳税人识别号：18位统一社会信用代码
    # 统一社会信用代码前缀：
    #   9 - 企业（91-企业，92-个体户，93-外资）
    #   1 - 机关/事业单位（11-机关，12-事业，13-社团，19-其他）
    #   5 - 社会组织（51-社团，52-民非，53-基金会）
    #   Y - 个体工商户
    if "buyer_tax_id" not in fields or "seller_tax_id" not in fields:
        # 合法的统一社会信用代码前缀（移除宽泛的[1-9]）
        valid_tax_prefixes = r"(?:9[1-5]|1[1-359]|5[1-3]|Y[1-4])"

        # 方法1: 根据上下文提取购方/销方税号
        buyer_tax_match = re.search(
            r"(?:购买方|购方)[\s\S]{0,50}?(?:纳税人识别号|税号|识别号|统一社会信用代码)[::：\s\n]*([0-9A-Z]{15,20})",
            normalized,
        )
        if buyer_tax_match and "buyer_tax_id" not in fields:
            tid = buyer_tax_match.group(1)
            if len(tid) == 18:
                fields["buyer_tax_id"] = tid

        seller_tax_match = re.search(
            r"(?:销售方|销方)[\s\S]{0,50}?(?:纳税人识别号|税号|识别号|统一社会信用代码)[::：\s\n]*([0-9A-Z]{15,20})",
            normalized,
        )
        if seller_tax_match and "seller_tax_id" not in fields:
            tid = seller_tax_match.group(1)
            if len(tid) == 18:
                fields["seller_tax_id"] = tid

        # 方法2: 查找所有合法税号
        if "buyer_tax_id" not in fields or "seller_tax_id" not in fields:
            tax_id_matches = re.findall(
                r"\b(" + valid_tax_prefixes + r"[0-9A-Z]{16})\b", normalized
            )
            # 过滤：必须包含字母（排除纯数字的发票号码）
            tax_id_matches = [
                m for m in tax_id_matches if any(c.isalpha() for c in m) and len(m) == 18
            ]
            if not tax_id_matches:
                # 备用：查找任何包含字母的18位代码
                tax_id_matches = re.findall(r"\b([0-9A-Z]{18})\b", normalized)
                tax_id_matches = [m for m in tax_id_matches if any(c.isalpha() for c in m)]
            if not tax_id_matches:
                # 最后备用：查找"纳税人识别号"标签后的数字（支持纯数字老税号）
                tax_label_match = re.search(
                    r"(?:纳税人识别号|税号|识别号)[::：\s\n]*([0-9]{15,20})", normalized
                )
                if tax_label_match:
                    tax_id_matches = [tax_label_match.group(1)]
            # 分配税号：第一个给buyer，第二个给seller（发票中通常购方在前）
            if len(tax_id_matches) >= 1 and "buyer_tax_id" not in fields:
                fields["buyer_tax_id"] = tax_id_matches[0]
            if len(tax_id_matches) >= 2 and "seller_tax_id" not in fields:
                fields["seller_tax_id"] = tax_id_matches[1]

    # 提取买方和卖方名称
    # 公司/单位名称常见后缀
    company_suffixes = r"(?:公司|商店|商行|企业|中心|部|酒店|宾馆|旅馆|旅店|民宿|会所|康健中心|店|室|服务部|有限公司|股份有限公司)"

    # 方法1: 从"名称:"提取（支持换行）
    all_company_names = re.findall(
        r"名称[:：][\s\n]*([\u4e00-\u9fff()（）A-Za-z0-9]+?" + company_suffixes + r")", normalized
    )

    # 方法2: 直接查找所有以"有限公司"结尾的公司名称
    # 排除以日期字符"日"开头的匹配（避免"2025年12月24日佳友..."被匹配为"日佳友..."）
    if len(all_company_names) < 2:
        raw_names = re.findall(r"([\u4e00-\u9fff()（）]{4,}" + company_suffixes + r")", normalized)
        # 清理名称：如果以"日"开头且来自日期，则去掉"日"
        # 方法：检查原始文本中该公司名前是否有"月XX日"模式
        cleaned_names = []
        for name in raw_names:
            if name.startswith("日") and len(name) > 1:
                # 检查原始文本中该名称前是否有日期模式
                # 查找 "月XX日" + 公司名（去掉"日"后） 的模式
                name_without_ri = name[1:]
                date_pattern = r"\d{1,2}月\d{1,2}日" + re.escape(name_without_ri)
                if re.search(date_pattern, normalized):
                    # 确认"日"来自日期，去掉
                    name = name_without_ri
                # 否则保留原始名称（可能是"日立"、"日产"等合法公司名）
            cleaned_names.append(name)
        all_company_names = cleaned_names

    # 火车票场景：站名地名（如"驻马店"）以"店"结尾会被 company_suffixes 误匹配为公司名
    # （如"郑州东站驻马店"被识别为"公司"）。此处用强公司关键词白名单过滤，仅保留真正的单位名
    if is_train_ticket(fields, normalized) and all_company_names:
        strong_company_keywords = (
            "公司",
            "有限",
            "集团",
            "厂",
            "事务所",
            "学院",
            "大学",
            "酒店",
            "宾馆",
            "政府",
            "委员会",
            "研究院",
            "医院",
            "银行",
        )
        all_company_names = [
            n for n in all_company_names
            if any(kw in n for kw in strong_company_keywords)
        ]

    # 方法3: 从"销售方/购买方"提取
    # 名称内部字符集允许少量空格（应对 OCR 在长公司名中间误插空格/换行的情况），
    # 匹配到 company_suffixes 结尾后再去除多余空白
    if "seller_name" not in fields:
        seller_match = re.search(
            r"(?:销售方|销方)[::：\s\n]*(?:名称[::：\s\n]*)?([\u4e00-\u9fff()（）A-Za-z0-9][\u4e00-\u9fff()（）A-Za-z0-9\s]*?"
            + company_suffixes
            + r")",
            normalized,
        )
        if seller_match:
            fields["seller_name"] = re.sub(r"\s+", "", seller_match.group(1))

    if "buyer_name" not in fields:
        buyer_match = re.search(
            r"(?:购买方|购方)[::：\s\n]*(?:名称[::：\s\n]*)?([\u4e00-\u9fff()（）A-Za-z0-9][\u4e00-\u9fff()（）A-Za-z0-9\s]*?"
            + company_suffixes
            + r")",
            normalized,
        )
        if buyer_match:
            fields["buyer_name"] = re.sub(r"\s+", "", buyer_match.group(1))

    # 方法4: 从所有"名称:"提取并推断
    if len(all_company_names) >= 2 and ("seller_name" not in fields or "buyer_name" not in fields):
        # 常见服务提供商（卖方）关键词
        service_providers = [
            "滴滴",
            "美团",
            "高德",
            "百度",
            "腾讯",
            "阿里",
            "京东",
            "拼多多",
            "中国铁路",
            "铁路",
            "航空",
            "南方航空",
            "东方航空",
            "国航",
            "海南航空",
            "春秋航空",
            "吉祥航空",
            "厦门航空",
            "深圳航空",
            "山东航空",
            "四川航空",
            "中国石油",
            "中国石化",
            "壳牌",
            "中海油",
            "加油站",
            "加气站",
            "出行",
            "打车",
            "网约车",
            "酒店",
            "宾馆",
            "旅馆",
            "住宿",
        ]

        name0_is_provider = any(p in all_company_names[0] for p in service_providers)
        name1_is_provider = any(p in all_company_names[1] for p in service_providers)

        if name0_is_provider and not name1_is_provider:
            # 第一个是服务提供商（卖方），第二个是买方
            if "seller_name" not in fields:
                fields["seller_name"] = all_company_names[0]
            if "buyer_name" not in fields:
                fields["buyer_name"] = all_company_names[1]
        elif name1_is_provider and not name0_is_provider:
            # 第二个是服务提供商（卖方），第一个是买方
            if "buyer_name" not in fields:
                fields["buyer_name"] = all_company_names[0]
            if "seller_name" not in fields:
                fields["seller_name"] = all_company_names[1]
        else:
            # 都是或都不是服务商：按发票常见顺序，购方在前（左上），销方在后（左下）
            # 但我们提取的顺序可能不确定，需要检查文本中的位置
            pos0 = normalized.find(all_company_names[0])
            pos1 = normalized.find(all_company_names[1])
            if pos0 < pos1:
                # 第一个出现在前，通常是购方
                if "buyer_name" not in fields:
                    fields["buyer_name"] = all_company_names[0]
                if "seller_name" not in fields:
                    fields["seller_name"] = all_company_names[1]
            else:
                # 第二个出现在前，可能是购方
                if "buyer_name" not in fields:
                    fields["buyer_name"] = all_company_names[1]
                if "seller_name" not in fields:
                    fields["seller_name"] = all_company_names[0]
    elif len(all_company_names) == 1:
        # 如果是火车票，唯一的公司名应该是购票方（买方），不是销方
        if is_train_ticket(fields, normalized):
            if "buyer_name" not in fields:
                fields["buyer_name"] = all_company_names[0]
        elif "seller_name" not in fields:
            fields["seller_name"] = all_company_names[0]

    # 备用价税合计提取（如果主模式未匹配）
    if "total_amount" not in fields:
        # 尝试匹配 "价税合计" 后面的金额
        total_patterns = [
            r"价税合计[\s\S]{0,30}?[¥￥]\s*([0-9]{1,8}\.[0-9]{2})",  # 价税合计...¥xxx.xx
            r"[¥￥]\s*([0-9]{1,6}\.[0-9]{2})\s*$",  # 行尾的 ¥xxx.xx
        ]
        for pat in total_patterns:
            m = re.search(pat, normalized, re.MULTILINE)
            if m:
                val = m.group(1)
                try:
                    if 0 < float(val) < 100000000:  # 合理范围：0-1亿
                        fields["total_amount"] = val
                        break
                except ValueError:
                    pass

    # 提取税额和金额
    # 方法1: 尝试匹配 "合计" 后面的两个金额
    heji_match = re.search(
        r"合[\s\n]*计[\s\n]*[¥￥]?([0-9]+\.?[0-9]*)[\s\n]*[¥￥]?[\s\n]*([0-9]+\.?[0-9]*)",
        normalized,
    )
    if heji_match:
        amount_val = heji_match.group(1)
        tax_val = heji_match.group(2)
        if amount_val and float(amount_val) > 0:
            fields["amount"] = amount_val
        if tax_val and float(tax_val) > 0:
            fields["tax"] = tax_val

    # 方法2: 查找连续的两个 ¥xxx.xx 格式金额（第一个是金额，第二个是税额）
    if "amount" not in fields or "tax" not in fields:
        # 查找所有 ¥xxx.xx 格式的金额
        all_amounts = re.findall(r"[¥￥]\s*([0-9]+\.[0-9]{2})", normalized)
        if len(all_amounts) >= 3:
            # 通常：金额、税额、价税合计 三个数字
            # 验证：金额 + 税额 ≈ 价税合计
            for i in range(len(all_amounts) - 2):
                try:
                    amt = float(all_amounts[i])
                    tax = float(all_amounts[i + 1])
                    total = float(all_amounts[i + 2])
                    # 动态误差：小金额用绝对误差，大金额用相对误差
                    # 小于1000元用绝对误差0.1，否则用相对误差0.01%
                    tolerance = max(0.1, total * 0.0001) if total > 0 else 0.1
                    if abs(amt + tax - total) <= tolerance:
                        if "amount" not in fields:
                            fields["amount"] = all_amounts[i]
                        if "tax" not in fields:
                            fields["tax"] = all_amounts[i + 1]
                        if "total_amount" not in fields:
                            fields["total_amount"] = all_amounts[i + 2]
                        break
                except ValueError:
                    pass

    # 火车票/高铁票票价提取
    if "amount" not in fields:
        # 尝试匹配票价格式: ¥xxx.xx 或 票价xxx.xx 或 金额xxx.xx
        fare_patterns = [
            r"票[\s]*价[\s\n::：]*[¥￥]?\s*([0-9]+\.?[0-9]*)",  # 票价:xx.xx
            r"[¥￥]\s*([0-9]+\.[0-9]{2})\b",  # ¥xx.xx (带小数点)
            r"金[\s]*额[\s\n::：]*[¥￥]?\s*([0-9]+\.?[0-9]*)",  # 金额:xx.xx
            r"票面金额[\s\n::：]*[¥￥]?\s*([0-9]+\.?[0-9]*)",  # 票面金额:xx.xx
        ]
        for fare_pat in fare_patterns:
            fare_match = re.search(fare_pat, normalized)
            if fare_match:
                fare_val = fare_match.group(1)
                if fare_val and float(fare_val) > 0:
                    fields["amount"] = fare_val
                    # 火车票的金额通常就是含税总额
                    if "total_amount" not in fields:
                        fields["total_amount"] = fare_val
                    break

    if "tax" not in fields:
        tax_match = re.search(r"税[\s]*额[\s\n::：]*([0-9]+\.?[0-9]+)", normalized)
        if tax_match:
            fields["tax"] = tax_match.group(1)

    if "total_amount" in fields:
        try:
            current_total = float(fields["total_amount"])
            all_yen = re.findall(r"[¥￥]\s*([0-9]+\.[0-9]{2})", normalized)
            if all_yen and current_total < 1.0:
                candidates = [float(v) for v in all_yen if float(v) > current_total]
                if candidates:
                    best = max(candidates)
                    if best < 100000000:
                        fields["total_amount"] = f"{best:.2f}"
                        if "amount" in fields:
                            del fields["amount"]
                        if "tax" in fields:
                            del fields["tax"]
        except (ValueError, TypeError):
            pass

    # ── 阶段1：纠正（识别结果校验与修正） ──

    if "amount" in fields and "tax" in fields:
        try:
            amt_val = float(fields["amount"])
            tax_val = float(fields["tax"])
            if amt_val > 0 and tax_val > 0 and amt_val < tax_val:
                fields["amount"], fields["tax"] = fields["tax"], fields["amount"]
        except (ValueError, TypeError):
            pass

    if "total_amount" in fields and "amount" in fields:
        try:
            total = float(fields["total_amount"])
            amount = float(fields["amount"])
            if abs(total - amount) < 0.01:
                all_yen = [float(v) for v in re.findall(r"[¥￥]\s*([0-9]{1,8}\.[0-9]{2})", normalized)]
                larger = [v for v in all_yen if v > amount]
                if larger:
                    fields["total_amount"] = f"{max(larger):.2f}"
        except (ValueError, TypeError):
            pass

    if "amount" in fields and "tax" in fields and "total_amount" in fields:
        try:
            amount = float(fields["amount"])
            tax = float(fields["tax"])
            total = float(fields["total_amount"])
            if abs(amount + tax - total) > 0.1 and total > amount and tax > 0:
                fields["amount"] = f"{total - tax:.2f}"
        except (ValueError, TypeError):
            pass

    # ── 阶段2：推导（用已有字段补全缺失字段） ──

    if "tax" not in fields and "total_amount" in fields and "amount" in fields:
        try:
            total = float(fields["total_amount"])
            amount = float(fields["amount"])
            if total > amount:
                fields["tax"] = f"{total - amount:.2f}"
        except (ValueError, TypeError):
            pass

    if "amount" not in fields and "total_amount" in fields and "tax" in fields:
        try:
            total = float(fields["total_amount"])
            tax = float(fields["tax"])
            if total > tax:
                fields["amount"] = f"{total - tax:.2f}"
        except (ValueError, TypeError):
            pass

    if "tax" not in fields and "amount" in fields:
        try:
            amount_val = float(fields["amount"])
            if amount_val > 0:
                all_yen = re.findall(r"[¥￥]\s*([0-9]+\.[0-9]{2})", normalized)
                for y in all_yen:
                    y_val = float(y)
                    if 0 < y_val < amount_val:
                        pct = round(y_val / amount_val * 100)
                        if pct in (1, 3, 5, 6, 9, 10, 13):
                            fields["tax"] = y
                            fields["tax_rate"] = f"{pct}%"
                            if "total_amount" not in fields:
                                fields["total_amount"] = f"{amount_val + y_val:.2f}"
                            break
        except (ValueError, TypeError):
            pass

    if "tax_rate" not in fields and "amount" in fields and "tax" in fields:
        try:
            amt_v = float(fields["amount"])
            tax_v = float(fields["tax"])
            if amt_v > 0:
                pct = round(tax_v / amt_v * 100)
                if pct in (1, 3, 5, 6, 9, 10, 13):
                    fields["tax_rate"] = f"{pct}%"
        except (ValueError, TypeError):
            pass

    # 火车票/高铁票：标准税率 9%（铁路旅客运输服务，2019-04-01 起）
    # 票面"票价"是含税总价，OCR 易把它误识别为不含税金额导致税额=0
    # 此处按 9% 反推 amount/tax，覆盖之前流程的错误推断（除非票面注明"免税"）
    if (
        is_train_ticket(fields, normalized)
        and "total_amount" in fields
        and "免税" not in normalized
    ):
        fields.setdefault("tax_rate", "9%")
        try:
            current_tax_val = float(fields.get("tax", "") or 0)
        except ValueError:
            current_tax_val = 0.0
        if current_tax_val == 0.0:
            try:
                total = float(fields["total_amount"])
                if total > 0:
                    amount_val = round(total / 1.09, 2)
                    tax_val = round(total - amount_val, 2)
                    fields["amount"] = f"{amount_val:.2f}"
                    fields["tax"] = f"{tax_val:.2f}"
            except (ValueError, TypeError):
                pass

    # 火车票销方固定为"中国铁路"：强制覆盖前面可能因 OCR 误识别（如站名"驻马店"）
    # 写入的错误销方。电子客票的销方在票面上不显示具体集团公司，统一标识"中国铁路"
    if is_train_ticket(fields, normalized):
        fields["seller_name"] = "中国铁路"

    # 火车票站点提取（多种格式）
    # 格式1: 郑州东 G547 信阳东
    # 使用 finditer 枚举全部候选，过滤掉包含票面噪声词（"国家税务总局监制"等水印 OCR 后）的误匹配
    _STATION_NOISE_WORDS = (
        "客票", "监制", "国家", "税务", "总局", "发票", "电子", "铁路",
        "省税", "骨郁", "子客", "总公", "集团", "车票",
    )
    for match in re.finditer(
        r"([\u4e00-\u9fff]{2,6})\s+([GDCZT]\d{1,4})\s+([\u4e00-\u9fff]{2,6})", normalized
    ):
        from_candidate = match.group(1)
        to_candidate = match.group(3)
        if any(w in from_candidate or w in to_candidate for w in _STATION_NOISE_WORDS):
            continue
        if from_candidate == to_candidate:
            continue
        fields["from_station"] = from_candidate
        fields["train_no"] = match.group(2)
        fields["to_station"] = to_candidate
        break

    # 格式2: xxx站 Pinyin G547
    if "from_station" not in fields:
        m_from = re.search(r"([^\s]{2,10}站)\s+([A-Z][a-z]+)\s+([GDCZT]\d{1,4})", normalized)
        if m_from:
            fields["from_station"] = m_from.group(1)
            fields["train_no"] = m_from.group(3)

    if "to_station" not in fields:
        m_to = re.search(
            r"\b([GDCZT]\d{1,4})\b[\s\S]{0,80}?([^\s]{2,10}站)\s+([A-Z][a-z]+)", normalized
        )
        if m_to:
            fields["train_no"] = m_to.group(1)
            fields["to_station"] = m_to.group(2)

    # 乘车日期和时间（火车票专用）
    travel_date_match = re.search(
        r"(\d{4})年?(\d{1,2})月?(\d{1,2})日?\s*(\d{1,2})[:：](\d{2})开?", normalized
    )
    if travel_date_match:
        fields["travel_date"] = (
            f"{travel_date_match.group(1)}\u5e74{travel_date_match.group(2)}\u6708{travel_date_match.group(3)}\u65e5"
        )
        fields["depart_time"] = f"{travel_date_match.group(4)}:{travel_date_match.group(5)}"

    # 火车票防御：若 date 与 travel_date 相同，说明 OCR 把乘车日期误识别为开票日期
    # （没有"开票日期"标签时格式1会匹配到位置靠前的乘车日期）
    # 此时清空 date，避免 RPA 验真等环节使用错误的开票日期
    if (
        is_train_ticket(fields, normalized)
        and fields.get("date")
        and fields.get("travel_date")
        and fields["date"] == fields["travel_date"]
    ):
        del fields["date"]

    # 乘客姓名（仅火车票）
    # 注意：不在此处为非火车票提取乘客姓名，避免匹配到大写金额如"圆贰角整"
    if is_train_ticket(fields, normalized) and "passenger_name" not in fields:
        # 排除列表：标签性文本和大写金额字符
        exclude_labels = [
            "购票人",
            "购买方",
            "销售方",
            "购方",
            "销方",
            "购买",
            "销售",
            "名称",
            "电子客票",
            "客票",
        ]
        amount_chars = "壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分圆整"

        # 方法1: 从"姓名"或"乘客"标签提取
        # 使用非贪婪匹配，并在常见关键词前停止
        name_label_match = re.search(
            r"(?:姓名|乘客)[::：\s]*([\u4e00-\u9fff]{2,4}?)(?:身份|证件|电子|票价|车次|\s|\d|$)",
            normalized,
        )
        if name_label_match:
            name = name_label_match.group(1)
            if name not in exclude_labels and not any(c in amount_chars for c in name):
                fields["passenger_name"] = name

        # 方法2: 从身份证号后面提取
        if "passenger_name" not in fields:
            name_match = re.search(r"\d{4,6}\*+\d{4}\s*([\u4e00-\u9fff]{2,6})", normalized)
            if name_match:
                name = name_match.group(1)
                # 移除后缀关键词
                for suffix in ["电子客票", "电子客", "电子", "客票", "购买", "销售", "电"]:
                    if name.endswith(suffix) and len(name) > len(suffix):
                        name = name[: -len(suffix)]
                        break
                # 验证不是排除列表中的文本
                if name not in exclude_labels and not any(c in amount_chars for c in name):
                    fields["passenger_name"] = name

    if is_flight_ticket(fields, normalized):
        fields.pop("train_no", None)
        fields.pop("seat_class", None)
        fields.pop("seat_number", None)

        if "passenger_name" not in fields:
            pn = re.search(r"(?:旅客姓名|姓名)[::：\s]*([\u4e00-\u9fff]{2,4})", normalized)
            if pn:
                fields["passenger_name"] = pn.group(1)

        if "flight_no" not in fields:
            fm = re.search(r"(?:航班号|航班)[::：\s]*([A-Z0-9]{2}\d{3,4})", normalized)
            if not fm:
                fm = re.search(r"\b([A-Z]{2}\d{3,4})\b", normalized)
            if fm:
                fields["flight_no"] = fm.group(1)

        if "airline" not in fields:
            am = re.search(r"(?:承运人|航空公司)[::：\s]*([\u4e00-\u9fff]+(?:航空|航空公司))", normalized)
            if am:
                fields["airline"] = am.group(1)

        if "cabin_class" not in fields:
            cm = re.search(r"(?:座位等级|舱位)[::：\s]*(\S{1,10})", normalized)
            if cm:
                fields["cabin_class"] = cm.group(1)

        if "ticket_number" not in fields:
            tm = re.search(r"(?:电子客票号码|客票号码|客票号)[::：\s]*(\d{10,15})", normalized)
            if tm:
                fields["ticket_number"] = tm.group(1)

        fare_m = re.search(r"票价[::：\s]*[¥￥]?\s*([0-9]+\.?[0-9]*)", normalized)
        if fare_m:
            fields.setdefault("fare", fare_m.group(1))

        fuel_m = re.search(r"燃油附加费[::：\s]*[¥￥]?\s*([0-9]+\.?[0-9]*)", normalized)
        if fuel_m:
            fields.setdefault("fuel_surcharge", fuel_m.group(1))

        caac_m = re.search(r"(?:民航发展基金|民航基金)[::：\s]*[¥￥]?\s*([0-9]+\.?[0-9]*)", normalized)
        if caac_m:
            fields.setdefault("caac_fund", caac_m.group(1))

        other_tax_m = re.search(r"其他税费[::：\s]*[¥￥]?\s*([0-9]+\.?[0-9]*)", normalized)
        if other_tax_m:
            fields.setdefault("other_tax", other_tax_m.group(1))

        insurance_m = re.search(r"保险费[::：\s]*[¥￥]?\s*([0-9]+\.?[0-9]*)", normalized)
        if insurance_m:
            fields.setdefault("insurance", insurance_m.group(1))

        vat_rate_m = re.search(r"增值税税率[::：\s]*([0-9]+\.?[0-9]*)\s*%?", normalized)
        if vat_rate_m:
            fields.setdefault("tax_rate", f"{vat_rate_m.group(1)}%")

        vat_tax_m = re.search(r"增值税税额[::：\s]*[¥￥]?\s*([0-9]+\.?[0-9]*)", normalized)
        if vat_tax_m:
            fields.setdefault("tax", vat_tax_m.group(1))

        if "amount" not in fields and "fare" in fields:
            try:
                fare_v = float(fields["fare"])
                fuel_v = float(fields.get("fuel_surcharge", "0"))
                fields["amount"] = f"{fare_v + fuel_v:.2f}"
            except (ValueError, TypeError):
                pass

        if "total_amount" not in fields:
            heji_m = re.search(r"合计[::：\s]*[¥￥]?\s*([0-9]+\.?[0-9]*)", normalized)
            if heji_m:
                fields["total_amount"] = heji_m.group(1)

        fill_date_m = re.search(r"填开日期[::：\s]*(\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?)", normalized)
        if fill_date_m and "date" not in fields:
            fields["date"] = fill_date_m.group(1)

        fields.setdefault("invoice_type", "航空运输电子客票行程单")

    return fields
