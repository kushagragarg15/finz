import { patternKey } from "./ingest";
import { classifyByRules, mergeClassifications, type AiSuggestion } from "./rules";
import type { Correction, RawTransaction, Transaction } from "./types";

/** AI suggestions are keyed by pattern so one LLM call covers all recurring lines. */
export type AiSuggestionMap = Record<string, AiSuggestion>;

export function buildLedger(raw: RawTransaction[], ai: AiSuggestionMap = {}): Transaction[] {
  return raw.map((t) => {
    const pattern = patternKey(t.description, t.counterparty);
    const rule = classifyByRules(t);
    const classification = mergeClassifications(rule, ai[pattern] ?? null);
    return { ...t, month: t.date.slice(0, 7), pattern, classification };
  });
}

/**
 * Apply human corrections on top of the machine classification. Corrections
 * are an append-only audit log; the latest one touching a transaction wins.
 */
export function applyCorrections(ledger: Transaction[], corrections: Correction[]): Transaction[] {
  if (!corrections.length) return ledger;
  const byId = new Map<string, Correction>();
  const byPattern = new Map<string, Correction>();
  for (const c of corrections) {
    if (c.appliedToPattern) byPattern.set(c.appliedToPattern, c);
    else byId.set(c.txnId, c);
  }
  return ledger.map((t) => {
    const direct = byId.get(t.id);
    const pat = byPattern.get(t.pattern);
    const winner = direct && pat ? (direct.at >= pat.at ? direct : pat) : direct ?? pat;
    if (!winner) return t;
    return {
      ...t,
      classification: {
        categoryId: winner.to,
        confidence: 1,
        source: "user",
        rationale: winner.note ? `Corrected by reviewer: ${winner.note}` : "Corrected by reviewer.",
        alternative: {
          categoryId: t.classification.categoryId,
          source: t.classification.source === "ai" ? "ai" : "rule",
          rationale: `Original machine classification (${Math.round(t.classification.confidence * 100)}% confidence).`,
        },
      },
    };
  });
}

export function months(ledger: Transaction[]): string[] {
  return [...new Set(ledger.map((t) => t.month))].sort();
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));
