import { CATEGORIES, SECTION_LABEL, categoryOf } from "./chartOfAccounts";
import { months, round2, sum } from "./ledger";
import type { MonthlyPnl, PnlLine, PnlSection, Section, Transaction } from "./types";

type PnlSectionKey = Exclude<Section, "non_pnl">;

/** Revenue keeps its bank sign; cost sections are presented as positive costs. */
const presentSign = (section: Section) => (section === "revenue" || section === "non_pnl" ? 1 : -1);

function buildLines(txns: Transaction[], section: Section): PnlLine[] {
  return CATEGORIES.filter((c) => c.section === section)
    .map((c) => {
      const items = txns.filter((t) => t.classification.categoryId === c.id);
      return {
        categoryId: c.id,
        name: c.name,
        amount: round2(presentSign(section) * sum(items.map((t) => t.amount))),
        txnIds: items.map((t) => t.id),
      };
    })
    .filter((l) => l.txnIds.length > 0);
}

function buildSection(txns: Transaction[], section: PnlSectionKey): PnlSection {
  const lines = buildLines(txns, section);
  return { section, label: SECTION_LABEL[section], lines, total: sum(lines.map((l) => l.amount)) };
}

export function computeMonthlyPnl(ledger: Transaction[], month: string): MonthlyPnl {
  const txns = ledger.filter((t) => t.month === month);
  const revenue = buildSection(txns, "revenue");
  const cogs = buildSection(txns, "cogs");
  const payroll = buildSection(txns, "payroll");
  const opex = buildSection(txns, "opex");
  const grossProfit = round2(revenue.total - cogs.total);
  const operatingProfit = round2(grossProfit - payroll.total - opex.total);
  const nonPnlLines = buildLines(txns, "non_pnl");
  const netCashEffect = sum(nonPnlLines.map((l) => l.amount));
  const netBankMovement = sum(txns.map((t) => t.amount));
  return {
    month,
    revenue,
    cogs,
    grossProfit,
    grossMargin: revenue.total ? round2((grossProfit / revenue.total) * 100) : null,
    payroll,
    opex,
    operatingProfit,
    operatingMargin: revenue.total ? round2((operatingProfit / revenue.total) * 100) : null,
    nonPnl: { lines: nonPnlLines, netCashEffect },
    netBankMovement,
    // Every bank dollar must land either in the P&L or below the line.
    reconciles: Math.abs(operatingProfit + netCashEffect - netBankMovement) < 0.005,
  };
}

export function computeAllPnl(ledger: Transaction[]): MonthlyPnl[] {
  return months(ledger).map((m) => computeMonthlyPnl(ledger, m));
}

/** Flat metric accessor used by variances and the analyst tools. */
export type MetricKey = "revenue" | "cogs" | "grossProfit" | "payroll" | "opex" | "operatingProfit";

export const METRIC_LABEL: Record<MetricKey, string> = {
  revenue: "Revenue",
  cogs: "Cost of Goods Sold",
  grossProfit: "Gross Profit",
  payroll: "Payroll",
  opex: "Operating Expenses",
  operatingProfit: "Operating Profit",
};

export function metricValue(p: MonthlyPnl, key: MetricKey): number {
  switch (key) {
    case "revenue": return p.revenue.total;
    case "cogs": return p.cogs.total;
    case "payroll": return p.payroll.total;
    case "opex": return p.opex.total;
    case "grossProfit": return p.grossProfit;
    case "operatingProfit": return p.operatingProfit;
  }
}

export function categoryValue(p: MonthlyPnl, categoryId: string): number {
  const section = categoryOf(categoryId).section;
  if (section === "non_pnl") return p.nonPnl.lines.find((l) => l.categoryId === categoryId)?.amount ?? 0;
  return p[section].lines.find((l) => l.categoryId === categoryId)?.amount ?? 0;
}

export function monthLabel(m: string, long = false): string {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
