import { CATEGORIES, categoryOf } from "./chartOfAccounts";
import { months, round2, sum } from "./ledger";
import { METRIC_LABEL, categoryValue, computeAllPnl, metricValue, monthLabel, type MetricKey } from "./pnl";
import type { MonthlyPnl, Section, Transaction, Variance, VarianceDriver } from "./types";

/**
 * Materiality policy (deterministic, documented in README):
 *  - totals/sections: |Δ| ≥ $1,000 and |Δ%| ≥ 5%
 *  - individual categories: |Δ| ≥ $750 and |Δ%| ≥ 15%
 *  - anything moving ≥ 2% of the later month's revenue is always material
 */
export const MATERIALITY = {
  totalAbs: 1000,
  totalPct: 5,
  categoryAbs: 750,
  categoryPct: 15,
  revenueShare: 0.02,
};

const METRICS: MetricKey[] = ["revenue", "cogs", "grossProfit", "payroll", "opex", "operatingProfit"];
const COST_SECTIONS: Section[] = ["cogs", "payroll", "opex"];
const SECTION_OF_METRIC: Partial<Record<MetricKey, Section>> = {
  revenue: "revenue",
  cogs: "cogs",
  payroll: "payroll",
  opex: "opex",
};

const isCostMetric = (m: string) =>
  COST_SECTIONS.includes(m as Section) || COST_SECTIONS.includes(categoryOf(m).section);

function pct(from: number, to: number): number | null {
  if (from === 0) return null;
  return round2(((to - from) / Math.abs(from)) * 100);
}

function patternLabel(t: Transaction): string {
  return t.description.replace(/\s*week\s*\d+/i, " (weekly)").trim();
}

/** Break a category's change into recurring-pattern level drivers. */
function patternDrivers(ledger: Transaction[], categoryId: string, from: string, to: string, sign: number): VarianceDriver[] {
  const inCat = ledger.filter((t) => t.classification.categoryId === categoryId && (t.month === from || t.month === to));
  const byPattern = new Map<string, Transaction[]>();
  inCat.forEach((t) => byPattern.set(t.pattern, [...(byPattern.get(t.pattern) ?? []), t]));
  return [...byPattern.entries()]
    .map(([pattern, txns]) => {
      const a = txns.filter((t) => t.month === from);
      const b = txns.filter((t) => t.month === to);
      const fromV = round2(sign * sum(a.map((t) => t.amount)));
      const toV = round2(sign * sum(b.map((t) => t.amount)));
      const notes: string[] = [];
      if (!a.length) notes.push(`new in ${monthLabel(to)}`);
      if (!b.length) notes.push(`absent in ${monthLabel(to)}`);
      if (a.length && b.length && a.length !== b.length) notes.push(`${a.length} → ${b.length} transactions`);
      return {
        key: pattern,
        label: `${patternLabel(txns[0])} · ${txns[0].counterparty}`,
        level: "pattern" as const,
        from: fromV,
        to: toV,
        delta: round2(toV - fromV),
        effect: round2(toV - fromV),
        txnIdsFrom: a.map((t) => t.id),
        txnIdsTo: b.map((t) => t.id),
        note: notes.join("; ") || undefined,
      };
    })
    .filter((d) => d.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

function categoryDrivers(ledger: Transaction[], a: MonthlyPnl, b: MonthlyPnl, sections: Section[], profitMetric: boolean): VarianceDriver[] {
  return CATEGORIES.filter((c) => sections.includes(c.section))
    .map((c) => {
      const fromV = categoryValue(a, c.id);
      const toV = categoryValue(b, c.id);
      const delta = round2(toV - fromV);
      const isCost = COST_SECTIONS.includes(c.section);
      const sign = c.section === "revenue" ? 1 : -1;
      const ids = (m: string) => ledger.filter((t) => t.month === m && t.classification.categoryId === c.id).map((t) => t.id);
      return {
        key: c.id,
        label: c.name,
        level: "category" as const,
        from: fromV,
        to: toV,
        delta,
        effect: profitMetric && isCost ? -delta : delta,
        txnIdsFrom: ids(a.month),
        txnIdsTo: ids(b.month),
        children: patternDrivers(ledger, c.id, a.month, b.month, sign).slice(0, 6),
      };
    })
    .filter((d) => d.delta !== 0)
    .sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect));
}

/** Deterministic context facts that often explain a variance (calendar effects etc). */
function contextFacts(ledger: Transaction[], from: string, to: string): string[] {
  const facts: string[] = [];
  const weeks = (m: string) =>
    new Set(
      ledger
        .filter((t) => t.month === m && /pos batch deposit/i.test(t.description))
        .map((t) => t.description.match(/week\s*(\d+)/i)?.[1])
        .filter(Boolean),
    ).size;
  const wf = weeks(from), wt = weeks(to);
  if (wf && wt && wf !== wt) {
    facts.push(`${monthLabel(to)} contains ${wt} weekly POS deposit batches vs ${wf} in ${monthLabel(from)} — part of the change is calendar timing, not trading performance.`);
  }
  const patternCounts = new Map<string, number>();
  ledger.forEach((t) => patternCounts.set(t.pattern, (patternCounts.get(t.pattern) ?? 0) + 1));
  const oneOffs = ledger.filter((t) => (t.month === to || t.month === from) && patternCounts.get(t.pattern) === 1);
  oneOffs.forEach((t) => {
    const cat = categoryOf(t.classification.categoryId);
    facts.push(`One-off in ${monthLabel(t.month)}: ${t.id} "${t.description}" ${t.amount < 0 ? "-" : ""}$${Math.abs(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} (${cat.name}${cat.section === "non_pnl" ? ", excluded from P&L" : ""}).`);
  });
  return facts;
}

function isMaterial(level: Variance["level"], delta: number, p: number | null, revenueTo: number): boolean {
  const abs = Math.abs(delta);
  if (revenueTo > 0 && abs >= MATERIALITY.revenueShare * revenueTo) return true;
  const [minAbs, minPct] = level === "category" ? [MATERIALITY.categoryAbs, MATERIALITY.categoryPct] : [MATERIALITY.totalAbs, MATERIALITY.totalPct];
  return abs >= minAbs && (p === null || Math.abs(p) >= minPct);
}

export function computeVariance(ledger: Transaction[], pnls: MonthlyPnl[], metric: string, fromMonth: string, toMonth: string): Variance | null {
  const a = pnls.find((p) => p.month === fromMonth);
  const b = pnls.find((p) => p.month === toMonth);
  if (!a || !b) return null;
  const isTotal = (METRICS as string[]).includes(metric);
  const from = isTotal ? metricValue(a, metric as MetricKey) : categoryValue(a, metric);
  const to = isTotal ? metricValue(b, metric as MetricKey) : categoryValue(b, metric);
  const delta = round2(to - from);
  const p = pct(from, to);
  const level: Variance["level"] = !isTotal ? "category" : SECTION_OF_METRIC[metric as MetricKey] ? "section" : "total";

  let drivers: VarianceDriver[];
  if (!isTotal) {
    const sign = categoryOf(metric).section === "revenue" ? 1 : -1;
    drivers = patternDrivers(ledger, metric, fromMonth, toMonth, sign);
  } else {
    const sections: Section[] =
      metric === "grossProfit" ? ["revenue", "cogs"]
      : metric === "operatingProfit" ? ["revenue", "cogs", "payroll", "opex"]
      : [SECTION_OF_METRIC[metric as MetricKey]!];
    drivers = categoryDrivers(ledger, a, b, sections, metric === "grossProfit" || metric === "operatingProfit");
  }

  const cost = isCostMetric(metric);
  return {
    id: `${metric}:${fromMonth}->${toMonth}`,
    metric,
    metricLabel: isTotal ? METRIC_LABEL[metric as MetricKey] : categoryOf(metric).name,
    level,
    fromMonth,
    toMonth,
    from,
    to,
    delta,
    pct: p,
    impact: (cost ? delta <= 0 : delta >= 0) ? "favorable" : "unfavorable",
    material: isMaterial(level, delta, p, b.revenue.total),
    drivers,
    context: contextFacts(ledger, fromMonth, toMonth),
  };
}

/** All month-over-month variances for totals and every P&L category. */
export function computeAllVariances(ledger: Transaction[], pnls = computeAllPnl(ledger)): Variance[] {
  const ms = months(ledger);
  const pnlCategories = CATEGORIES.filter((c) => c.section !== "non_pnl").map((c) => c.id);
  const out: Variance[] = [];
  for (let i = 1; i < ms.length; i++) {
    for (const m of [...METRICS, ...pnlCategories]) {
      const v = computeVariance(ledger, pnls, m, ms[i - 1], ms[i]);
      if (v && (v.from !== 0 || v.to !== 0)) out.push(v);
    }
  }
  return out;
}

export function materialVariances(vs: Variance[]): Variance[] {
  return vs.filter((v) => v.material).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
