import { monthLabel } from "../finance/pnl";
import { materialVariances } from "../finance/variance";
import type { Workspace } from "../finance/workspace";
import type { AnalystReply } from "./analyst";
import { checkGrounding } from "./grounding";
import { groqChat } from "./groq";
import { collectTxnIds } from "./tools";

/**
 * Executive briefing. The facts are assembled deterministically on the
 * server and the model only writes prose over them: one call, no tools,
 * so it fits comfortably inside free-tier token limits.
 */
export function briefingFacts(ws: Workspace) {
  const ms = ws.months;
  const opVariances = ms.slice(1).map((m, i) => ws.variances.find((v) => v.id === `operatingProfit:${ms[i]}->${m}`)!).filter(Boolean);
  const costPressures = materialVariances(ws.variances)
    .filter((v) => v.level === "category" && v.impact === "unfavorable")
    .slice(0, 3);
  const open = ws.review.filter((i) => i.resolution?.status !== "resolved" && i.severity !== "low");
  return {
    months: ws.pnls.map((p) => ({
      month: monthLabel(p.month, true),
      revenue: p.revenue.total,
      gross_margin_pct: p.grossMargin,
      operating_profit: p.operatingProfit,
      operating_margin_pct: p.operatingMargin,
    })),
    operating_profit_changes: opVariances.map((v) => ({
      period: `${monthLabel(v.fromMonth)} to ${monthLabel(v.toMonth)}`,
      change: v.delta,
      calendar_timing_effect: v.decomposition.calendar,
      one_off_effect: v.decomposition.oneOff,
      one_off_transactions: v.decomposition.oneOffTxnIds,
      underlying_change: v.decomposition.underlying,
      underlying_drivers: v.decomposition.underlyingDrivers.slice(0, 4),
    })),
    biggest_cost_pressures: costPressures.map((v) => ({
      category: v.metricLabel,
      period: `${monthLabel(v.fromMonth)} to ${monthLabel(v.toMonth)}`,
      change: v.delta,
      pct_change: v.pct,
      one_off_effect: v.decomposition.oneOff,
      underlying_change: v.decomposition.underlying,
      top_driver: v.drivers[0]?.label,
      transactions: v.drivers[0] ? [...v.drivers[0].txnIdsTo].slice(0, 3) : [],
    })),
    needs_attention: open.slice(0, 6).map((i) => ({ severity: i.severity, item: i.title, transactions: i.txnIds.slice(0, 2) })),
  };
}

export async function runBriefing(ws: Workspace): Promise<AnalystReply> {
  const facts = briefingFacts(ws);
  const msg = await groqChat({
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content:
          "You brief a restaurant owner on their books. Write at most 5 markdown bullets: (1) how operating profit moved and why, separating calendar timing and one-offs from the underlying change, (2) the biggest cost pressure, (3) what needs attention before the numbers are final. Use ONLY figures from the JSON, copied exactly and formatted like $12,345.67 (negatives as -$1,234.56). An effect is the impact on operating profit: positive helps profit, negative hurts it. Cite transaction ids in square brackets like [T1179]. Bold the key phrase of each bullet. No heading, no preamble.",
      },
      { role: "user", content: JSON.stringify(facts) },
    ],
  });
  const answer = (msg.content ?? "").trim();
  const known = new Set(ws.ledger.map((t) => t.id));
  return {
    answer,
    trace: [{ name: "briefing_facts", args: {}, result: facts, evidence: [...collectTxnIds(facts, known)] }],
    evidenceTxnIds: [...new Set([...collectTxnIds(answer, known), ...collectTxnIds(facts, known)])],
    grounding: checkGrounding(answer, [facts]),
    varianceIds: [],
    model: msg.model,
    tokens: msg.tokens,
  };
}
