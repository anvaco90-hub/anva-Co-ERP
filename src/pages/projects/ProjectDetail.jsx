import { useCallback, useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { BUDGET_CATEGORIES, baht, canEditProjects } from "../../lib/projects";
import {
  computeProjectFinancialSummary,
  isCancelledStatus,
  normalizeBudgetCategory,
} from "../../lib/projectFinancials";
import StatusBadge from "./StatusBadge";
import { FieldError, fieldErrorClass } from "../../components/FieldError";
import {
  SIMULATED_PROJECTS,
  PROJECT_DETAILED_BUDGETS,
  SIMULATED_PURCHASE_ORDERS,
  SIMULATED_EXPENSES,
} from "../../lib/dashboardSimulationData";
import {
  DollarSign,
  Layers,
  FileText,
  ShoppingCart,
  Receipt,
  Package,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  MapPin,
  Download,
  Warehouse,
} from "lucide-react";

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

function calcDurationDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  const diff = Math.round((e - s) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff + 1 : null;
}

async function safeListQuery(promise, label) {
  try {
    const res = await promise;
    if (res?.error) {
      console.warn(`ProjectDetail [${label}] warning:`, res.error.message || res.error);
      return [];
    }
    return res?.data || [];
  } catch (err) {
    console.warn(`ProjectDetail [${label}] query failed:`, err);
    return [];
  }
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const canEdit = canEditProjects(profile.role);

  const [project, setProject] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [items, setItems] = useState([]);
  const [purchaseRequisitions, setPurchaseRequisitions] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [boqs, setBoqs] = useState([]);
  const [stockIssues, setStockIssues] = useState([]);
  const [stockAdjustments, setStockAdjustments] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [isSimulation, setIsSimulation] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [importingBoq, setImportingBoq] = useState(false);

  // View Mode: 'categories' (สรุปรายหมวด) | 'itemized' (แจกแจงรายการอุปกรณ์ย่อย)
  const [viewMode, setViewMode] = useState("categories");

  // New Item Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [category, setCategory] = useState(BUDGET_CATEGORIES[0]);
  const [itemName, setItemName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("รายการ");
  const [unitCost, setUnitCost] = useState("");
  const [itemFormErrors, setItemFormErrors] = useState({});

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editItem, setEditItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setActionError("");
    try {
      const pRes = await supabase.from("projects").select("*").eq("id", id).maybeSingle();

      if (pRes.data) {
        setProject(pRes.data);
        setIsSimulation(false);

        const [
          dbItems,
          dbPRs,
          dbPOs,
          dbExps,
          dbQuotes,
          dbBoqs,
          dbIssues,
          dbReturns,
          dbInvoices,
        ] = await Promise.all([
          safeListQuery(
            supabase.from("project_budget_items").select("*").eq("project_id", id).order("category"),
            "project_budget_items"
          ),
          safeListQuery(
            supabase.from("purchase_requisitions").select("*").eq("project_id", id).order("request_date", { ascending: false }),
            "purchase_requisitions"
          ),
          safeListQuery(
            supabase.from("purchase_orders").select("*, vendors(vendor_name)").eq("project_id", id).order("order_date", { ascending: false }),
            "purchase_orders"
          ),
          safeListQuery(
            supabase.from("expenses").select("*, vendors(vendor_name)").eq("project_id", id).order("expense_date", { ascending: false }),
            "expenses"
          ),
          safeListQuery(
            supabase.from("quotations").select("*").eq("project_id", id).order("issue_date", { ascending: false }),
            "quotations"
          ),
          safeListQuery(
            supabase.from("boqs").select("*").eq("project_id", id).order("created_at", { ascending: false }),
            "boqs"
          ),
          safeListQuery(
            supabase
              .from("stock_issues")
              .select("id, issue_no, issue_date, notes, created_at, stock_issue_items(quantity, unit_cost, inventory_items(id, item_code, item_name, unit, avg_unit_cost))")
              .eq("project_id", id)
              .order("created_at", { ascending: false }),
            "stock_issues"
          ),
          safeListQuery(
            supabase
              .from("stock_adjustments")
              .select("id, adj_no, qty_before, qty_after, unit_cost, reason, created_at, source_project_id, inventory_items(id, item_code, item_name, unit, avg_unit_cost)")
              .eq("source_project_id", id)
              .order("created_at", { ascending: false }),
            "stock_adjustments"
          ),
          safeListQuery(
            supabase
              .from("sales_invoices")
              .select("id, invoice_no, issue_date, due_date, total_amount, paid_amount, remaining_amount, status, is_opening_balance")
              .eq("project_id", id)
              .order("issue_date", { ascending: false }),
            "sales_invoices"
          ),
        ]);

        setItems(dbItems);
        setPurchaseRequisitions(dbPRs);
        setPurchaseOrders(dbPOs);
        setExpenses(dbExps);
        setQuotations(dbQuotes);
        setBoqs(dbBoqs);
        setStockIssues(dbIssues);
        setStockAdjustments(dbReturns);
        setSalesInvoices(dbInvoices);
        return;
      }

      // Only allow simulation mode if explicitly navigating to a demo ID (prj-...)
      const simMatch = SIMULATED_PROJECTS.find((p) => p.id === id);
      if (simMatch) {
        setProject({
          ...simMatch,
          client_name: simMatch.client_name || simMatch.customer_name,
          budget_total: simMatch.budget_total || simMatch.contract_amount * 0.8,
        });
        setItems(PROJECT_DETAILED_BUDGETS[id] || []);
        const simPOs = SIMULATED_PURCHASE_ORDERS.filter(
          (po) => po.project_code === simMatch.project_code || po.project_name?.includes("Solar")
        );
        setPurchaseOrders(simPOs);
        setExpenses(SIMULATED_EXPENSES.slice(0, 3));
        setPurchaseRequisitions([]);
        setQuotations([]);
        setBoqs([]);
        setStockIssues([]);
        setStockAdjustments([]);
        setSalesInvoices([]);
        setIsSimulation(true);
      } else {
        setProject(null);
        setNotFound(true);
      }
    } catch (err) {
      console.error("Failed loading project detail:", err);
      setProject(null);
      setActionError("ไม่สามารถโหลดข้อมูลโครงการได้");
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const financial = useMemo(
    () =>
      computeProjectFinancialSummary({
        project,
        budgetItems: items,
        purchaseOrders,
        expenses,
        stockIssues,
        stockAdjustments,
        quotations,
        boqs,
        salesInvoices,
      }),
    [project, items, purchaseOrders, expenses, stockIssues, stockAdjustments, quotations, boqs, salesInvoices]
  );

  const {
    contractAmount,
    contractSourceLabel,
    totalBudget,
    budgetFromItemsOnly,
    allocatedBudget,
    poTotalSpent,
    expTotalSpent,
    netStoreCost,
    netStoreDelta,
    storeIssuedTotal,
    storeReturnedTotal,
    totalActualSpent,
    remainingBudget,
    budgetUsagePct,
    projectedGrossMargin,
    projectedGrossMarginPct,
    billedTotal,
    collectedTotal,
    activePOs,
    activeExpenses,
    activeInvoices,
    categorySummary,
  } = financial;

  const durationDays = calcDurationDays(project?.start_date, project?.end_date);

  const insertBudgetItemToDb = async (payload) => {
    const fullInsert = await supabase
      .from("project_budget_items")
      .insert(payload)
      .select()
      .single();

    if (!fullInsert.error) return fullInsert.data;

    // Fallback if older schema only has core columns (project_id, category, budgeted_amount)
    if (/column/i.test(fullInsert.error.message || "")) {
      const minimalInsert = await supabase
        .from("project_budget_items")
        .insert({
          project_id: payload.project_id,
          category: payload.category,
          budgeted_amount: payload.budgeted_amount,
        })
        .select()
        .single();
      if (!minimalInsert.error) {
        return { ...payload, ...minimalInsert.data };
      }
      throw minimalInsert.error;
    }

    throw fullInsert.error;
  };

  // Handle adding new budget item
  const handleAddItem = async () => {
    setActionError("");
    setActionSuccess("");
    const newErrors = {};
    if (!itemName.trim()) {
      newErrors.itemName = "ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุชื่ออุปกรณ์/บริการ)";
    }
    if (!unitCost || Number(unitCost) <= 0) {
      newErrors.unitCost = "ช่องนี้ยังไม่กรอก ช่องว่างนะ (ระบุราคาต่อหน่วย)";
    }
    if (quantity === "" || Number(quantity) <= 0) {
      newErrors.quantity = "ช่องนี้ยังไม่กรอก ช่องว่างนะ (จำนวนต้องมากกว่า 0)";
    }

    if (Object.keys(newErrors).length > 0) {
      setItemFormErrors(newErrors);
      return;
    }

    const qty = Number(quantity) || 1;
    const cost = Number(unitCost) || 0;
    const totalAmt = Math.round(qty * cost * 100) / 100;

    const payload = {
      project_id: id,
      category,
      item_name: itemName.trim(),
      item_code: itemCode.trim() || "-",
      quantity: qty,
      unit: unit.trim() || "รายการ",
      unit_cost: cost,
      budgeted_amount: totalAmt,
      actual_spent: 0,
      po_ref: "-",
    };

    try {
      let createdItem = { id: `bi-sim-${Date.now()}`, ...payload };
      if (!isSimulation) {
        createdItem = await insertBudgetItemToDb(payload);
      }

      setItems((prev) => [...prev, createdItem]);
      setItemName("");
      setItemCode("");
      setQuantity("1");
      setUnit("รายการ");
      setUnitCost("");
      setItemFormErrors({});
      setShowAddForm(false);
      setActionSuccess("บันทึกรายการงบประมาณเรียบร้อยแล้ว");
    } catch (err) {
      console.error("Add budget item error:", err);
      setActionError(`บันทึกรายการไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    }
  };

  // Handle importing budget items directly from latest active BOQ
  const handleImportFromBoq = async () => {
    if (isSimulation || boqs.length === 0) return;
    const targetBoq = boqs.find((b) => !isCancelledStatus(b.status)) || boqs[0];
    if (!targetBoq) return;

    setImportingBoq(true);
    setActionError("");
    setActionSuccess("");
    try {
      const { data: boqItems, error: bErr } = await supabase
        .from("boq_items")
        .select("*")
        .eq("boq_id", targetBoq.id)
        .order("sort_order", { ascending: true });

      if (bErr) throw bErr;
      if (!boqItems || boqItems.length === 0) {
        setActionError(`ไม่พบรายการย่อยใน ${targetBoq.boq_no}`);
        return;
      }

      const toInsert = [];
      for (const bi of boqItems) {
        const qty = Number(bi.quantity || 1);
        const matCost = Number(bi.total_material_cost || 0);
        const labCost = Number(bi.total_labor_cost || 0);
        const totCost = Number(bi.total_amount || 0);

        if (matCost > 0) {
          toInsert.push({
            project_id: id,
            category: BUDGET_CATEGORIES[0],
            item_code: bi.item_code || "-",
            item_name: bi.item_name,
            quantity: qty,
            unit: bi.unit || "ชุด",
            unit_cost: Number(bi.material_unit_cost || matCost / Math.max(qty, 1)),
            budgeted_amount: matCost,
            actual_spent: 0,
            po_ref: targetBoq.boq_no || "-",
          });
        }
        if (labCost > 0) {
          toInsert.push({
            project_id: id,
            category: BUDGET_CATEGORIES[1],
            item_code: bi.item_code || "-",
            item_name: `ค่าแรงติดตั้ง: ${bi.item_name}`,
            quantity: qty,
            unit: bi.unit || "ชุด",
            unit_cost: Number(bi.labor_unit_cost || labCost / Math.max(qty, 1)),
            budgeted_amount: labCost,
            actual_spent: 0,
            po_ref: targetBoq.boq_no || "-",
          });
        }
        if (matCost === 0 && labCost === 0 && totCost > 0) {
          toInsert.push({
            project_id: id,
            category: normalizeBudgetCategory(bi.category),
            item_code: bi.item_code || "-",
            item_name: bi.item_name,
            quantity: qty,
            unit: bi.unit || "รายการ",
            unit_cost: Math.round((totCost / Math.max(qty, 1)) * 100) / 100,
            budgeted_amount: totCost,
            actual_spent: 0,
            po_ref: targetBoq.boq_no || "-",
          });
        }
      }

      if (toInsert.length === 0) {
        setActionError(`รายการใน ${targetBoq.boq_no} ยังไม่มีมูลค่าต้นทุน`);
        return;
      }

      const inserted = [];
      for (const row of toInsert) {
        inserted.push(await insertBudgetItemToDb(row));
      }

      setItems((prev) => [...prev, ...inserted]);
      setActionSuccess(`นำเข้า ${inserted.length} รายการงบประมาณจาก ${targetBoq.boq_no} เรียบร้อยแล้ว`);
      setViewMode("itemized");
    } catch (err) {
      console.error("Import BOQ budget error:", err);
      setActionError(`ดึงรายการจาก BOQ ไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    } finally {
      setImportingBoq(false);
    }
  };

  // Handle editing item
  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditItem({ ...item });
  };

  const handleSaveEdit = async (itemId) => {
    if (!editItem) return;
    setActionError("");
    const qty = Number(editItem.quantity) || 1;
    const cost = Number(editItem.unit_cost) || 0;
    const totalAmt = Math.round(qty * cost * 100) / 100;
    const updatedFields = {
      category: editItem.category,
      item_code: editItem.item_code || "-",
      item_name: (editItem.item_name || "").trim() || editItem.category,
      quantity: qty,
      unit: (editItem.unit || "").trim() || "รายการ",
      unit_cost: cost,
      budgeted_amount: totalAmt,
      updated_at: new Date().toISOString(),
    };

    try {
      if (!isSimulation) {
        const { error: updErr } = await supabase
          .from("project_budget_items")
          .update(updatedFields)
          .eq("id", itemId);
        if (updErr) {
          if (/column/i.test(updErr.message || "")) {
            const { error: fbErr } = await supabase
              .from("project_budget_items")
              .update({ category: updatedFields.category, budgeted_amount: totalAmt })
              .eq("id", itemId);
            if (fbErr) throw fbErr;
          } else {
            throw updErr;
          }
        }
      }

      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, ...updatedFields } : i))
      );
      setEditingId(null);
      setEditItem(null);
      setActionSuccess("แก้ไขรายการงบประมาณเรียบร้อยแล้ว");
    } catch (err) {
      console.error("Update budget item error:", err);
      setActionError(`แก้ไขรายการไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    }
  };

  // Handle removing item
  const handleRemoveItem = async (itemId) => {
    if (!confirm("ยืนยันการลบรายการอุปกรณ์/งบประมาณนี้?")) return;
    setActionError("");
    try {
      if (!isSimulation) {
        const { error: delErr } = await supabase
          .from("project_budget_items")
          .delete()
          .eq("id", itemId);
        if (delErr) throw delErr;
      }
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      console.error("Delete budget item error:", err);
      setActionError(`ลบรายการไม่สำเร็จ: ${err.message || "เกิดข้อผิดพลาด"}`);
    }
  };

  if (loading && !project) {
    return <div className="p-8 text-center text-steel-400">กำลังโหลดข้อมูลโครงการและหมวดงบประมาณ...</div>;
  }

  if (notFound || !project) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-steel-200 bg-white p-8 text-center shadow-xs space-y-4">
        <AlertCircle className="h-10 w-10 text-amber-600 mx-auto" />
        <h2 className="text-lg font-bold text-steel-900">ไม่พบข้อมูลโครงการนี้ในระบบ</h2>
        <p className="text-xs text-steel-500">
          {actionError || "โครงการอาจถูกลบไปแล้ว หรือรหัสโครงการในลิงก์ไม่ถูกต้อง"}
        </p>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 rounded-xl bg-steel-900 px-4 py-2 text-xs font-bold text-white hover:bg-steel-800"
        >
          ← กลับหน้ารายการโครงการ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-14 font-sans text-steel-900 leading-normal">
      {/* 1. Header Banner & Status */}
      <div className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-steel-100 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/projects" className="text-xs font-bold text-amber-700 hover:underline">
                ← กลับหน้ารายการโครงการ
              </Link>
              <span className="text-steel-300">•</span>
              <span className="font-mono text-xs font-bold text-steel-600 bg-steel-100 px-2 py-0.5 rounded">
                {project.project_code}
              </span>
              {isSimulation && (
                <span className="rounded-md bg-amber-100 text-amber-900 px-2 py-0.5 text-[10px] font-black uppercase">
                  Demo Simulation
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-black text-steel-900 sm:text-3xl">
              {project.project_name}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-steel-500 flex items-center gap-2 flex-wrap">
              <span>ลูกค้า: <strong className="text-steel-800">{project.client_name || project.customer_name || "-"}</strong></span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-steel-400" />
                {project.site_address || "ไม่ได้ระบุที่อยู่หน้างาน"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
            <StatusBadge status={project.status} />
            {canEdit && !isSimulation && (
              <Link
                to={`/projects/${id}/edit`}
                className="rounded-xl border border-steel-300 bg-white px-3 py-1.5 text-xs font-bold text-steel-700 hover:bg-steel-50 transition"
              >
                แก้ไขโครงการ
              </Link>
            )}
          </div>
        </div>

        {/* Project Contract & Margin Summary */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
          <div className="rounded-xl bg-slate-50 p-3 border border-steel-100">
            <div className="text-steel-500 font-semibold">มูลค่าสัญญารวม (Contract)</div>
            <div className="text-base font-black font-mono text-steel-900 mt-0.5">
              {contractAmount > 0 ? `${baht(contractAmount)} บ.` : "-"}
            </div>
            <div className="text-[10px] text-steel-500 truncate" title={contractSourceLabel}>
              {contractSourceLabel}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-steel-100">
            <div className="text-steel-500 font-semibold">งบประมาณควบคุม (Budget)</div>
            <div className="text-base font-black font-mono text-indigo-700 mt-0.5">
              {baht(totalBudget)} บ.
            </div>
            <div className="text-[10px] text-steel-400">
              {budgetFromItemsOnly ? "รวมจากรายการงบประมาณ" : getNumberUnitLabel(totalBudget) || "งบตั้งต้นโครงการ"}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-steel-100">
            <div className="text-steel-500 font-semibold">กำไรขั้นต้นคาดการณ์ (Margin)</div>
            <div className={`text-base font-black font-mono mt-0.5 ${projectedGrossMargin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {contractAmount > 0 ? `${baht(projectedGrossMargin)} บ.` : "-"}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold">
              {contractAmount > 0 ? `อัตรากำไร: ${projectedGrossMarginPct}%` : "รอเชื่อมใบเสนอราคา/สัญญา"}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-steel-100">
            <div className="text-steel-500 font-semibold">ระยะเวลาโครงการ</div>
            <div className="text-xs font-bold text-steel-800 mt-1">
              {project.start_date || project.end_date
                ? `${project.start_date || "-"} ถึง ${project.end_date || "-"}`
                : "ยังไม่ได้กำหนดวันเริ่ม-สิ้นสุด"}
            </div>
            <div className="text-[10px] text-steel-400">
              {durationDays ? `ระยะเวลาตามแผน ${durationDays} วัน` : "แก้ไขได้ในหน้าข้อมูลโครงการ"}
            </div>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 flex items-center justify-between">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError("")} className="text-rose-600 hover:underline">
            ปิด
          </button>
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button type="button" onClick={() => setActionSuccess("")} className="text-emerald-700 hover:underline">
            ปิด
          </button>
        </div>
      )}

      {/* 2. Four Budget Overview Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-steel-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-steel-500">
            <span>1. งบประมาณโครงการรวม</span>
            <DollarSign className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-steel-900 font-mono">
            {baht(totalBudget)} <span className="text-xs font-normal text-steel-500">บาท</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-steel-600 border-t border-steel-100 pt-2">
            <span>จัดสรรรายหมวดแล้ว:</span>
            <span className="font-bold text-steel-900">{baht(allocatedBudget)} บ.</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-steel-100">
            <div
              className="h-full bg-indigo-600"
              style={{ width: `${totalBudget > 0 ? Math.min((allocatedBudget / totalBudget) * 100, 100) : 0}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-800">
            <span>2. ต้นทุนใช้จริง (Actual)</span>
            <ShoppingCart className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-900 font-mono">
            {baht(totalActualSpent)} <span className="text-xs font-normal text-steel-500">บาท</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-steel-600 border-t border-amber-50 pt-2">
            <span>อัตราการใช้งบ:</span>
            <span className="font-bold text-amber-800">{budgetUsagePct}%</span>
          </div>
          <div className="text-[10px] text-steel-500 mt-1">
            PO {baht(poTotalSpent)} · EXP {baht(expTotalSpent)} · คลัง {netStoreDelta < 0 ? `-${baht(Math.abs(netStoreDelta))}` : baht(netStoreCost)}
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-amber-100">
            <div
              className={`h-full ${Number(budgetUsagePct) > 90 ? "bg-rose-500" : "bg-amber-500"}`}
              style={{ width: `${Math.min(Number(budgetUsagePct), 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-800">
            <span>3. งบคงเหลือ (Remaining)</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className={`mt-2 text-2xl font-black font-mono ${remainingBudget >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {baht(remainingBudget)} <span className="text-xs font-normal text-steel-500">บาท</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-steel-600 border-t border-emerald-50 pt-2">
            <span>คงเหลือคิดเป็น:</span>
            <span className="font-bold text-emerald-700">
              {totalBudget > 0 ? ((remainingBudget / totalBudget) * 100).toFixed(1) : "0.0"}%
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${totalBudget > 0 ? Math.max(Math.min((remainingBudget / totalBudget) * 100, 100), 0) : 0}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-steel-200/90 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-steel-500">
              <span>4. สถานะคุมต้นทุน & รายรับ</span>
              {remainingBudget >= 0 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600" />
              )}
            </div>
            <div className="mt-2">
              <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${
                remainingBudget < 0
                  ? "bg-rose-100 text-rose-800"
                  : Number(budgetUsagePct) > 85
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}>
                {remainingBudget < 0 ? "ใช้เกินงบประมาณ" : Number(budgetUsagePct) > 85 ? "ใช้ใกล้เต็มงบ (>85%)" : "ควบคุมงบได้ตามแผน"}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-steel-600 border-t border-steel-100 pt-2 space-y-0.5">
            <div>PO จริง {activePOs.length} ใบ · EXP {activeExpenses.length} ใบ · เบิกคลัง {stockIssues.length} ครั้ง</div>
            <div>วางบิลลูกค้า {baht(billedTotal)} บ. (รับแล้ว {baht(collectedTotal)} บ.)</div>
          </div>
        </div>
      </div>

      {/* 3. Detailed Budget Section: Categories & Itemized Equipment Details */}
      <div className="rounded-2xl border border-steel-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-steel-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-steel-900 dark:text-slate-100">
                รายละเอียดหมวดงบประมาณโครงการ (Project Budget Categories & Equipment Details)
              </h2>
              <p className="text-xs text-steel-500 dark:text-slate-400">
                แจกแจงงบประมาณรายหมวดและดึงยอดใช้จ่ายจริงจาก PO, ใบสำคัญจ่าย EXP และการเบิก-คืนสโตร์แบบเรียลไทม์
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
            <div className="flex items-center rounded-xl bg-steel-100 dark:bg-slate-800 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode("categories")}
                className={`rounded-lg px-3 py-1.5 transition ${
                  viewMode === "categories"
                    ? "bg-white dark:bg-slate-700 text-steel-900 dark:text-white shadow-xs"
                    : "text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-white"
                }`}
              >
                สรุปภาพรวม 6 หมวด
              </button>
              <button
                type="button"
                onClick={() => setViewMode("itemized")}
                className={`rounded-lg px-3 py-1.5 transition ${
                  viewMode === "itemized"
                    ? "bg-white dark:bg-slate-700 text-steel-900 dark:text-white shadow-xs"
                    : "text-steel-600 dark:text-slate-400 hover:text-steel-900 dark:hover:text-white"
                }`}
              >
                รายการงบย่อย ({items.length})
              </button>
            </div>

            {canEdit && !isSimulation && boqs.length > 0 && (
              <button
                type="button"
                disabled={importingBoq}
                onClick={handleImportFromBoq}
                className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 px-3 py-2 text-xs font-bold text-sky-800 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{importingBoq ? "กำลังนำเข้า..." : "ดึงงบจาก BOQ"}</span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-1.5 rounded-xl bg-hivis hover:bg-amber-400 px-3.5 py-2 text-xs font-bold text-steel-900 transition shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{showAddForm ? "ปิดฟอร์ม" : "เพิ่มรายการงบ"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Add New Item Form Drawer */}
        {showAddForm && (
          <div className="mt-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-4 shadow-xs">
            <div className="font-bold text-xs text-amber-900 dark:text-amber-200 mb-3 flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              <span>เพิ่มรายการอุปกรณ์ / รายการงบประมาณใหม่</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 text-xs">
              <div className="lg:col-span-2">
                <label className="block font-bold text-steel-700 mb-1">เลือกหมวดงบประมาณ *</label>
                <select
                  className="w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 font-medium text-steel-900 focus:border-hivis focus:outline-none"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-2">
                <label className="block font-bold text-steel-700 mb-1">ชื่อรายการอุปกรณ์ / บริการ *</label>
                <input
                  className={fieldErrorClass(itemFormErrors.itemName, "w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 font-medium text-steel-900 focus:border-hivis focus:outline-none")}
                  placeholder="เช่น แผงโซลาร์เซลล์, ท่อ EMT, ค่าแรงติดตั้ง"
                  value={itemName}
                  onChange={(e) => {
                    setItemName(e.target.value);
                    if (itemFormErrors.itemName) setItemFormErrors((prev) => ({ ...prev, itemName: "" }));
                  }}
                />
                <FieldError error={itemFormErrors.itemName} />
              </div>

              <div>
                <label className="block font-bold text-steel-700 mb-1">รหัสพัสดุ (ถ้ามี)</label>
                <input
                  className="w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 font-medium text-steel-900 focus:border-hivis focus:outline-none"
                  placeholder="MAT-001"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                />
              </div>

              <div>
                <label className="block font-bold text-steel-700 mb-1">จำนวน *</label>
                <input
                  className={fieldErrorClass(itemFormErrors.quantity, "w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 font-medium text-steel-900 focus:border-hivis focus:outline-none")}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    if (itemFormErrors.quantity) setItemFormErrors((prev) => ({ ...prev, quantity: "" }));
                  }}
                />
                <FieldError error={itemFormErrors.quantity} />
              </div>

              <div>
                <label className="block font-bold text-steel-700 mb-1">หน่วย</label>
                <input
                  className="w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 font-medium text-steel-900 focus:border-hivis focus:outline-none"
                  placeholder="แผง / เครื่อง / ท่อน / งาน"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>

              <div>
                <label className="block font-bold text-steel-700 mb-1">ราคาต่อหน่วย (บาท) *</label>
                <input
                  className={fieldErrorClass(itemFormErrors.unitCost, "w-full rounded-lg border border-steel-300 bg-white px-3 py-1.5 font-medium text-steel-900 focus:border-hivis focus:outline-none")}
                  type="number"
                  placeholder="0.00"
                  value={unitCost}
                  onChange={(e) => {
                    setUnitCost(e.target.value);
                    if (itemFormErrors.unitCost) setItemFormErrors((prev) => ({ ...prev, unitCost: "" }));
                  }}
                />
                <FieldError error={itemFormErrors.unitCost} />
              </div>

              <div className="lg:col-span-2 flex items-end">
                <div className="text-xs text-steel-600">
                  รวมงบประมาณ: <strong className="text-steel-900 font-mono text-sm">{baht((Number(quantity) || 1) * (Number(unitCost) || 0))}</strong> บาท
                </div>
              </div>

              <div className="lg:col-span-2 flex items-end justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setItemFormErrors({});
                  }}
                  className="rounded-lg bg-steel-200 hover:bg-steel-300 px-3 py-1.5 text-xs font-bold text-steel-700"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="rounded-lg bg-hivis hover:bg-amber-400 px-4 py-1.5 text-xs font-bold text-steel-900 shadow-xs"
                >
                  บันทึกรายการ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Mode 1: Category Summary */}
        {viewMode === "categories" ? (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categorySummary.map((cat, idx) => {
              const catPct = totalBudget > 0 ? ((cat.budgeted / totalBudget) * 100).toFixed(1) : "0.0";
              const usedPct = cat.budgeted > 0 ? ((cat.actualSpent / cat.budgeted) * 100).toFixed(1) : cat.actualSpent > 0 ? "100.0" : "0.0";
              const catRemain = cat.budgeted - cat.actualSpent;

              return (
                <div
                  key={cat.name}
                  className="rounded-xl border border-steel-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/80 p-4 flex flex-col justify-between transition hover:border-amber-300 dark:hover:border-amber-500/60 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs text-steel-900 dark:text-slate-100 line-clamp-1" title={cat.name}>
                        {idx + 1}. {cat.name}
                      </span>
                      <span className="rounded-full bg-steel-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-steel-700 dark:text-slate-200 shrink-0">
                        {cat.itemsCount} รายการ
                      </span>
                    </div>

                    <div className="mt-3 text-lg font-black font-mono text-steel-900 dark:text-white">
                      {baht(cat.budgeted)} <span className="text-xs font-normal text-steel-500 dark:text-slate-400">บาท</span>
                    </div>
                    <div className="text-[11px] text-steel-500 dark:text-slate-400">
                      สัดส่วน: {catPct}% ของงบโครงการรวม
                    </div>

                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-steel-600 dark:text-slate-400">ใช้จริง/สั่งซื้อแล้ว:</span>
                        <span className="font-bold font-mono text-amber-800 dark:text-amber-400">{baht(cat.actualSpent)} บ. ({usedPct}%)</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-steel-200 dark:bg-slate-700">
                        <div
                          className={`h-full ${Number(usedPct) > 90 ? "bg-rose-500" : "bg-amber-500"}`}
                          style={{ width: `${Math.min(Number(usedPct), 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-steel-500 dark:text-slate-400 pt-0.5">
                        <span>คงเหลือในหมวด:</span>
                        <span className={`font-bold ${catRemain >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {baht(catRemain)} บ.
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-steel-200/60 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => setViewMode("itemized")}
                      className="text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:underline flex items-center justify-between w-full"
                    >
                      <span>ดูรายการย่อย ({cat.itemsCount} รายการ)</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-steel-300 bg-slate-50/70 p-8 text-center text-xs text-steel-500 space-y-3">
            <div>ยังไม่มีรายการงบประมาณย่อยในโครงการนี้</div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="rounded-lg bg-hivis px-3 py-1.5 font-bold text-steel-900 hover:bg-amber-400"
                >
                  + เพิ่มรายการงบประมาณ
                </button>
              )}
              {canEdit && !isSimulation && boqs.length > 0 && (
                <button
                  type="button"
                  disabled={importingBoq}
                  onClick={handleImportFromBoq}
                  className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 font-bold text-sky-800 hover:bg-sky-50"
                >
                  ดึงงบจาก {boqs[0].boq_no}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl border border-steel-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-steel-200 dark:border-slate-800 bg-steel-50 dark:bg-slate-800 text-steel-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                  <th className="py-3 px-3">หมวดงบประมาณ</th>
                  <th className="py-3 px-2 text-center">รหัส</th>
                  <th className="py-3 px-3">รายการอุปกรณ์ / บริการ</th>
                  <th className="py-3 px-2 text-right">จำนวน</th>
                  <th className="py-3 px-2 text-center">หน่วย</th>
                  <th className="py-3 px-3 text-right">ราคา/หน่วย (บ.)</th>
                  <th className="py-3 px-3 text-right">งบรวม (บ.)</th>
                  <th className="py-3 px-2 text-center">อ้างอิง</th>
                  {canEdit && <th className="py-3 px-2 text-center w-20">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {items.map((item) => {
                  const isRowEditing = editingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
                      <td className="py-2.5 px-3 font-semibold text-steel-700 dark:text-slate-300 max-w-[160px]" title={item.category}>
                        {isRowEditing ? (
                          <select
                            className="w-full rounded border border-steel-300 px-2 py-1 text-xs"
                            value={normalizeBudgetCategory(editItem.category)}
                            onChange={(e) => setEditItem({ ...editItem, category: e.target.value })}
                          >
                            {BUDGET_CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="truncate block">{item.category}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-[11px] text-steel-500 dark:text-slate-400 font-bold">
                        {isRowEditing ? (
                          <input
                            className="w-20 rounded border border-steel-300 px-1.5 py-1 text-xs"
                            value={editItem.item_code || ""}
                            onChange={(e) => setEditItem({ ...editItem, item_code: e.target.value })}
                          />
                        ) : (
                          item.item_code || "-"
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-steel-900 dark:text-slate-100 max-w-xs" title={item.item_name || item.category}>
                        {isRowEditing ? (
                          <input
                            className="w-full rounded border border-steel-300 px-2 py-1 text-xs"
                            value={editItem.item_name || ""}
                            onChange={(e) => setEditItem({ ...editItem, item_name: e.target.value })}
                          />
                        ) : (
                          item.item_name || item.category
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-medium text-steel-800 dark:text-slate-200">
                        {isRowEditing ? (
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="w-20 rounded border border-steel-300 px-1.5 py-1 text-right text-xs"
                            value={editItem.quantity ?? 1}
                            onChange={(e) => setEditItem({ ...editItem, quantity: e.target.value })}
                          />
                        ) : (
                          Number(item.quantity || 1).toLocaleString("th-TH")
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center text-steel-500 dark:text-slate-400">
                        {isRowEditing ? (
                          <input
                            className="w-16 rounded border border-steel-300 px-1.5 py-1 text-center text-xs"
                            value={editItem.unit || "รายการ"}
                            onChange={(e) => setEditItem({ ...editItem, unit: e.target.value })}
                          />
                        ) : (
                          item.unit || "รายการ"
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-steel-700 dark:text-slate-300">
                        {isRowEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="w-24 rounded border border-steel-300 px-1.5 py-1 text-right text-xs"
                            value={editItem.unit_cost ?? editItem.budgeted_amount ?? 0}
                            onChange={(e) => setEditItem({ ...editItem, unit_cost: e.target.value })}
                          />
                        ) : (
                          baht(item.unit_cost || item.budgeted_amount)
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-steel-900 dark:text-slate-100">
                        {isRowEditing
                          ? baht((Number(editItem.quantity) || 1) * (Number(editItem.unit_cost) || 0))
                          : baht(item.budgeted_amount)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {item.po_ref && item.po_ref !== "-" ? (
                          <span className="rounded bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            {item.po_ref}
                          </span>
                        ) : (
                          <span className="text-steel-300 dark:text-slate-600">-</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-2.5 px-2 text-center">
                          {isRowEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(item.id)}
                                className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                                title="บันทึก"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditItem(null);
                                }}
                                className="rounded p-1 text-steel-500 hover:bg-steel-100"
                                title="ยกเลิก"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(item)}
                                className="rounded p-1 text-steel-400 hover:text-amber-700 transition"
                                title="แก้ไขรายการ"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.id)}
                                className="rounded p-1 text-steel-400 hover:text-rose-600 transition"
                                title="ลบรายการ"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Cross-Department Connected Live Documents */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Box 1: BOQ & Quotations */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-steel-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-sky-700" />
              <div>
                <h3 className="font-bold text-sm text-steel-900">งานขาย: BOQ & ใบเสนอราคาโครงการ</h3>
                <p className="text-[11px] text-steel-500">BOQ {boqs.length} ฉบับ · ใบเสนอราคา {quotations.length} ฉบับ</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <Link to="/boq/new" className="text-sky-700 hover:underline">+ BOQ</Link>
              <span className="text-steel-300">|</span>
              <Link to="/quotations/new" className="text-sky-700 hover:underline">+ ใบเสนอราคา</Link>
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            {quotations.map((qt) => (
              <Link
                key={qt.id}
                to={`/quotations/${qt.id}`}
                className="rounded-xl border border-steel-100 p-3 hover:bg-sky-50/40 transition flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-black text-sky-800">QT</span>
                    <span className="font-mono text-xs font-bold text-steel-900">{qt.quotation_no}</span>
                    <span className="text-[10px] text-steel-400 font-mono">{qt.issue_date}</span>
                  </div>
                  <div className="text-xs font-semibold text-steel-700 mt-1 truncate">
                    {qt.customer_name || "ลูกค้าโครงการ"} {qt.approved_po_no ? `· PO ลูกค้า: ${qt.approved_po_no}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-xs text-steel-900">
                    {baht(qt.grand_total > 0 ? qt.grand_total : qt.total_amount)} บ.
                  </div>
                  <span className="inline-block rounded-full bg-steel-100 px-2 py-0.5 text-[9px] font-bold text-steel-700">
                    {qt.status}
                  </span>
                </div>
              </Link>
            ))}

            {boqs.map((b) => (
              <Link
                key={b.id}
                to={`/boq/${b.id}`}
                className="rounded-xl border border-steel-100 p-3 hover:bg-amber-50/40 transition flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">BOQ</span>
                    <span className="font-mono text-xs font-bold text-steel-900">{b.boq_no}</span>
                  </div>
                  <div className="text-xs font-semibold text-steel-700 mt-1 truncate">{b.title}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-xs text-steel-900">ขาย {baht(b.grand_total)} บ.</div>
                  <div className="text-[10px] text-steel-500">ต้นทุน {baht(b.total_cost)} บ.</div>
                </div>
              </Link>
            ))}

            {quotations.length === 0 && boqs.length === 0 && (
              <div className="py-6 text-center text-steel-400 text-xs">ยังไม่มี BOQ หรือใบเสนอราคาที่ผูกกับโครงการนี้</div>
            )}
          </div>
        </div>

        {/* Box 2: PR & PO */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-steel-100 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-amber-700" />
              <div>
                <h3 className="font-bold text-sm text-steel-900">จัดซื้อ: ใบขอซื้อ (PR) & ใบสั่งซื้อ (PO)</h3>
                <p className="text-[11px] text-steel-500">PR {purchaseRequisitions.length} ใบ · PO ใช้งาน {activePOs.length}/{purchaseOrders.length} ใบ</p>
              </div>
            </div>
            <Link to="/purchasing" className="text-xs font-bold text-amber-800 hover:underline flex items-center gap-1">
              <span>ไปที่ฝ่ายจัดซื้อ</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-3 space-y-2.5">
            {purchaseOrders.map((po) => {
              const cancelled = isCancelledStatus(po.status);
              const poAmt = Number(po.grand_total > 0 ? po.grand_total : po.total_amount || 0);
              return (
                <Link
                  key={po.id || po.po_no}
                  to={po.id ? `/purchasing/po/${po.id}` : "/purchasing"}
                  className={`rounded-xl border p-3 transition flex items-center justify-between ${
                    cancelled ? "border-steel-100 bg-steel-50/60 opacity-60" : "border-steel-100 hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">PO</span>
                      <span className="font-mono text-xs font-bold text-steel-900">{po.po_no}</span>
                      <span className="text-[10px] text-steel-400 font-mono">{po.order_date}</span>
                    </div>
                    <div className="text-xs font-semibold text-steel-800 mt-1 truncate">
                      {po.custom_vendor_name || po.vendors?.vendor_name || po.vendor_name || "ผู้จำหน่ายวัสดุ"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-xs text-steel-900">{baht(poAmt)} บ.</div>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      cancelled
                        ? "bg-rose-100 text-rose-700"
                        : po.status === "รับของครบ" || po.status === "received"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      {po.status_th || po.status || "สั่งซื้อแล้ว"}
                    </span>
                  </div>
                </Link>
              );
            })}

            {purchaseRequisitions.map((pr) => (
              <Link
                key={pr.id}
                to={`/purchasing/pr/${pr.id}`}
                className="rounded-xl border border-steel-100 p-3 hover:bg-slate-50 transition flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-black text-steel-700">PR</span>
                    <span className="font-mono text-xs font-bold text-steel-900">{pr.pr_no}</span>
                    <span className="text-[10px] text-steel-400 font-mono">{pr.request_date}</span>
                  </div>
                  <div className="text-[11px] text-steel-600 mt-1 truncate max-w-xs">{pr.notes || "ใบขอซื้อวัสดุโครงการ"}</div>
                </div>
                <span className="inline-block rounded-full bg-steel-100 px-2 py-0.5 text-[9px] font-bold text-steel-700">
                  {pr.status}
                </span>
              </Link>
            ))}

            {purchaseOrders.length === 0 && purchaseRequisitions.length === 0 && (
              <div className="py-6 text-center text-steel-400 text-xs">ยังไม่มีใบขอซื้อหรือใบสั่งซื้อที่ผูกกับโครงการนี้</div>
            )}
          </div>
        </div>

        {/* Box 3: Expenses (EXP) & AR Invoices */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-steel-100 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-indigo-700" />
              <div>
                <h3 className="font-bold text-sm text-steel-900">บัญชี: ใบสำคัญจ่าย (EXP) & วางบิล (AR)</h3>
                <p className="text-[11px] text-steel-500">EXP {activeExpenses.length} ใบ · ใบแจ้งหนี้ลูกค้า {activeInvoices.length} ใบ</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <Link to="/accounting/expenses" className="text-indigo-700 hover:underline">ค่าใช้จ่าย</Link>
              <span className="text-steel-300">|</span>
              <Link to="/accounting/ar-aging" className="text-indigo-700 hover:underline">ลูกหนี้ AR</Link>
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            {expenses.map((exp) => (
              <div key={exp.id || exp.expense_no} className="rounded-xl border border-steel-100 p-3 hover:bg-slate-50 transition flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-800">EXP</span>
                    <span className="font-mono text-xs font-bold text-steel-900">{exp.expense_no}</span>
                    <span className="text-[10px] text-steel-400 font-mono">{exp.expense_date}</span>
                  </div>
                  <div className="text-xs font-semibold text-steel-800 mt-1 truncate">
                    {exp.description || exp.expense_category || "ค่าใช้จ่ายโครงการ"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-xs text-indigo-900">{baht(exp.total_amount)} บ.</div>
                  <span className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800">
                    {exp.status || "จ่ายเงินแล้ว"}
                  </span>
                </div>
              </div>
            ))}

            {salesInvoices.map((inv) => (
              <div key={inv.id} className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">INV</span>
                    <span className="font-mono text-xs font-bold text-steel-900">{inv.invoice_no}</span>
                    <span className="text-[10px] text-steel-400 font-mono">{inv.issue_date}</span>
                  </div>
                  <div className="text-[11px] text-steel-600 mt-1">
                    รับชำระแล้ว {baht(inv.paid_amount)} / {baht(inv.total_amount)} บ.
                  </div>
                </div>
                <span className="inline-block rounded-full bg-white border border-emerald-200 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                  {inv.status}
                </span>
              </div>
            ))}

            {expenses.length === 0 && salesInvoices.length === 0 && (
              <div className="py-6 text-center text-steel-400 text-xs">ยังไม่มีใบสำคัญจ่ายหรือใบแจ้งหนี้ที่ผูกกับโครงการนี้</div>
            )}
          </div>
        </div>

        {/* Box 4: Store Issues & Returns */}
        <div className="rounded-2xl border border-steel-200/90 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-steel-100 pb-3">
            <div className="flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="font-bold text-sm text-steel-900">สโตร์: เบิก-คืนพัสดุเข้าหน้างาน</h3>
                <p className="text-[11px] text-steel-500">
                  เบิก {baht(storeIssuedTotal)} บ. · คืนคลัง {baht(storeReturnedTotal)} บ. · สุทธิ {netStoreDelta < 0 ? `-${baht(Math.abs(netStoreDelta))}` : baht(netStoreCost)} บ.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
              <Link to={`/store/issues/new?project=${id}`} className="text-amber-700 hover:underline">+ เบิกพัสดุ</Link>
              <span className="text-steel-300">|</span>
              <Link to={`/store/adjust?project=${id}&tab=return_stock`} className="text-emerald-700 hover:underline">↩️ คืนคลัง</Link>
              <span className="text-steel-300">|</span>
              <Link to="/store/issues" className="text-steel-700 hover:underline flex items-center gap-1">
                <span>ประวัติ</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            {stockIssues.map((iss) => {
              const issTotal = (iss.stock_issue_items || []).reduce((s, li) => {
                const uc = Number(li.unit_cost) > 0 ? Number(li.unit_cost) : Number(li.inventory_items?.avg_unit_cost || 0);
                return s + Number(li.quantity || 0) * uc;
              }, 0);
              return (
                <div key={iss.id} className="rounded-xl border border-steel-100 p-3 flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-black text-orange-800">ISSUE</span>
                      <span className="font-mono text-xs font-bold text-steel-900">{iss.issue_no}</span>
                      <span className="text-[10px] text-steel-400 font-mono">{iss.issue_date}</span>
                    </div>
                    <div className="text-xs text-steel-700 mt-1 truncate">
                      {(iss.stock_issue_items || []).length} รายการ {iss.notes ? `· ${iss.notes}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono font-bold text-xs text-orange-800">
                    -{baht(issTotal)} บ.
                  </div>
                </div>
              );
            })}

            {stockAdjustments
              .filter((adj) => Number(adj.qty_after || 0) > Number(adj.qty_before || 0))
              .map((ret) => {
                const qtyReturned = Number(ret.qty_after || 0) - Number(ret.qty_before || 0);
                const retUnitCost = Number(ret.unit_cost) > 0 ? Number(ret.unit_cost) : Number(ret.inventory_items?.avg_unit_cost || 0);
                const retValue = qtyReturned * retUnitCost;
                return (
                  <div key={ret.id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">คืนคลัง</span>
                        <span className="font-mono text-xs font-bold text-steel-900">{ret.adj_no}</span>
                      </div>
                      <div className="text-xs text-steel-700 mt-1 truncate">
                        {ret.inventory_items?.item_name || "วัสดุคืนคลัง"} ({qtyReturned} {ret.inventory_items?.unit || "หน่วย"})
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono font-bold text-xs text-emerald-700">
                      +{baht(retValue)} บ.
                    </div>
                  </div>
                );
              })}

            {stockIssues.length === 0 && stockAdjustments.length === 0 && (
              <div className="py-6 text-center text-steel-400 text-xs">ยังไม่มีประวัติเบิก-คืนพัสดุสำหรับโครงการนี้</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
