import type { CategoryId, Classification, RawTransaction } from "./types";

/**
 * Deterministic keyword rules. They encode domain knowledge that should never
 * drift (e.g. "loan principal" is never an expense). Each rule carries a
 * confidence reflecting how unambiguous the pattern is.
 */
interface Rule {
  id: string;
  test: RegExp; // tested against "description | counterparty"
  categoryId: CategoryId;
  confidence: number;
  why: string;
  /** Only match inflows (+1) or outflows (-1). */
  sign?: 1 | -1;
}

export const RULES: Rule[] = [
  // Non-P&L first: these are the costly mistakes if they leak into the P&L.
  { id: "loan", test: /loan (principal|repayment)|principal repayment/i, categoryId: "bs_loan_principal", confidence: 0.97, why: "Description states loan principal repayment." },
  { id: "owner", test: /owner (distribution|draw)|distribution \| owner/i, categoryId: "eq_owner_distribution", confidence: 0.97, why: "Payment to the owner labelled as a distribution." },
  { id: "salestax", test: /sales tax|dept\.? of revenue|department of taxation/i, categoryId: "bs_sales_tax", confidence: 0.95, why: "Remittance to a state tax authority." },
  { id: "giftcard", test: /gift card/i, categoryId: "bs_deferred_revenue", confidence: 0.85, sign: 1, why: "Gift card sales are a liability until redeemed." },
  { id: "transfer", test: /transfer (to|from) (savings|checking)|internal transfer/i, categoryId: "bs_transfer", confidence: 0.9, why: "Transfer between the business's own accounts." },
  { id: "card_payment", test: /card (autopay|payment)|card services/i, categoryId: "bs_credit_card", confidence: 0.88, sign: -1, why: "Payment of a credit card balance." },
  { id: "supplier_credit", test: /credit memo|vendor credit|(sysco|us foods|produce|butcher|bakery).*(credit|refund)/i, categoryId: "cogs_food", confidence: 0.82, sign: 1, why: "Credit from a food supplier reduces food cost." },
  { id: "capex", test: /equipment purchase|new (oven|fridge|freezer|range)|equipment world/i, categoryId: "bs_fixed_assets", confidence: 0.9, sign: -1, why: "Purchase of long-lived kitchen equipment." },

  // Revenue
  { id: "pos_food", test: /pos batch deposit.*food/i, categoryId: "rev_food", confidence: 0.97, sign: 1, why: "Toast POS food sales batch deposit." },
  { id: "pos_bev", test: /pos batch deposit.*beverage/i, categoryId: "rev_beverage", confidence: 0.97, sign: 1, why: "Toast POS beverage sales batch deposit." },
  { id: "catering_in", test: /catering invoice/i, categoryId: "rev_catering", confidence: 0.95, sign: 1, why: "Client payment of a catering invoice." },
  { id: "delivery_in", test: /delivery marketplace payout|doordash|uber eats|grubhub/i, categoryId: "rev_delivery", confidence: 0.9, sign: 1, why: "Payout from delivery marketplace." },
  { id: "refunds", test: /refund|discount|comp(s)?\b/i, categoryId: "rev_refunds", confidence: 0.93, sign: -1, why: "POS refunds/discounts reduce revenue." },

  // COGS
  { id: "delivery_fee", test: /delivery platform commission|marketplace (fee|commission)/i, categoryId: "opex_delivery_fees", confidence: 0.9, sign: -1, why: "Commission deducted by the delivery platform." },
  { id: "bev_inv", test: /beverage inventory|beer|wine|spirits|southern glazer/i, categoryId: "cogs_beverage", confidence: 0.95, sign: -1, why: "Beverage inventory purchase." },
  { id: "catering_food", test: /catering event food|food purchase/i, categoryId: "cogs_food", confidence: 0.75, sign: -1, why: "Food purchase, but tied to a specific event." },
  { id: "food_inv", test: /food inventory|sysco|us foods|produce|butcher|bakery supply/i, categoryId: "cogs_food", confidence: 0.94, sign: -1, why: "Food inventory from a known supplier." },
  { id: "packaging", test: /packaging|disposables|to-go/i, categoryId: "cogs_packaging", confidence: 0.92, sign: -1, why: "To-go packaging and disposables." },

  // Payroll
  { id: "pay_tax", test: /payroll tax|benefits/i, categoryId: "pay_taxes", confidence: 0.96, sign: -1, why: "Employer payroll taxes and benefits." },
  { id: "pay_salary", test: /salary/i, categoryId: "pay_salary", confidence: 0.95, sign: -1, why: "Manager salary run." },
  { id: "pay_hourly", test: /payroll|wages/i, categoryId: "pay_hourly", confidence: 0.94, sign: -1, why: "Hourly wage payroll run." },

  // Opex
  { id: "rent", test: /\brent\b|landlord/i, categoryId: "opex_rent", confidence: 0.97, sign: -1, why: "Monthly rent to landlord." },
  { id: "utilities", test: /utilit|electric|con ed|water/i, categoryId: "opex_utilities", confidence: 0.95, sign: -1, why: "Utility bill." },
  { id: "telecom", test: /internet|phone|comcast|verizon/i, categoryId: "opex_telecom", confidence: 0.95, sign: -1, why: "Telecom bill." },
  { id: "insurance", test: /insurance/i, categoryId: "opex_insurance", confidence: 0.95, sign: -1, why: "Insurance premium." },
  { id: "software", test: /software|subscription|saas/i, categoryId: "opex_software", confidence: 0.93, sign: -1, why: "Software / POS subscription." },
  { id: "accounting", test: /accounting|bookkeeping|legal|cpa/i, categoryId: "opex_professional", confidence: 0.94, sign: -1, why: "Professional services." },
  { id: "marketing", test: /marketing|ads\b|advertis|yelp|meta/i, categoryId: "opex_marketing", confidence: 0.93, sign: -1, why: "Advertising spend." },
  { id: "repairs", test: /repair|maintenance/i, categoryId: "opex_repairs", confidence: 0.92, sign: -1, why: "Repairs and maintenance." },
  { id: "cleaning", test: /cleaning|linen/i, categoryId: "opex_cleaning", confidence: 0.94, sign: -1, why: "Cleaning / linen service." },
  { id: "office", test: /office|admin supplies|staples/i, categoryId: "opex_office", confidence: 0.92, sign: -1, why: "Office and admin supplies." },
  { id: "license", test: /licen[cs]e|permit/i, categoryId: "opex_licenses", confidence: 0.85, sign: -1, why: "Business licence renewal." },
];

export function classifyByRules(t: RawTransaction): (Classification & { ruleId: string }) | null {
  const hay = `${t.description} | ${t.counterparty}`;
  const sign = t.amount >= 0 ? 1 : -1;
  for (const r of RULES) {
    if (r.sign && r.sign !== sign) continue;
    if (r.test.test(hay)) {
      return { categoryId: r.categoryId, confidence: r.confidence, source: "rule", rationale: r.why, ruleId: r.id };
    }
  }
  return null;
}

export interface AiSuggestion {
  categoryId: CategoryId;
  confidence: number;
  rationale: string;
}

/**
 * Ensemble: rules and the LLM classify independently. Agreement raises
 * confidence; disagreement drops it below the review threshold and keeps the
 * alternative so a human can pick.
 */
export function mergeClassifications(
  rule: Classification | null,
  ai: AiSuggestion | null,
): Classification {
  if (rule && ai) {
    if (rule.categoryId === ai.categoryId) {
      return {
        categoryId: rule.categoryId,
        confidence: Math.min(0.99, Math.max(rule.confidence, ai.confidence) + 0.03),
        source: "rule+ai",
        rationale: `${rule.rationale} AI agrees: ${ai.rationale}`,
      };
    }
    const primaryIsRule = rule.confidence >= ai.confidence;
    const [p, s] = primaryIsRule ? [rule, ai] : [ai, rule];
    return {
      categoryId: p.categoryId,
      confidence: Math.min(0.55, p.confidence),
      source: primaryIsRule ? "rule" : "ai",
      rationale: `${p.rationale} (Rules and AI disagree.)`,
      alternative: { categoryId: s.categoryId, source: primaryIsRule ? "ai" : "rule", rationale: s.rationale },
    };
  }
  if (rule) return rule;
  if (ai) return { categoryId: ai.categoryId, confidence: Math.min(0.85, ai.confidence), source: "ai", rationale: ai.rationale };
  return { categoryId: "bs_uncategorized", confidence: 0, source: "rule", rationale: "No rule matched and AI classification was unavailable." };
}

export const UNCERTAIN_THRESHOLD = 0.8;
