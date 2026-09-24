"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import ShinyText from "@/components/reactbits/ShinyText";
import { monthLabel } from "@/lib/finance/pnl";
import type { Variance, VarianceDriver } from "@/lib/finance/types";
import { dataKey, explainVariance } from "@/lib/client";
import { useStore } from "@/lib/store";
import { useWorkspace } from "@/lib/useWorkspace";
import { cx, money, pct } from "@/lib/format";
import { AiMark, EvidenceButton } from "./bits";
import { Markdown } from "./Answer";

function DriverRow({ d, max, v }: { d: VarianceDriver; max: number; v: Variance }) {
  const [open, setOpen] = useState(false);
  const w = max ? Math.max(2, (Math.abs(d.effect) / max) * 100) : 0;
  // For profit/revenue metrics a positive effect is good; for cost metrics more cost is bad.
  const isCostMetric = ["cogs", "payroll", "opex"].includes(v.metric) || /^(cogs|pay|opex)_/.test(v.metric);
  const favorable = isCostMetric ? d.effect <= 0 : d.effect >= 0;
  const ids = [...d.txnIdsFrom, ...d.txnIdsTo];
  return (
    <li className="py-2.5">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 md:grid-cols-[minmax(0,16rem)_1fr_auto]">
        <button onClick={() => setOpen(!open)} className="flex min-w-0 items-center gap-1.5 text-left text-sm" aria-expanded={open} disabled={!d.children?.length}>
          {d.children?.length ? <ChevronRight className={cx("size-3.5 shrink-0 text-faint transition-transform", open && "rotate-90")} /> : <span className="w-3.5" />}
          <span className="truncate">{d.label}</span>
        </button>
        <div className="order-3 col-span-2 h-2 rounded-full bg-line/40 md:order-none md:col-span-1">
          <div className={cx("h-2 rounded-full", favorable ? "bg-teal" : "bg-tomato")} style={{ width: `${w}%` }} />
        </div>
        <span className={cx("num text-right text-sm", favorable ? "text-teal" : "text-tomato")}>{money(d.effect, { sign: true })}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 pl-5 text-xs text-faint">
        <span className="num">{money(d.from)} to {money(d.to)}</span>
        {d.note && <span className="text-amber/90">{d.note}</span>}
        <EvidenceButton ids={ids} title={`${d.label}: ${monthLabel(v.fromMonth)} and ${monthLabel(v.toMonth)}`} />
      </div>
      {open && d.children && (
        <ul className="mt-2 space-y-1.5 border-l border-line pl-4 ml-2">
          {d.children.map((c) => (
            <li key={c.key} className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span className="text-muted">{c.label}</span>
              <span className="num text-paper">{money(c.delta, { sign: true })}</span>
              {c.note && <span className="text-amber/90">{c.note}</span>}
              <EvidenceButton ids={[...c.txnIdsFrom, ...c.txnIdsTo]} title={c.label} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Narrative({ v }: { v: Variance }) {
  const input = useStore((s) => s.input)!;
  const cached = useStore((s) => s.narratives[v.id]);
  const setNarrative = useStore((s) => s.setNarrative);
  const [failed, setFailed] = useState<string | null>(null);
  const key = dataKey(input);
  const fresh = cached && cached.key === key;
  const loading = !fresh && failed !== `${v.id}:${key}`;

  useEffect(() => {
    if (fresh) return;
    let cancelled = false;
    explainVariance(input, v.id)
      .then((r) => { if (!cancelled) setNarrative(v.id, { ...r, key }); })
      .catch(() => { if (!cancelled) setFailed(`${v.id}:${key}`); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.id, key]);

  return (
    <div className={cx("rounded-xl border p-4", cached?.source === "template" ? "border-line bg-ink-2" : "border-iris/25 bg-iris-deep/10")}>
      <div className="mb-1.5">
        {cached?.source === "template" ? <span className="text-xs text-muted">Computed summary (AI unavailable or failed verification)</span> : <AiMark label="Explanation written by AI, figures verified" />}
      </div>
      {loading ? (
        <ShinyText text="Explaining the drivers…" color="#8b80d6" shineColor="#ede9e0" speed={1.8} className="text-sm" />
      ) : cached ? (
        <div className="text-muted"><Markdown text={cached.text} /></div>
      ) : (
        <p className="text-sm text-amber">The explanation could not be generated. The drivers below are still exact.</p>
      )}
    </div>
  );
}

function Detail({ v }: { v: Variance }) {
  const ws = useWorkspace()!;
  const ask = useStore((s) => s.ask);
  const max = Math.max(...v.drivers.map((d) => Math.abs(d.effect)), 1);
  const allIds = [...new Set(v.drivers.flatMap((d) => [...d.txnIdsFrom, ...d.txnIdsTo]))];
  const trend = ws.pnls.map((p) => {
    const vv = ws.variances.find((x) => x.metric === v.metric && x.toMonth === p.month);
    return { month: p.month, value: vv ? vv.to : ws.variances.find((x) => x.metric === v.metric && x.fromMonth === p.month)?.from ?? 0 };
  });
  const tmax = Math.max(...trend.map((t) => Math.abs(t.value)), 1);

  return (
    <article className="space-y-6">
      <header>
        <p className="text-sm text-muted">{monthLabel(v.fromMonth, true)} to {monthLabel(v.toMonth, true)}</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">{v.metricLabel}</h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
          <span className="num text-muted">{money(v.from)} to {money(v.to)}</span>
          <span className={cx("num font-display text-2xl font-semibold", v.impact === "favorable" ? "text-teal" : "text-tomato")}>{money(v.delta, { sign: true })}</span>
          <span className={cx("num text-sm", v.impact === "favorable" ? "text-teal" : "text-tomato")}>{pct(v.pct)}</span>
          <span className="text-sm text-muted">{v.impact}{v.material ? ", material" : ", below materiality"}</span>
        </p>
      </header>

      <div className="flex items-end gap-3" aria-label="Monthly trend">
        {trend.map((t) => (
          <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
            <span className="num text-xs text-muted">{money(t.value)}</span>
            <div className="flex h-16 w-full items-end">
              <div className={cx("w-full rounded-t-md", t.month === v.toMonth ? "bg-paper/80" : t.month === v.fromMonth ? "bg-paper/35" : "bg-line")} style={{ height: `${(Math.abs(t.value) / tmax) * 100}%` }} />
            </div>
            <span className="text-xs text-faint">{monthLabel(t.month).split(" ")[0]}</span>
          </div>
        ))}
      </div>

      <Narrative v={v} />

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium">What drove it</h3>
          <EvidenceButton ids={allIds} title={`Transactions behind ${v.metricLabel}, ${monthLabel(v.fromMonth)} to ${monthLabel(v.toMonth)}`}>
            Show all {allIds.length} transactions behind this variance
          </EvidenceButton>
        </div>
        <ul className="mt-2 divide-y divide-line/60">{v.drivers.slice(0, 10).map((d) => <DriverRow key={d.key} d={d} max={max} v={v} />)}</ul>
      </section>

      {v.context.length > 0 && (
        <section>
          <h3 className="font-medium">Context</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">{v.context.map((c) => <li key={c} className="border-l-2 border-amber/50 pl-3">{c}</li>)}</ul>
        </section>
      )}

      <button onClick={() => ask(`Explain the change in ${v.metricLabel} from ${monthLabel(v.fromMonth, true)} to ${monthLabel(v.toMonth, true)}. Separate timing effects and one-offs from underlying performance.`)} className="text-sm text-iris hover:underline">
        Discuss this with the analyst
      </button>
    </article>
  );
}

export default function Variances() {
  const ws = useWorkspace();
  const focusId = useStore((s) => s.focusVarianceId);
  const focusVariance = useStore((s) => s.focusVariance);
  const [showAll, setShowAll] = useState(false);
  const pairs = useMemo(() => (ws ? ws.months.slice(1).map((m, i) => `${ws.months[i]}->${m}`) : []), [ws]);
  const [pair, setPair] = useState<string | null>(null);

  const activePair = focusId ? focusId.split(":")[1] : pair ?? pairs[pairs.length - 1];
  if (!ws) return null;
  const list = ws.variances
    .filter((v) => `${v.fromMonth}->${v.toMonth}` === activePair && (showAll || v.material || v.id === focusId))
    .sort((a, b) => (a.level === "category") === (b.level === "category") ? Math.abs(b.delta) - Math.abs(a.delta) : a.level === "category" ? 1 : -1);
  const selected = ws.variances.find((v) => v.id === focusId) ?? list[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Variances</h1>
        <p className="mt-2 max-w-[70ch] text-muted">
          Month-over-month changes that clear the materiality bar: at least $1,000 and 5% for totals, $750 and 15% for a single category, or anything above 2% of revenue.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex rounded-lg border border-line p-0.5">
          {pairs.map((p) => {
            const [a, b] = p.split("->");
            return (
              <button key={p} role="tab" aria-selected={activePair === p} onClick={() => { setPair(p); focusVariance(null); }} className={cx("rounded-md px-3 py-1.5 text-sm", activePair === p ? "bg-panel-2 text-paper" : "text-muted hover:text-paper")}>
                {monthLabel(a).split(" ")[0]} to {monthLabel(b).split(" ")[0]}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[var(--iris)]" /> Include immaterial
        </label>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <ul className="space-y-1.5 lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto lg:pr-1">
          {list.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => focusVariance(v.id)}
                className={cx("w-full rounded-xl border px-3 py-2.5 text-left", selected?.id === v.id ? "border-paper/40 bg-panel-2" : "border-transparent hover:bg-panel")}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cx("text-sm", v.level === "category" ? "text-muted" : "font-medium")}>{v.metricLabel}</span>
                  <span className={cx("num text-sm", v.impact === "favorable" ? "text-teal" : "text-tomato")}>{money(v.delta, { sign: true })}</span>
                </span>
                <span className="num text-xs text-faint">{pct(v.pct)}{!v.material && ", immaterial"}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl border border-line bg-panel p-5 md:p-6">{selected ? <Detail v={selected} /> : <p className="text-muted">No material variances for this period.</p>}</div>
      </div>
    </div>
  );
}
