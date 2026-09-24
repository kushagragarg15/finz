import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { checkGrounding } from "../../ai/grounding";
import { resolveMetric, runTool } from "../../ai/tools";
import { parseWorkbook } from "../ingest";
import { buildLedger, sum } from "../ledger";
import { mergeClassifications } from "../rules";
import { buildWorkspace } from "../workspace";

const parsed = parseWorkbook(readFileSync("public/sample/nyc-restaurant-transactions.xlsx"));
const base = { raw: parsed.transactions, ai: {}, corrections: [], resolutions: [] };
const ws = buildWorkspace(base);
const pnl = (m: string) => ws.pnls.find((p) => p.month === m)!;
const cat = (id: string) => ws.txnById.get(id)!.classification.categoryId;

describe("ingest", () => {
  it("reads every transaction with no warnings", () => {
    expect(parsed.transactions).toHaveLength(181);
    expect(parsed.warnings).toEqual([]);
    expect(ws.months).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
  it("preserves the bank total to the cent", () => {
    expect(sum(parsed.transactions.map((t) => t.amount))).toBe(19280.63);
  });
});

describe("P&L", () => {
  it("reconciles every month: operating profit + non-P&L = net bank movement", () => {
    for (const p of ws.pnls) expect(p.reconciles).toBe(true);
  });
  it("matches independently computed March figures", () => {
    const m = pnl("2026-03");
    expect(m.revenue.total).toBe(150535.07);
    expect(m.cogs.total).toBe(54176.44);
    expect(m.grossProfit).toBe(96358.63);
    expect(m.payroll.total).toBe(50729.81);
    expect(m.opex.total).toBe(26776.68);
    expect(m.operatingProfit).toBe(18852.14);
  });
  it("keeps judgment items out of the P&L", () => {
    expect(cat("T1061")).toBe("bs_fixed_assets"); // oven
    expect(cat("T1062")).toBe("bs_sales_tax");
    expect(cat("T1117")).toBe("bs_deferred_revenue"); // gift cards
    expect(cat("T1118")).toBe("bs_loan_principal");
    expect(cat("T1180")).toBe("eq_owner_distribution");
    expect(pnl("2026-01").nonPnl.netCashEffect).toBe(-13950);
  });
});

describe("corrections", () => {
  it("reclassifying a transaction flows into the P&L and still reconciles", () => {
    const corrected = buildWorkspace({ ...base, corrections: [{ txnId: "T1061", from: "bs_fixed_assets", to: "opex_repairs", at: "2026-01-01T00:00:00Z" }] });
    const jan = corrected.pnls[0];
    expect(jan.operatingProfit).toBe(Math.round((pnl("2026-01").operatingProfit - 7800) * 100) / 100);
    expect(jan.reconciles).toBe(true);
    expect(corrected.txnById.get("T1061")!.classification.source).toBe("user");
  });
  it("pattern corrections apply to every matching transaction", () => {
    const t = ws.txnById.get("T1006")!;
    const corrected = buildWorkspace({ ...base, corrections: [{ txnId: t.id, from: "opex_delivery_fees", to: "rev_refunds", at: "2026-01-01T00:00:00Z", appliedToPattern: t.pattern }] });
    expect(corrected.ledger.filter((x) => x.classification.categoryId === "rev_refunds" && x.pattern === t.pattern)).toHaveLength(14);
  });
});

describe("classification ensemble", () => {
  it("drops confidence below review threshold when rule and AI disagree", () => {
    const c = mergeClassifications({ categoryId: "cogs_food", confidence: 0.94, source: "rule", rationale: "r" }, { categoryId: "rev_catering", confidence: 0.7, rationale: "a" });
    expect(c.confidence).toBeLessThan(0.8);
    expect(c.alternative?.categoryId).toBe("rev_catering");
  });
  it("boosts confidence on agreement", () => {
    const c = mergeClassifications({ categoryId: "opex_rent", confidence: 0.9, source: "rule", rationale: "r" }, { categoryId: "opex_rent", confidence: 0.9, rationale: "a" });
    expect(c.source).toBe("rule+ai");
    expect(c.confidence).toBeGreaterThan(0.9);
  });
  it("sends unmatched lines to suspense when AI is unavailable", () => {
    const l = buildLedger([{ id: "X1", date: "2026-01-01", description: "Mystery wire", counterparty: "ACME", amount: -10, method: "Wire" }]);
    expect(l[0].classification.categoryId).toBe("bs_uncategorized");
  });
});

describe("review", () => {
  const kinds = (id: string) => ws.review.filter((i) => i.txnIds.includes(id)).map((i) => i.kind);
  it("flags the out-of-state tax payment", () => expect(kinds("T1062")).toContain("data_inconsistency"));
  it("flags the one-off catering food purchase", () => expect(kinds("T1179")).toContain("non_recurring"));
  it("flags the unusually large repair bill", () => expect(kinds("T1115")).toContain("unusual_amount"));
  it("flags the annual licence as a prepaid candidate", () => expect(kinds("T1181")).toContain("prepaid_candidate"));
});

describe("variances", () => {
  const v = ws.variances.find((x) => x.id === "operatingProfit:2026-02->2026-03")!;
  it("drivers sum exactly to the variance", () => {
    expect(sum(v.drivers.map((d) => d.effect))).toBe(v.delta);
  });
  it("identifies the calendar effect and the one-off", () => {
    expect(v.context.join(" ")).toMatch(/5 weekly POS deposit batches vs 4/);
    const food = ws.variances.find((x) => x.id === "cogs_food:2026-02->2026-03")!;
    expect(food.drivers[0].txnIdsTo).toEqual(["T1179"]);
  });
});

describe("analyst tools & grounding", () => {
  it("resolves natural-language metrics", () => {
    expect(resolveMetric("operating profit")).toBe("operatingProfit");
    expect(resolveMetric("food costs")).toBe("cogs_food");
    expect(resolveMetric("Payroll")).toBe("payroll");
  });
  it("answers March revenue from the ledger", () => {
    const out = runTool(ws, "get_metric_trend", { metric: "revenue" }) as { values: { value: number }[] };
    expect(out.values[2].value).toBe(150535.07);
  });
  it("refuses unsafe calculator input", () => {
    expect(() => runTool(ws, "calculate", { expression: "process.exit()" })).toThrow();
    expect(runTool(ws, "calculate", { expression: "96358.63 - 76837.94" })).toMatchObject({ result: 19520.69 });
  });
  it("verifies figures that come from tools and flags invented ones", () => {
    const tool = [{ revenue: 150535.07, pct: 19.84 }];
    expect(checkGrounding("Revenue was $150,535.07 (+19.8%) in March, see [T1119].", tool).verified).toBe(true);
    expect(checkGrounding("Revenue was about $150.5K.", tool).verified).toBe(true);
    const bad = checkGrounding("Revenue was $151,200.00.", tool);
    expect(bad.verified).toBe(false);
    expect(bad.unverified).toEqual(["$151,200.00"]);
  });
});

describe("variance decomposition", () => {
  it("calendar + one-off + underlying sums exactly to the change", () => {
    for (const v of ws.variances) {
      const d = v.decomposition;
      expect(Math.round((d.calendar + d.oneOff + d.underlying) * 100) / 100).toBe(v.delta);
    }
  });
  it("isolates March's extra week and one-offs in the operating profit change", () => {
    const d = ws.variances.find((x) => x.id === "operatingProfit:2026-02->2026-03")!.decomposition;
    expect(d.calendar).toBe(13924.92);
    expect(d.oneOff).toBe(-7100);
    expect(d.oneOffTxnIds.sort()).toEqual(["T1179", "T1181"]);
    expect(sum(d.underlyingDrivers.map((x) => x.effect))).toBeCloseTo(d.underlying, 0);
  });
});

describe("messy CSV export", () => {
  const messy = parseWorkbook(readFileSync("public/sample/messy-bank-export.csv"));
  const mws = buildWorkspace({ raw: messy.transactions, ai: {}, corrections: [], resolutions: [] });
  const byId = (id: string) => messy.transactions.find((t) => t.id === id)!;
  it("maps alternative headers and parses US dates and $(…) amounts", () => {
    expect(messy.transactions).toHaveLength(20);
    expect(byId("R-001")).toMatchObject({ date: "2026-04-01", amount: -9000, description: "Rent", counterparty: "Landlord" });
    expect(byId("R-008").amount).toBe(412.3);
    expect(byId("R-006").amount).toBe(-3412.87);
  });
  it("routes supplier credits to food cost and transfers below the line", () => {
    expect(mws.txnById.get("R-008")!.classification.categoryId).toBe("cogs_food");
    expect(mws.txnById.get("R-013")!.classification.categoryId).toBe("bs_transfer");
    expect(mws.txnById.get("R-006")!.classification.categoryId).toBe("bs_credit_card");
  });
  it("flags the duplicate Sysco charge and unknown lines", () => {
    const kinds = mws.review.map((i) => `${i.kind}:${i.txnIds.join(",")}`);
    expect(kinds).toContain("possible_duplicate:R-017,R-018");
    expect(mws.txnById.get("R-005")!.classification.categoryId).toBe("bs_uncategorized"); // Zelle to a person, no AI
    expect(mws.pnls[0].reconciles).toBe(true);
  });
});
