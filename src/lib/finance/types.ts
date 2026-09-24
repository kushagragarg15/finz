// Core domain types shared by the deterministic engine, the API routes and the UI.

export type Section =
  | "revenue"
  | "cogs"
  | "payroll"
  | "opex"
  | "non_pnl"; // balance-sheet / equity / pass-through items that never hit the P&L

export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  section: Section;
  /** Accounting treatment shown to the user for non-P&L items. */
  treatment?: string;
  description: string;
}

/** A single bank line, exactly as ingested (never mutated after ingest). */
export interface RawTransaction {
  id: string;
  date: string; // ISO yyyy-mm-dd
  description: string;
  counterparty: string;
  amount: number; // signed: + inflow, - outflow
  method: string;
}

export type ClassificationSource = "rule" | "ai" | "rule+ai" | "user";

export interface Classification {
  categoryId: CategoryId;
  confidence: number; // 0..1
  source: ClassificationSource;
  rationale: string;
  /** Present when the rule engine and the AI disagreed. */
  alternative?: { categoryId: CategoryId; source: "rule" | "ai"; rationale: string };
}

export interface Transaction extends RawTransaction {
  month: string; // yyyy-mm
  /** Normalised pattern key, e.g. "pos batch deposit - food sales week #" */
  pattern: string;
  classification: Classification;
}

export interface Correction {
  txnId: string;
  from: CategoryId;
  to: CategoryId;
  note?: string;
  at: string; // ISO timestamp
  /** When set, the correction was applied to every txn sharing this pattern. */
  appliedToPattern?: string;
}

export type ReviewKind =
  | "accounting_treatment"
  | "classification_uncertain"
  | "unusual_amount"
  | "data_inconsistency"
  | "non_recurring"
  | "possible_duplicate"
  | "prepaid_candidate";

export type Severity = "high" | "medium" | "low";

export interface ReviewItem {
  id: string; // `${kind}:${txnId}`
  kind: ReviewKind;
  severity: Severity;
  txnIds: string[];
  title: string;
  detail: string;
  suggestedAction: string;
}

export type ReviewStatus = "open" | "resolved";

export interface ReviewResolution {
  itemId: string;
  status: ReviewStatus;
  note: string;
  at: string;
}

export interface PnlLine {
  categoryId: CategoryId;
  name: string;
  amount: number; // presented sign: revenue +, costs + (as positive cost)
  txnIds: string[];
}

export interface PnlSection {
  section: Exclude<Section, "non_pnl">;
  label: string;
  total: number;
  lines: PnlLine[];
}

export interface MonthlyPnl {
  month: string;
  revenue: PnlSection;
  cogs: PnlSection;
  grossProfit: number;
  grossMargin: number | null;
  payroll: PnlSection;
  opex: PnlSection;
  operatingProfit: number;
  operatingMargin: number | null;
  nonPnl: { lines: PnlLine[]; netCashEffect: number };
  /** Reconciliation: operatingProfit + non-P&L cash effect must equal net bank movement. */
  netBankMovement: number;
  reconciles: boolean;
}

export interface VarianceDriver {
  key: string; // category id or pattern
  label: string;
  level: "category" | "pattern";
  from: number;
  to: number;
  delta: number;
  /** Contribution of this driver to the parent metric (sign-adjusted for profit metrics). */
  effect: number;
  txnIdsFrom: string[];
  txnIdsTo: string[];
  note?: string;
  children?: VarianceDriver[];
}

export interface Variance {
  id: string; // `${metric}:${from}->${to}`
  metric: string; // e.g. "revenue", "cogs", "grossProfit", or a category id
  metricLabel: string;
  level: "total" | "section" | "category";
  fromMonth: string;
  toMonth: string;
  from: number;
  to: number;
  delta: number;
  pct: number | null;
  /** Direction relative to profit: good (helps profit) or bad. */
  impact: "favorable" | "unfavorable";
  material: boolean;
  drivers: VarianceDriver[];
  context: string[]; // deterministic facts, e.g. partial weeks
  /** delta = calendar + oneOff + underlying (exact, in the metric's own sign). */
  decomposition: {
    calendar: number;
    oneOff: number;
    underlying: number;
    calendarTxnIds: string[];
    oneOffTxnIds: string[];
    /** Category effects after removing calendar and one-off transactions, largest first (sums to underlying). */
    underlyingDrivers: { label: string; effect: number }[];
  };
}
