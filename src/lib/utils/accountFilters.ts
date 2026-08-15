/**
 * Shared Chart-of-Accounts filtering resolver.
 *
 * Several forms need a subset of masterlist/accounts filtered by accountType — APV's "AP
 * Account" (liability) and per-line "Account" (expense) dropdowns, the Items masterlist's
 * income/expense/inventory/cogs account pickers. Before this file existed, each form re-derived
 * its own `$accountsStore.filter(acc => acc.raw?.accountType === 'expense').map(...)` copy
 * independently — functionally identical duplication of the exact kind that made the
 * itemAutofill.ts bugs possible (see that file). This is the one place that knows the real
 * masterlist/accounts accountType values and how to turn a filtered list into {label, value}
 * options; every such dropdown should call filterAccountsByType() instead of re-deriving its own
 * filter.
 */

import { getAccountCategory, type AccountCategory } from './accountTypes';

export interface AccountOptionLike {
  label: string;
  value: string;
  raw?: Record<string, any>;
}

export interface AccountOption {
  label: string;
  value: string;
}

/**
 * Filters a raw Chart-of-Accounts option list down to one or more broad categories
 * ('asset'|'liability'|'equity'|'revenue'|'expense'|'cogs'), formatted as
 * {label: "CODE - Name", value: id}.
 *
 * Matches by *category*, not by exact accountType string — each account's stored accountType
 * (which may be a granular QuickBooks-style value like 'accounts-payable' or 'bank', a legacy
 * broad value like 'liability', or a space-separated/pluralized older variant like "accounts
 * payable") is resolved to its broad category via accountTypes.ts's getAccountCategory() first.
 * This used to match the literal accountType string exactly, so an account typed 'accounts-payable'
 * never matched a caller asking for 'liability' — the root cause of APV's AP Account/Expense
 * Account dropdowns rendering empty against a real Chart of Accounts that (correctly, by
 * QuickBooks' own standard taxonomy) never uses the 6 broad values directly. See
 * accountTypes.ts's docblock for the full explanation and the standard this now follows.
 *
 * Requires the account options to have come from a store created with includeRawData:true —
 * `createFirestoreOptionsStore('masterlist/accounts', 'name', 'id', true)`. Without it,
 * `option.raw` is undefined and this always returns [].
 *
 * @param type one category, or several (an account matching any of them is included) — e.g.
 *   Items masterlist's COGS picker accepts both 'cogs' and 'expense' accounts.
 * @param emptyLabel when given and no account matches, returns a single placeholder option
 *   `{label: emptyLabel, value: ''}` instead of an empty array — turns "the dropdown is
 *   mysteriously empty" into a visible, actionable hint that the Chart of Accounts is actually
 *   missing that account type. Omit it to just get [] (matches the old un-hinted behavior).
 */
export function filterAccountsByType(
  accounts: AccountOptionLike[],
  type: AccountCategory | AccountCategory[],
  emptyLabel?: string
): AccountOption[] {
  const wanted = new Set((Array.isArray(type) ? type : [type]).map((t) => t.toLowerCase()));

  const filtered = accounts
    .filter((acc) => wanted.has(getAccountCategory(acc.raw?.accountType)))
    .map((acc) => ({ label: `${acc.raw?.code || ''} - ${acc.label}`, value: acc.value }));

  if (filtered.length === 0 && emptyLabel) {
    return [{ label: emptyLabel, value: '' }];
  }

  return filtered;
}
