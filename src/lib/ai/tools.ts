import { CATEGORIES, SECTION_LABEL, categoryOf } from "../finance/chartOfAccounts";
import { round2, sum } from "../finance/ledger";
import { METRIC_LABEL, categoryValue, metricValue, monthLabel, type MetricKey } from "../finance/pnl";
import type { Transaction, Variance } from "../finance/types";
import { computeVariance, materialVariances } from "../finance/variance";
import type { Workspace } from "../finance/workspace";
import type { ToolSpec } from "./groq";

const METRIC_KEYS = Object.keys(METRIC_LABEL) as MetricKey[];

export const TOOL_SPECS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "get_pnl",
      description: "Monthly P&L (revenue, COGS, gross profit, payroll, opex, operating profit) with category lines and non-P&L items. Use for any total or line-item question.",
      parameters: {
        type: "object",
        properties: { months: { type: "array", items: { type: "string" }, description: "Months like '2026-03' or 'March'. Omit for all months." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_metric_trend",
      description: "Value of one metric for every month with month-over-month change. metric can be a P&L total (revenue, cogs, grossProfit, payroll, opex, operatingProfit) or a category id/name (e.g. 'cogs_food', 'Food Cost').",
      parameters: { type: "object", properties: { metric: { type: "string" } }, required: ["metric"] },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_variance",
      description: "Deterministic variance analysis for a metric between two months: change, % change, materiality, ranked drivers (categories and recurring patterns) with transaction ids, and context facts (calendar effects, one-offs).",
      parameters: {
        type: "object",
        properties: {
          metric: { type: "string", description: "P&L total or category id/name" },
          from_month: { type: "string" },
          to_month: { type: "string" },
        },
        required: ["metric", "from_month", "to_month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_transactions",
      description: "Find transactions by month, category, section, counterparty or text. Returns rows with ids, total and count.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string" },
          category: { type: "string", description: "category id or name" },
          section: { type: "string", enum: ["revenue", "cogs", "payroll", "opex", "non_pnl"] },
          counterparty: { type: "string" },
          text: { type: "string", description: "substring of description" },
          ids: { type: "array", items: { type: "string" } },
          min_abs_amount: { type: "number" },
          sort: { type: "string", enum: ["date", "amount_desc"] },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_review_items",
      description: "Transactions needing human attention: uncertain classifications, non-P&L accounting treatment, unusual amounts, inconsistent data, one-offs.",
      parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "resolved", "all"] } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_changes",
      description: "Material variances ranked by size, across all consecutive month pairs, plus first-to-last-month change for P&L totals. Use for 'what changed most' questions.",
      parameters: { type: "object", properties: { limit: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Exact arithmetic on numbers taken from other tools, e.g. '96358.63 - 76837.94'. Never do arithmetic yourself.",
      parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_categories",
      description: "Chart of accounts: category ids, names and sections.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function resolveMonth(ws: Workspace, input: string | undefined): string | null {
  if (!input) return null;
  const s = input.toLowerCase().trim();
  if (/^\d{4}-\d{2}$/.test(s)) return ws.months.includes(s) ? s : null;
  const idx = MONTH_NAMES.findIndex((m) => s.startsWith(m.slice(0, 3)) || s.includes(m));
  if (idx < 0) return null;
  const mm = String(idx + 1).padStart(2, "0");
  return ws.months.find((m) => m.endsWith(`-${mm}`)) ?? null;
}

export function resolveMetric(input: string): string | null {
  const s = input.toLowerCase().replace(/[^a-z_& ]/g, "").trim();
  const direct = METRIC_KEYS.find((k) => k.toLowerCase() === s.replace(/[ _]/g, "") || METRIC_LABEL[k].toLowerCase() === s);
  if (direct) return direct;
  const synonyms: Record<string, string> = {
    sales: "revenue", "total revenue": "revenue", "cost of goods sold": "cogs", "gross margin": "grossProfit",
    "operating income": "operatingProfit", "net operating income": "operatingProfit", ebit: "operatingProfit",
    "operating expenses": "opex", "operating expense": "opex", "labor": "payroll", "labour": "payroll", wages: "payroll",
    "food": "cogs_food", "food cost": "cogs_food", "food costs": "cogs_food", "beverage cost": "cogs_beverage", "refunds": "rev_refunds",
  };
  if (synonyms[s]) return synonyms[s];
  const cat = CATEGORIES.find((c) => c.id === s || c.name.toLowerCase() === s) ??
    CATEGORIES.find((c) => c.name.toLowerCase().includes(s) || s.includes(c.name.toLowerCase()));
  return cat?.id ?? null;
}

const txnRow = (t: Transaction) => ({
  id: t.id,
  date: t.date,
  description: t.description,
  counterparty: t.counterparty,
  amount: t.amount,
  category: categoryOf(t.classification.categoryId).name,
  section: categoryOf(t.classification.categoryId).section,
  confidence: t.classification.confidence,
});

function compactVariance(v: Variance) {
  return {
    metric: v.metricLabel,
    from_month: monthLabel(v.fromMonth),
    to_month: monthLabel(v.toMonth),
    from: v.from,
    to: v.to,
    change: v.delta,
    pct_change: v.pct,
    impact: v.impact,
    material: v.material,
    drivers: v.drivers.slice(0, 6).map((d) => ({
      driver: d.label,
      from: d.from,
      to: d.to,
      change: d.delta,
      effect_on_metric: d.effect,
      note: d.note,
      transactions_from: d.txnIdsFrom.slice(0, 12),
      transactions_to: d.txnIdsTo.slice(0, 12),
      sub_drivers: d.children?.slice(0, 3).map((c) => ({ driver: c.label, change: c.delta, note: c.note, transactions_to: c.txnIdsTo.slice(0, 8), transactions_from: c.txnIdsFrom.slice(0, 8) })),
    })),
    context: v.context,
  };
}

function safeCalc(expr: string): number {
  if (!/^[\d\s+\-*/().,]+$/.test(expr)) throw new Error("Only numbers and + - * / ( ) are allowed");
  const v = Function(`"use strict"; return (${expr.replace(/,/g, "")});`)();
  if (typeof v !== "number" || !isFinite(v)) throw new Error("Invalid expression");
  return round2(v);
}

export function runTool(ws: Workspace, name: string, args: Record<string, unknown>): unknown {
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : undefined);
  switch (name) {
    case "get_pnl": {
      const requested = Array.isArray(args.months) ? (args.months as string[]).map((m) => resolveMonth(ws, m)).filter(Boolean) : ws.months;
      return ws.pnls
        .filter((p) => requested.includes(p.month))
        .map((p) => ({
          month: monthLabel(p.month, true),
          revenue: p.revenue.total,
          revenue_lines: p.revenue.lines.map((l) => ({ category: l.name, amount: l.amount })),
          cogs: p.cogs.total,
          cogs_lines: p.cogs.lines.map((l) => ({ category: l.name, amount: l.amount })),
          gross_profit: p.grossProfit,
          gross_margin_pct: p.grossMargin,
          payroll: p.payroll.total,
          payroll_lines: p.payroll.lines.map((l) => ({ category: l.name, amount: l.amount })),
          operating_expenses: p.opex.total,
          opex_lines: p.opex.lines.map((l) => ({ category: l.name, amount: l.amount })),
          operating_profit: p.operatingProfit,
          operating_margin_pct: p.operatingMargin,
          excluded_non_pnl_items: p.nonPnl.lines.map((l) => ({ category: l.name, cash_amount: l.amount, transactions: l.txnIds })),
          reconciles_to_bank: p.reconciles,
        }));
    }
    case "get_metric_trend": {
      const metric = resolveMetric(str("metric") ?? "");
      if (!metric) return { error: `Unknown metric '${str("metric")}'. Call list_categories.` };
      const isTotal = (METRIC_KEYS as string[]).includes(metric);
      const values = ws.pnls.map((p) => ({ month: monthLabel(p.month, true), value: isTotal ? metricValue(p, metric as MetricKey) : categoryValue(p, metric) }));
      return {
        metric: isTotal ? METRIC_LABEL[metric as MetricKey] : categoryOf(metric).name,
        values: values.map((v, i) => ({
          ...v,
          change_vs_prior: i ? round2(v.value - values[i - 1].value) : null,
          pct_change_vs_prior: i && values[i - 1].value ? round2(((v.value - values[i - 1].value) / Math.abs(values[i - 1].value)) * 100) : null,
        })),
        period_total: sum(values.map((v) => v.value)),
      };
    }
    case "explain_variance": {
      const metric = resolveMetric(str("metric") ?? "");
      const from = resolveMonth(ws, str("from_month"));
      const to = resolveMonth(ws, str("to_month"));
      if (!metric || !from || !to) return { error: `Could not resolve metric/months. Available months: ${ws.months.join(", ")}` };
      const v = computeVariance(ws.ledger, ws.pnls, metric, from, to);
      return v ? { variance_id: v.id, ...compactVariance(v) } : { error: "No data" };
    }
    case "search_transactions": {
      let rows = ws.ledger;
      const month = resolveMonth(ws, str("month"));
      if (str("month") && !month) return { error: `Unknown month. Available: ${ws.months.join(", ")}` };
      if (month) rows = rows.filter((t) => t.month === month);
      if (str("category")) {
        const cat = resolveMetric(str("category")!);
        rows = rows.filter((t) => t.classification.categoryId === cat);
      }
      if (str("section")) rows = rows.filter((t) => categoryOf(t.classification.categoryId).section === str("section"));
      if (str("counterparty")) rows = rows.filter((t) => t.counterparty.toLowerCase().includes(str("counterparty")!.toLowerCase()));
      if (str("text")) rows = rows.filter((t) => t.description.toLowerCase().includes(str("text")!.toLowerCase()));
      if (Array.isArray(args.ids)) rows = rows.filter((t) => (args.ids as string[]).includes(t.id));
      if (typeof args.min_abs_amount === "number") rows = rows.filter((t) => Math.abs(t.amount) >= (args.min_abs_amount as number));
      if (str("sort") === "amount_desc") rows = [...rows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      const limit = Math.min(Number(args.limit) || 25, 40);
      return { count: rows.length, net_total: sum(rows.map((t) => t.amount)), showing: Math.min(limit, rows.length), transactions: rows.slice(0, limit).map(txnRow) };
    }
    case "get_review_items": {
      const status = str("status") ?? "open";
      const items = ws.review.filter((i) => status === "all" || (status === "resolved" ? i.resolution?.status === "resolved" : i.resolution?.status !== "resolved"));
      return {
        count: items.length,
        items: items.map((i) => ({
          severity: i.severity,
          type: i.kind,
          title: i.title,
          detail: i.detail,
          suggested_action: i.suggestedAction,
          transactions: i.txnIds.slice(0, 10),
          status: i.resolution?.status ?? "open",
          reviewer_note: i.resolution?.note,
        })),
      };
    }
    case "get_top_changes": {
      const limit = Math.min(Number(args.limit) || 8, 15);
      const first = ws.months[0], last = ws.months[ws.months.length - 1];
      const period = first !== last
        ? METRIC_KEYS.map((k) => computeVariance(ws.ledger, ws.pnls, k, first, last)).filter(Boolean).map((v) => ({ metric: v!.metricLabel, from_month: monthLabel(first), to_month: monthLabel(last), from: v!.from, to: v!.to, change: v!.delta, pct_change: v!.pct }))
        : [];
      return {
        review_period: `${monthLabel(first)} – ${monthLabel(last)}`,
        first_to_last_month: period,
        largest_material_month_over_month: materialVariances(ws.variances).slice(0, limit).map((v) => ({
          metric: v.metricLabel, from_month: monthLabel(v.fromMonth), to_month: monthLabel(v.toMonth), from: v.from, to: v.to, change: v.delta, pct_change: v.pct, impact: v.impact,
          top_driver: v.drivers[0] ? `${v.drivers[0].label} (${v.drivers[0].effect})` : null,
        })),
      };
    }
    case "calculate": {
      const expr = str("expression") ?? "";
      return { expression: expr, result: safeCalc(expr) };
    }
    case "list_categories":
      return CATEGORIES.map((c) => ({ id: c.id, name: c.name, section: SECTION_LABEL[c.section] }));
    default:
      return { error: `Unknown tool ${name}` };
  }
}

/** Collect every transaction id referenced in tool outputs (for evidence panels). */
export function collectTxnIds(value: unknown, known: Set<string>, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const m of value.matchAll(/\bT\d{3,}\b/g)) if (known.has(m[0])) out.add(m[0]);
  } else if (Array.isArray(value)) value.forEach((v) => collectTxnIds(v, known, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectTxnIds(v, known, out));
  return out;
}
