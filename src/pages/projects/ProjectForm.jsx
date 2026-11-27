import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import CustomerSelectField from "../../components/CustomerSelectField";
import { STATUS_LABELS } from "../../lib/projects";
import { FieldError, fieldErrorClass } from "../../components/FieldError";
import { ArrowLeft, AlertCircle, Check } from "lucide-react";

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
    <div className="max-w-4xl mx-auto space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={id ? `/projects/${id}` : "/projects"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-2xs transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{id ? "กลับรายละเอียดโครงการ" : "กลับรายการโครงการ"}</span>
          </Link>
          <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {id ? "แก้ไขโครงการ" : "สร้างโครงการใหม่"}
          </h1>
        </div>
        {id && updatedAt && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            แก้ไขล่าสุด: {new Date(updatedAt).toLocaleString("th-TH")}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              รหัสโครงการ *
            </label>
            <input
              className={fieldErrorClass(errors.project_code, "input text-xs font-mono font-bold w-full")}
              placeholder="เช่น PRJ-2026-001"
              value={form.project_code}
              onChange={set("project_code")}
            />
            <FieldError error={errors.project_code} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              ชื่อโครงการ *
            </label>
            <input
              className={fieldErrorClass(errors.project_name, "input text-xs w-full")}
              placeholder="เช่น โครงการติดตั้งระบบโซลาร์เซลล์..."
              value={form.project_name}
              onChange={set("project_name")}
            />
            <FieldError error={errors.project_name} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              ชื่อลูกค้า
            </label>
            <CustomerSelectField
              placeholder="ค้นหาจากสมุดรายชื่อ หรือพิมพ์ชื่อบริษัท/ผู้ว่าจ้าง..."
              value={form.client_name ?? ""}
              onChange={(val) => set("client_name")({ target: { value: val } })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              งบประมาณรวม (บาท)
            </label>
            <input
              className="input text-xs font-mono w-full"
              type="number"
              min="0"
              step="0.01"
              value={form.budget_total}
              onChange={set("budget_total")}
            />
            {form.budget_total > 0 && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                {getNumberUnitLabel(form.budget_total)}
              </span>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              ที่อยู่หน้างาน
            </label>
            <textarea
              className="input text-xs w-full leading-relaxed"
              rows={2}
              placeholder="ระบุที่ตั้งหน้างานหรือสถานที่ติดตั้ง..."
              value={form.site_address ?? ""}
              onChange={set("site_address")}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              วันเริ่มงาน
            </label>
            <input
              className="input text-xs w-full"
              type="date"
              value={form.start_date}
              onChange={set("start_date")}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              วันสิ้นสุด
            </label>
            <input
              className="input text-xs w-full"
              type="date"
              value={form.end_date}
              onChange={set("end_date")}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              สถานะโครงการ
            </label>
            <select
              className="input text-xs w-full"
              value={form.status}
              onChange={set("status")}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-3 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Link to={id ? `/projects/${id}` : "/projects"} className="btn-ghost">
            ยกเลิก
          </Link>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={save}
            disabled={busy}
          >
            <Check className="h-4 w-4" />
            <span>{busy ? "กำลังบันทึก..." : "บันทึกโครงการ"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
