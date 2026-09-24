"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { categoryOf } from "@/lib/finance/chartOfAccounts";
import type { Transaction } from "@/lib/finance/types";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx, money } from "@/lib/format";
import { CategoryLabel, CategorySelect, Confidence } from "./bits";

function Correction({ t, similar }: { t: Transaction; similar: number }) {
  const correct = useStore((s) => s.correct);
  const [to, setTo] = useState(t.classification.categoryId);
  const [note, setNote] = useState("");
  const [all, setAll] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = to !== t.classification.categoryId;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed) return;
        correct({ txnId: t.id, from: t.classification.categoryId, to, note: note || undefined, appliedToPattern: all ? t.pattern : undefined });
        setSaved(true);
      }}
      className="space-y-3 rounded-xl border border-line bg-ink-2 p-4"
    >
      <label htmlFor={`cat-${t.id}`} className="block text-sm font-medium">Category</label>
      <CategorySelect id={`cat-${t.id}`} value={to} onChange={(v) => { setTo(v); setSaved(false); }} />
      {changed && (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (optional), e.g. confirmed with invoice"
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm placeholder:text-faint"
          />
          {similar > 1 && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-[var(--iris)]" />
              Apply to all {similar} transactions with this pattern
            </label>
          )}
          {categoryOf(to).section !== categoryOf(t.classification.categoryId).section && (
            <p className="text-xs text-amber">
              Moves from {categoryOf(t.classification.categoryId).section === "non_pnl" ? "below the line" : categoryOf(t.classification.categoryId).section.toUpperCase()} to{" "}
              {categoryOf(to).section === "non_pnl" ? "below the line (excluded from P&L)" : categoryOf(to).section.toUpperCase()}. The P&L will recalculate.
            </p>
          )}
        </>
      )}
      <div className="flex items-center gap-3">
        <button disabled={!changed} className="rounded-lg bg-paper px-4 py-2 text-sm font-medium text-ink disabled:opacity-30">Save correction</button>
        {saved && <span className="text-sm text-teal" role="status">Correction saved. The P&L, variances and review queue have been updated.</span>}
      </div>
    </form>
  );
}

function Detail({ t, ledger }: { t: Transaction; ledger: Transaction[] }) {
  const similar = ledger.filter((x) => x.pattern === t.pattern).length;
  const c = t.classification;
  return (
    <div className="space-y-6">
      <div>
        <p className="num text-3xl font-semibold tracking-tight">{money(t.amount, { cents: true })}</p>
        <p className="mt-1 text-paper">{t.description}</p>
        <p className="text-sm text-muted">{t.counterparty}, {t.date}, {t.method}</p>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CategoryLabel id={c.categoryId} />
          <Confidence c={c} />
        </div>
        <p className="text-sm text-muted">{c.rationale}</p>
        {categoryOf(c.categoryId).treatment && <p className="text-sm text-amber/90">{categoryOf(c.categoryId).treatment}</p>}
        {c.alternative && (
          <p className="rounded-lg border border-line p-3 text-sm text-muted">
            <span className="text-paper">{c.source === "user" ? "Machine suggested" : "Alternative"}: </span>
            {categoryOf(c.alternative.categoryId).name}{" "}
            <span className={c.alternative.source === "ai" ? "text-iris" : "text-faint"}>({c.alternative.source === "ai" ? "AI" : "rule"})</span>. {c.alternative.rationale}
          </p>
        )}
      </div>
      <Correction key={`${t.id}:${c.categoryId}`} t={t} similar={similar} />
    </div>
  );
}

export default function TxnDrawer() {
  const ids = useStore((s) => s.drawerTxnIds);
  return ids ? <DrawerBody key={ids.join(",")} ids={ids} /> : null;
}

function DrawerBody({ ids }: { ids: string[] }) {
  const ws = useWorkspace();
  const title = useStore((s) => s.drawerTitle);
  const close = useStore((s) => s.closeDrawer);
  const [focus, setFocus] = useState<string | null>(ids.length === 1 ? ids[0] : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const rows = useMemo(() => (ws ? ids.map((id) => ws.txnById.get(id)).filter((t): t is Transaction => Boolean(t)) : []), [ws, ids]);
  if (!ws) return null;
  const focused = focus ? ws.txnById.get(focus) : null;
  const total = rows.reduce((a, t) => a + t.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={close} aria-label="Close" />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-panel shadow-2xl">
        <header className="flex items-center gap-3 border-b border-line px-5 py-4">
          {focused && rows.length > 1 && (
            <button onClick={() => setFocus(null)} className="text-muted hover:text-paper" aria-label="Back to list"><ArrowLeft className="size-4" /></button>
          )}
          <h2 className="flex-1 truncate font-display text-lg font-semibold">{focused && rows.length > 1 ? focused.id : title}</h2>
          <button onClick={close} className="text-muted hover:text-paper" aria-label="Close"><X className="size-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {focused ? (
            <Detail t={focused} ledger={ws.ledger} />
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">
                {rows.length} transactions, net <span className="num text-paper">{money(total, { cents: true })}</span>. Select one to inspect or correct it.
              </p>
              <ul className="divide-y divide-line">
                {rows.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => setFocus(t.id)} className="grid w-full grid-cols-[4.5rem_1fr_auto] items-baseline gap-3 py-2.5 text-left hover:bg-panel-2/60">
                      <span className="num text-xs text-faint">{t.id}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{t.description}</span>
                        <span className="text-xs text-muted">{t.date}, <CategoryLabel id={t.classification.categoryId} /></span>
                      </span>
                      <span className={cx("num text-sm", t.amount >= 0 ? "text-teal" : "text-paper")}>{money(t.amount, { cents: true })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
