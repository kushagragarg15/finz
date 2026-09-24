import { z } from "zod";
import { CATEGORIES, CATEGORY_BY_ID } from "../finance/chartOfAccounts";
import { patternKey } from "../finance/ingest";
import type { AiSuggestionMap } from "../finance/ledger";
import type { RawTransaction } from "../finance/types";
import { groqChat } from "./groq";

const ResultSchema = z.object({
  results: z.array(
    z.object({
      key: z.string(),
      categoryId: z.string(),
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    }),
  ),
});

const SYSTEM = `You are a restaurant bookkeeper classifying bank transactions into a fixed chart of accounts.
Rules:
- Choose exactly one categoryId from the provided list. Never invent ids.
- Think about accounting treatment, not just keywords: capital purchases, loan principal, owner distributions, sales tax remittances and gift card sales are NOT P&L items.
- confidence is your probability (0-1) that the category is correct. Use < 0.8 when the description is ambiguous or the item could reasonably belong elsewhere.
- rationale: one short sentence.
Return JSON: {"results":[{"key":..., "categoryId":..., "confidence":..., "rationale":...}]}`;

/**
 * Classify each *distinct pattern* once (recurring weekly lines collapse into
 * a single pattern), independently of the rule engine. The two opinions are
 * merged deterministically in `mergeClassifications`.
 */
export async function aiCategorize(raw: RawTransaction[]): Promise<AiSuggestionMap> {
  const groups = new Map<string, RawTransaction[]>();
  raw.forEach((t) => {
    const k = patternKey(t.description, t.counterparty);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  });
  const patterns = [...groups.entries()].map(([key, ts]) => ({
    key,
    description: ts[0].description.replace(/week\s*\d+/i, "week N"),
    counterparty: ts[0].counterparty,
    method: ts[0].method,
    direction: ts[0].amount >= 0 ? "inflow" : "outflow",
    occurrences: ts.length,
    typicalAmount: Math.round(ts.reduce((a, t) => a + Math.abs(t.amount), 0) / ts.length),
  }));

  const chart = CATEGORIES.map((c) => ({ id: c.id, name: c.name, section: c.section, description: c.description }));
  const out: AiSuggestionMap = {};
  const BATCH = 40;
  for (let i = 0; i < patterns.length; i += BATCH) {
    const batch = patterns.slice(i, i + BATCH);
    const msg = await groqChat({
      json: true,
      maxTokens: 4096,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Business: independent full-service restaurant in New York City.\nChart of accounts:\n${JSON.stringify(chart)}\n\nTransactions to classify:\n${JSON.stringify(batch)}`,
        },
      ],
    });
    const parsed = ResultSchema.safeParse(JSON.parse(msg.content ?? "{}"));
    if (!parsed.success) continue;
    for (const r of parsed.data.results) {
      if (!groups.has(r.key) || !CATEGORY_BY_ID[r.categoryId]) continue; // reject hallucinated ids
      out[r.key] = { categoryId: r.categoryId, confidence: r.confidence, rationale: r.rationale };
    }
  }
  return out;
}
