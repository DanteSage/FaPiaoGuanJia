
export type ReimbursementStatus = "draft" | "pending_payment" | "paid";

export type ReimbursementFolder = {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ReimbursementType = "travel" | "transportation" | "accommodation" | "office" | "entertainment" | "meal" | "training" | "communication" | "medical" | "other";

export type PaymentMethod = "bank_transfer" | "cash" | "company_card" | "alipay" | "wechat";

export type ReimbursementItem = {
  id: string;
  invoiceId: string;
  invoiceName: string;
  invoiceCode?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  amount: number;
  taxAmount?: number;
  category: string;
  purpose?: string;
  notes?: string;
  attachments?: string[];
  invoiceDeleted?: boolean;
};

export type ApprovalRecord = {
  id: string;
  approver: string;
  action: "submit" | "approve" | "reject" | "return";
  comment?: string;
  timestamp: number;
};

export type ReimbursementStatusUpdateExtra = {
  approver?: string;
  rejectReason?: string;
  comment?: string;
};

export type Reimbursement = {
  id: string;
  code: string;
  title: string;
  type: ReimbursementType;
  applicant: string;
  applicantId?: string;
  department: string;
  sales?: string;
  costPerDay?: string;
  purpose: string;
  status: ReimbursementStatus;
  items: ReimbursementItem[];
  totalAmount: number;
  totalTax: number;
  approvedAmount?: number;
  paymentMethod?: PaymentMethod;
  bankAccount?: string;
  bankName?: string;
  createdAt: number;
  updatedAt: number;
  submittedAt?: number;
  approvedAt?: number;
  paidAt?: number;
  approver?: string;
  rejectReason?: string;
  approvalRecords: ApprovalRecord[];
  notes?: string;
  tags?: string[];
  folderId?: string | null;
};

export type ReimbursementFilter = {
  status?: ReimbursementStatus[];
  type?: ReimbursementType[];
  applicant?: string;
  department?: string;
  dateRange?: { start: number; end: number };
  amountRange?: { min: number; max: number };
  search?: string;
  folderId?: string | null;
};

export type ReimbursementSort = {
  field: "createdAt" | "totalAmount" | "updatedAt" | "status" | "type";
  order: "asc" | "desc";
};

export type ReimbursementStats = {
  total: number;
  count: number;
  byStatus: Record<ReimbursementStatus, number>;
  byType: Record<string, number>;
  avgAmount: number;
  pendingCount: number;
  pendingAmount: number;
};
