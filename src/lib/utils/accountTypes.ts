/**
 * Canonical Chart-of-Accounts account-type taxonomy.
 *
 * The app used to offer only 6 broad types (asset/liability/equity/revenue/expense/cogs) — far
 * less granular than any real-world Chart of Accounts, including this one's actual data, which
 * already uses the industry-standard QuickBooks-style account types (Bank, Accounts Receivable,
 * Other Current Asset, Fixed Assets, Accounts Payable, Other Current Liabilities, ...). Every
 * account typed that way fell outside the app's 6-value model entirely: `formatAccountType`
 * silently fell back to showing the raw stored string, and every accountType-filtered dropdown
 * (APV's AP Account/Expense Account, the Items masterlist's income/expense/inventory/cogs
 * pickers) matched nothing, because none of those granular values are literally 'liability' or
 * 'expense'. This is the one place that knows the full standard taxonomy and how it maps down to
 * the broad debit/credit category every other part of the app (normal-balance calculations,
 * category-filtered dropdowns) actually needs.
 *
 * Sourced from QuickBooks Online's own account type list: Bank, Accounts Receivable (A/R), Other
 * Current Assets, Fixed Assets, Other Assets, Accounts Payable (A/P), Credit Card, Other Current
 * Liabilities, Long Term Liabilities, Equity, Income, Cost of Goods Sold, Expenses, Other Income,
 * Other Expense — https://quickbooks.intuit.com/learn-support/en-us/help-article/chart-accounts/learn-account-detail-types-chart-accounts/L2gCy0rfy_US_en_US
 */

/** The 6 broad categories every account ultimately rolls up to for debit/credit purposes. */
export type AccountCategory = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cogs';

export interface AccountTypeDef {
  value: string;
  label: string;
  category: AccountCategory;
  normalBalance: 'debit' | 'credit';
}

export const ACCOUNT_TYPES: AccountTypeDef[] = [
  // Assets
  { value: 'bank', label: 'Bank', category: 'asset', normalBalance: 'debit' },
  { value: 'accounts-receivable', label: 'Accounts Receivable (A/R)', category: 'asset', normalBalance: 'debit' },
  { value: 'other-current-asset', label: 'Other Current Asset', category: 'asset', normalBalance: 'debit' },
  { value: 'fixed-asset', label: 'Fixed Asset', category: 'asset', normalBalance: 'debit' },
  { value: 'other-asset', label: 'Other Asset', category: 'asset', normalBalance: 'debit' },
  // Liabilities
  { value: 'accounts-payable', label: 'Accounts Payable (A/P)', category: 'liability', normalBalance: 'credit' },
  { value: 'credit-card', label: 'Credit Card', category: 'liability', normalBalance: 'credit' },
  { value: 'other-current-liability', label: 'Other Current Liability', category: 'liability', normalBalance: 'credit' },
  { value: 'long-term-liability', label: 'Long Term Liability', category: 'liability', normalBalance: 'credit' },
  // Equity
  { value: 'equity', label: 'Equity', category: 'equity', normalBalance: 'credit' },
  // Income / Expense
  { value: 'income', label: 'Income', category: 'revenue', normalBalance: 'credit' },
  { value: 'cost-of-goods-sold', label: 'Cost of Goods Sold', category: 'cogs', normalBalance: 'debit' },
  { value: 'expense', label: 'Expense', category: 'expense', normalBalance: 'debit' },
  { value: 'other-income', label: 'Other Income', category: 'revenue', normalBalance: 'credit' },
  { value: 'other-expense', label: 'Other Expense', category: 'expense', normalBalance: 'debit' }
];

// Legacy 6-value system (still valid — accounts created before this taxonomy expanded, or a
// user who just wants the simple version, keep working) and known plural/spacing variants that
// don't reduce to a canonical slug via simple space-to-hyphen normalization alone (English
// pluralization is irregular: "liability" -> "liabilities", not "liabilitys").
const ALIASES: Record<string, string> = {
  asset: 'other-current-asset',
  liability: 'other-current-liability',
  revenue: 'income',
  cogs: 'cost-of-goods-sold',
  'fixed-assets': 'fixed-asset',
  'other-assets': 'other-asset',
  'other-current-assets': 'other-current-asset',
  'other-current-liabilities': 'other-current-liability',
  'long-term-liabilities': 'long-term-liability',
  'accounts-receivables': 'accounts-receivable'
};

/**
 * Normalizes a raw stored `accountType` value to its canonical slug. Tolerates the
 * space-separated, inconsistently-pluralized values already present in Chart of Accounts data
 * that predates this file (e.g. "accounts receivable", "fixed assets", "other current
 * liabilities") without requiring a one-time migration for existing accounts to work correctly —
 * new accounts created through the form now save the canonical hyphenated slug directly, but
 * nothing needs to touch already-stored documents for them to display and filter correctly too.
 */
export function normalizeAccountType(raw: string | undefined | null): string {
  const slug = String(raw || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (ACCOUNT_TYPES.some((t) => t.value === slug)) return slug;
  return ALIASES[slug] || slug;
}

/** Looks up the full type definition (label, category, normalBalance) for a raw stored value. */
export function getAccountTypeDef(raw: string | undefined | null): AccountTypeDef | undefined {
  return ACCOUNT_TYPES.find((t) => t.value === normalizeAccountType(raw));
}

/**
 * Resolves the broad debit/credit category for a raw stored accountType value — what
 * `filterAccountsByType`, normal-balance calculations, etc. actually need. Falls back to a
 * keyword guess against the raw string itself (not the account *name* — that's
 * determineAccountTypeFromName in reportingService.ts, a separate concern) for anything that
 * doesn't match a known type or alias at all, so a completely unrecognized value still lands
 * somewhere sane rather than being silently dropped from every category-filtered dropdown.
 */
export function getAccountCategory(raw: string | undefined | null): AccountCategory {
  const def = getAccountTypeDef(raw);
  if (def) return def.category;

  const slug = normalizeAccountType(raw);
  if (/liab/.test(slug)) return 'liability';
  if (/equity/.test(slug)) return 'equity';
  if (/cogs|cost-of-goods/.test(slug)) return 'cogs';
  if (/expense/.test(slug)) return 'expense';
  if (/income|revenue|sales/.test(slug)) return 'revenue';
  return 'asset';
}

/** Human-readable label for a raw stored accountType value, falling back to the raw value itself (Title Cased) if genuinely unrecognized. */
export function formatAccountType(raw: string | undefined | null): string {
  const def = getAccountTypeDef(raw);
  if (def) return def.label;
  const str = String(raw || '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
