import { categoryOf } from "./chartOfAccounts";
import { UNCERTAIN_THRESHOLD } from "./rules";
import type { ReviewItem, Severity, Transaction } from "./types";

/** The business operates in New York; tax/licensing counterparties elsewhere are suspicious. */
export const BUSINESS_STATE = "New York";

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

const fmt = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const TREATMENT_SEVERITY: Record<string, Severity> = {
  bs_fixed_assets: "high",
  bs_sales_tax: "high",
  bs_deferred_revenue: "high",
  bs_loan_principal: "medium",
  eq_owner_distribution: "medium",
};

/**
 * Deterministic review rules. Each produces a human-readable reason and a
 * suggested action; the UI lets a reviewer resolve items with a note.
 */
export function detectReviewItems(ledger: Transaction[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  const add = (i: Omit<ReviewItem, "id">) => items.push({ ...i, id: `${i.kind}:${i.txnIds.join(",")}` });

  const patternTxns = new Map<string, Transaction[]>();
  ledger.forEach((t) => patternTxns.set(t.pattern, [...(patternTxns.get(t.pattern) ?? []), t]));

  for (const t of ledger) {
    const c = t.classification;
    const cat = categoryOf(c.categoryId);

    // 1. Classification uncertainty (low confidence, rule/AI disagreement, unclassified)
    const uncertain = c.source !== "user" && (c.confidence < UNCERTAIN_THRESHOLD || c.categoryId === "bs_uncategorized");
    if (uncertain) {
      const alt = c.alternative ? ` Alternative: ${categoryOf(c.alternative.categoryId).name} (${c.alternative.source}) — ${c.alternative.rationale}` : "";
      add({
        kind: "classification_uncertain",
        severity: c.categoryId === "bs_uncategorized" ? "high" : "medium",
        txnIds: [t.id],
        title: `Uncertain classification: ${t.description}`,
        detail: `Classified as ${cat.name} with ${Math.round(c.confidence * 100)}% confidence. ${c.rationale}${alt}`,
        suggestedAction: "Confirm the category or correct it.",
      });
    }

    // 2. Items that need a non-P&L accounting treatment (once the category itself is settled)
    if (cat.section === "non_pnl" && cat.id !== "bs_uncategorized" && !uncertain) {
      let extra = "";
      if (cat.id === "bs_loan_principal") {
        const interest = ledger.some((x) => /interest/i.test(x.description));
        if (!interest) extra = " No loan interest payment appears in the period — confirm whether interest was paid or accrued separately.";
      }
      if (cat.id === "bs_sales_tax") {
        extra = " POS deposits may include sales tax collected from customers; if so, revenue is overstated by the tax portion.";
      }
      if (cat.id === "bs_deferred_revenue") {
        extra = " Revenue should be recognised as the cards are redeemed (redemptions are not visible in bank data).";
      }
      add({
        kind: "accounting_treatment",
        severity: TREATMENT_SEVERITY[cat.id] ?? "medium",
        txnIds: [t.id],
        title: `${cat.name}: ${t.description} (${fmt(t.amount)})`,
        detail: `${cat.treatment}${extra} Excluded from operating profit.`,
        suggestedAction:
          cat.id === "bs_fixed_assets" ? `Capitalise and depreciate (e.g. 7 years ≈ ${fmt(t.amount / 84)}/month).`
          : cat.id === "bs_deferred_revenue" ? "Keep as a liability; recognise revenue on redemption."
          : "Confirm treatment.",
      });
    }

    // 3. Jurisdiction mismatch for tax / licensing counterparties
    const state = US_STATES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(t.counterparty));
    if (state && state !== BUSINESS_STATE) {
      add({
        kind: "data_inconsistency",
        severity: "high",
        txnIds: [t.id],
        title: `Out-of-state counterparty: ${t.counterparty}`,
        detail: `This business operates in ${BUSINESS_STATE}, but ${t.id} (${fmt(t.amount)}, "${t.description}") was paid to ${t.counterparty}.${cat.id === "bs_sales_tax" ? " A NYC restaurant would normally remit sales tax to NY State (DTF)." : ""}`,
        suggestedAction: "Verify the payee; it may be a misdirected payment or a data-entry error.",
      });
    }

    // 4. Prepaid / annual costs expensed in a single month
    if (cat.section !== "non_pnl" && t.amount < 0 && /\bannual\b|\byearly\b|12[- ]month/i.test(t.description)) {
      add({
        kind: "prepaid_candidate",
        severity: "low",
        txnIds: [t.id],
        title: `Annual cost expensed in one month: ${t.description}`,
        detail: `${fmt(t.amount)} covers ~12 months but hits ${t.month} in full.`,
        suggestedAction: `Consider recording as a prepaid and amortising ≈ ${fmt(t.amount / 12)}/month.`,
      });
    }
  }

  // 5. Unusual amounts within a recurring pattern (outflows ≥ 1.5× the pattern median)
  for (const txns of patternTxns.values()) {
    if (txns.length < 3) continue;
    const med = median(txns.map((t) => Math.abs(t.amount)));
    for (const t of txns) {
      if (t.amount < 0 && Math.abs(t.amount) >= 1.5 * med && Math.abs(t.amount) - med >= 500) {
        add({
          kind: "unusual_amount",
          severity: "medium",
          txnIds: [t.id],
          title: `Unusually high: ${t.description} (${fmt(t.amount)})`,
          detail: `${(Math.abs(t.amount) / med).toFixed(1)}× the typical ${fmt(med)} for this recurring payment to ${t.counterparty}.`,
          suggestedAction: "Check the invoice; confirm it is not a capital repair, duplicate or mis-keyed amount.",
        });
      }
    }
  }

  // 6. Material one-off P&L transactions (pattern seen once in the dataset)
  for (const txns of patternTxns.values()) {
    if (txns.length !== 1) continue;
    const t = txns[0];
    const cat = categoryOf(t.classification.categoryId);
    if (cat.section === "non_pnl" || Math.abs(t.amount) < 1000) continue;
    add({
      kind: "non_recurring",
      severity: "medium",
      txnIds: [t.id],
      title: `One-off ${cat.name}: ${t.description}`,
      detail: `${fmt(t.amount)} to ${t.counterparty} on ${t.date} does not recur in the period and distorts month-over-month comparisons.`,
      suggestedAction: /catering|event/i.test(t.description)
        ? "Confirm the category and match it to the related catering revenue when judging margins."
        : "Confirm the category and whether it should be spread over the periods it benefits.",
    });
  }

  // 7. Possible duplicates: same counterparty & amount within 5 days
  const sorted = [...ledger].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const days = (Date.parse(b.date) - Date.parse(a.date)) / 86_400_000;
      if (days > 5) break;
      if (a.counterparty === b.counterparty && a.amount === b.amount) {
        add({
          kind: "possible_duplicate",
          severity: "high",
          txnIds: [a.id, b.id],
          title: `Possible duplicate: ${a.counterparty} ${fmt(a.amount)}`,
          detail: `${a.id} (${a.date}) and ${b.id} (${b.date}) have identical counterparty and amount.`,
          suggestedAction: "Confirm both payments are genuine.",
        });
      }
    }
  }

  // 8. Policy judgment: delivery payouts recorded gross alongside separate commissions
  const payouts = ledger.filter((t) => t.classification.categoryId === "rev_delivery");
  const commissions = ledger.filter((t) => t.classification.categoryId === "opex_delivery_fees");
  if (payouts.length && commissions.length) {
    const rate = commissions.reduce((a, t) => a + Math.abs(t.amount), 0) / payouts.reduce((a, t) => a + t.amount, 0);
    add({
      kind: "accounting_treatment",
      severity: "low",
      txnIds: commissions.map((t) => t.id),
      title: "Delivery marketplace: gross vs net presentation",
      detail: `Payouts are booked as revenue and ${commissions.length} commission deductions (${(rate * 100).toFixed(1)}% of payouts) as an operating expense. If the payouts are already net of commission, fees are double-counted.`,
      suggestedAction: "Confirm with DoorDash/Uber Eats statements whether payouts are gross or net.",
    });
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
