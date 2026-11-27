import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { baht, canEditProjects } from "../../lib/projects";
import StatusBadge from "./StatusBadge";
import { resolveProjectContractInfo } from "../../lib/projectFinancials";
import { Building2, Calendar, DollarSign, Plus, Search, ArrowRight, Layers } from "lucide-react";
import Pagination from "../../components/Pagination";
import TableSortFilter from "../../components/TableSortFilter";

// ฟังก์ชันสำหรับแปลงรูปแบบวันที่ให้แสดงเฉพาะ วัน เดือน ปี (เช่น 12 พ.ย. 2569)
function formatDateOnly(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ProjectList() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("code_asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8); // 8 | 16 | 24 | 48 (เหมาะสำหรับ grid 2-columns)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  const PROJECT_SORT_OPTIONS = [
    { value: "code_asc", label: "รหัสโครงการ (น้อย  มาก: 0  9)" },
    { value: "code_desc", label: "รหัสโครงการ (มาก  น้อย: 9  0)" },
    { value: "name_asc", label: "ชื่อโครงการ ก  ฮ (A  Z)" },
    { value: "name_desc", label: "ชื่อโครงการ ฮ  ก (Z  A)" },
    { value: "amount_desc", label: "มูลค่าสัญญา (มาก  น้อย)" },
    { value: "amount_asc", label: "มูลค่าสัญญา (น้อย  มาก)" },
    { value: "date_desc", label: " วันที่โครงการล่าสุด (ใหม่  เก่า)" },
    { value: "date_asc", label: " วันที่โครงการ (เก่า  ใหม่)" },
  ];

  useEffect(() => {
    Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      supabase
        .from("quotations")
        .select("id, project_id, quotation_no, status, grand_total, total_amount")
        .order("issue_date", { ascending: false }),
      supabase
        .from("boqs")
        .select("id, project_id, boq_no, status, grand_total")
        .order("created_at", { ascending: false }),
    ])
      .then(([pRes, qRes, bRes]) => {
        if (pRes.error) {
          console.error(pRes.error);
          setError("ไม่สามารถโหลดข้อมูลโครงการได้");
          setProjects([]);
          setIsDemo(false);
          return;
        }
        const rawProjects = pRes.data || [];
        const quotes = qRes.error ? [] : qRes.data || [];
        const boqsList = bRes.error ? [] : bRes.data || [];

        const quotesByPrj = {};
        quotes.forEach((qt) => {
          if (!qt.project_id) return;
          if (!quotesByPrj[qt.project_id]) quotesByPrj[qt.project_id] = [];
          quotesByPrj[qt.project_id].push(qt);
        });

        const boqsByPrj = {};
        boqsList.forEach((b) => {
          if (!b.project_id) return;
          if (!boqsByPrj[b.project_id]) boqsByPrj[b.project_id] = [];
          boqsByPrj[b.project_id].push(b);
        });

        const enriched = rawProjects.map((p) => {
          const contractInfo = resolveProjectContractInfo(
            p,
            quotesByPrj[p.id] || [],
            boqsByPrj[p.id] || []
          );
          return {
            ...p,
            contract_amount: contractInfo.amount,
            contract_source_label: contractInfo.sourceLabel,
          };
        });

        setProjects(enriched);
        setIsDemo(false);
      })
      .catch((err) => {
        console.error(err);
        setError("ไม่สามารถโหลดข้อมูลโครงการได้");
        setProjects([]);
        setIsDemo(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const q = search.trim().toLowerCase();
  const shown = useMemo(() => {
    const filtered = projects.filter(
      (p) =>
        !q ||
        [p.project_code, p.project_name, p.client_name, p.customer_name].some((v) =>
          (v ?? "").toLowerCase().includes(q)
        )
    );

    return filtered.sort((a, b) => {
      if (sortBy === "name_asc") return (a.project_name || "").localeCompare(b.project_name || "", "th");
      if (sortBy === "name_desc") return (b.project_name || "").localeCompare(a.project_name || "", "th");
      if (sortBy === "code_asc") return (a.project_code || "").localeCompare(b.project_code || "", undefined, { numeric: true });
      if (sortBy === "code_desc") return (b.project_code || "").localeCompare(a.project_code || "", undefined, { numeric: true });
      if (sortBy === "amount_desc") return Number(b.contract_amount || b.budget_total || 0) - Number(a.contract_amount || a.budget_total || 0);
      if (sortBy === "amount_asc") return Number(a.contract_amount || a.budget_total || 0) - Number(b.contract_amount || b.budget_total || 0);
      if (sortBy === "date_asc") return (a.created_at || a.start_date || "").localeCompare(b.created_at || b.start_date || "");
      // Default: date_desc
      return (b.created_at || b.start_date || "").localeCompare(a.created_at || a.start_date || "");
    });
  }, [projects, q, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return shown.slice(start, start + pageSize);
  }, [shown, currentPage, pageSize]);

  const totalContractAll = projects.reduce((sum, p) => sum + Number(p.contract_amount || p.budget_total || 0), 0);
  const activeCount = projects.filter((p) => p.status === 'in_progress' || p.status === 'active').length;

  return (
    <div className="space-y-4 pb-12">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              โครงการและงบประมาณ (Projects &amp; Budgets)
            </h1>
            {isDemo && (
              <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 text-[11px] font-bold">
                ข้อมูลจำลอง (Demo)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ติดตามมูลค่าสัญญา, การจัดสรรงบรายหมวด (ค่าอุปกรณ์, ค่าแรง, เครื่องจักร, โสหุ้ย) และต้นทุนจริง
          </p>
        </div>

        {canEditProjects(profile.role) && (
          <Link
            to="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-amber-500 dark:hover:bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950 shadow-xs transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>สร้างโครงการใหม่</span>
          </Link>
        )}
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">โครงการทั้งหมด</div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {projects.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">โครงการ</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            กำลังดำเนินงาน: <span className="font-bold text-emerald-700 dark:text-emerald-400">{activeCount} โครงการ</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">มูลค่าสัญญารวม (Contract Value)</div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
            {baht(totalContractAll)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">บาท</span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">สัญญาจ้างงานวิศวกรรมและติดตั้ง</div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">การคุมงบประมาณ &amp; ต้นทุน</div>
          <div className="mt-1.5 text-2xl font-bold text-sky-700 dark:text-sky-400">6 หมวดงบละเอียด</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">เชื่อมโยงค่าใช้จ่ายจริงจาก PO และ EXP</div>
        </div>
      </div>

      {/* Search Input & Standard Sort Filter */}
      <div className="flex flex-wrap items-center gap-2 max-w-2xl">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            className="input pl-9 text-xs"
            placeholder="ค้นหารหัสโครงการ / ชื่อโครงการ / ลูกค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <TableSortFilter
          value={sortBy}
          onChange={setSortBy}
          options={PROJECT_SORT_OPTIONS}
        />
      </div>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
          กำลังโหลดข้อมูลโครงการ...
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-12 text-center text-slate-500 dark:text-slate-400 text-sm border border-slate-200 dark:border-slate-800">
          ไม่พบโครงการที่ค้นหา
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {paginatedProjects.map((p) => {
            const displayDate = p.updated_at || p.created_at;
            const contractAmt = Number(p.contract_amount || 0);
            const budgetAmt = Number(p.budget_total || 0);
            const grossMargin = contractAmt > 0 ? contractAmt - budgetAmt : 0;
            const grossMarginPct = contractAmt > 0 ? ((grossMargin / contractAmt) * 100).toFixed(1) : "0.0";

            return (
              <div
                key={p.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs transition hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400">
                        {p.project_code}
                      </span>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5 line-clamp-1">
                        {p.project_name}
                      </h2>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>

                  <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className="text-slate-400 dark:text-slate-500">ลูกค้า:</span>{" "}
                    <span className="font-bold text-slate-800 dark:text-slate-100">{p.client_name || p.customer_name || "-"}</span>
                  </div>

                  {/* Financial Mini Grid */}
                  <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-200/80 dark:border-slate-700/80 text-xs">
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">มูลค่าสัญญา</div>
                      <div className="font-bold font-mono text-slate-900 dark:text-white text-sm tabular-nums">
                        {contractAmt > 0 ? `${baht(contractAmt)} บ.` : "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">งบประมาณควบคุม</div>
                      <div className="font-bold font-mono text-sky-700 dark:text-sky-400 text-sm tabular-nums">{baht(budgetAmt)} บ.</div>
                    </div>
                    <div className="col-span-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">กำไรขั้นต้นคาดการณ์:</span>
                      <span className="font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">{baht(grossMargin)} บ. ({grossMarginPct}%)</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDateOnly(p.start_date)} - {formatDateOnly(p.end_date)}</span>
                    </span>
                    {displayDate && (
                      <span>อัปเดต: {formatDateOnly(displayDate)}</span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>แจกแจง 6 หมวดงบประมาณละเอียด</span>
                  </div>
                  <Link
                    to={`/projects/${p.id}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 px-3 py-1.5 text-xs font-bold text-white dark:text-slate-950 transition shadow-2xs"
                  >
                    <span>ดูรายละเอียด</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* แถบเปลี่ยนหน้า (Pagination < 1 2 3 4 5 6 >) */}
      {!loading && shown.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3 shadow-2xs">
          <Pagination
            currentPage={currentPage}
            totalItems={shown.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[8, 16, 24, 48]}
          />
        </div>
      )}
    </div>
  );
}
