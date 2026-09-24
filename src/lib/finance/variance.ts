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

const METRIC_SECTIONS: Record<string, Section[]> = {
  revenue: ["revenue"], cogs: ["cogs"], payroll: ["payroll"], opex: ["opex"],
  grossProfit: ["revenue", "cogs"], operatingProfit: ["revenue", "cogs", "payroll", "opex"],
};

/** Does a transaction feed this metric (a P&L total or a single category)? */
function scopeOf(metric: string): (t: Transaction) => boolean {
  const sections = METRIC_SECTIONS[metric];
  return sections
    ? (t) => sections.includes(categoryOf(t.classification.categoryId).section)
    : (t) => t.classification.categoryId === metric;
}

/** Deterministic context facts relevant to this metric (calendar effects, one-offs). */
function contextFacts(ledger: Transaction[], from: string, to: string, inScope: (t: Transaction) => boolean): string[] {
  const facts: string[] = [];
  const weeks = (m: string) =>
    new Set(
      ledger
        .filter((t) => t.month === m && /pos batch deposit/i.test(t.description))
        .map((t) => t.description.match(/week\s*(\d+)/i)?.[1])
        .filter(Boolean),
    ).size;
  const wf = weeks(from), wt = weeks(to);
  const weeklyInScope = ledger.some((t) => (t.month === from || t.month === to) && inScope(t) && /\bweek\s*\d+/i.test(t.description));
  if (wf && wt && wf !== wt && weeklyInScope) {
    facts.push(`${monthLabel(to)} contains ${wt} weekly POS deposit batches vs ${wf} in ${monthLabel(from)}. Part of the change is calendar timing, not trading performance.`);
  }
  const patternCounts = new Map<string, number>();
  ledger.forEach((t) => patternCounts.set(t.pattern, (patternCounts.get(t.pattern) ?? 0) + 1));
  const oneOffs = ledger.filter((t) => (t.month === to || t.month === from) && patternCounts.get(t.pattern) === 1 && inScope(t));
  oneOffs.forEach((t) => {
    const cat = categoryOf(t.classification.categoryId);
    facts.push(`One-off in ${monthLabel(t.month)}: ${t.id} "${t.description}" ${t.amount < 0 ? "-" : ""}$${Math.abs(t.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} (${cat.name}${cat.section === "non_pnl" ? ", excluded from P&L" : ""}).`);
  });
  return facts;
}

const weekOf = (t: Transaction) => Number(t.description.match(/\bweek\s*(\d+)/i)?.[1] ?? 0);

/**
 * Split a variance into calendar timing (extra weekly batches in one month),
 * one-off transactions (patterns seen once in the dataset) and the remaining
 * underlying change. Each transaction's effect is its bank amount, flipped
 * for cost metrics, so the three parts sum exactly to the delta.
 */
function decompose(ledger: Transaction[], metric: string, from: string, to: string, delta: number): Variance["decomposition"] {
  const inScope = scopeOf(metric);
  const sign = isCostMetric(metric) ? -1 : 1;
  const effect = (t: Transaction) => sign * t.amount * (t.month === to ? 1 : -1);

  const scoped = ledger.filter((t) => (t.month === from || t.month === to) && inScope(t));
  const maxWeek = (m: string) => Math.max(0, ...ledger.filter((t) => t.month === m).map(weekOf));
  const wFrom = maxWeek(from), wTo = maxWeek(to);
  const calendarTxns = scoped.filter((t) => {
    const w = weekOf(t);
    return w > 0 && ((t.month === to && w > wFrom) || (t.month === from && w > wTo));
  });
  const counts = new Map<string, number>();
  ledger.forEach((t) => counts.set(t.pattern, (counts.get(t.pattern) ?? 0) + 1));
  const oneOffTxns = scoped.filter((t) => counts.get(t.pattern) === 1 && !calendarTxns.includes(t));

  const calendar = sum(calendarTxns.map(effect));
  const oneOff = sum(oneOffTxns.map(effect));
  const excluded = new Set([...calendarTxns, ...oneOffTxns]);
  const byCategory = new Map<string, number>();
  scoped.filter((t) => !excluded.has(t)).forEach((t) => {
    // For profit metrics the effect of a cost is its (negative) bank amount; effect() already handles sign.
    byCategory.set(t.classification.categoryId, (byCategory.get(t.classification.categoryId) ?? 0) + effect(t));
  });
  return {
    calendar,
    oneOff,
    underlying: round2(delta - calendar - oneOff),
    calendarTxnIds: calendarTxns.map((t) => t.id),
    oneOffTxnIds: oneOffTxns.map((t) => t.id),
    underlyingDrivers: [...byCategory.entries()]
      .map(([id, e]) => ({ label: categoryOf(id).name, effect: round2(e) }))
      .filter((d) => Math.abs(d.effect) >= 0.01)
      .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)),
  };
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
    context: contextFacts(ledger, fromMonth, toMonth, scopeOf(metric)),
    decomposition: decompose(ledger, metric, fromMonth, toMonth, delta),
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
