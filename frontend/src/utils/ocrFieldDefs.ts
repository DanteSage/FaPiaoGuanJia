import type { InvoiceCategory } from "../types";

export type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  validate?: (value: string) => boolean;
};

const COMMON_FIELDS: FieldDef[] = [
  { key: "invoice_code", label: "发票代码", placeholder: "10-12位数字", validate: (v) => /^\d{10,12}$/.test(v) },
  { key: "invoice_number", label: "发票号码" },
  {
    key: "date",
    label: "开票日期",
    placeholder: "2025-12-25 / 2025年12月25日",
    validate: (v) =>
      /^(\d{4})([-/.年])(\d{1,2})([-/.月])(\d{1,2})(日)?$/.test(v) ||
      /^\d{4}-\d{2}-\d{2}$/.test(v) ||
      /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v),
  },
  { key: "total_amount", label: "价税合计", placeholder: "170.00", validate: (v) => /^(\d+)(\.\d{1,2})?$/.test(v) },
  { key: "amount", label: "金额", placeholder: "155.96", validate: (v) => /^(\d+)(\.\d{1,2})?$/.test(v) },
  { key: "tax", label: "税额", placeholder: "14.04", validate: (v) => /^(\d+)(\.\d{1,2})?$/.test(v) },
  { key: "invoice_type", label: "发票类型" },
  { key: "buyer_name", label: "购买方名称" },
  { key: "buyer_tax_id", label: "购买方税号/统一代码", validate: (v) => /^[0-9A-Z]{10,20}$/.test(v) },
  { key: "seller_name", label: "销售方名称" },
];

const VAT_EXTRA: FieldDef[] = [
  { key: "tax_rate", label: "税率", placeholder: "0.09" },
  { key: "seller_tax_id", label: "销售方税号", validate: (v) => /^[0-9A-Z]{10,20}$/.test(v) },
  { key: "remark", label: "备注" },
];

const TRAIN_EXTRA: FieldDef[] = [
  { key: "passenger_name", label: "乘客姓名" },
  { key: "id_number", label: "身份证号" },
  { key: "train_no", label: "车次", placeholder: "G547", validate: (v) => /^[GDCZTKL]?\d{1,4}$/i.test(v) },
  { key: "from_station", label: "始发站" },
  { key: "to_station", label: "到达站" },
  { key: "travel_date", label: "乘车日期" },
  { key: "depart", label: "发车时间", placeholder: "09:26", validate: (v) => /^\d{1,2}:\d{2}$/.test(v) },
  { key: "seat_level", label: "席别" },
  { key: "seat", label: "座位号" },
  { key: "carriage", label: "车厢" },
];

const FLIGHT_EXTRA: FieldDef[] = [
  { key: "passenger_name", label: "旅客姓名" },
  { key: "id_number", label: "身份证号" },
  { key: "flight_no", label: "航班号", placeholder: "CA1234" },
  { key: "airline", label: "承运人" },
  { key: "departure_airport", label: "起飞机场" },
  { key: "arrival_airport", label: "到达机场" },
  { key: "departure_time", label: "起飞时间", placeholder: "2025-12-25 09:26" },
  { key: "cabin_class", label: "座位等级" },
  { key: "ticket_number", label: "电子客票号码" },
  { key: "fare", label: "票价" },
  { key: "fuel_surcharge", label: "燃油附加费" },
  { key: "caac_fund", label: "民航发展基金" },
  { key: "other_tax", label: "其他税费" },
  { key: "insurance", label: "保险费" },
];

const RIDESHARE_EXTRA: FieldDef[] = [
  { key: "order_no", label: "订单号" },
  { key: "start_location", label: "起点" },
  { key: "end_location", label: "终点" },
  { key: "start_time", label: "上车时间" },
  { key: "end_time", label: "下车时间" },
  { key: "distance", label: "行驶距离" },
  { key: "duration", label: "行驶时长" },
  { key: "vehicle_type", label: "车型" },
];

const TAXI_EXTRA: FieldDef[] = [
  { key: "start_location", label: "起点" },
  { key: "end_location", label: "终点" },
  { key: "distance", label: "行驶距离" },
  { key: "fare", label: "车费", validate: (v) => /^(\d+)(\.\d{1,2})?$/.test(v) },
];

const HOTEL_EXTRA: FieldDef[] = [
  { key: "check_in_date", label: "入住日期" },
  { key: "check_out_date", label: "离店日期" },
  { key: "room_type", label: "房型" },
  { key: "nights", label: "入住夜数", validate: (v) => /^\d+$/.test(v) },
  { key: "room_rate", label: "房费/晚", validate: (v) => /^(\d+)(\.\d{1,2})?$/.test(v) },
];

const TOLL_EXTRA: FieldDef[] = [
  { key: "tax_rate", label: "税率", placeholder: "0.03" },
  { key: "entry_station", label: "入口收费站" },
  { key: "exit_station", label: "出口收费站" },
];

const CATEGORY_EXTRAS: Record<InvoiceCategory, FieldDef[]> = {
  vat_special: VAT_EXTRA,
  vat_normal: VAT_EXTRA,
  electronic: VAT_EXTRA,
  toll: TOLL_EXTRA,
  train: TRAIN_EXTRA,
  flight: FLIGHT_EXTRA,
  rideshare: RIDESHARE_EXTRA,
  rideshare_invoice: RIDESHARE_EXTRA,
  hotel: HOTEL_EXTRA,
  taxi: TAXI_EXTRA,
  other: [],
};

export function getFieldDefsByCategory(category?: InvoiceCategory): FieldDef[] {
  const extras = category ? CATEGORY_EXTRAS[category] ?? [] : [];
  const merged: FieldDef[] = [...COMMON_FIELDS];
  const seen = new Set(merged.map((d) => d.key));
  for (const def of extras) {
    if (!seen.has(def.key)) {
      merged.push(def);
      seen.add(def.key);
    }
  }
  return merged;
}

export function getFieldLabel(key: string, category?: InvoiceCategory): string {
  const defs = getFieldDefsByCategory(category);
  return defs.find((d) => d.key === key)?.label ?? key;
}

export const CRITICAL_FIELD_KEYS = ["invoice_number", "total_amount", "date"] as const;

export type CriticalFieldKey = typeof CRITICAL_FIELD_KEYS[number];

export const CRITICAL_FIELD_LABELS: Record<CriticalFieldKey, string> = {
  invoice_number: "发票号码",
  total_amount: "价税合计",
  date: "开票日期",
};

export function getMissingCriticalFields(fields: Record<string, string>): CriticalFieldKey[] {
  return CRITICAL_FIELD_KEYS.filter((key) => !fields[key]?.trim());
}
