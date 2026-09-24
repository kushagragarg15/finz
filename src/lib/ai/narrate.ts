import { monthLabel } from "../finance/pnl";
import type { Variance } from "../finance/types";
import { checkGrounding, type GroundingResult } from "./grounding";
import { aiEnabled, groqChat } from "./groq";

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Deterministic fallback narrative — used when AI is off or fails verification. */
export function templateNarrative(v: Variance): string {
  const dir = v.delta >= 0 ? "increased" : "decreased";
  const pct = v.pct === null ? "" : ` (${v.pct > 0 ? "+" : ""}${v.pct}%)`;
  const top = v.drivers.slice(0, 3).map((d) => `${d.label} ${d.effect >= 0 ? "+" : ""}${money(d.effect)}`).join("; ");
  return `${v.metricLabel} ${dir} from ${money(v.from)} in ${monthLabel(v.fromMonth)} to ${money(v.to)} in ${monthLabel(v.toMonth)}, a change of ${money(v.delta)}${pct}. Largest drivers: ${top || "n/a"}.${v.context.length ? " " + v.context[0] : ""}`;
}

export async function narrateVariance(v: Variance): Promise<{ text: string; source: "ai" | "template"; grounding: GroundingResult | null }> {
  if (!aiEnabled()) return { text: templateNarrative(v), source: "template", grounding: null };
  const payload = {
    metric: v.metricLabel,
    from_month: monthLabel(v.fromMonth, true),
    to_month: monthLabel(v.toMonth, true),
    from: v.from,
    to: v.to,
    change: v.delta,
    pct_change: v.pct,
    impact: v.impact,
    drivers: v.drivers.slice(0, 6).map((d) => ({
      driver: d.label, from: d.from, to: d.to, change: d.delta, effect_on_metric: d.effect, note: d.note,
      sub_drivers: d.children?.slice(0, 3).map((c) => ({ driver: c.label, change: c.delta, note: c.note, transactions: [...c.txnIdsTo, ...c.txnIdsFrom].slice(0, 4) })),
      transactions: d.children?.length ? undefined : [...d.txnIdsTo, ...d.txnIdsFrom].slice(0, 4),
    })),
    context: v.context,
  };
  try {
    const msg = await groqChat({
      maxTokens: 400,
      messages: [
        {
          role: "system",
          content: "You are a restaurant controller explaining a P&L variance to the owner. Write 2-4 sentences. Use ONLY figures present in the JSON (copy them exactly, formatted like $12,345.67). Separate calendar/timing effects and one-offs from underlying performance. Cite key transaction ids in square brackets like [T1179]. No preamble, no headings.",
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });
    const text = (msg.content ?? "").trim();
    const grounding = checkGrounding(text, [payload]);
    if (!text || !grounding.verified) return { text: templateNarrative(v), source: "template", grounding };
    return { text, source: "ai", grounding };
  } catch {
    return { text: templateNarrative(v), source: "template", grounding: null };
  }
}
