/**
 * Shared item-selection auto-fill resolver.
 *
 * Every transaction form with an item-linked line-item table (Sales Invoice, Credit Memo,
 * Receiving Report, Inventory Adjustment) needs the same thing when its "Item" combobox
 * changes: look up the selected masterlist/items record and pull out description/unit/price
 * so the rest of the line fills in automatically. Before this file existed, each form
 * re-derived its own `raw.xxx ?? raw.yyy ?? raw.zzz` fallback chain independently, and they
 * drifted out of sync with each other and with the real schema — Receiving Report's version
 * read flat properties that never existed on the option object at all (only `.raw.<field>`
 * does, and only when the option store was created with includeRawData:true), so its auto-fill
 * silently did nothing. This is the one place that knows the real masterlist/items field names;
 * every form should call resolveItemAutofill() instead of re-deriving its own version.
 */

export interface ItemOptionLike {
  label: string;
  value: string;
  raw?: Record<string, any>;
}

export interface ResolvedItemFields {
  /** The Item's display name (option.label) — always safe, doesn't need .raw at all. */
  itemName: string;
  /** masterlist/items.description */
  description: string;
  /** masterlist/items.unit_id — the reference id. Use this if your line item's own `unit`
   *  field is itself an id resolved to a display name at save time (Sales Invoice, Credit
   *  Memo, Inventory Adjustment all do this via a separate Unit <select> + unitOptions). */
  unitId: string;
  /** masterlist/items.unit_name — the already-denormalized display string. Use this if your
   *  line item's `unit` field is plain text with no separate id/name split (Receiving Report). */
  unitName: string;
  /** masterlist/items.sales_price — what a *customer* should be charged. Use for
   *  customer-facing forms (Sales Invoice, Credit Memo). */
  salesPrice: number;
  /** masterlist/items.purchase_price — what it costs *this business* to acquire. Use for
   *  vendor-facing / inventory-value forms (Receiving Report, Inventory Adjustment). */
  purchasePrice: number;
  /** masterlist/items.category / category_name (id and display name, if a form needs them). */
  category: string;
  categoryName: string;
  /** masterlist/items.tax_type_id / taxType, if a form needs the item's default tax type. */
  taxType: string;
}

/**
 * Resolves the standard auto-fill fields for a line item once its "Item" combobox selection
 * changes. Requires the option to have come from a store created with includeRawData:true —
 * `createFirestoreOptionsStore('items', 'name', 'id', true)`. Without it, `option.raw` is
 * undefined and every field below silently resolves to its empty/zero default (this is exactly
 * how the bug looked before it was found: no error, just nothing filling in).
 *
 * This only *resolves* the values — callers are still responsible for assigning them into
 * their own line-item object AND reassigning their line-items array afterward (e.g.
 * `lineItems = [...lineItems]`) to actually trigger a re-render. That reassignment can't be
 * centralized here: Svelte's reactivity is compiler-driven off assignment expressions it can
 * see in each component's own <script> block, not off calls into an imported function — mutating
 * a line item from inside this file would be invisible to Svelte no matter what it does
 * internally. Forgetting that reassignment after calling this is the other half of the bug this
 * file was written to fix; see BLUEPRINT.md §7 for the full explanation.
 */
export function resolveItemAutofill(selected: ItemOptionLike | undefined | null): ResolvedItemFields {
  const raw: Record<string, any> = selected?.raw || {};
  return {
    itemName: selected?.label || '',
    description: raw.description || '',
    unitId: raw.unit_id ?? raw.unitId ?? '',
    unitName: raw.unit_name ?? raw.unit ?? '',
    salesPrice: typeof raw.sales_price === 'number' ? raw.sales_price : (typeof raw.price === 'number' ? raw.price : 0),
    purchasePrice: typeof raw.purchase_price === 'number' ? raw.purchase_price : (typeof raw.price === 'number' ? raw.price : 0),
    category: raw.category ?? '',
    categoryName: raw.category_name ?? '',
    taxType: raw.tax_type_id ?? raw.taxType ?? ''
  };
}
