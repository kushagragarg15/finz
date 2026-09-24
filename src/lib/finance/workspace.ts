import { applyCorrections, buildLedger, months, type AiSuggestionMap } from "./ledger";
import { computeAllPnl } from "./pnl";
import { detectReviewItems } from "./review";
import type { Correction, MonthlyPnl, RawTransaction, ReviewItem, ReviewResolution, Transaction, Variance } from "./types";
import { computeAllVariances } from "./variance";

/** Everything the client persists. The server recomputes all numbers from this. */
export interface WorkspaceInput {
  raw: RawTransaction[];
  ai: AiSuggestionMap;
  corrections: Correction[];
  resolutions: ReviewResolution[];
}

export interface ReviewItemWithStatus extends ReviewItem {
  resolution?: ReviewResolution;
}

export interface Workspace {
  ledger: Transaction[];
  months: string[];
  pnls: MonthlyPnl[];
  variances: Variance[];
  review: ReviewItemWithStatus[];
  txnById: Map<string, Transaction>;
}

/** Single deterministic pipeline shared by the UI and the AI tools. */
export function buildWorkspace(input: WorkspaceInput): Workspace {
  const ledger = applyCorrections(buildLedger(input.raw, input.ai), input.corrections);
  const pnls = computeAllPnl(ledger);
  const resolutionById = new Map(input.resolutions.map((r) => [r.itemId, r]));
  const review = detectReviewItems(ledger).map((i) => ({ ...i, resolution: resolutionById.get(i.id) }));
  return {
    ledger,
    months: months(ledger),
    pnls,
    variances: computeAllVariances(ledger, pnls),
    review,
    txnById: new Map(ledger.map((t) => [t.id, t])),
  };
}
