import { useState } from "react";
import type { ReimbursementType, ReimbursementFolder } from "../../types/reimbursement";

type CreateDialogProps = {
  folders?: ReimbursementFolder[];
  defaultValues?: { applicant?: string; department?: string; sales?: string };
  onConfirm: (title: string, applicant: string, department: string, purpose: string, type: ReimbursementType, sales?: string, costPerDay?: string, folderId?: string | null) => void;
  onCancel: () => void;
};

const TYPE_OPTIONS = [
  { value: "travel", label: "差旅费" },
  { value: "transportation", label: "交通费" },
  { value: "accommodation", label: "住宿费" },
  { value: "office", label: "办公费" },
  { value: "entertainment", label: "招待费" },
  { value: "meal", label: "餐饮费" },
  { value: "training", label: "培训费" },
  { value: "communication", label: "通讯费" },
  { value: "medical", label: "医疗费" },
  { value: "other", label: "其他" }
];

export function CreateDialog({ folders, defaultValues, onConfirm, onCancel }: CreateDialogProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ReimbursementType>("other");
  const [applicant, setApplicant] = useState(defaultValues?.applicant || "");
  const [department, setDepartment] = useState(defaultValues?.department || "");
  const [purpose, setPurpose] = useState("");
  const [sales, setSales] = useState(defaultValues?.sales || "");
  const [costPerDay, setCostPerDay] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!title.trim() || !applicant.trim() || !department.trim() || !purpose.trim()) return;
    onConfirm(title, applicant, department, purpose, type, sales, costPerDay, folderId || null);
  };

  return (
    <div className="dialogOverlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: "520px" }}>
        <div className="dialogHeader">
          <div className="dialogTitle">新建报销</div>
          <button className="dialogCloseBtn" onClick={onCancel}>×</button>
        </div>
        <div className="dialogBody">
          <div className="dialogField">
            <label>报销标题</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：2024年1月差旅费报销" />
          </div>
          <div className="dialogField">
            <label>报销类型</label>
            <select value={type} onChange={e => setType(e.target.value as ReimbursementType)}>
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="dialogField">
              <label>申请人</label>
              <input value={applicant} onChange={e => setApplicant(e.target.value)} placeholder="请输入姓名" />
            </div>
            <div className="dialogField">
              <label>部门</label>
              <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="请输入部门" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="dialogField">
              <label>销售</label>
              <input value={sales} onChange={e => setSales(e.target.value)} placeholder="请输入销售" />
            </div>
            <div className="dialogField">
              <label>费用/天</label>
              <input value={costPerDay} onChange={e => setCostPerDay(e.target.value)} placeholder="请输入费用/天" />
            </div>
          </div>
          {folders && folders.length > 0 && (
            <div className="dialogField">
              <label>文件夹</label>
              <select value={folderId || ""} onChange={e => setFolderId(e.target.value || null)}>
                <option value="">未分类</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="dialogField">
            <label>报销事由</label>
            <textarea value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="请详细说明报销事由" rows={3} />
          </div>
        </div>
        <div className="dialogFooter">
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={handleSubmit} disabled={!title || !applicant || !department || !purpose}>创建</button>
        </div>
      </div>
    </div>
  );
}
