"use client";

import { useMemo, useState } from "react";
import { Search, Undo2 } from "lucide-react";
import { SECTION_LABEL, categoryOf } from "@/lib/finance/chartOfAccounts";
import { monthLabel } from "@/lib/finance/pnl";
import { UNCERTAIN_THRESHOLD } from "@/lib/finance/rules";
import type { Section } from "@/lib/finance/types";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx, money } from "@/lib/format";
import { CategoryLabel, Confidence } from "./bits";

type Filter = "all" | "uncertain" | "non_pnl" | "corrected";

export default function Transactions() {
  const ws = useWorkspace();
  const input = useStore((s) => s.input)!;
  const openTxns = useStore((s) => s.openTxns);
  const undo = useStore((s) => s.undoCorrection);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("all");
  const [section, setSection] = useState<Section | "all">("all");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    if (!ws) return [];
    const needle = q.toLowerCase();
    return ws.ledger.filter((t) => {
      const c = t.classification;
      if (month !== "all" && t.month !== month) return false;
      if (section !== "all" && categoryOf(c.categoryId).section !== section) return false;
      if (filter === "uncertain" && !(c.source !== "user" && c.confidence < UNCERTAIN_THRESHOLD)) return false;
      if (filter === "non_pnl" && categoryOf(c.categoryId).section !== "non_pnl") return false;
      if (filter === "corrected" && c.source !== "user") return false;
      if (needle && !`${t.id} ${t.description} ${t.counterparty} ${categoryOf(c.categoryId).name}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [ws, q, month, section, filter]);

  if (!ws) return null;
  const counts = {
    all: ws.ledger.length,
    uncertain: ws.ledger.filter((t) => t.classification.source !== "user" && t.classification.confidence < UNCERTAIN_THRESHOLD).length,
    non_pnl: ws.ledger.filter((t) => categoryOf(t.classification.categoryId).section === "non_pnl").length,
    corrected: ws.ledger.filter((t) => t.classification.source === "user").length,
  };
  const agreed = ws.ledger.filter((t) => t.classification.source === "rule+ai").length;
  const aiSeen = Object.keys(input.ai).length > 0;

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "uncertain", label: "Uncertain" },
    { id: "non_pnl", label: "Not in P&L" },
    { id: "corrected", label: "Corrected" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Transactions</h1>
        <p className="mt-2 max-w-[70ch] text-muted">
          Keyword rules and the AI classify every line independently.
          {aiSeen ? ` They agree on ${agreed} of ${ws.ledger.length}; where they disagree, confidence drops and the line goes to review.` : " AI was unavailable for this file, so these are rule-only classifications."}{" "}
          Select any row to see the reasoning or correct it.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filter" className="flex rounded-lg border border-line p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cx("rounded-md px-3 py-1.5 text-sm", filter === f.id ? "bg-panel-2 text-paper" : "text-muted hover:text-paper")}
            >
              {f.label} <span className={cx("num text-xs", f.id === "uncertain" && counts.uncertain ? "text-amber" : "text-faint")}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" className="rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm">
          <option value="all">All months</option>
          {ws.months.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
        </select>
        <select value={section} onChange={(e) => setSection(e.target.value as Section | "all")} aria-label="Section" className="rounded-lg border border-line bg-ink-2 px-3 py-2 text-sm">
          <option value="all">All sections</option>
          {(Object.keys(SECTION_LABEL) as Section[]).map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
        </select>
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-line bg-ink-2 px-3 py-2">
          <Search className="size-4 text-faint" aria-hidden />
          <span className="sr-only">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, vendor, category or ID" className="flex-1 bg-transparent text-sm outline-none placeholder:text-faint" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-3 py-3 font-normal">Date</th>
              <th className="px-3 py-3 font-normal">Transaction</th>
              <th className="px-3 py-3 font-normal">Category</th>
              <th className="px-3 py-3 font-normal">Confidence</th>
              <th className="px-3 py-3 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.id}
                onClick={() => openTxns([t.id], t.id)}
                onKeyDown={(e) => e.key === "Enter" && openTxns([t.id], t.id)}
                tabIndex={0}
                className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-panel-2/70 focus:bg-panel-2/70"
              >
                <td className="num whitespace-nowrap px-3 py-2.5 text-muted">{t.date}</td>
                <td className="px-3 py-2.5">
                  <span className="block">{t.description}</span>
                  <span className="text-xs text-faint">{t.id}, {t.counterparty}</span>
                </td>
                <td className="px-3 py-2.5"><CategoryLabel id={t.classification.categoryId} /></td>
                <td className="px-3 py-2.5"><Confidence c={t.classification} /></td>
                <td className={cx("num px-3 py-2.5 text-right", t.amount >= 0 ? "text-teal" : "text-paper")}>{money(t.amount, { cents: true })}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-muted">No transactions match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {input.corrections.length > 0 && (
        <section aria-labelledby="log-h">
          <h2 id="log-h" className="font-display text-xl font-semibold">Correction log</h2>
          <p className="mt-1 text-sm text-muted">Corrections are stored as an audit trail on top of the original classification. Undo one and the numbers recalculate.</p>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
            {input.corrections.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <button onClick={() => openTxns([c.txnId], c.txnId)} className="num text-paper hover:underline">{c.txnId}</button>
                <span className="text-muted">{categoryOf(c.from).name}</span>
                <span className="text-faint">to</span>
                <span className="text-paper">{categoryOf(c.to).name}</span>
                {c.appliedToPattern && <span className="text-xs text-iris">applied to all similar</span>}
                {c.note && <span className="text-muted">“{c.note}”</span>}
                <span className="ml-auto text-xs text-faint">{new Date(c.at).toLocaleString()}</span>
                <button onClick={() => undo(i)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-paper"><Undo2 className="size-3.5" /> Undo</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
