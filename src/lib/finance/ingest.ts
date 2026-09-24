import * as XLSX from "xlsx";
import type { RawTransaction } from "./types";

export interface IngestResult {
  transactions: RawTransaction[];
  warnings: string[];
  sheetName: string;
  rowsRead: number;
}

const HEADER_SYNONYMS: Record<keyof RawTransaction, string[]> = {
  id: ["transaction id", "txn id", "id", "reference", "ref"],
  date: ["date", "transaction date", "posted date", "posting date"],
  description: ["description", "memo", "details", "narrative"],
  counterparty: ["counterparty", "payee", "vendor", "merchant", "name"],
  amount: ["amount", "value", "amount (usd)"],
  method: ["method", "type", "payment method", "channel"],
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

function toIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Excel serial date: parse without timezone conversion.
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return null;
}

function toAmount(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return Math.round(v * 100) / 100;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  const negParen = /^\(.*\)$/.test(s);
  s = s.replace(/[()$,\s]/g, "");
  const n = Number(s);
  if (!isFinite(n)) return null;
  return Math.round((negParen ? -Math.abs(n) : n) * 100) / 100;
}

/** Parse an .xlsx / .xls / .csv buffer into validated raw transactions. */
export function parseWorkbook(data: ArrayBuffer | Uint8Array): IngestResult {
  const wb = XLSX.read(data, { type: "array", cellDates: false, raw: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const warnings: string[] = [];

  // Locate the header row (first row that contains a date + amount column).
  let headerIdx = -1;
  let colMap: Partial<Record<keyof RawTransaction, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] ?? []).map(norm);
    const map: Partial<Record<keyof RawTransaction, number>> = {};
    (Object.keys(HEADER_SYNONYMS) as (keyof RawTransaction)[]).forEach((key) => {
      const idx = cells.findIndex((c) => HEADER_SYNONYMS[key].includes(c));
      if (idx >= 0) map[key] = idx;
    });
    if (map.date !== undefined && map.amount !== undefined && map.description !== undefined) {
      headerIdx = i;
      colMap = map;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error("Could not find a header row with Date, Description and Amount columns.");
  }

  const seen = new Set<string>();
  const transactions: RawTransaction[] = [];
  let rowsRead = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((c) => c == null || c === "")) continue;
    rowsRead++;
    const get = (k: keyof RawTransaction) => (colMap[k] !== undefined ? r[colMap[k]!] : null);
    const rowNo = i + 1;

    const date = toIsoDate(get("date"));
    const amount = toAmount(get("amount"));
    const description = String(get("description") ?? "").trim();
    if (!date) { warnings.push(`Row ${rowNo}: unreadable date "${get("date")}" — skipped.`); continue; }
    if (amount === null) { warnings.push(`Row ${rowNo}: unreadable amount "${get("amount")}" — skipped.`); continue; }
    if (!description) warnings.push(`Row ${rowNo}: missing description.`);

    let id = String(get("id") ?? "").trim() || `ROW${rowNo}`;
    if (seen.has(id)) {
      warnings.push(`Row ${rowNo}: duplicate transaction id ${id} — renamed to ${id}-dup${rowNo}.`);
      id = `${id}-dup${rowNo}`;
    }
    seen.add(id);

    transactions.push({
      id,
      date,
      description,
      counterparty: String(get("counterparty") ?? "").trim() || "Unknown",
      amount,
      method: String(get("method") ?? "").trim(),
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { transactions, warnings, sheetName, rowsRead };
}

/** Normalise a description into a recurring-pattern key (strips week numbers, digits). */
export function patternKey(description: string, counterparty: string): string {
  const d = description
    .toLowerCase()
    .replace(/\bweek\s*\d+\b/g, "week #")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  return `${d} | ${counterparty.toLowerCase().trim()}`;
}
