"use client";

import { Fragment, useState } from "react";
import { ChevronRight, CircleCheck, CircleAlert } from "lucide-react";
import CountUp from "@/components/reactbits/CountUp";
import { monthLabel } from "@/lib/finance/pnl";
import type { MonthlyPnl, PnlSection } from "@/lib/finance/types";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx, money, pct } from "@/lib/format";
import Briefing from "./Briefing";

type SectionKey = "revenue" | "cogs" | "payroll" | "opex";

/** Animated once, then snapped to the exact figure (a spring's slow tail must never show a wrong number). */
function ProfitFigure({ value, delay }: { value: number; delay: number }) {
  const [done, setDone] = useState(false);
  if (done) return <>{money(value)}</>;
  return (
    <>
      {value < 0 && "−"}$<CountUp to={Math.abs(Math.round(value))} separator="," duration={1} delay={delay} onEnd={() => setDone(true)} />
    </>
  );
}

function Cell({ value, ids, title, strong }: { value: number; ids?: string[]; title: string; strong?: boolean }) {
  const openTxns = useStore((s) => s.openTxns);
  const content = <span className={cx("num", strong && "font-semibold", value < 0 && "text-tomato")}>{money(value)}</span>;
  if (!ids?.length) return <td className="px-3 py-2 text-right">{content}</td>;
  return (
    <td className="px-3 py-2 text-right">
      <button onClick={() => openTxns(ids, title)} className="rounded px-1 hover:bg-panel-2 hover:underline hover:decoration-iris hover:underline-offset-4" title={`Show ${ids.length} transactions`}>
        {content}
      </button>
    </td>
  );
}

function DeltaCell({ a, b, cost }: { a: number; b: number; cost?: boolean }) {
  const d = b - a;
  const good = cost ? d <= 0 : d >= 0;
  const p = a ? (d / Math.abs(a)) * 100 : null;
  return (
    <td className={cx("num px-3 py-2 text-right text-sm", Math.abs(d) < 0.5 ? "text-faint" : good ? "text-teal" : "text-tomato")}>
      {money(d, { sign: true })} <span className="text-xs opacity-70">{pct(p === null ? null : Math.round(p * 10) / 10)}</span>
    </td>
  );
}

function SectionRows({ pnls, k, open, toggle }: { pnls: MonthlyPnl[]; k: SectionKey; open: boolean; toggle: () => void }) {
  const focusVariance = useStore((s) => s.focusVariance);
  const sec = (p: MonthlyPnl) => p[k] as PnlSection;
  const lineIds = [...new Set(pnls.flatMap((p) => sec(p).lines.map((l) => l.categoryId)))];
  const n = pnls.length;
  const cost = k !== "revenue";
  return (
    <>
      <tr className="border-t border-line">
        <th scope="row" className="px-3 py-2 text-left font-medium">
          <button onClick={toggle} className="inline-flex items-center gap-1.5" aria-expanded={open}>
            <ChevronRight className={cx("size-4 text-faint transition-transform", open && "rotate-90")} aria-hidden />
            {sec(pnls[0]).label}
          </button>
        </th>
        {pnls.map((p) => <Cell key={p.month} value={sec(p).total} ids={sec(p).lines.flatMap((l) => l.txnIds)} title={`${sec(p).label}, ${monthLabel(p.month)}`} strong />)}
        {n > 1 && <DeltaCell a={sec(pnls[n - 2]).total} b={sec(pnls[n - 1]).total} cost={cost} />}
        <td className="px-3 py-2 text-right">
          {n > 1 && (
            <button onClick={() => focusVariance(`${k}:${pnls[n - 2].month}->${pnls[n - 1].month}`)} className="text-xs text-iris hover:underline">
              Why?
            </button>
          )}
        </td>
      </tr>
      {open && lineIds.map((id) => {
        const line = (p: MonthlyPnl) => sec(p).lines.find((l) => l.categoryId === id);
        const name = pnls.map(line).find(Boolean)!.name;
        return (
          <tr key={id} className="text-sm text-muted">
            <th scope="row" className="py-1.5 pl-10 pr-3 text-left font-normal">{name}</th>
            {pnls.map((p) => <Cell key={p.month} value={line(p)?.amount ?? 0} ids={line(p)?.txnIds} title={`${name}, ${monthLabel(p.month)}`} />)}
            {n > 1 && <DeltaCell a={line(pnls[n - 2])?.amount ?? 0} b={line(pnls[n - 1])?.amount ?? 0} cost={cost} />}
            <td className="px-3 py-1.5 text-right">
              {n > 1 && (
                <button onClick={() => focusVariance(`${id}:${pnls[n - 2].month}->${pnls[n - 1].month}`)} className="text-xs text-faint hover:text-iris">Why?</button>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function TotalRow({ label, pnls, get, metric, margin }: { label: string; pnls: MonthlyPnl[]; get: (p: MonthlyPnl) => number; metric: string; margin: (p: MonthlyPnl) => number | null }) {
  const focusVariance = useStore((s) => s.focusVariance);
  const n = pnls.length;
  return (
    <tr className="border-y border-paper/30 bg-panel-2/50">
      <th scope="row" className="px-3 py-2.5 text-left font-display font-semibold">{label}</th>
      {pnls.map((p) => (
        <td key={p.month} className="px-3 py-2.5 text-right">
          <span className={cx("num font-semibold", get(p) < 0 && "text-tomato")}>{money(get(p))}</span>
          <span className="num block text-xs text-faint">{margin(p) === null ? "" : `${margin(p)!.toFixed(1)}% margin`}</span>
        </td>
      ))}
      {n > 1 && <DeltaCell a={get(pnls[n - 2])} b={get(pnls[n - 1])} />}
      <td className="px-3 py-2.5 text-right">
        {n > 1 && <button onClick={() => focusVariance(`${metric}:${pnls[n - 2].month}->${pnls[n - 1].month}`)} className="text-xs text-iris hover:underline">Why?</button>}
      </td>
    </tr>
  );
}

export default function Overview() {
  const ws = useWorkspace();
  const openTxns = useStore((s) => s.openTxns);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ revenue: true, cogs: true, payroll: false, opex: false });
  if (!ws) return null;
  const { pnls } = ws;
  const n = pnls.length;
  const allReconcile = pnls.every((p) => p.reconciles);
  const nonPnlIds = [...new Set(pnls.flatMap((p) => p.nonPnl.lines.map((l) => l.categoryId)))];

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            {monthLabel(pnls[0].month, true).split(" ")[0]} to {monthLabel(pnls[n - 1].month, true)} review
          </h1>
          <p className="mt-2 text-muted">{ws.ledger.length} bank transactions, categorized and reconciled.</p>
        </div>
        <div className="grid grid-cols-3 gap-4 sm:flex sm:gap-8">
          {pnls.map((p, i) => (
            <div key={p.month}>
              <p className="text-xs text-muted sm:text-sm"><span className="hidden sm:inline">Operating profit, </span>{monthLabel(p.month).split(" ")[0]}<span className="sm:hidden"> profit</span></p>
              <p className={cx("num font-display text-xl font-semibold sm:text-3xl", p.operatingProfit < 0 ? "text-tomato" : "text-paper")}>
                <ProfitFigure value={p.operatingProfit} delay={i * 0.15} />
              </p>
            </div>
          ))}
        </div>
      </header>

      <Briefing />

      <section aria-labelledby="pnl-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="pnl-h" className="font-display text-xl font-semibold">Profit and loss</h2>
          <p className={cx("inline-flex items-center gap-1.5 text-sm", allReconcile ? "text-teal" : "text-tomato")}>
            {allReconcile ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
            {allReconcile ? "Every month reconciles to the bank to the cent" : "Reconciliation gap: check non-P&L items"}
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="text-sm text-muted">
                <th className="px-3 py-3 text-left font-normal"><span className="sr-only">Line</span></th>
                {pnls.map((p) => <th key={p.month} scope="col" className="px-3 py-3 text-right font-medium text-paper">{monthLabel(p.month)}</th>)}
                {n > 1 && <th scope="col" className="px-3 py-3 text-right font-normal">{monthLabel(pnls[n - 1].month).split(" ")[0]} vs {monthLabel(pnls[n - 2].month).split(" ")[0]}</th>}
                <th className="w-14"><span className="sr-only">Explain</span></th>
              </tr>
            </thead>
            <tbody>
              <SectionRows pnls={pnls} k="revenue" open={open.revenue} toggle={() => setOpen({ ...open, revenue: !open.revenue })} />
              <SectionRows pnls={pnls} k="cogs" open={open.cogs} toggle={() => setOpen({ ...open, cogs: !open.cogs })} />
              <TotalRow label="Gross profit" pnls={pnls} get={(p) => p.grossProfit} metric="grossProfit" margin={(p) => p.grossMargin} />
              <SectionRows pnls={pnls} k="payroll" open={open.payroll} toggle={() => setOpen({ ...open, payroll: !open.payroll })} />
              <SectionRows pnls={pnls} k="opex" open={open.opex} toggle={() => setOpen({ ...open, opex: !open.opex })} />
              <TotalRow label="Operating profit" pnls={pnls} get={(p) => p.operatingProfit} metric="operatingProfit" margin={(p) => p.operatingMargin} />
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="below-h" className="grid gap-6 2xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <h2 id="below-h" className="font-display text-xl font-semibold">Kept out of the P&L</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-muted">
            These cash movements are real but aren&apos;t operating income or expense. They sit on the balance sheet or in equity.
          </p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <tbody>
                {nonPnlIds.map((id) => {
                  const line = (p: MonthlyPnl) => p.nonPnl.lines.find((l) => l.categoryId === id);
                  const name = pnls.map(line).find(Boolean)!.name;
                  return (
                    <tr key={id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-3 py-2 text-left font-normal text-amber">{name}</th>
                      {pnls.map((p) => <Cell key={p.month} value={line(p)?.amount ?? 0} ids={line(p)?.txnIds} title={`${name}, ${monthLabel(p.month)}`} />)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-2xl border border-line p-4 text-sm">
          <h3 className="font-medium">Bank reconciliation</h3>
          <dl className="mt-3 grid gap-4 sm:grid-cols-3 2xl:grid-cols-1">
            {pnls.map((p) => (
              <Fragment key={p.month}>
                <div>
                  <dt className="text-muted">{monthLabel(p.month)}</dt>
                  <dd className="num mt-0.5 flex justify-between"><span>Operating profit</span><span>{money(p.operatingProfit, { cents: true })}</span></dd>
                  <dd className="num flex justify-between text-amber"><span>Non-P&L</span><span>{money(p.nonPnl.netCashEffect, { cents: true })}</span></dd>
                  <dd className="num flex justify-between border-t border-line pt-0.5">
                    <button className="hover:underline" onClick={() => openTxns(ws.ledger.filter((t) => t.month === p.month).map((t) => t.id), `All transactions, ${monthLabel(p.month)}`)}>Net bank movement</button>
                    <span className={p.reconciles ? "text-teal" : "text-tomato"}>{money(p.netBankMovement, { cents: true })}</span>
                  </dd>
                </div>
              </Fragment>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
