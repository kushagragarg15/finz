"use client";

import { SECTION_LABEL, categoryOf } from "./finance/chartOfAccounts";
import { monthLabel } from "./finance/pnl";
import type { Correction } from "./finance/types";
import { materialVariances } from "./finance/variance";
import type { Workspace } from "./finance/workspace";

/** Download the reviewed workpaper as an Excel file. Every number comes from the same engine as the UI. */
export async function exportWorkpaper(ws: Workspace, corrections: Correction[], fileName: string) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const months = ws.pnls.map((p) => monthLabel(p.month));

  // 1. P&L
  const pnl: (string | number | null)[][] = [["Line", ...months]];
  const section = (key: "revenue" | "cogs" | "payroll" | "opex") => {
    pnl.push([SECTION_LABEL[key], ...ws.pnls.map((p) => p[key].total)]);
    const ids = [...new Set(ws.pnls.flatMap((p) => p[key].lines.map((l) => l.categoryId)))];
    ids.forEach((id) => pnl.push([`   ${categoryOf(id).name}`, ...ws.pnls.map((p) => p[key].lines.find((l) => l.categoryId === id)?.amount ?? 0)]));
  };
  section("revenue");
  section("cogs");
  pnl.push(["Gross profit", ...ws.pnls.map((p) => p.grossProfit)]);
  pnl.push(["Gross margin %", ...ws.pnls.map((p) => p.grossMargin)]);
  section("payroll");
  section("opex");
  pnl.push(["Operating profit", ...ws.pnls.map((p) => p.operatingProfit)]);
  pnl.push(["Operating margin %", ...ws.pnls.map((p) => p.operatingMargin)]);
  pnl.push([]);
  pnl.push(["Kept out of the P&L"]);
  const nonIds = [...new Set(ws.pnls.flatMap((p) => p.nonPnl.lines.map((l) => l.categoryId)))];
  nonIds.forEach((id) => pnl.push([`   ${categoryOf(id).name}`, ...ws.pnls.map((p) => p.nonPnl.lines.find((l) => l.categoryId === id)?.amount ?? 0)]));
  pnl.push([]);
  pnl.push(["Reconciliation"]);
  pnl.push(["   Operating profit", ...ws.pnls.map((p) => p.operatingProfit)]);
  pnl.push(["   Non-P&L cash", ...ws.pnls.map((p) => p.nonPnl.netCashEffect)]);
  pnl.push(["   Net bank movement", ...ws.pnls.map((p) => p.netBankMovement)]);
  pnl.push(["   Reconciles", ...ws.pnls.map((p) => (p.reconciles ? "Yes" : "NO"))]);
  const pnlSheet = XLSX.utils.aoa_to_sheet(pnl);
  pnlSheet["!cols"] = [{ wch: 34 }, ...months.map(() => ({ wch: 14 }))];
  XLSX.utils.book_append_sheet(wb, pnlSheet, "P&L");

  // 2. Ledger with classifications
  const ledger: (string | number)[][] = [["ID", "Date", "Description", "Counterparty", "Amount", "Category", "Section", "Confidence", "Source", "Reasoning"]];
  ws.ledger.forEach((t) => {
    const c = categoryOf(t.classification.categoryId);
    ledger.push([t.id, t.date, t.description, t.counterparty, t.amount, c.name, SECTION_LABEL[c.section], Math.round(t.classification.confidence * 100), t.classification.source, t.classification.rationale]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ledger), "Ledger");

  // 3. Material variances with their exact decomposition
  const vars: (string | number)[][] = [["Metric", "From", "To", "From value", "To value", "Change", "Change %", "Calendar timing", "One-offs", "Underlying", "Largest driver", "Transactions"]];
  materialVariances(ws.variances).forEach((v) =>
    vars.push([v.metricLabel, monthLabel(v.fromMonth), monthLabel(v.toMonth), v.from, v.to, v.delta, v.pct ?? "", v.decomposition.calendar, v.decomposition.oneOff, v.decomposition.underlying, v.drivers[0]?.label ?? "", [...new Set(v.drivers.flatMap((d) => [...d.txnIdsFrom, ...d.txnIdsTo]))].join(" ")]),
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vars), "Variances");

  // 4. Review log
  const review = [["Severity", "Type", "Item", "Detail", "Suggested action", "Transactions", "Status", "Reviewer note", "Resolved at"]];
  ws.review.forEach((i) => review.push([i.severity, i.kind, i.title, i.detail, i.suggestedAction, i.txnIds.join(" "), i.resolution?.status ?? "open", i.resolution?.note ?? "", i.resolution?.at ?? ""]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(review), "Review log");

  // 5. Audit trail of corrections
  const audit = [["When", "Transaction", "From", "To", "Applied to all similar", "Note"]];
  corrections.forEach((c) => audit.push([c.at, c.txnId, categoryOf(c.from).name, categoryOf(c.to).name, c.appliedToPattern ? "Yes" : "No", c.note ?? ""]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(audit), "Audit trail");

  const base = fileName.replace(/\.[^.]+$/, "");
  XLSX.writeFile(wb, `${base} - reviewed workpaper.xlsx`);
}
