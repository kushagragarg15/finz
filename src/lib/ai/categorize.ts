import { z } from "zod";
import { CATEGORIES, CATEGORY_BY_ID } from "../finance/chartOfAccounts";
import { patternKey } from "../finance/ingest";
import type { AiSuggestionMap } from "../finance/ledger";
import type { RawTransaction } from "../finance/types";
import { groqChat } from "./groq";

const ItemSchema = z.object({
  i: z.coerce.number().int(),
  categoryId: z.string(),
  confidence: z.coerce.number().min(0).max(1),
  rationale: z.string().default(""),
});

const SYSTEM = `You are a restaurant bookkeeper classifying bank transactions into a fixed chart of accounts.
Rules:
- Choose exactly one categoryId from the provided list. Never invent ids. Use bs_uncategorized if you genuinely cannot tell.
- Think about accounting treatment, not just keywords: capital purchases, loan principal, owner distributions, sales tax remittances, gift card sales and transfers between the business's own accounts are NOT P&L items.
- confidence is your calibrated probability (0-1) that the category is correct. Use 0.95+ only when the description is unambiguous. Use 0.5-0.8 when the line could reasonably belong elsewhere (e.g. a Zelle payment to a person, a credit-card autopay, a generic marketplace purchase).
- rationale: one short sentence; mention the alternative when unsure.
Return JSON: {"results":[{"i": <index>, "categoryId": "...", "confidence": 0.0, "rationale": "..."}]} with one entry per input index.`;

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
  const keys = [...groups.keys()];
  const patterns = keys.map((key, i) => {
    const ts = groups.get(key)!;
    return {
      i,
      description: ts[0].description.replace(/week\s*\d+/i, "week N"),
      counterparty: ts[0].counterparty,
      method: ts[0].method,
      direction: ts[0].amount >= 0 ? "inflow" : "outflow",
      occurrences: ts.length,
      typicalAmount: Math.round(ts.reduce((a, t) => a + Math.abs(t.amount), 0) / ts.length),
    };
  });

  const chart = CATEGORIES.map((c) => `${c.id}: ${c.name} (${c.section}) - ${c.description}`).join("\n");
  const out: AiSuggestionMap = {};
  const BATCH = 40;
  for (let b = 0; b < patterns.length; b += BATCH) {
    const batch = patterns.slice(b, b + BATCH);
    const msg = await groqChat({
      json: true,
      maxTokens: 4096,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Business: independent full-service restaurant in New York City.\nChart of accounts:\n${chart}\n\nTransactions to classify:\n${JSON.stringify(batch)}`,
        },
      ],
    });
    let results: unknown[] = [];
    try {
      const parsed = JSON.parse(msg.content ?? "{}");
      results = Array.isArray(parsed) ? parsed : Array.isArray(parsed.results) ? parsed.results : [];
    } catch {
      continue;
    }
    // Validate item by item so one malformed entry doesn't discard the batch.
    for (const r of results) {
      const item = ItemSchema.safeParse(r);
      if (!item.success) continue;
      const key = keys[item.data.i];
      if (!key || !CATEGORY_BY_ID[item.data.categoryId]) continue; // reject hallucinated ids
      out[key] = { categoryId: item.data.categoryId, confidence: item.data.confidence, rationale: item.data.rationale };
    }
  }
  return out;
}
