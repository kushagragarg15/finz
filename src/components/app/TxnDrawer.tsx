"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { categoryOf } from "@/lib/finance/chartOfAccounts";
import type { Transaction } from "@/lib/finance/types";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx, money } from "@/lib/format";
import { CategoryLabel, CategorySelect, Confidence } from "./bits";

const sectionName = (id: string) => {
  const s = categoryOf(id).section;
  return s === "non_pnl" ? "off the P&L" : { revenue: "Revenue", cogs: "Cost of goods sold", payroll: "Payroll", opex: "Operating expenses" }[s];
};

function Correction({ t, similar }: { t: Transaction; similar: number }) {
  const correct = useStore((s) => s.correct);
  const [to, setTo] = useState(t.classification.categoryId);
  const [note, setNote] = useState("");
  const [all, setAll] = useState(false);
  const [saved, setSaved] = useState(false);
  const from = t.classification.categoryId;
  const changed = to !== from;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed) return;
        correct({ txnId: t.id, from, to, note: note || undefined, appliedToPattern: all ? t.pattern : undefined });
        setSaved(true);
      }}
      className="space-y-3 border-t border-rule pt-5"
    >
      <label htmlFor={`cat-${t.id}`} className="block font-medium">Category</label>
      <CategorySelect id={`cat-${t.id}`} value={to} onChange={(v) => { setTo(v); setSaved(false); }} />
      {changed && (
        <>
          {categoryOf(to).section !== categoryOf(from).section && (
            <p className="text-sm text-flag">Moves this from {sectionName(from)} to {sectionName(to)}. The statement recalculates when you save.</p>
          )}
          <div>
            <label htmlFor={`note-${t.id}`} className="block text-sm text-ink-2">Reason (optional)</label>
            <input
              id={`note-${t.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Confirmed against the invoice"
              className="mt-1 h-11 w-full rounded-md border border-rule-strong bg-sheet px-3 text-[16px] placeholder:text-ink-3 sm:text-sm"
            />
          </div>
          {similar > 1 && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4 accent-[var(--ink)]" />
              Apply to all {similar} transactions like this one
            </label>
          )}
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={!changed} className="h-11 rounded-md bg-ink px-4 text-sm font-medium text-white disabled:opacity-25">Save correction</button>
        {saved && <span className="text-sm text-pos" role="status">Saved. The statement, changes and review list are updated.</span>}
      </div>
    </form>
  );
}

function Detail({ t, ledger }: { t: Transaction; ledger: Transaction[] }) {
  const similar = ledger.filter((x) => x.pattern === t.pattern).length;
  const c = t.classification;
  const cat = categoryOf(c.categoryId);
  return (
    <div className="space-y-5">
      <div>
        <p className={cx("num font-cond text-3xl font-semibold", t.amount < 0 ? "text-ink" : "text-pos")}>{money(t.amount, { cents: true })}</p>
        <p className="mt-1">{t.description}</p>
        <p className="text-sm text-ink-3">{t.counterparty}, {t.date}, {t.method}</p>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="sr-only">Category</dt>
          <dd className="font-medium"><CategoryLabel id={c.categoryId} /></dd>
          <dd><Confidence c={c} /></dd>
        </div>
        <dd className="text-ink-2">{c.rationale}</dd>
        {cat.treatment && <dd className="rounded-md bg-flag-wash px-3 py-2 text-flag">{cat.treatment}</dd>}
        {c.alternative && (
          <dd className="rounded-md border border-rule px-3 py-2 text-ink-2">
            <span className="text-ink">{c.source === "user" ? "Machine suggestion was" : "The other opinion"}: {categoryOf(c.alternative.categoryId).name}</span>{" "}
            <span className={c.alternative.source === "ai" ? "text-ai" : "text-ink-3"}>({c.alternative.source === "ai" ? "AI" : "rule"})</span>. {c.alternative.rationale}
          </dd>
        )}
      </dl>
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
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const rows = useMemo(() => (ws ? ids.map((id) => ws.txnById.get(id)).filter((t): t is Transaction => Boolean(t)) : []), [ws, ids]);
  if (!ws) return null;
  const focused = focus ? ws.txnById.get(focus) : null;
  const total = rows.reduce((a, t) => a + t.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-ink/30" onClick={close} aria-label="Close" tabIndex={-1} />
      <aside className="relative flex max-h-[88dvh] w-full flex-col rounded-t-xl border-t border-rule-strong bg-sheet shadow-2xl sm:h-full sm:max-h-none sm:max-w-lg sm:rounded-none sm:border-l sm:border-t-0">
        <header className="flex min-h-14 items-center gap-2 border-b border-rule px-4 sm:px-5">
          {focused && rows.length > 1 && (
            <button onClick={() => setFocus(null)} className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sheet-2" aria-label="Back to the list"><ArrowLeft className="size-4" /></button>
          )}
          <h2 className="min-w-0 flex-1 truncate font-cond text-lg font-semibold">{focused && rows.length > 1 ? focused.id : title}</h2>
          <button ref={closeRef} onClick={close} className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-sheet-2" aria-label="Close"><X className="size-5" /></button>
        </header>
        <div className="pb-safe flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          {focused ? (
            <Detail t={focused} ledger={ws.ledger} />
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-2">
                {rows.length} transactions, net <span className="num font-medium text-ink">{money(total, { cents: true })}</span>. Select one to see why it was categorized that way, or to correct it.
              </p>
              <ul className="divide-y divide-rule border-y border-rule">
                {rows.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => setFocus(t.id)} className="grid w-full grid-cols-[1fr_auto] items-baseline gap-3 py-2.5 text-left hover:bg-sheet-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{t.description}</span>
                        <span className="text-xs text-ink-3">{t.id}, {t.date}, <CategoryLabel id={t.classification.categoryId} compact /></span>
                      </span>
                      <span className={cx("num text-sm", t.amount >= 0 && "text-pos")}>{money(t.amount, { cents: true })}</span>
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
