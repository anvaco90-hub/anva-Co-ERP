import { supabase } from "./supabase";
import { uploadFile } from "./files";

// สิทธิ์จัดการสโตร์ (สโตร์ และ แอดมิน)
export const canManageStore = (role) => ["store", "admin"].includes(role);
export const canIssueStock = canManageStore;

// แปลงและจัดรูปแบบจำนวนนับในสโตร์ให้เป็นจำนวนเต็ม (Integer)
export function formatIntQty(val) {
  if (val === null || val === undefined || val === "") return "0";
  const num =
    typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return "0";
  return Math.round(num).toLocaleString("th-TH");
}

export function toIntQty(val) {
  if (val === null || val === undefined || val === "") return 0;
  const num =
    typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return 0;
  return Math.round(num);
}

// คำอุปสรรครหัสวัสดุแยกตามหมวดหมู่
export const CATEGORY_PREFIXES = {
  "ปูน ทราย หิน": "CM",
  เหล็ก: "ST",
  ไม้และแผ่นไม้: "WD",
  ไฟฟ้า: "EL",
  ประปาและสุขภัณฑ์: "PL",
  สีและเคมีภัณฑ์: "CH",
  "อุปกรณ์/เครื่องมือ": "TL",
  "อื่น ๆ": "OT",
};

// หา Prefix ตามชื่อหมวดหมู่
export function getCategoryPrefix(categoryName) {
  if (!categoryName) return "ITM";
  for (const [key, prefix] of Object.entries(CATEGORY_PREFIXES)) {
    if (categoryName.includes(key) || key.includes(categoryName)) return prefix;
  }
  return "ITM";
}

export async function uploadItemImage(file) {
  const { r2Key } = await uploadFile(file, "items");
  return r2Key;
}
