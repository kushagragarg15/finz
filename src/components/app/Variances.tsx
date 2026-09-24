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
import { EvidenceButton } from "./bits";
import { Markdown } from "./Answer";

const isCostMetric = (m: string) => ["cogs", "payroll", "opex"].includes(m) || /^(cogs|pay|opex)_/.test(m);
const short = (m: string) => monthLabel(m).split(" ")[0];

/**
 * Bridge from last month's figure to this month's: calendar timing, one-offs
 * and the underlying change. The parts come from the engine and sum exactly.
 */
function Bridge({ v }: { v: Variance }) {
  const d = v.decomposition;
  const cost = isCostMetric(v.metric);
  const steps = [
    { label: `${short(v.fromMonth)} ${monthLabel(v.fromMonth).split(" ")[1]}`, value: v.from, kind: "total" as const, ids: [] as string[] },
    { label: "Calendar timing", value: d.calendar, kind: "step" as const, ids: d.calendarTxnIds, hint: "Extra or missing weekly batches" },
    { label: "One-offs", value: d.oneOff, kind: "step" as const, ids: d.oneOffTxnIds, hint: "Items seen once in the period" },
    { label: "Underlying change", value: d.underlying, kind: "step" as const, ids: [] as string[], hint: "Everything else" },
    { label: `${short(v.toMonth)} ${monthLabel(v.toMonth).split(" ")[1]}`, value: v.to, kind: "total" as const, ids: [] as string[] },
  ];
  let run = v.from;
  const spans = steps.map((s) => {
    if (s.kind === "total") return { ...s, a: Number.NEGATIVE_INFINITY, b: s.value };
    const a = run;
    run += s.value;
    return { ...s, a, b: run };
  });
  // Bridge axis: only the range the steps move through (plus padding), so small steps stay visible.
  // Totals are drawn from the left edge, so their length is relative, as in any bridge chart.
  const points = [v.from, v.to, ...spans.filter((s) => s.kind === "step").flatMap((s) => [s.a, s.b])];
  const span = Math.max(...points) - Math.min(...points) || Math.abs(v.to) || 1;
  const lo = Math.min(...points) - span * 0.6;
  const hi = Math.max(...points) + span * 0.15;
  const x = (n: number) => (n === Number.NEGATIVE_INFINITY ? 0 : ((n - lo) / (hi - lo || 1)) * 100);

  return (
    <figure aria-label={`${v.metricLabel} bridge`}>
      <figcaption className="mb-2 text-xs text-ink-3">Bridge from {short(v.fromMonth)} to {short(v.toMonth)}. The axis is cut so the steps are visible.</figcaption>
      <ol className="space-y-1.5">
        {spans.map((s) => {
          const left = x(Math.min(s.a, s.b));
          const width = Math.max(0.6, Math.abs(x(s.b) - x(s.a)));
          const good = cost ? s.value <= 0 : s.value >= 0;
          const tone = s.kind === "total" ? "bg-ink/80" : s.value === 0 ? "bg-rule-strong" : good ? "bg-pos" : "bg-neg";
          return (
            <li key={s.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_7rem]">
              <span className={cx("leading-tight", s.kind === "total" ? "font-medium" : "text-ink-2")}>
                {s.label}
                {s.kind === "step" && s.ids.length > 0 && (
                  <span className="block"><EvidenceButton ids={s.ids} title={`${s.label}: ${v.metricLabel}`}>{s.ids.length} transaction{s.ids.length > 1 ? "s" : ""}</EvidenceButton></span>
                )}
              </span>
              <span className="relative h-5 rounded-sm bg-sheet-2">
                <span className={cx("absolute inset-y-0 rounded-sm", tone)} style={{ left: `${left}%`, width: `${width}%` }} />
              </span>
              <span className={cx("num text-right", s.kind === "total" ? "font-semibold" : s.value === 0 ? "text-ink-3" : good ? "text-pos" : "text-neg")}>
                {s.kind === "total" ? money(s.value) : money(s.value, { sign: true })}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

function DriverRow({ d, max, v }: { d: VarianceDriver; max: number; v: Variance }) {
  const [open, setOpen] = useState(false);
  const w = max ? Math.max(1.5, (Math.abs(d.effect) / max) * 100) : 0;
  const favorable = isCostMetric(v.metric) ? d.effect <= 0 : d.effect >= 0;
  return (
    <li className="py-2.5">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,15rem)_1fr_6.5rem]">
        <button onClick={() => setOpen(!open)} className="flex min-h-8 min-w-0 items-center gap-1 text-left text-sm" aria-expanded={open} disabled={!d.children?.length}>
          {d.children?.length ? <ChevronRight className={cx("size-4 shrink-0 text-ink-3 transition-transform", open && "rotate-90")} aria-hidden /> : <span className="w-4" />}
          <span className="truncate">{d.label}</span>
        </button>
        <span className="order-3 col-span-2 h-1.5 rounded-full bg-sheet-2 md:order-none md:col-span-1">
          <span className={cx("block h-1.5 rounded-full", favorable ? "bg-pos" : "bg-neg")} style={{ width: `${w}%` }} />
        </span>
        <span className={cx("num text-right text-sm", favorable ? "text-pos" : "text-neg")}>{money(d.effect, { sign: true })}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 pl-5 text-xs text-ink-3">
        <span className="num">{money(d.from)} to {money(d.to)}</span>
        {d.note && <span className="text-flag">{d.note}</span>}
        <EvidenceButton ids={[...d.txnIdsFrom, ...d.txnIdsTo]} title={`${d.label}, ${short(v.fromMonth)} and ${short(v.toMonth)}`} />
      </div>
      {open && d.children && (
        <ul className="ml-2 mt-2 space-y-1.5 border-l border-rule pl-4">
          {d.children.map((c) => (
            <li key={c.key} className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span className="text-ink-2">{c.label}</span>
              <span className="num">{money(c.delta, { sign: true })}</span>
              {c.note && <span className="text-flag">{c.note}</span>}
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

  const ai = cached?.source === "ai";
  return (
    <div className={cx("border-l-2 pl-4", ai || loading ? "border-ai" : "border-rule-strong")}>
      <p className={cx("text-xs font-medium", ai || loading ? "text-ai" : "text-ink-3")}>
        {loading ? "Analyst note" : ai ? "Analyst note, figures checked against the ledger" : "Computed summary (the AI note wasn't available or didn't pass the figure check)"}
      </p>
      <div className="mt-1">
        {loading ? (
          <ShinyText text="Writing up the drivers…" color="#6d86e6" shineColor="#1b2233" speed={1.8} className="text-sm" />
        ) : cached ? (
          <Markdown text={cached.text} />
        ) : (
          <p className="text-sm text-ink-2">No note for this change. The bridge and drivers below are exact.</p>
        )}
      </div>
    </div>
  );
}

function Detail({ v }: { v: Variance }) {
  const ask = useStore((s) => s.ask);
  const max = Math.max(...v.drivers.map((d) => Math.abs(d.effect)), 1);
  const allIds = [...new Set(v.drivers.flatMap((d) => [...d.txnIdsFrom, ...d.txnIdsTo]))];

  return (
    <article className="space-y-7">
      <header>
        <p className="text-sm text-ink-3">{monthLabel(v.fromMonth, true)} to {monthLabel(v.toMonth, true)}</p>
        <h2 className="mt-0.5 font-cond text-2xl font-semibold">{v.metricLabel}</h2>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3">
          <span className={cx("num font-cond text-2xl font-semibold", v.impact === "favorable" ? "text-pos" : "text-neg")}>{money(v.delta, { sign: true })}</span>
          <span className={cx("num text-sm", v.impact === "favorable" ? "text-pos" : "text-neg")}>{pct(v.pct)}</span>
          <span className="text-sm text-ink-2">{v.impact === "favorable" ? "Helps profit" : "Hurts profit"}{v.material ? ", material" : ", below the materiality bar"}</span>
        </p>
      </header>

      <Bridge v={v} />
      <Narrative v={v} />

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
          <h3 className="font-cond text-lg font-semibold">What moved it</h3>
          <EvidenceButton ids={allIds} title={`Transactions behind ${v.metricLabel}, ${short(v.fromMonth)} to ${short(v.toMonth)}`}>
            All {allIds.length} transactions behind this change
          </EvidenceButton>
        </div>
        <ul className="divide-y divide-rule">{v.drivers.slice(0, 10).map((d) => <DriverRow key={d.key} d={d} max={max} v={v} />)}</ul>
      </section>

      {v.context.length > 0 && (
        <section>
          <h3 className="font-cond text-lg font-semibold">Worth knowing</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">{v.context.map((c) => <li key={c} className="border-l-2 border-flag pl-3">{c}</li>)}</ul>
        </section>
      )}

      <button onClick={() => ask(`Explain the change in ${v.metricLabel} from ${monthLabel(v.fromMonth, true)} to ${monthLabel(v.toMonth, true)}. Separate timing effects and one-offs from underlying performance.`)} className="min-h-9 text-sm text-ai hover:underline">
        Discuss this change with the analyst
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

  if (!ws) return null;
  if (!pairs.length) {
    return (
      <div className="space-y-3">
        <h1 className="font-cond text-3xl font-semibold tracking-tight sm:text-4xl">Changes</h1>
        <p className="max-w-[60ch] text-ink-2">This file covers a single month, so there is nothing to compare yet. Upload two or more months to see what changed and why.</p>
      </div>
    );
  }
  const activePair = focusId ? focusId.split(":")[1] : pair ?? pairs[pairs.length - 1];
  const list = ws.variances
    .filter((v) => `${v.fromMonth}->${v.toMonth}` === activePair && (showAll || v.material || v.id === focusId))
    .sort((a, b) => ((a.level === "category") === (b.level === "category") ? Math.abs(b.delta) - Math.abs(a.delta) : a.level === "category" ? 1 : -1));
  const selected = ws.variances.find((v) => v.id === focusId) ?? list[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-cond text-3xl font-semibold tracking-tight sm:text-4xl">Changes</h1>
        <p className="mt-1.5 max-w-[68ch] text-ink-2">
          Month-on-month movements that clear the materiality bar: at least $1,000 and 5% for totals, $750 and 15% for a single line, or anything above 2% of revenue.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="tablist" aria-label="Months compared" className="flex overflow-x-auto border-b border-rule">
          {pairs.map((p) => {
            const [a, b] = p.split("->");
            return (
              <button key={p} role="tab" aria-selected={activePair === p} onClick={() => { setPair(p); focusVariance(null); }}
                className={cx("relative min-h-11 shrink-0 px-3 text-sm", activePair === p ? "text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-ink" : "text-ink-2 hover:text-ink")}>
                {short(a)} to {short(b)}
              </button>
            );
          })}
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="size-4 accent-[var(--ink)]" /> Include small changes
        </label>
      </div>

      {/* Phones: pick a change from a menu */}
      <label className="block lg:hidden">
        <span className="sr-only">Change to show</span>
        <select value={selected?.id ?? ""} onChange={(e) => focusVariance(e.target.value)} className="h-11 w-full rounded-md border border-rule-strong bg-sheet px-3 text-sm">
          {list.map((v) => <option key={v.id} value={v.id}>{v.metricLabel}: {money(v.delta, { sign: true })} ({pct(v.pct)})</option>)}
        </select>
      </label>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_1fr]">
        <ul className="hidden divide-y divide-rule self-start rounded-lg border border-rule-strong bg-sheet lg:block">
          {list.map((v) => (
            <li key={v.id}>
              <button
                onClick={() => focusVariance(v.id)}
                aria-current={selected?.id === v.id ? "true" : undefined}
                className={cx("relative w-full px-4 py-2.5 text-left", selected?.id === v.id ? "bg-sheet-2 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-ink" : "hover:bg-sheet-2")}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cx("text-sm", v.level === "category" ? "text-ink-2" : "font-medium")}>{v.metricLabel}</span>
                  <span className={cx("num text-sm", v.impact === "favorable" ? "text-pos" : "text-neg")}>{money(v.delta, { sign: true })}</span>
                </span>
                <span className="num text-xs text-ink-3">{pct(v.pct)}{!v.material && ", small"}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-rule-strong bg-sheet p-4 sm:p-6">
          {selected ? <Detail v={selected} /> : <p className="text-ink-2">No material changes between these months.</p>}
        </div>
      </div>
    </div>
  );
}
