"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import CountUp from "@/components/reactbits/CountUp";
import { monthLabel } from "@/lib/finance/pnl";
import { foots, markIndex } from "@/lib/finance/tickmarks";
import type { MonthlyPnl, PnlSection } from "@/lib/finance/types";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx, money, pct } from "@/lib/format";
import { CellTicks, TICK_META, Tick, type TickKind } from "./bits";
import Briefing from "./Briefing";

type SectionKey = "revenue" | "cogs" | "payroll" | "opex";
type Marks = ReturnType<typeof markIndex>;

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

// First column stays put while the months scroll sideways on small screens.
const stickyCol = "sticky left-0 z-10 w-40 min-w-40 bg-sheet shadow-[1px_0_0_#dfe2e7] sm:w-auto sm:min-w-56 sm:shadow-none";

function Amount({ value, ids, title, marks, footed, strong }: { value: number; ids: string[]; title: string; marks: Marks; footed?: boolean; strong?: boolean }) {
  const openTxns = useStore((s) => s.openTxns);
  const text = <span className={cx("num", strong && "font-semibold", value < 0 && "text-neg")}>{money(value)}</span>;
  return (
    <td className="whitespace-nowrap py-2 pl-3 text-right">
      {ids.length ? (
        <button onClick={() => openTxns(ids, title)} className="rounded-sm hover:underline hover:decoration-ai hover:underline-offset-4" title={`Open the ${ids.length} transactions behind this figure`}>
          {text}
        </button>
      ) : (
        <span className="text-ink-3">{text}</span>
      )}
      <CellTicks marks={marks(ids)} footed={footed} />
    </td>
  );
}

function Change({ a, b, cost }: { a: number; b: number; cost?: boolean }) {
  const d = b - a;
  const good = cost ? d <= 0 : d >= 0;
  const p = a ? Math.round((d / Math.abs(a)) * 1000) / 10 : null;
  return (
    <td className={cx("num whitespace-nowrap py-2 pl-4 text-right text-sm", Math.abs(d) < 0.5 ? "text-ink-3" : good ? "text-pos" : "text-neg")}>
      {money(d, { sign: true })}
      <span className="ml-1.5 text-xs opacity-80">{pct(p)}</span>
    </td>
  );
}

function ExplainLink({ id, strong }: { id: string; strong?: boolean }) {
  const focusVariance = useStore((s) => s.focusVariance);
  return (
    <td className="py-2 pl-3 pr-4 text-right">
      <button onClick={() => focusVariance(id)} className={cx("text-xs hover:underline", strong ? "text-ai" : "text-ink-3 hover:text-ai")}>
        Explain
      </button>
    </td>
  );
}

function SectionRows({ pnls, k, open, toggle, marks }: { pnls: MonthlyPnl[]; k: SectionKey; open: boolean; toggle: () => void; marks: Marks }) {
  const sec = (p: MonthlyPnl) => p[k] as PnlSection;
  const lineIds = [...new Set(pnls.flatMap((p) => sec(p).lines.map((l) => l.categoryId)))];
  const n = pnls.length;
  const cost = k !== "revenue";
  const pair = n > 1 ? `${pnls[n - 2].month}->${pnls[n - 1].month}` : "";
  return (
    <>
      <tr className="border-t border-rule">
        <th scope="row" className={cx(stickyCol, "py-2 pl-4 pr-3 text-left font-semibold")}>
          <button onClick={toggle} className="inline-flex items-start gap-1 text-left" aria-expanded={open}>
            <ChevronRight className={cx("mt-0.5 size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-90")} aria-hidden />
            {sec(pnls[0]).label}
          </button>
        </th>
        {pnls.map((p) => (
          <Amount key={p.month} value={sec(p).total} ids={sec(p).lines.flatMap((l) => l.txnIds)} title={`${sec(p).label}, ${monthLabel(p.month)}`} marks={marks} footed={foots(sec(p).lines, sec(p).total)} strong />
        ))}
        {n > 1 && <Change a={sec(pnls[n - 2]).total} b={sec(pnls[n - 1]).total} cost={cost} />}
        {n > 1 ? <ExplainLink id={`${k}:${pair}`} strong /> : <td />}
      </tr>
      {open && lineIds.map((id) => {
        const line = (p: MonthlyPnl) => sec(p).lines.find((l) => l.categoryId === id);
        const name = pnls.map(line).find(Boolean)!.name;
        return (
          <tr key={id} className="text-sm text-ink-2">
            <th scope="row" className={cx(stickyCol, "py-1.5 pl-9 pr-3 text-left font-normal leading-snug")}>{name}</th>
            {pnls.map((p) => <Amount key={p.month} value={line(p)?.amount ?? 0} ids={line(p)?.txnIds ?? []} title={`${name}, ${monthLabel(p.month)}`} marks={marks} />)}
            {n > 1 && <Change a={line(pnls[n - 2])?.amount ?? 0} b={line(pnls[n - 1])?.amount ?? 0} cost={cost} />}
            {n > 1 ? <ExplainLink id={`${id}:${pair}`} /> : <td />}
          </tr>
        );
      })}
    </>
  );
}

function TotalRow({ label, pnls, get, metric, margin }: { label: string; pnls: MonthlyPnl[]; get: (p: MonthlyPnl) => number; metric: string; margin: (p: MonthlyPnl) => number | null }) {
  const n = pnls.length;
  return (
    <tr className="border-y-2 border-ink/80">
      <th scope="row" className={cx(stickyCol, "py-2.5 pl-4 pr-3 text-left font-cond text-base font-semibold")}>{label}</th>
      {pnls.map((p) => (
        <td key={p.month} className="whitespace-nowrap py-2.5 pl-3 pr-9 text-right">
          <span className={cx("num font-semibold", get(p) < 0 && "text-neg")}>{money(get(p))}</span>
          <span className="num block text-xs text-ink-3">{margin(p) === null ? "" : `${margin(p)!.toFixed(1)}% margin`}</span>
        </td>
      ))}
      {n > 1 && <Change a={get(pnls[n - 2])} b={get(pnls[n - 1])} />}
      {n > 1 ? <ExplainLink id={`${metric}:${pnls[n - 2].month}->${pnls[n - 1].month}`} strong /> : <td />}
    </tr>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-2" aria-label="Tickmark legend">
      {(Object.keys(TICK_META) as TickKind[]).map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5"><Tick kind={k} /> {TICK_META[k].label}</li>
      ))}
    </ul>
  );
}

export default function Overview() {
  const ws = useWorkspace();
  const openTxns = useStore((s) => s.openTxns);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ revenue: true, cogs: true, payroll: false, opex: false });
  const marks = useMemo(() => (ws ? markIndex(ws) : () => ({ agreed: false, flagged: 0, adjusted: false })), [ws]);
  if (!ws) return null;
  const { pnls } = ws;
  const n = pnls.length;
  const allTie = pnls.every((p) => p.reconciles);
  const nonPnlIds = [...new Set(pnls.flatMap((p) => p.nonPnl.lines.map((l) => l.categoryId)))];
  const openItems = ws.review.filter((i) => i.resolution?.status !== "resolved").length;
  const period = n > 1 ? `${monthLabel(pnls[0].month, true).split(" ")[0]} to ${monthLabel(pnls[n - 1].month, true)}` : monthLabel(pnls[0].month, true);
  const cols = n + (n > 1 ? 3 : 2);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div>
          <h1 className="font-cond text-3xl font-semibold tracking-tight sm:text-4xl">Profit and loss</h1>
          <p className="mt-1.5 text-ink-2">
            {period}. {ws.ledger.length} bank transactions.{" "}
            <span className={allTie ? "text-pos" : "text-neg"}>{allTie ? "Every month ties to the bank." : "A month does not tie to the bank."}</span>
          </p>
        </div>
        <dl className="grid w-full grid-cols-3 divide-x divide-rule border-y border-rule sm:w-auto sm:border-0" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {pnls.map((p, i) => (
            <div key={p.month} className="px-3 py-2 first:pl-0 sm:px-5 sm:py-0">
              <dt className="text-xs text-ink-3"><span className="hidden sm:inline">Operating profit, </span>{monthLabel(p.month).split(" ")[0]}<span className="sm:hidden"> profit</span></dt>
              <dd className={cx("num font-cond text-xl font-semibold sm:text-3xl", p.operatingProfit < 0 && "text-neg")}>
                <ProfitFigure value={p.operatingProfit} delay={i * 0.12} />
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <Briefing />

      <section aria-labelledby="pnl-h" className="rounded-lg border border-rule-strong bg-sheet">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
          <h2 id="pnl-h" className="font-cond text-lg font-semibold">Monthly statement</h2>
          <p className="text-xs text-ink-3">Select any figure to see its transactions.</p>
        </div>
        <div className="border-b border-rule px-4 py-2.5">
          <Legend />
          {openItems > 0 && <p className="mt-1.5 text-xs text-ink-3">{openItems} open review items are flagged in the figures they affect.</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="text-sm">
                <th className={cx(stickyCol, "py-2.5 pl-4 text-left font-normal text-ink-3")}><span className="sr-only">Line</span></th>
                {pnls.map((p) => <th key={p.month} scope="col" className="py-2.5 pl-3 pr-9 text-right font-semibold">{monthLabel(p.month)}</th>)}
                {n > 1 && <th scope="col" className="py-2.5 pl-4 text-right font-normal text-ink-2">{monthLabel(pnls[n - 1].month).split(" ")[0]} vs {monthLabel(pnls[n - 2].month).split(" ")[0]}</th>}
                <th className="w-16"><span className="sr-only">Explain</span></th>
              </tr>
            </thead>
            <tbody>
              <SectionRows pnls={pnls} k="revenue" open={open.revenue} toggle={() => setOpen({ ...open, revenue: !open.revenue })} marks={marks} />
              <SectionRows pnls={pnls} k="cogs" open={open.cogs} toggle={() => setOpen({ ...open, cogs: !open.cogs })} marks={marks} />
              <TotalRow label="Gross profit" pnls={pnls} get={(p) => p.grossProfit} metric="grossProfit" margin={(p) => p.grossMargin} />
              <SectionRows pnls={pnls} k="payroll" open={open.payroll} toggle={() => setOpen({ ...open, payroll: !open.payroll })} marks={marks} />
              <SectionRows pnls={pnls} k="opex" open={open.opex} toggle={() => setOpen({ ...open, opex: !open.opex })} marks={marks} />
              <TotalRow label="Operating profit" pnls={pnls} get={(p) => p.operatingProfit} metric="operatingProfit" margin={(p) => p.operatingMargin} />

              {nonPnlIds.length > 0 && (
                <>
                  <tr>
                    <th colSpan={cols} scope="rowgroup" className="px-4 pb-1 pt-6 text-left">
                      <span className="font-cond text-base font-semibold">Kept out of the P&L</span>
                      <span className="ml-2 text-xs font-normal text-ink-3">Real cash movements that belong on the balance sheet or in equity</span>
                    </th>
                  </tr>
                  {nonPnlIds.map((id) => {
                    const line = (p: MonthlyPnl) => p.nonPnl.lines.find((l) => l.categoryId === id);
                    const name = pnls.map(line).find(Boolean)!.name;
                    return (
                      <tr key={id} className="border-t border-rule text-sm">
                        <th scope="row" className={cx(stickyCol, "py-1.5 pl-4 pr-3 text-left font-normal text-flag")}>{name}</th>
                        {pnls.map((p) => <Amount key={p.month} value={line(p)?.amount ?? 0} ids={line(p)?.txnIds ?? []} title={`${name}, ${monthLabel(p.month)}`} marks={marks} />)}
                        <td colSpan={n > 1 ? 2 : 1} />
                      </tr>
                    );
                  })}
                </>
              )}

              <tr>
                <th colSpan={cols} scope="rowgroup" className="px-4 pb-1 pt-6 text-left font-cond text-base font-semibold">Tie-out to bank</th>
              </tr>
              {[
                { label: "Operating profit", get: (p: MonthlyPnl) => p.operatingProfit },
                { label: "Cash kept out of the P&L", get: (p: MonthlyPnl) => p.nonPnl.netCashEffect },
              ].map((r) => (
                <tr key={r.label} className="border-t border-rule text-sm text-ink-2">
                  <th scope="row" className={cx(stickyCol, "py-1.5 pl-4 pr-3 text-left font-normal")}>{r.label}</th>
                  {pnls.map((p) => <td key={p.month} className="num py-1.5 pl-3 pr-9 text-right">{money(r.get(p), { cents: true })}</td>)}
                  <td colSpan={n > 1 ? 2 : 1} />
                </tr>
              ))}
              <tr className="border-t border-ink/60 text-sm">
                <th scope="row" className={cx(stickyCol, "py-2 pl-4 pr-3 text-left font-semibold")}>Net movement in the bank account</th>
                {pnls.map((p) => (
                  <td key={p.month} className="whitespace-nowrap py-2 pl-3 text-right">
                    <button
                      onClick={() => openTxns(ws.ledger.filter((t) => t.month === p.month).map((t) => t.id), `All transactions, ${monthLabel(p.month)}`)}
                      className="num font-semibold hover:underline hover:decoration-ai hover:underline-offset-4"
                    >
                      {money(p.netBankMovement, { cents: true })}
                    </button>
                    <span className="inline-flex w-9 pl-1">{p.reconciles ? <Tick kind="agreed" /> : <span className="text-xs text-neg">off</span>}</span>
                  </td>
                ))}
                <td colSpan={n > 1 ? 2 : 1} />
              </tr>
              <tr><td colSpan={cols} className="h-3" /></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
