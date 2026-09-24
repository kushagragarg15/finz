import type { Category, CategoryId, Section } from "./types";

/**
 * Restaurant chart of accounts. The P&L is built purely from these sections;
 * anything in `non_pnl` is shown below the line with its accounting treatment.
 */
export const CATEGORIES: Category[] = [
  // Revenue
  { id: "rev_food", name: "Food Sales", section: "revenue", description: "Dine-in / POS food sales" },
  { id: "rev_beverage", name: "Beverage Sales", section: "revenue", description: "Dine-in / POS beverage and bar sales" },
  { id: "rev_catering", name: "Catering Revenue", section: "revenue", description: "Catering invoices paid by clients" },
  { id: "rev_delivery", name: "Delivery Marketplace Sales", section: "revenue", description: "Gross payouts from DoorDash / Uber Eats" },
  { id: "rev_refunds", name: "Refunds & Discounts", section: "revenue", description: "Contra-revenue: POS refunds, comps and discounts" },
  { id: "rev_other", name: "Other Revenue", section: "revenue", description: "Miscellaneous operating income" },

  // COGS
  { id: "cogs_food", name: "Food Cost", section: "cogs", description: "Food inventory from distributors and suppliers" },
  { id: "cogs_beverage", name: "Beverage Cost", section: "cogs", description: "Beer, wine, spirits and beverage inventory" },
  { id: "cogs_packaging", name: "Packaging & Disposables", section: "cogs", description: "To-go containers, disposables" },

  // Payroll
  { id: "pay_hourly", name: "Hourly Wages", section: "payroll", description: "Kitchen and front-of-house hourly wages" },
  { id: "pay_salary", name: "Management Salaries", section: "payroll", description: "Salaried managers" },
  { id: "pay_taxes", name: "Payroll Taxes & Benefits", section: "payroll", description: "Employer payroll taxes and benefits" },

  // Operating expenses
  { id: "opex_rent", name: "Rent", section: "opex", description: "Premises rent" },
  { id: "opex_utilities", name: "Utilities", section: "opex", description: "Electric, gas, water" },
  { id: "opex_telecom", name: "Internet & Phone", section: "opex", description: "Telecom" },
  { id: "opex_insurance", name: "Insurance", section: "opex", description: "Business insurance premiums" },
  { id: "opex_software", name: "Software & POS", section: "opex", description: "POS and software subscriptions" },
  { id: "opex_professional", name: "Accounting & Professional Fees", section: "opex", description: "Bookkeeping, legal, advisory" },
  { id: "opex_marketing", name: "Marketing", section: "opex", description: "Advertising and promotion" },
  { id: "opex_repairs", name: "Repairs & Maintenance", section: "opex", description: "Equipment and premises repairs" },
  { id: "opex_cleaning", name: "Cleaning & Linen", section: "opex", description: "Cleaning and linen service" },
  { id: "opex_office", name: "Office & Admin", section: "opex", description: "Office supplies and admin" },
  { id: "opex_delivery_fees", name: "Delivery Platform Commissions", section: "opex", description: "Commissions deducted by delivery marketplaces" },
  { id: "opex_licenses", name: "Licenses & Permits", section: "opex", description: "Business licences and permits" },
  { id: "opex_other", name: "Other Operating Expense", section: "opex", description: "Operating costs not elsewhere classified" },

  // Non-P&L
  { id: "bs_fixed_assets", name: "Fixed Assets (Capex)", section: "non_pnl", treatment: "Capitalise to fixed assets and depreciate over useful life; do not expense.", description: "Equipment and long-lived asset purchases" },
  { id: "bs_loan_principal", name: "Loan Principal", section: "non_pnl", treatment: "Reduces the loan liability on the balance sheet. Only interest belongs in the P&L.", description: "Repayment of borrowed principal" },
  { id: "eq_owner_distribution", name: "Owner Distributions", section: "non_pnl", treatment: "Equity distribution to the owner, not a business expense.", description: "Owner draws / distributions" },
  { id: "bs_sales_tax", name: "Sales Tax Remittance", section: "non_pnl", treatment: "Pass-through liability: sales tax collected from customers and remitted to the state.", description: "Sales tax paid to tax authority" },
  { id: "bs_deferred_revenue", name: "Gift Card Liability", section: "non_pnl", treatment: "Deferred revenue: recognise as revenue when the gift card is redeemed.", description: "Gift card sales not yet redeemed" },
  { id: "bs_uncategorized", name: "Uncategorised (Suspense)", section: "non_pnl", treatment: "Held in suspense until a human classifies it.", description: "Could not be classified" },
];

export const CATEGORY_BY_ID: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

export const SECTION_LABEL: Record<Section, string> = {
  revenue: "Revenue",
  cogs: "Cost of Goods Sold",
  payroll: "Payroll",
  opex: "Operating Expenses",
  non_pnl: "Non-P&L / Balance Sheet",
};

export function categoryOf(id: CategoryId): Category {
  return CATEGORY_BY_ID[id] ?? CATEGORY_BY_ID.bs_uncategorized;
}

export function isPnl(id: CategoryId): boolean {
  return categoryOf(id).section !== "non_pnl";
}
