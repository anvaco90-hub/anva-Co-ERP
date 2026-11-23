import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { STATUS_LABELS } from "../../lib/projects";
import { FieldError, fieldErrorClass } from "../../components/FieldError";

const EMPTY = {
  project_code: "",
  project_name: "",
  client_name: "",
  site_address: "",
  budget_total: 0,
  start_date: "",
  end_date: "",
  status: "planning",
};

// ฟังก์ชันแปลงตัวเลขให้เป็นข้อความบอกหน่วย (เช่น พัน, หมื่น, แสน, ล้าน)
function getNumberUnitLabel(num) {
  const n = Number(num);
  if (isNaN(n) || n === 0) return "";
  if (n >= 1000000)
    return `(${(n / 1000000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ล้านบาท)`;
  if (n >= 100000)
    return `(${(n / 100000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} แสนบาท)`;
  if (n >= 10000)
    return `(${(n / 10000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} หมื่นบาท)`;
  if (n >= 1000)
    return `(${(n / 1000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} พันบาท)`;
  return "";
}

export default function ProjectForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data, error }) => {
        if (error) return setError("โหลดข้อมูลโครงการไม่สำเร็จ");
        setForm({
          ...EMPTY,
          ...data,
          start_date: data.start_date ?? "",
          end_date: data.end_date ?? "",
        });
        if (data.updated_at) setUpdatedAt(data.updated_at);
      });
  }, [id]);

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    if (errors[k]) {
      setErrors((prev) => ({ ...prev, [k]: "" }));
    }
  };

  async function save() {
    setError("");
    const newErrors = {};

    if (!form.project_code.trim()) {
      newErrors.project_code = "ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณาระบุรหัสโครงการ)";
    }
    if (!form.project_name.trim()) {
      newErrors.project_name = "ช่องนี้ยังไม่กรอก ช่องว่างนะ (กรุณาระบุชื่อโครงการ)";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setError("ไม่สามารถบันทึกได้: มีช่องที่ยังไม่ได้กรอก (กรุณาตรวจสอบช่องที่มีข้อความเตือนสีแดง)");
      return;
    }

    setBusy(true);
    const payload = {
      ...form,
      project_code: form.project_code.trim(),
      project_name: form.project_name.trim(),
      budget_total: Number(form.budget_total) || 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      updated_at: new Date().toISOString(), // บันทึกเวลาที่แก้ไขล่าสุด
    };
    delete payload.id;
    delete payload.created_at;

    const q = id
      ? supabase
          .from("projects")
          .update(payload)
          .eq("id", id)
          .select("id, updated_at")
          .single()
      : supabase.from("projects").insert(payload).select("id").single();
    const { data, error } = await q;
    setBusy(false);

    if (error) {
      setError(
        error.code === "23505"
          ? "รหัสโครงการนี้ถูกใช้แล้ว"
          : "บันทึกไม่สำเร็จ (ตรวจสอบสิทธิ์การใช้งาน)",
      );
      return;
    }
    navigate(`/projects/${data.id}`);
  }

  const valid = form.project_code.trim() && form.project_name.trim();

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {id ? "แก้ไขโครงการ" : "สร้างโครงการ"}
        </h1>
        {id && updatedAt && (
          <span className="text-xs text-steel-500">
            แก้ไขล่าสุด: {new Date(updatedAt).toLocaleString("th-TH")}
          </span>
        )}
      </div>
      <div className="mt-5 grid gap-4 rounded-lg bg-white p-5 md:grid-cols-2">
        <label className="text-sm">
          <span className="font-semibold text-steel-800">รหัสโครงการ *</span>
          <input
            className={fieldErrorClass(errors.project_code, "input mt-1 w-full")}
            placeholder="เช่น PRJ-2026-001"
            value={form.project_code}
            onChange={set("project_code")}
          />
          <FieldError error={errors.project_code} />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-steel-800">ชื่อโครงการ *</span>
          <input
            className={fieldErrorClass(errors.project_name, "input mt-1 w-full")}
            placeholder="เช่น โครงการก่อสร้างอาคารสำนักงาน"
            value={form.project_name}
            onChange={set("project_name")}
          />
          <FieldError error={errors.project_name} />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-steel-800">ชื่อลูกค้า</span>
          <input
            className="input mt-1 w-full"
            placeholder="ชื่อบริษัทหรือผู้ว่าจ้าง"
            value={form.client_name ?? ""}
            onChange={set("client_name")}
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-steel-800">งบประมาณรวม (บาท)</span>
          <input
            className="input mt-1 w-full"
            type="number"
            min="0"
            step="0.01"
            value={form.budget_total}
            onChange={set("budget_total")}
          />
          {/* แสดงหน่วยนับเงิน เพื่อให้ผู้กรอกรู้ว่าเป็น พัน/หมื่น/แสน/ล้าน */}
          {form.budget_total > 0 && (
            <span className="text-xs text-steel-500 mt-1 block">
              {getNumberUnitLabel(form.budget_total)}
            </span>
          )}
        </label>
        <label className="text-sm md:col-span-2">
          <span className="font-semibold text-steel-800">ที่อยู่หน้างาน</span>
          <textarea
            className="input mt-1 w-full"
            rows={2}
            value={form.site_address ?? ""}
            onChange={set("site_address")}
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-steel-800">วันเริ่มงาน</span>
          <input
            className="input mt-1 w-full"
            type="date"
            value={form.start_date}
            onChange={set("start_date")}
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-steel-800">วันสิ้นสุด</span>
          <input
            className="input mt-1 w-full"
            type="date"
            value={form.end_date}
            onChange={set("end_date")}
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-steel-800">สถานะ</span>
          <select
            className="input mt-1 w-full"
            value={form.status}
            onChange={set("status")}
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs sm:text-sm font-semibold text-rose-800 flex items-center gap-2">
          <span></span>
          <span>{error}</span>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          className="btn-primary"
          onClick={save}
          disabled={busy}
        >
          {busy ? "กำลังบันทึก..." : "บันทึกโครงการ"}
        </button>
        <Link to={id ? `/projects/${id}` : "/projects"} className="btn-ghost">
          ยกเลิก
        </Link>
      </div>
    </div>
  );
}
