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
  const counts: Record<Filter, number> = {
    all: ws.ledger.length,
    uncertain: ws.ledger.filter((t) => t.classification.source !== "user" && t.classification.confidence < UNCERTAIN_THRESHOLD).length,
    non_pnl: ws.ledger.filter((t) => categoryOf(t.classification.categoryId).section === "non_pnl").length,
    corrected: ws.ledger.filter((t) => t.classification.source === "user").length,
  };
  const agreed = ws.ledger.filter((t) => t.classification.source === "rule+ai").length;
  const aiSeen = Object.keys(input.ai).length > 0;
  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "uncertain", label: "Unsure" },
    { id: "non_pnl", label: "Off P&L" },
    { id: "corrected", label: "Corrected" },
  ];
  const net = rows.reduce((a, t) => a + t.amount, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-cond text-3xl font-semibold tracking-tight sm:text-4xl">Ledger</h1>
        <p className="mt-1.5 max-w-[68ch] text-ink-2">
          Keyword rules and the AI label every line separately.{" "}
          {aiSeen ? `They agree on ${agreed} of ${ws.ledger.length}. Where they don't, confidence drops and the line goes to review.` : "The AI wasn't available for this file, so these labels come from rules only."}
        </p>
      </header>

      <div className="space-y-3">
        <div role="tablist" aria-label="Show" className="flex w-full overflow-x-auto border-b border-rule">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cx(
                "relative min-h-11 shrink-0 px-3 text-sm",
                filter === f.id ? "text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {f.label} <span className={cx("num text-xs", f.id === "uncertain" && counts.uncertain ? "font-medium text-flag" : "text-ink-3")}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="flex h-11 items-center gap-2 rounded-md border border-rule-strong bg-sheet px-3 focus-within:border-ai">
            <Search className="size-4 text-ink-3" aria-hidden />
            <span className="sr-only">Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, vendor, category or ID" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3 sm:text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" className="h-11 rounded-md border border-rule-strong bg-sheet px-3 text-sm">
              <option value="all">All months</option>
              {ws.months.map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
            </select>
            <select value={section} onChange={(e) => setSection(e.target.value as Section | "all")} aria-label="Section" className="h-11 rounded-md border border-rule-strong bg-sheet px-3 text-sm">
              <option value="all">All sections</option>
              {(Object.keys(SECTION_LABEL) as Section[]).map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
            </select>
          </div>
        </div>
        <p className="text-sm text-ink-3">
          {rows.length} of {ws.ledger.length} shown, net <span className="num text-ink-2">{money(net, { cents: true })}</span>
        </p>
      </div>

      {/* Phones: a list you can tap */}
      <ul className="divide-y divide-rule rounded-lg border border-rule-strong bg-sheet md:hidden">
        {rows.map((t) => (
          <li key={t.id}>
            <button onClick={() => openTxns([t.id], t.id)} className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-3 text-left active:bg-sheet-2">
              <span className="min-w-0 truncate text-sm">{t.description}</span>
              <span className={cx("num text-sm", t.amount >= 0 && "text-pos")}>{money(t.amount, { cents: true })}</span>
              <span className="min-w-0 truncate text-xs text-ink-3">{t.date}, <CategoryLabel id={t.classification.categoryId} compact /></span>
              <Confidence c={t.classification} />
            </button>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-8 text-center text-sm text-ink-2">Nothing matches these filters.</li>}
      </ul>

      {/* Larger screens: a proper ledger table */}
      <div className="hidden overflow-hidden rounded-lg border border-rule-strong bg-sheet md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-ink-3">
              <th className="px-4 py-2.5 font-normal">Date</th>
              <th className="px-3 py-2.5 font-normal">Transaction</th>
              <th className="px-3 py-2.5 font-normal">Category</th>
              <th className="px-3 py-2.5 font-normal">Confidence</th>
              <th className="px-4 py-2.5 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.id}
                onClick={() => openTxns([t.id], t.id)}
                onKeyDown={(e) => e.key === "Enter" && openTxns([t.id], t.id)}
                tabIndex={0}
                className="cursor-pointer border-b border-rule last:border-0 hover:bg-sheet-2 focus:bg-sheet-2"
              >
                <td className="num whitespace-nowrap px-4 py-2.5 text-ink-2">{t.date}</td>
                <td className="px-3 py-2.5">
                  <span className="block">{t.description}</span>
                  <span className="text-xs text-ink-3">{t.id}, {t.counterparty}</span>
                </td>
                <td className="px-3 py-2.5"><CategoryLabel id={t.classification.categoryId} /></td>
                <td className="px-3 py-2.5"><Confidence c={t.classification} /></td>
                <td className={cx("num whitespace-nowrap px-4 py-2.5 text-right", t.amount >= 0 && "text-pos")}>{money(t.amount, { cents: true })}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-2">Nothing matches these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {input.corrections.length > 0 && (
        <section aria-labelledby="log-h">
          <h2 id="log-h" className="font-cond text-xl font-semibold">Audit trail</h2>
          <p className="mt-1 text-sm text-ink-2">Every correction is kept on top of the original label. Undo one and the figures recalculate.</p>
          <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule-strong bg-sheet">
            {input.corrections.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <button onClick={() => openTxns([c.txnId], c.txnId)} className="num font-medium hover:underline">{c.txnId}</button>
                <span className="text-ink-2">{categoryOf(c.from).name}</span>
                <span className="text-ink-3">to</span>
                <span>{categoryOf(c.to).name}</span>
                {c.appliedToPattern && <span className="text-xs text-ink-2">(all similar)</span>}
                {c.note && <span className="text-ink-2">“{c.note}”</span>}
                <span className="ml-auto text-xs text-ink-3">{new Date(c.at).toLocaleString()}</span>
                <button onClick={() => undo(i)} className="inline-flex min-h-9 items-center gap-1 text-xs text-ink-2 hover:text-ink"><Undo2 className="size-3.5" aria-hidden /> Undo</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
