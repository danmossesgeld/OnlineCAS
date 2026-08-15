# DigiSoft CAS — System Blueprint (for AI Agents)

> **Purpose of this document.** This is a verified, code-level reference to how DigiSoft CAS actually works today — not an aspirational spec. Every claim below was produced by reading the real source files (paths and line ranges are noted where it matters), not by inferring "how an accounting system should work." Where the code is inconsistent, incomplete, or buggy, that is documented explicitly rather than smoothed over, because an AI agent editing this codebase needs to know what's really there before touching it.
>
> This is the single source of truth for system architecture and data flow in `src/docs/`. Earlier docs that duplicated or contradicted it (`SYSTEM_DOCUMENTATION.md`, `system_architecture_and_data_flow.md`, `masterlist and field linking.md`) have been removed — their content was either idealized/illustrative (didn't match the live implementation) or fully superseded by the sections below. `UI_IMPROVEMENT_TUTORIAL.md` is a separate, still-relevant forward-looking UI redesign backlog, not a system-behavior doc, and is unaffected by this cleanup.
>
> Last verified: 2026-08-15, against the `main` branch.

---

## 1. System Overview

**DigiSoft CAS** ("Computerized Accounting System") is a Philippine-context small-business accounting app: sales, purchases, inventory value adjustments, general ledger, and standard financial reports (Trial Balance, Balance Sheet, Income Statement, AR/AP Aging, Tax Reporting).

**Stack:**
- **SvelteKit 2 / Svelte 5**, TypeScript, Tailwind CSS 4 + DaisyUI 5
- **`@sveltejs/adapter-static`** (`svelte.config.js`) with SPA fallback (`fallback: 'index.html'`) — this is a **fully static single-page app**, not an SSR server. All data access happens client-side, in the browser, directly against Firestore.
- **Firebase**: Firestore (data), Firebase Auth (email/password login only — `signInWithEmailAndPassword`), Firebase Hosting (`firebase.json`, `apphosting.yaml`)
- No backend server, no Cloud Functions found in the repo, no API routes (`src/routes/**/+server.ts` — none exist). All business logic — validation, journal-entry generation, report aggregation — runs **in the browser**.
- Charting: Chart.js is **not** an npm dependency; the dashboard lazy-loads it from a CDN (`cdn.jsdelivr.net/npm/chart.js@4.4.1`) at runtime via an injected `<script>` tag.

### 1.1 ⚠️ Operationally significant open issues

These require a product/scope decision before anyone can close them — they are not one-line fixes. Smaller, contained bugs are catalogued in §6 instead.

1. **RBAC is now basic, not absent — but still just two roles.** Admin Tools (§4.7) added a real `admin`/`user` role plus an `isActive` flag, enforced both client-side and in `firestore.rules`. What's still missing: any finer-grained permission model (e.g. bookkeepers who can post but not void, or per-transaction-type rights) — today it's a binary admin/non-admin split, nothing between. Building that out further is a product-scope decision, same as before.
2. **No inventory quantity/stock ledger exists anywhere in the codebase.** "Inventory Adjustment" and "Receiving Report" are both purely GL/value postings; neither touches an item's on-hand quantity (there is no on-hand-quantity field on the Item schema at all). This is a real feature to design and build (schema, which transactions move stock, what reports are needed) — it needs product scoping before implementation.

**Check `firestore.rules`' expiry first** in any "the app isn't saving/loading data" investigation, before debugging application code — it has expired before, silently blocking all reads/writes.

**`firestore.rules` in this repo now has real, role-aware rules (written alongside Admin Tools, §4.7) — but whether they're actually deployed is unverified.** The file has a note at its top explaining why: the version previously committed here was the expired test-mode placeholder, untouched since the initial commit, while whatever was actually live in production had already been changed directly in the Firebase Console at some point, bypassing this repo. The current file may or may not be live — check before assuming either way, and don't `firebase deploy --only firestore:rules` blind.

---

## 2. Architecture & Conventions

### 2.1 The unified create/edit/view form pattern

Every transaction type (Sales Invoice, Credit Memo, Receive Payment, APV, Inventory Adjustment, General Journal) follows the same pattern:

- **One real form component** lives at `.../form/+page.svelte` and handles **create, edit, and view** in a single file, branching on mode.
- Mode is derived by `$lib/stores/formModeStore.ts`'s `createFormModeStore()`:
  ```ts
  docId       = $page.params.id || $page.url.searchParams.get('id') || ''
  isViewMode  = $page.url.pathname.includes('/view/') || searchParams.get('viewMode') === 'true'
  isEditMode  = Boolean(docId) && !isViewMode
  isCreateMode = !Boolean(docId)
  ```
- The **canonical URL convention actually used by list pages is query-param based**: `/…/form?id={id}` (edit) and `/…/form?id={id}&viewMode=true` (view) — this is how `ListContainer`/`FireTable`'s row action buttons navigate (`ListContainer.svelte` ~line 519, 530).
- The **path-param routes** `.../form/[id]/+page.svelte` and `.../view/[id]/+page.svelte` also exist for several transaction types, but they are **not real forms** — each is a ~15-line stub whose only job is `onMount(() => goto('/…/form?id=' + $page.params.id[...&viewMode=true]))`. They exist so a bookmarkable/typeable path-style URL still works, but nothing in the app's own navigation links to them. Treat any `form/[id]` or `view/[id]` file you encounter as a redirect shim, not a place to add logic.
- Exceptions to the single-form pattern: **Credit Memo** and **Vendor Payment** have genuinely separate, hand-built `view/+page.svelte` read-only pages (not a redirect, not the form-in-view-mode) that independently re-fetch the document and re-implement their own display markup. Vendor Payment has no `[id]` folder at all. **Sales Invoice, Inventory Adjustment, and Receiving Report** reuse the form component itself for viewing (`disabled={isViewMode}` throughout) — Receiving Report in particular has no `view/` directory of any kind, just `form/` and `list/`.

### 2.2 Firestore path resolution — read this before writing any new data access code

All Firestore access goes through `src/lib/utils/firestoreCrud.ts` (CRUD) and `src/lib/utils/firestoreStores.ts` (realtime `collectionStore`), both of which share the same resolution logic and the same map:

```ts
const ROOT_COLLECTION_MAP: Record<string, string> = {
  'masterlist': 'listdatabase',
  'otherlist': 'listdatabase',
  'customerCenter': 'transactions',
  'vendorCenter': 'transactions',
  'accounting': 'transactions'
  // NOTE: 'inventory' is NOT in this map.
};
function getRootCollection(parentCollection) {
  return ROOT_COLLECTION_MAP[parentCollection] || 'listdatabase'; // <-- silent fallback
}
```

Path strings are resolved by counting `/`-separated segments:
- **1 segment** (`'items'`) → used literally as a top-level Firestore collection name.
- **2 segments** (`'masterlist/items'`) → `[parent, sub] = segments`; root = `getRootCollection(parent)`; resolves to `{root}/{parent}/{sub}` (root **document**, not collection — Firestore path is `collection(root) → doc(parent) → collection(sub)`).
- **3 segments** (`'transactions/customerCenter/salesInvoices'`) → segments used **literally** as `[root, parent, sub]`, with **no lookup through `ROOT_COLLECTION_MAP` at all**.

**The trap:** because the map's fallback is `|| 'listdatabase'`, calling a 2-segment path whose first segment *isn't* a map key (e.g. `'transactions/creditMemo'`, `'inventory/adjustments'`) silently resolves to `listdatabase/transactions/creditMemo` or `listdatabase/inventory/adjustments` — a plausible-looking but *wrong* path that fails silently (empty query results, `null` doc reads) rather than throwing. This exact mistake was the root cause of a (now-fixed) Receive-Payment credit-application bug, and is still the root cause of the broken Inventory Adjustment view page (§6). **When writing new code, either use the full, explicit 3-segment path, or double-check that the first segment of any 2-segment path is actually one of `masterlist | otherlist | customerCenter | vendorCenter | accounting`.**

**The other outlier:** Inventory Adjustment's *form* (not its broken view page) uses the 4-argument call form `addDocToCollection('inventory', 'transactions', 'adjustments', data)`, which is `firestoreCrud.ts`'s explicit "Case 1: three-level format" — this makes `'inventory'` a literal **top-level root collection**, sitting outside `listdatabase` entirely and outside the `ROOT_COLLECTION_MAP` pattern used everywhere else. Real path: **`inventory/transactions/adjustments`** (collection `inventory` → doc `transactions` → subcollection `adjustments`). This is intentional-but-inconsistent; don't "fix" it to match the masterlist/otherlist convention without also updating every reader.

`firestoreCrud.ts` exports: `addDocToCollection`, `updateDocInCollection` (always `setDoc(..., {merge:true})` — never a destructive overwrite), `deleteDocFromCollection`, `getDocFromCollection`, `queryCollectionDocs(path, FilterCondition[])`. All accept either the segmented-path string form or explicit multi-argument forms; see the file for the exact overload behavior summarized above.

**Every branch of `addDocToCollection`/`updateDocInCollection`/`deleteDocFromCollection` also calls `writeAuditLog()`** (`auditLogService.ts`, §8.3) after the real Firestore operation succeeds — this is the audit trail's single choke point. `deleteDocFromCollection` additionally `getDoc`s the target *before* deleting it so the audit entry can carry a full snapshot of what was removed. Code that bypasses these three functions and talks to `firebase/firestore` directly (there was exactly one such site, in `accountingService.ts`'s journal-entry regeneration, now fixed to route through `deleteDocFromCollection`) silently skips the audit trail — don't add a new one without either going through these functions or calling `writeAuditLog()` manually.

`firestoreStores.ts` exports `collectionStore(parentCollection, subCollectionName, queryOptions?, rootCollection?)` — a Svelte `readable` wrapping a live `onSnapshot` listener, used by `FireTable` and every option-store factory. Same path-resolution rules apply.

### 2.3 Auth flow

`src/routes/+layout.svelte`: on mount, subscribes to `onAuthStateChanged` (using `src/lib/firebase.ts`). If unauthenticated and not on `/`, redirect to `/`. If authenticated and on `/`, redirect to `/main/dashboard`. Renders `<Sidebar/>` + wrapped `<main>` only when a user is present and not on `/`; otherwise renders a bare `<slot/>` (the login page, `src/routes/+page.svelte` → `<LoginForm/>`). Every `onAuthStateChanged` firing also calls `loadUserProfile()` (§4.7) — if the resulting profile has `isActive:false`, it force-signs the user back out immediately. Beyond that and the `/admin/*` route guard (§4.7), there is no per-route or per-role gating anywhere else in the app — every non-admin route trusts that if you're rendering, you're an authenticated, active user, nothing more specific.

`src/routes/+error.svelte`: a 404 (`$page.status === 404`) renders a friendly "Under Construction" panel rather than a generic error. `src/routes/[...catchall]/+page.svelte`: catches any unmatched path *within* the route tree and renders the identical "Under Construction" UI (duplicated markup, not a shared component) — so broken/future sidebar links degrade gracefully instead of 404ing.

### 2.4 Shared component library (`src/lib/components/`)

| Component | Role |
|---|---|
| `FireTable.svelte` | Realtime table bound directly to a `collectionStore`. Auto-formats: date-like keys, PHP currency for the **hardcoded key allowlist** `amount/totalDue/grossAmount/netSales` only (a `col.type:'currency'` declaration elsewhere is silently ignored — confirmed dead config on Inventory Adjustment's list), and colored pills for a `status` column. Supports optional parent/child hierarchy rendering via a `parentId` field (used by Chart of Accounts for sub-accounts). |
| `ListContainer.svelte` | Full list-page chrome for **transactions**: summary cards (Total/Posted/Draft/Pending/Overdue), search+status+date filters, buttons, wraps `FireTable`. Posted/Draft counts query Title-Case `'Posted'`/`'Draft'`, matching what every transaction form actually saves. Pending/Overdue are derived client-side from the already-fetched total snapshot: any document whose status is neither `'draft'` nor `'paid'` (case-insensitive) counts as pending — covering Sales Invoice's `Unpaid`/`Partially Paid` and APV's `Posted`/`Partially Paid` alike — and of those, one past its `dueDateField` counts as overdue; this replaced a dependency on an `isPaid` boolean no transaction form ever wrote. |
| `MasterListContainer.svelte` | Simpler list-page chrome for **masterlist/otherlist** entities: search only, `New {X}` button, delegates edit/delete to a slot. No summary cards. |
| `ModalForm.svelte` | Generic add/edit modal driven entirely by a `fields: [{label,name,type,options,required,section}]` config array — used by every masterlist/otherlist page. `section:'advanced'` fields render in a second column. |
| `FormLayout.svelte` | Page chrome for transaction forms: back button + title + white card wrapper + `<form>`. |
| `FormSection.svelte` | Groups fields under a heading; `isItemTable=true` mode delegates straight to `TxnItemTable` for line-item grids. |
| `TxnFields.svelte` | Renders a `fields[]` array in a responsive 1–3 column grid; fields can be pinned to the same visual row via a `row` key. |
| `TxnItemTable.svelte` | The editable line-item grid (add/remove rows, per-cell text/number/select inputs, accounting-formatted `amount` column with comma-formatting on blur). Its `rows` prop is one-way (`rows={items}`, not `bind:rows`); when it receives zero rows it calls `onAdd()` — the same callback the "+ Add Item" button uses — rather than synthesizing a row locally, so the first row always lands in the parent's real array. See §7 point 11 for the bug this replaced. |
| `FormFooter.svelte` | Bottom bar: Save/Cancel buttons **and** (when `summaryMode="transaction"`) a self-contained Gross/Discount/Net/VAT/Vatable/Zero-rated/Exempt/Withholding/Total summary panel that **independently recomputes its own totals from `lineItems`** rather than purely trusting the parent's numbers (parent-supplied `grossAmount`/`vat`/etc. props override the internal computation when passed). The internal fallback computation filters `lineItems` by `taxType === 'vat'`/`'zero'`/`'exempt'` literal values that no form's `taxType` field (a Firestore option id) ever actually equals, so any form that doesn't pass explicit totals gets a silently-wrong VAT figure — Sales Invoice and APV both now pass their own computed `grossAmount`/`discount`/`netSales`/`vat`/`vatableSales`/`lessWithholding`/`totalDue`/etc. explicitly rather than relying on the fallback. `showWithholding` (default `true`) gates both the withholding `<select>` and the "Less: Withholding Tax" line — not every transaction type has a withholding concept in the accounting engine (Receiving Report never did; see `createReceivingReportJournalEntry`, §5.2), and passing no `withholdingTaxOptions` used to just render the selector anyway with zero options rather than not rendering it at all. Pass `showWithholding={false}` for a transaction type without real withholding logic, don't just omit the other withholding props. |
| `reports/ReportContainer.svelte` | Generic wrapper for the 5 financial report pages: date-range **or** as-of-date parameter inputs, a `generateReport` event, a `print` button (`window.print()`), an `export` event (each report page implements its own hand-rolled CSV, not a shared exporter). |
| `Sidebar.svelte` | Static, hardcoded nav tree (not data-driven) mirroring the route structure; highlights active section by `$page.url.pathname` prefix match. |
| `LoginForm.svelte` | Email/password form calling `signInWithEmailAndPassword` directly. |

### 2.5 Shared utility library (`src/lib/utils/`)

| File | Role |
|---|---|
| `firestoreCrud.ts` | See §2.2. |
| `firestoreStores.ts` | See §2.2. `collectionStore()`. |
| `firestoreOptions.ts` | `createFirestoreOptionsStore(collectionName, labelKey='name', valueKey='id', includeRawData=false)` — the workhorse option-store factory used by nearly every form. **Bare collection names** (no `/`) are routed by a hardcoded array check: `['customers','items','vendors','othernames'].includes(name)` → `masterlist/{name}`, else → `otherlist/{name}`. Note the array says `othernames` while the real page/collection is `masterlist/others` — calling `createFirestoreOptionsStore('others')` bare would mis-resolve to `otherlist/others` (doesn't appear to be called this way anywhere today, but is a trap for new code). Also exports a small set of pre-built, rarely-used legacy stores (`customerOptionsStore`, `itemOptionsStore`, etc.) built directly off `collectionStore`, kept for backward compatibility. |
| `optionStores.ts` | A second, smaller registry of pre-built stores (`categoryOptions`, `unitOptions`, `customerOptions`, `termsOptions`, `paymentMethodOptions`, `itemOptions`, `taxTypeOptions`) built via `createFirestoreOptionsStore`. Functionally overlapping with the legacy stores in `firestoreOptions.ts` — most forms actually call `createFirestoreOptionsStore(...)` directly inline rather than importing from either registry file, so both files are partially vestigial; don't assume every form uses them. |
| `itemAutofill.ts` | `resolveItemAutofill(selectedOption)` — the one place that knows the real `masterlist/items` field names (`description`, `unit_id`/`unit_name`, `sales_price`/`purchase_price`, ...). Every item-linked line-item table (Sales Invoice, Credit Memo, Receiving Report, Inventory Adjustment) calls this when its Item combobox changes, instead of re-deriving its own fallback chain. See §7 point 7 for why this exists and the reactivity gotcha it doesn't (can't) solve on its own. |
| `accountTypes.ts` | The canonical Chart-of-Accounts taxonomy — `ACCOUNT_TYPES` (15 QuickBooks-style values), `normalizeAccountType()`, `getAccountTypeDef()`, `getAccountCategory()`, `formatAccountType()`. See §5.5. |
| `accountFilters.ts` | `filterAccountsByType(accounts, category, emptyLabel?)` — filters a raw Chart-of-Accounts option list (from `createFirestoreOptionsStore('masterlist/accounts', ..., true)`) down to one or more broad categories (`'liability'`, `['cogs','expense']`, ...) via `accountTypes.ts`'s `getAccountCategory()`, formatted as `{label, value}`. Used by APV's AP Account/Expense Account dropdowns and the Items masterlist's income/expense/inventory/cogs account pickers — both were independent, drifting duplicates of this same filter before. Optional third arg returns a single placeholder option instead of `[]` when nothing matches, so a genuinely-empty Chart of Accounts of that category reads as a hint rather than a silently-empty dropdown. |
| `withholdingTax.ts` | `WITHHOLDING_TAX_OPTIONS` — the RR 2-98 (as amended) rate schedule every transaction type with a real withholding concept (Sales Invoice, Credit Memo, APV) passes to `FormFooter`'s `withholdingTaxOptions` prop. Covers the common categories in practice: 1% goods, 2% services/contractors, 5% rentals, 5%/10%/15% professional/talent fees (by payee type and gross-receipts threshold), 10% commissions. `value` stays a plain percent string (multiple labels intentionally share a value, e.g. two 2% categories) — every calc site does `parseFloat(value)/100 * amount` and doesn't care which category produced the rate. Was three independently duplicated array literals, then just `1%`/`2%`, before. |
| `accountingService.ts` | All journal-entry generation. See §5. |
| `reportingService.ts` | All report aggregation (Trial Balance, Balance Sheet, Income Statement, AR/AP Aging) plus the `AccountType`/`FSClassification` enums. See §5.4. |
| `documentIdService.ts` | `generateNextDocumentId(DocumentType)` — sequential document numbering. See §5.5 for its concurrency gap. |
| `formatters.ts` | `formatCurrency` (₱, `en-PH`), `formatDate`, `formatDateForInput`, `formatNumber`, `formatQuantity`. All handle both JS `Date` and Firestore `{seconds,nanoseconds}` timestamp shapes. |
| `csvExporter.ts` | `convertToCSV`, `downloadCSV`, `exportFirestoreCollectionToCSV`. **Only actually used by the masterlist CSV-import/export buttons** (Accounts/Customers/Items/Vendors/Others). Every report page and Audit Trail/Tax Reporting instead hand-roll their own Blob/`<a download>` CSV export inline, duplicating this same pattern rather than reusing it. |
| `csvParser.ts` | `parseCSV`/`parseCSVToRecords` — a real quoted-field-aware CSV parser (handles embedded commas/quotes), used by the masterlist CSV importers. |
| `fileEncoding.ts` | `readFileAsTextSmart(file)` — tries UTF-8/Windows-1252/ISO-8859-1 and picks whichever produces the fewest `U+FFFD` replacement characters. Used by Accounts/Customers/Vendors CSV import; Items/Others CSV import use plain `file.text()` instead (inconsistent, but low-impact). |
| `adminService.ts` | Admin Tools' backing service — user account creation (via a throwaway secondary Firebase app instance, §4.7), profile role/active updates, password-reset emails, and the bulk `resetAllTransactions` delete. See §4.7. |
| `companyProfileService.ts` | `getCompanyProfile()`/`saveCompanyProfile()` — the business's own BIR identity, a singleton doc at `listdatabase/companyProfile`, admin-write-only. See §4.7. |
| `auditLogService.ts` | `writeAuditLog()`/`getAuditLogs()` — the audit trail. `writeAuditLog` is called internally by `firestoreCrud.ts`'s three primitives (create/update/delete), not by page code directly. See §4.7/§8.3. |
| `invoicePdfService.ts` | `generateSalesInvoicePdf(invoice, companyProfile)` — client-side `pdfmake` document generation (fonts shipped via `pdfmake/build/vfs_fonts`, no server involved — this is a static-hosted SPA, §2.6). Only Sales Invoice is wired up today (`salesInvoice/form/+page.svelte`'s view-mode "Download PDF" button); Credit Memo/APV/2307 aren't yet. See §8.1. |

### 2.6 Design system

`src/app.css` (440 lines): Tailwind 4 + a CSS-custom-property design-token system (`--color-primary-*`, `--color-neutral-*`, semantic success/warning/error scales, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--transition-*`), Inter font loaded from Google Fonts CDN. DaisyUI classes (`select-bordered`, `input-bordered`, `btn-ghost`, etc.) are mixed freely with raw Tailwind utility classes and inline `style="..."` attributes using the CSS variables — there is no single consistent styling approach across components (some use Tailwind classes, some use inline `var(--...)` styles, some use DaisyUI component classes). `iconify-icon` custom elements are used throughout for icons (Material Symbols icon set), not an SVG-sprite or bundled-icon-component approach.

---

## 3. Firestore Data Model

Two root collections carry essentially all data: **`listdatabase`** (reference/master data) and **`transactions`** (business documents). Two more exist as flat, standalone root collections outside that pair: **`inventory`**, for Inventory Adjustment only (an inconsistency — see §2.2), and **`users`**, for Admin Tools' role profiles (§4.7) — a genuinely different kind of data (access control, not business/reference data), so it deliberately isn't nested under either.

```
listdatabase (root collection)
├── masterlist (doc)
│   ├── accounts     (Chart of Accounts)
│   ├── customers
│   ├── items
│   ├── vendors
│   └── others        ("Other Names")
└── otherlist (doc)
    ├── categories
    ├── discounts
    ├── locations
    ├── paymentmethods
    ├── tax
    ├── terms
    ├── units
    └── costcenters

transactions (root collection)
├── customerCenter (doc)
│   ├── salesInvoices
│   ├── creditMemos
│   └── receipts
├── vendorCenter (doc)
│   ├── apvs
│   ├── payments
│   └── receivingReports
└── accounting (doc)
    ├── journalEntries
    └── fiscalPeriods

inventory (root collection)      ← outlier, not under listdatabase/transactions
└── transactions (doc)
    └── adjustments

users (root collection)          ← flat, one doc per account, id = Firebase Auth uid (§4.7)
└── {uid}
```

### 3.1 `listdatabase/masterlist/*` schemas (as actually captured by each page's `ModalForm` fields)

**`accounts`** (Chart of Accounts) — the only masterlist entity with rich structure and hierarchy support:
`code*, name*, description, accountType* (15-value QuickBooks-style taxonomy — `bank`, `accounts-receivable`, `accounts-payable`, ... — see §5.5), fsClassification (current-asset|non-current-asset|current-liability|non-current-liability|equity|revenue|cost-of-sales|operating-expense|other-income|other-expense|tax — see §5.5), parentId (self-referencing, drives FireTable's hierarchy rendering), parentName (denormalized), glCode, glName, slCode, slName, isActive (bool, default true), isSystem (bool; purely informational — does not restrict editing or deletion, an explicit product decision; the only place it's still set is `reportingService.ts`'s auto-plugged "Retained Earnings" account, §5.4), createdAt, updatedAt`.

**`customers`**: `code*, name*, contact_person, phone, email, billing_address, shipping_address, tax_id, is_active (bool, default true), created_at, updated_at`.

**`vendors`**: `code*, name*, contact_person, phone, email, address (single field, no billing/shipping split), tax_id, is_active, created_at, updated_at`.

**`others`** ("Other Names"): `code*, name*, type (free text, not a select), contact_person, phone, email, address, status (free text, not a checkbox/select — no `is_active` boolean here)`.

**`items`**: `code*, name*, description, category (select → otherlist/categories id), category_name (denormalized), unit_id (select → otherlist/units id), unit_name (denormalized), is_inventory (bool, default false — but note §1.1: nothing consumes this flag for actual stock tracking), is_sellable (bool, default true), is_purchasable (bool, default true), sales_price, purchase_price, income_account_id (select, filtered to masterlist/accounts where accountType==='revenue'), expense_account_id (filtered accountType==='expense'), inventory_account_id (filtered accountType==='asset'), cogs_account_id (filtered accountType==='cogs'||'expense'), average_cost (number, UI `readonly:true`, default 0 — never programmatically updated anywhere in the codebase), is_active (default true)`.

### 3.2 `listdatabase/otherlist/*` schemas

**`categories`, `discounts`, `locations`, `paymentmethods`, `tax`, `terms`, `units`** are all **structurally identical and minimal**: the only field is `{ name: string }` (via a single `ModalForm` field `{label:'Name*', name:'name', type:'text', required:true}`). No code, no active flag, no description, no rate/percentage/day-count values — notably, `tax` has no numeric rate field and `terms` has no day-count field; both are pure name-only lookup lists. (Line-item tax calculations elsewhere in the app classify a selected tax option by matching its **label text**, e.g. looking for the substring "vat"/"zero"/"0%", rather than reading a stored numeric rate — see §5.1.) None of these seven pages have CSV import/export.

An eighth, same-shaped collection, **`otherlist/costcenters`**, exists in Firestore and is consumed live by APV's line items (§3.4). It has its own management page at `src/routes/otherlist/costcenters/+page.svelte` (linked from both the Other List index and the sidebar), identical in structure to the seven pages above.

### 3.3 `transactions/customerCenter/*` schemas

**`salesInvoices`** — header: `customer, customerName, selectedTerms, termsName, paymentMethod, paymentMethodName, invoiceDate (Date), dueDate (Date, auto-computed from terms), poNumber, memo, cashSale (bool), withholdingTax ('' | '1' | '2'), invoiceNo (INV + 9-digit seq, or literal 'DRAFT'), status ('Draft'|'Unpaid'|'Paid'|'Partially Paid' — set externally by Receive Payment), grossAmount, discount, netSales, vat, vatableSales, zeroRated, vatExempt, lessWithholding, totalDue, createdAt, updatedAt`. Line items (`lineItems[]`): `item, itemName, description, unit, unitName, qty, price, dsc (numeric percent — converted from a discount-option ID at save time), dscDisplay (leftover UI string, also persisted), taxType, taxTypeName, amount`.

Calculation (reactive block):
```
grossAmount = Σ(price·qty)
discount    = Σ(price·qty·dsc%/100)
netSales    = Σ line.amount                      // amount already discount-applied
vatableAmount/zeroRated/vatExempt = amount split by taxCategory(line)
vatableSales = vatableAmount / 1.12               // back out VAT-exclusive base — 12% is HARDCODED
vat          = vatableSales × 0.12                // HARDCODED 12%, independent of the tax-type record's actual rate
lessWithholding = withholdingTax ? vatableSales × withholdingTax%/100 : 0
totalDue     = netSales − lessWithholding          // VAT stays included in totalDue; only WHT is subtracted
```
`taxCategory(line)` classifies by the selected tax option's **rate** (if `rate>0` → vatable) or its **label text** (contains "zero"/"0%" → zero-rated; else → exempt) — not by an explicit type field. The vatable/zero-rated/exempt split exists specifically to keep the generated journal entry balanced when an invoice mixes tax categories (§5.2) — don't collapse it back into a single `grossAmount/1.12` computation.

**`creditMemos`** — header: `cmNo (CM+9digits), cmDate (⚠ saved as a raw string, not a Date/Timestamp, for newly-created memos — the form never calls `new Date()` on it), customer, customerName, reference, status (always forced to `'Posted'` at save — no working draft path despite the field nominally supporting `'Draft'`), memo, items[], subtotal, taxRate, taxAmount, totalAmount, withholdingTax, journalEntryId (only transaction type in Customer Center where this is actually written back), createdAt, updatedAt`. Items: `itemId, description, quantity, unit, unitPrice, discount (numeric percent, resolved from the discount-option id at save time — `getDiscountPercentFromOptionId`, matching Sales Invoice's `dsc` convention; a reactive remap on load handles documents saved before this was aligned, where `discount` is still the raw option id), taxType, amount, maxQuantity`. Same gross/discount/net/VAT/WHT formula shape as Sales Invoice. An `invoiceId`/`invoiceNo` linking field and all its supporting load/handler code still exist but are **not exposed in the UI** (explicitly removed per an in-code comment) — dead-but-present code.

**`receipts`** — header: `customer, customerName, receiptNo (PR+9digits, generated with an extra Firestore-side uniqueness re-check loop, unlike the other document types), receiptDate (Date), paymentMethod, paymentMethodName, reference, memo, amount, appliedCredits[] ({id,type:'credit_memo'|'advance_payment',reference,appliedAmount} — `availableAmount` is computed for display but stripped before save), totalAppliedCredit, invoicePayments[] ({invoiceId,invoiceNo,originalAmount,amountPaid}), status (always `'Posted'`), createdAt, updatedAt`. No VAT/discount computation at this level — this document just records cash-in and its allocation. Per-invoice ad hoc discount/tax adjustments computed live in the allocation UI (`payable = amount − credit − amount·discount% − amount·tax%`) are **never persisted** — only `originalAmount`/`amountPaid` survive to Firestore. Its "Apply Credit" flow reads/writes Credit Memos and prior Receipts at their real paths, `transactions/customerCenter/creditMemos` / `transactions/customerCenter/receipts`.

### 3.4 `transactions/vendorCenter/*` schemas

**`apvs`** — header: `supplier, supplierName, account (AP liability account id), accountName, selectedTerms, termsName, paymentMethod, paymentMethodName, apvDate (Date), dueDate (Date), referenceNo, poNumber, memo, withholdingTax (string %), apvNo (APV+9digits, or literal 'DRAFT' until first posted), status ('Draft' or 'Posted' — set by which Save button is used, mirroring Sales Invoice; Vendor Payment further transitions it to 'Paid'/'Partially Paid' as it's allocated against, see below), grossAmount, discount, netAmount, vat (lines with a taxType selected are treated as vatable at a flat 12% computed on the net-of-line-discount amount — must stay in sync with `createApvJournalEntry`'s per-line VAT math, §5.2), lessWithholding (netAmount × withholding%), totalAmountDue (= netAmount + vat − lessWithholding; also doubles as APV's running balance — Vendor Payment decrements it directly, the same convention Sales Invoice's `totalDue` uses), createdAt, updatedAt`. Line items: `item?, description, unit, qty, price (pre-discount base amount), dsc, taxType, amount/total (net-of-discount — `createApvJournalEntry` debits the expense at gross `price` and credits the line discount separately, so re-debiting the already-net `amount` doesn't double-apply the discount), account (expense GL account id), accountName, costCenter, costCenterName, taxTypeName`. **No `taxRate`, `tax_account_id`, `discount_account_id`, or `withholding_tax_account_id` are ever saved** — `accountingService.ts`'s generator expects these and always falls back to hardcoded placeholder account IDs when they're absent (see §5.2).

**`payments`** (Vendor Payment) — `vendor, vendorName, paymentNo (VP+9digits, only included in create mode — omitted entirely on update rather than set to `undefined`, since Firestore's `setDoc` rejects `undefined` field values and this app doesn't set `ignoreUndefinedProperties`; setting it to `undefined` on every edit used to make the update call throw before anything else in the save ran), paymentDate (Date), paymentMethod, paymentMethodName, reference, memo, amount, billPayments[] ({billId,billNo,originalAmount,amountPaid}), status (always 'Posted'), createdAt (create mode only, same reason), updatedAt`. No tax/discount math at all — pure cash-out + allocation record, same shape as Receive Payment. Its outstanding-bills query filters by vendor and excludes `'draft'`/`'paid'` statuses client-side (matching Receive Payment's outstanding-invoice convention), so a partially-paid APV stays visible for further payment rather than disappearing the moment its status leaves `'Posted'`. On save (create **and** edit), a delta-based helper decrements each allocated APV's `totalAmountDue` and updates its status; edit-mode also now calls `createVendorPaymentJournalEntry`, which — per its dedup behavior in §5.2 — returns the existing entry's id unchanged rather than re-syncing amounts if one already exists.

**`receivingReports`** — `rrNo (RR+9digits — ⚠ reserved eagerly on form-open, not on save, so abandoned new-RR sessions permanently burn a sequence number), rrDate (Date), vendor, vendorName, items[] ({id (masterlist item doc id — confusingly named), itemName (denormalized display name, written by updateItem's item-selection handler), description, quantity, unit (denormalized unit *name* string, from the selected item's `unit_name` — not an id), unitCost (from the selected item's `purchase_price`), amount}), reference, poNo, location, locationName, status ('Draft' or 'Posted' — set by which Save button is used, mirroring APV/Sales Invoice), memo, subtotal, taxRate (no UI field for this — always 0 on new docs), taxAmount (always 0), totalAmount (= subtotal), createdAt, updatedAt`. The form's "Item" column is keyed `id` with `displayField: 'itemName'` — necessary because `TxnItemTable`'s read-only-mode fallback only special-cases a column literally keyed `item`/`unit`/`taxType`, and would otherwise render the raw item doc id in view mode.

### 3.5 `inventory/transactions/adjustments` schema

`adjustmentNo (ADJ+timestamp — NOT via documentIdService, a different ad hoc generator), adjustmentType ('increase'|'decrease'), adjustmentDate (Date), warehouse (id → otherlist/locations), warehouseName, referenceNo, account (id — the GL account to move value into/out of, → masterlist/accounts), accountName, remarks, lineItems[] ({item,itemName,description,unit,unitName,qty,price,dsc:0,taxType:'',amount = qty×price}), itemCount, totalValue (Σ line amounts), status ('Draft', never advanced), createdAt, updatedAt`. No variance-vs-prior-quantity concept — `amount` (qty×unit cost) is used directly as the journal debit/credit value; there's nothing to compare against because there's no stock ledger (§1.1).

### 3.6 `transactions/accounting/*` schemas

**`journalEntries`** — the universal ledger, written by every module. Header:
```
journalDate (Date), referenceNo (string, format 'JE-<timestamp-derived>' — see §5.3 for the numbering inconsistency),
description, memo, sourceType ('salesInvoice'|'apv'|'payment'|'receipt'|'creditMemo'|'receivingReport'|'inventory_adjustment'|'general'),
sourceId (doc id of the originating transaction, or absent for manual GJ entries),
totalDebit, totalCredit, isPosted (bool), status ('draft'|'posted' — only set by the manual General Journal form; generator functions set isPosted:true but not always a matching status string),
lines: JournalEntryLine[], createdAt, updatedAt
```
`JournalEntryLine`: `lineNo, accountId, accountName, nameType? ('customer'|'vendor'|'other'), nameId?, nameName?, lineDescription, debit, credit` (APV's generator additionally sets optional `costCenterId`/`costCenterName`, not used by any other generator).

**`fiscalPeriods`** — `{ id, year, month, monthName, startDate, endDate, isClosed, closedDate, closedBy }`. `closedBy` is hardcoded to the literal string `'current-user-id'`, never resolved from the actual authenticated user. Every journal-entry generator plus the manual General Journal form checks `isClosed` before posting — see `assertPeriodOpen` in §5.2.

---

## 4. Module Walkthroughs

### 4.1 Customer Center

| Transaction | Collection | Doc-number prefix | Draft support | JE generator | JE ID written back? |
|---|---|---|---|---|---|
| Sales Invoice | `transactions/customerCenter/salesInvoices` | `INV` | Yes (only one with a working Save-as-Draft) | `createSalesInvoiceJournalEntry` (simplified single-entry variant; a `createDetailedSalesInvoiceJournalEntries` 3-entry variant exists in `accountingService.ts` but is never called by the form) | No |
| Credit Memo | `transactions/customerCenter/creditMemos` | `CM` | No (always saved `Posted`) | `createCreditMemoJournalEntry` | **Yes** |
| Receive Payment | `transactions/customerCenter/receipts` | `PR` | No (always `Posted`) | `createReceiptJournalEntry` | No |

**Printing**: Sales Invoice's view mode (`salesInvoice/form/+page.svelte`, reached via `?id={id}&viewMode=true`) has a "Download PDF" button in `FormLayout`'s header-actions slot, calling `invoicePdfService.ts`'s `generateSalesInvoicePdf()` — the only transaction type with a print/PDF output anywhere in the app (§8.1). Fetches `companyProfileService.getCompanyProfile()` for the seller block and, if the invoice has a linked customer, a live `masterlist/customers` read for buyer address/TIN (not otherwise loaded into this form). Line items prefer each saved line's own `itemName`/`unitName` over a fresh option-store lookup, so the PDF reflects what the item/unit were actually called at save time.

**Sales cycle in practice:** Sales Invoice creates AR (or, if `cashSale`, an "Undeposited Cash" debit and immediate `status:'Paid'`) → Receive Payment allocates cash/credits against outstanding invoices and, on **both create and edit**, updates each allocated invoice's `totalDue`/`status` (`Partially Paid`/`Paid`) via a delta-based helper (`applyInvoiceBalanceDeltas`) that adjusts by the *change* in allocation since the receipt was loaded, rather than re-applying the full current amount on every save. The same delta approach applies to credit-memo/advance-payment `appliedAmount` tracking (`applyCreditDeltas`) — re-adding the full amount on every edit used to double-count a credit that hadn't actually changed. Credit Memo reverses revenue/VAT against AR; Receive Payment's "Apply Credit" flow reads/writes Credit Memos and prior Receipts at their real Firestore paths (§3.3).

**Editing behavior differs by type:** editing a Sales Invoice **deletes and regenerates** its journal entry from scratch (`accountingService.ts` explicitly deletes prior entries for the same `sourceId` before inserting). Editing a Receipt **does not** — `createReceiptJournalEntry` detects an existing entry for the source and just returns its ID unchanged, leaving a stale JE after any allocation edit. Editing a Credit Memo always re-derives amounts and re-posts (no dedup-and-skip logic in its generator, unlike Receipt/APV).

**Hard delete only, everywhere:** deleting any transaction via `ListContainer` is a true Firestore delete with a plain `confirm()` — no soft-delete/void flag exists, and no code anywhere cleans up the corresponding `journalEntries` document, so deletes can leave orphaned journal entries and stale counterpart statuses (e.g. deleting an invoice that a Receipt already partially paid).

### 4.2 Vendor Center

| Transaction | Collection | Doc-number prefix | Ever reaches "Posted"? | JE generator | JE ID written back? | Duplicate-JE guard on re-save? |
|---|---|---|---|---|---|---|
| APV | `transactions/vendorCenter/apvs` | `APV` | **Yes** — primary Save posts `'Posted'`; secondary "Save as Draft" saves `'Draft'` | `createApvJournalEntry` | No | Yes (returns existing ID, doesn't update) |
| Vendor Payment | `transactions/vendorCenter/payments` | `VP` | Always (`'Posted'` unconditionally) | `createVendorPaymentJournalEntry` | No | Yes (returns existing ID, doesn't update) |
| Receiving Report | `transactions/vendorCenter/receivingReports` | `RR` | **Yes** — primary Save posts `'Posted'`; secondary "Save as Draft" saves `'Draft'` | `createReceivingReportJournalEntry` | **Yes** | **Yes** — checks `getJournalEntriesForSource` and returns the existing entry's id, same as APV/Vendor Payment |

**Purchase cycle in practice:** Receiving Report books Dr. Inventory (hardcoded GL account) / Cr. AP for goods received, with no stock-quantity effect. APV books the expense/liability side, now including a real VAT-input debit (12% of net-of-line-discount amount, for any line with a taxType selected) and a real withholding-tax credit that's actually subtracted from the AP credit rather than double-booked (see below). Vendor Payment allocates cash against outstanding APVs by querying vendor + excluding `'draft'`/`'paid'` client-side (so a partially-paid APV stays visible, rather than the previous strict `status=='Posted'` filter that would drop it the instant a payment partially applied). On save it decrements each allocated APV's `totalAmountDue` and updates its status (`'Paid'`/`'Partially Paid'`) via a delta-based helper, on both create and edit.

**APV's journal entry now balances even when withholding tax and/or line discounts apply.** Previously the AP credit booked the *full* `netAmount` (because `totalAmountDue` never subtracted `lessWithholding`, which was hardcoded to 0) while a *separate* withholding-tax credit was also booked, double-crediting the withholding amount with no offsetting debit — and separately, each line's discount was applied twice (once implicitly, because the saved `amount`/`total` field is already net-of-discount, and again by `createApvJournalEntry`'s own `item.amount - item.amount*dsc/100`). Both are fixed: the form now computes real `vat`/`lessWithholding`/`totalAmountDue` (§3.4) instead of hardcoding the latter two to 0, and the generator debits each line's expense at the pre-discount `price` (crediting the discount separately) instead of re-discounting the already-net `amount`.

### 4.3 Inventory

Only one transaction type: **Inventory Adjustment** (`inventory/transactions/adjustments`, prefix `ADJ`, see §3.5). Purely a value posting (`createInventoryAdjustmentJournalEntry`): increase → Dr. hardcoded "Inventory Asset" / Cr. user-selected account; decrease → reverse. Its Warehouse and Account dropdowns are sourced from the real, managed `otherlist/locations` and `masterlist/accounts` collections. There's no stock-quantity ledger anywhere in the app to adjust against (§1.1) — this module computes and posts a value with no linkage to real inventory counts.

### 4.4 Accounting

- **General Journal** (`transactions/accounting/journalEntries`, `sourceType:'general'`): the only place journal entries are hand-authored directly by a user rather than generated by a transaction. UI enforces balance (`Math.abs(totalDebit-totalCredit) < 0.01`) and per-line "exactly one of debit/credit" before allowing save, and is also blocked by `assertPeriodOpen` (§5.2) the same as every generated JE — all client-side only, no Firestore rule backs any of it up. `documentIdService.ts` has a fully-configured `DocumentType.JOURNAL_ENTRY` (prefix `JE`, field `journalNo`) that is **never actually called** — real journal entries (both manual and generated) use an ad hoc, non-sequential, timestamp-derived `referenceNo` instead (`JE-${Date.now().toString().substring(7)}`), duplicated independently in both the GJ form and `accountingService.ts`.
- **Reports** (`reports/apAging`, `arAging`, `balanceSheet`, `incomeStatement`, `trialBalance`, `generalLedger`, `salesJournal`, `purchaseJournal`, `cashReceiptsJournal`, `cashDisbursementsJournal`): all thin wrappers around `ReportContainer` + a `reportingService.ts` data function (see §5.4). AR/AP Aging bucket by a crude **substring match** on `line.accountName` containing `"receivable"`/`"payable"` — not by any real account-type/classification field, and not by actual invoice/APV due dates (age is computed from the *journal entry's* date, not a per-document due date). Every report's CSV export is hand-rolled inline (Blob + synthetic `<a download>`), not routed through `csvExporter.ts`. The five statutory-book reports (§8.4) are the same shape/pattern as the original three, just newer.
- **Audit Trail** (sidebar label "Transaction Journal"): a filterable/sortable/paginated **read-only viewer** over the entire `journalEntries` collection (fetched unfiltered, filtered client-side), re-deriving debit/credit totals per entry from `lines[]` rather than trusting the stored header totals, flagging out-of-balance entries. Has full CSV export. This is *not* a change-history/who-edited-what audit log — there's no such feature anywhere in the app.
- **Data Auditor**: a **data-quality scanner**, functionally distinct from Audit Trail — runs 9 independent checks (missing required fields, duplicate reference numbers / account codes, journal lines referencing account names absent from the Chart of Accounts, items missing a sales price under any of several historical field-name aliases, etc.) across journal entries and every masterlist collection, and offers advisory (non-writing) account-code suggestions for orphaned account names. Embeds a smaller, duplicate copy of the same balance-check journal table Audit Trail shows, without Audit Trail's filtering/export.
- **Period Closing**: real writes to `fiscalPeriods`, enforces sequential close/reopen order and blocks closing a period containing unposted (`isPosted:false`) journal entries. Every JE generator plus the General Journal form enforces this at post time too, via `assertPeriodOpen` (§5.2) — closing a period actually blocks new postings into it, not just on-page copy.
- **Tax Reporting**: derives Output VAT / Input VAT / Withholding Tax purely by **substring-matching `accountName`** on posted journal entries (e.g. `"output vat"`, `"vat payable"`, `"withholding"`), not from any dedicated tax collection or from the `otherlist/tax` master list. Produces a monthly rollup plus three detail tables.

### 4.5 Masterlist & Otherlist

Every page follows: `MasterListContainer` (search + New button) + local `ModalForm` (add/edit) + inline delete + (for Accounts/Customers/Items/Vendors/Others only) inline CSV import/export handlers. See §3.1/§3.2 for schemas. **CSV import is inconsistent**: Customers and Vendors **destructively wipe the entire collection** before importing (behind a `confirm()`); Accounts, Items, and Others are append-only with no upsert-by-code, so re-running an import duplicates records. None of the eight otherlist entities (including Cost Centers, `otherlist/costcenters`) have CSV support.

Accounts' **"Sample CSV" download button had a real bug**, not just a doc-vs-code mismatch: every top-level (no-`parentId`) row had one extra comma, shifting `isActive` to `''` and `isSystem` to `'true'` on import for every root account (Current Assets, Current Liabilities, Owner Equity, Revenue, Operating Expenses). Anyone who imported that literal sample, or hand-built a CSV following the same field pattern, ended up with every root account permanently marked as a system account. Fixed (correct 12-field rows throughout).

**`isSystem` no longer restricts anything — full user control over the Chart of Accounts was an explicit product decision, not an oversight.** It used to hard-disable the Edit/Delete buttons (`disabled={row.isSystem}`) with no visible reason why (indistinguishable from "broken," and permanently stuck any account incorrectly flagged `isSystem`, like the CSV bug above), and `handleDelete` separately blocked with an alert. Both restrictions are removed; `isSystem` is now purely informational, still settable via its own checkbox in the form (which — turns out — was already a no-op `disabled` config even before this change, since `ModalForm.svelte` never reads a field's `disabled` property for any field type; the checkbox was always freely clickable regardless of what that config implied). The one place `isSystem` still matters is `reportingService.ts`, which sets it on the auto-plugged "Retained Earnings" account (§5.4) — purely a marker, nothing reads it back.

### 4.6 Dashboard (`main/dashboard`)

Live-Firestore-driven (not static), but its KPIs are computed by **keyword-substring-matching `accountName` across all posted journal entries for the current year** rather than by real account-type joins — and several figures are explicit placeholders acknowledged in the source's own comments: `cashBalance = totalAssets` ("simplified"), `arTotal = totalRevenue` ("simplified — use revenue as AR"), `apTotal = totalLiabilities`, `quickRatio` computed identically to `currentRatio`. "Top Customers"/"Top Vendors" tables key off `entry.customer`/`entry.vendorId` on journal-entry documents (fields that generator functions do set for customer/vendor-linked entries, but which display as the raw ID — or the literal string `"unknown"` — since no lookup against `masterlist/customers`/`masterlist/vendors` is performed to resolve a display name). Charts are two Chart.js canvases (Revenue-vs-Expense line, AR-vs-AP bar) using the CDN-loaded library described in §1.

### 4.7 Admin Tools (`src/routes/admin/*`)

The first role/permission concept anywhere in the app (§1.1). Gated by a real, if basic, `admin`/`user` role.

**`users` collection** (its own flat root collection, `users/{uid}`, keyed by Firebase Auth uid — see §3): `email, displayName, role ('admin'|'user'), isActive (bool), createdAt, updatedAt, createdBy? (uid of the admin who created them via Admin Tools; absent for self-bootstrapped profiles)`. This is a Firestore profile document, not a Firebase Auth custom claim — there's still no Admin SDK or backend (§1), so this profile is the sole source of truth for role/active checks everywhere, app code and `firestore.rules` alike.

**Bootstrap**: `admin@admin.com` is the one hardcoded identity (`DEFAULT_ADMIN_EMAIL` in `src/lib/stores/userProfile.ts`, mirrored in `firestore.rules`). `loadUserProfile()` — called from `src/routes/+layout.svelte` on every `onAuthStateChanged` — creates a `users/{uid}` doc the first time any account signs in with no existing profile: `role:'admin'` if the token's email matches the bootstrap identity, `role:'user'` otherwise, both `isActive:true`. There's no separate signup/registration flow; this bootstrap-on-first-login is how *every* account gets a profile, not just the first admin.

**`isAdmin`** (derived store, `src/lib/stores/userProfile.ts`): true iff the current profile's role is `'admin'` and `isActive` isn't `false`. Gates the "Admin Tools" sidebar section (hidden entirely for non-admins, `Sidebar.svelte`) and `src/routes/admin/+layout.svelte`, which redirects non-admins away from any `/admin/*` URL directly rather than just hiding the link. That guard waits on a separate `profileReady` store, not `profileLoading` — `profileLoading`'s initial value (`false`) is indistinguishable from "already finished" if read on a hard refresh landing straight on an admin URL, before the root layout's async profile load has resolved even once; `profileReady` stays `false` until the first load actually completes, however long that takes.

**Deactivation** (`isActive:false`) is checked in two places: `+layout.svelte` force-signs-out a deactivated user the next time `onAuthStateChanged` fires, and `firestore.rules`' `isActiveUser()` blocks their reads/writes at the data layer too. It does **not** disable or delete the underlying Firebase Auth credential — only the Firebase Console (or an Admin SDK this app doesn't have) can do that. A deactivated user's login still technically succeeds against Firebase Auth; the app just immediately kicks them back out and Firestore rejects everything they try afterward.

**`/admin/users`**: lists every `users` profile via a direct live `onSnapshot` — not the `firestoreCrud.ts`/`collectionStore` path-mapping convention (§2.2), since `users` is a flat 1-segment collection with no parent/sub nesting to map. Admins can toggle role and `isActive` (both controls disabled on your own row — no self-demote, no self-deactivate) and send a password-reset email (`sendPasswordResetEmail`, safe for any address, doesn't touch the caller's session).

**Creating a user** (`createUserAccount`, `src/lib/utils/adminService.ts`): calling `createUserWithEmailAndPassword` on the app's normal Auth instance while already signed in would sign the admin out and sign in as the new user instead — the client SDK holds exactly one active session per app instance. This spins up a throwaway secondary Firebase app instance (`initializeApp(firebaseConfig, 'admin-create-user-<timestamp>')`) to create the Auth account on, signs *that* instance out immediately, writes the `users/{uid}` profile from the admin's own primary session, then tears the secondary instance down (`deleteApp`) — the admin's session is never disturbed. There is no way to fully delete another user's Auth account from the client SDK at all; "removing" someone here only ever means deactivating their profile.

**`/admin/resetTransactions`** (`resetAllTransactions`, `adminService.ts`): deletes every document in `transactions/customerCenter/{salesInvoices,creditMemos,receipts}`, `transactions/vendorCenter/{apvs,payments,receivingReports}`, `transactions/accounting/{journalEntries,fiscalPeriods}`, and the outlier `inventory/transactions/adjustments` — nothing else. Chart of Accounts, Customers/Vendors/Items/Others, every otherlist collection, and `users` are never touched. Deletes are chunked into `writeBatch` calls of 400 (Firestore's hard cap is 500 writes/batch) rather than one `deleteDoc` per document. The page gates the button behind typing the literal phrase `RESET TRANSACTIONS` into a text field before it's even clickable, on top of a `confirm()` dialog — this is the single most destructive, most irreversible action anywhere in the app (§1.1), and there is no undo, backup, or soft-delete anywhere in this codebase to fall back on if it's run by mistake.

**`/admin/auditLog`** (`getAuditLogs()`, `auditLogService.ts`): read-only, newest-first table (most recent 500 entries) over the `auditLogs` collection — When | Who | Action | Collection | Document ID, with a click-to-expand row showing the full pre-delete snapshot JSON for `action:'delete'` entries. Admin-only by `firestore.rules` (`allow read: if isAdmin()`), independent of the `/admin/*` route guard that already applies to every page under this path. See §2.2/§8.3 for how entries actually get written.

**`/admin/companyProfile`** (`companyProfileService.ts`): the business's own BIR identity — `registeredName*, tradeName, tin*, rdoCode, registeredAddress*, vatStatus ('vat'|'non-vat'), lineOfBusiness, contactNumber, email, updatedAt, updatedBy` — stored as a single singleton document at `listdatabase/companyProfile`, not a masterlist/otherlist entity (there's exactly one company, no code/list semantics apply). First step toward closing the §8.1 "no seller-identification data anywhere" gap: nothing reads from it yet (no invoice/OR printing or BIR Form 2307 generation exists to consume it — still open, see §8.1/§8.7), it only captures and persists the data those features will need. Unlike every other `listdatabase` doc — where any active user can read/write per `firestore.rules` — writes to this one are restricted to `isAdmin()`; reads stay open to any active user since invoice printing will eventually need it outside `/admin/*`.

---

## 5. The Accounting Engine

### 5.1 Tax-rate handling — a systemic pattern to know

VAT is **hardcoded at 12%** in every calculation site (Sales Invoice's reactive block, Credit Memo's reactive block, `accountingService.ts`'s `grossAmount/1.12` sales-revenue split), regardless of whatever numeric rate a given `otherlist/tax` record might notionally represent — because, per §3.2, `otherlist/tax` records don't even have a rate field; they're name-only. Classification of a line as vatable/zero-rated/exempt is done by matching the *label text* of the selected tax option, not a stored rate or type code. If you're asked to make VAT-rate-configurable, this is the single hardcoded assumption threaded through the most call sites.

### 5.2 Journal-entry generators (`accountingService.ts`) — quick reference

All generators share the shape: call `assertPeriodOpen(date)` first (via `isDateInClosedPeriod`, which checks `transactions/accounting/fiscalPeriods` for a closed period spanning the transaction date, §3.6) and throw before building anything if the period is closed; then build a header + `lines[]`; call `getJournalEntriesForSource(sourceType, sourceId)` to check for an existing entry (behavior on collision **varies by generator** — see table below); then `addDocToCollection('accounting','journalEntries', entry)`.

**Known limitation:** document-save and journal-entry-creation are two separate, non-transactional writes throughout this codebase. A closed-period rejection (or any other post-save error) can leave the source transaction document saved in Firestore without a matching journal entry. Making the whole save pipeline atomic would be a larger, separate refactor.

| Function | Called from | On existing JE for same source | Writes `journalEntryId` back to source doc? | Notable hardcoded fallback account IDs |
|---|---|---|---|---|
| `createSalesInvoiceJournalEntry` | Sales Invoice form | **Deletes old entries, re-creates** | No | `accounts-receivable`, `undeposited-cash`, `sales-discount`, `cwt-bir2307`, `output-vat`, `sales-revenue` |
| `createDetailedSalesInvoiceJournalEntries` | *(nothing — dead code, never imported by any route)* | n/a | n/a | same set, split across 3 entries |
| `createApvJournalEntry` | APV form | Returns existing ID unchanged | No | `purchase-discounts`, `vat-input`, `withholding-tax-payable`, `accounts-payable` (only if line lacks its own account) |
| `createInventoryAdjustmentJournalEntry` | Inventory Adjustment form | Returns existing ID unchanged | No | `inventory-asset` (always, regardless of any real account) |
| `createReceiptJournalEntry` | Receive Payment form | Returns existing ID unchanged (**edit never regenerates**) | No | `cash`, `bank`, `credit-card-receivable`, `online-payments`, `accounts-receivable`, `customer-credit-balance`, `customer-deposits` |
| `createVendorPaymentJournalEntry` | Vendor Payment form (create and edit — edit now calls it too, though it still just returns the existing entry's id unchanged rather than re-syncing amounts) | Returns existing ID unchanged | No | `cash`, `bank`, `credit-card`, `online-payments`, `accounts-payable` |
| `createCreditMemoJournalEntry` | Credit Memo form | *(no dedup check — always inserts)* | **Yes** | `sales-revenue`, `output-vat`, `withholding-tax-receivable`, `accounts-receivable` |
| `createReceivingReportJournalEntry` | Receiving Report form (only reachable when `status==='Posted'`) | Returns existing ID unchanged | **Yes** | `inventory`, `accounts-payable` |

Sales Invoice and Credit Memo both post Output VAT to the same `output-vat` account id, so a credit memo actually nets against the liability balance the original invoice posted to (previously Credit Memo used a separate `vat-payable` id that never reconciled against it).

Payment-method → cash/bank account resolution (`createReceiptJournalEntry`, `createVendorPaymentJournalEntry`) switches on the **hardcoded literal strings** `'check'|'credit-card'|'online'`, not on the actual Firestore-driven `otherlist/paymentmethods` option values selected in the UI — in practice this will almost always fall through to the `'cash'` default unless a paymentmethods record's ID happens to exactly equal one of those literals.

`getJournalEntriesForSource(sourceType, sourceId)` — used both internally and by view pages (Credit Memo, Receiving Report) to fetch an entry's JE for display — queries `transactions/accounting/journalEntries` with `where('sourceType','==',...)` + `where('sourceId','==',...)`.

### 5.3 Document numbering (`documentIdService.ts`)

`generateNextDocumentId(DocumentType)` looks up the single most-recent document in the target collection (`orderBy(field,'desc'), limit(1)`), extracts the trailing number from its prefix+padded-number field, and increments. **It is wrapped in `runTransaction(...)` but never calls `transaction.get()`/`.set()` inside the callback** — it uses plain `getDocs`, so Firestore's transaction isolation provides **no actual protection** against two concurrent saves computing the same next number. `DocumentType` → prefix/collection/field map:

| DocumentType | Prefix | Field | Collection | Actually used? |
|---|---|---|---|---|
| `SALES_INVOICE` | `INV` | `invoiceNo` | `transactions/customerCenter/salesInvoices` | Yes |
| `CREDIT_MEMO` | `CM` | `cmNo` | `transactions/customerCenter/creditMemos` | Yes |
| `PAYMENT_RECEIPT` | `PR` | `receiptNo` | `transactions/customerCenter/receipts` | Yes (+ extra collision re-check loop, unique to this one) |
| `APV` | `APV` | `apvNo` | `transactions/vendorCenter/apvs` | Yes |
| `VENDOR_PAYMENT` | `VP` | `paymentNo` | `transactions/vendorCenter/payments` | Yes |
| `RECEIVING_REPORT` | `RR` | `rrNo` | `transactions/vendorCenter/receivingReports` | Yes (reserved on form-open, not on save) |
| `JOURNAL_ENTRY` | `JE` | `journalNo` | `transactions/accounting/journalEntries` | **No** — configured but never called; JEs use an ad hoc timestamp-derived reference instead |

Inventory Adjustment's `ADJ` numbers are generated by neither this service nor a sequential counter — just `` `ADJ-${Date.now().toString().substring(7)}` ``, timestamp-derived like the journal-entry fallback.

### 5.4 Reporting engine (`reportingService.ts`)

`getAllAccounts()` reads `masterlist/accounts` verbatim and casts `accountType`/`fsClassification` to the enum types with **no validation** — accounts saved before the §5.5 taxonomy was aligned won't match the enum values used by downstream `switch`/`===` logic. `getAccountBalances(dateRange)` walks every posted journal entry line, matching against a chart-of-accounts-seeded balance map **by account name first, then by account ID**; for any line whose account isn't found in either, it synthesizes a new balance bucket on the fly using `determineAccountTypeFromName`/`determineFSClassificationFromName` — keyword-heuristic functions (e.g. name contains "cash"/"bank"/"receivable"/"inventory" → Asset/CurrentAsset) that are, in practice, doing more of the real classification work than the Chart of Accounts data itself, precisely because of stale pre-taxonomy account records.

`getTrialBalanceData` / `getBalanceSheetData` both **auto-plug a synthetic "Retained Earnings" line** (creating the account in `masterlist/accounts` on first use if it doesn't exist, code `3500`) whenever debits≠credits or assets≠liabilities+equity, forcing the report to visually balance rather than surfacing the imbalance to the user. **A nonzero "Retained Earnings" plug should be read as a symptom of an upstream unbalanced journal entry, not a real equity balance** — e.g. it's what used to mask the now-fixed APV-with-withholding imbalance (§4.2), and would mask any future one the same way.

**Statutory books** (`getGeneralLedgerData`, `getSalesJournalData`, `getPurchaseJournalData`, `getCashReceiptsJournalData`, `getCashDisbursementsJournalData`, §8.4): all built on `getJournalEntries(dateRange)` directly, none go through `getAccountBalances`. `getGeneralLedgerData` makes a second `getJournalEntries` call for everything posted *before* the range to seed a per-account beginning balance, groups the range's lines by account (code, falling back to name) so the report reads as one ledger per account rather than every account's activity interleaved together, sorts chronologically within each group, and computes a running balance per line using the same `getAccountCategory()`-resolved normal-balance direction as `getAccountBalances`. The Sales/Purchase Journal and Cash Receipts/Disbursements Journal functions instead filter `getJournalEntries` results by `sourceType` (`'salesInvoice'`/`'apv'`/`'receipt'`/`'payment'`) and, for each matching entry, do one extra `getDocFromCollection` read back to the source document (`transactions/customerCenter/salesInvoices`, etc.) to pull the human-readable document number and stored VAT/amount fields — the journal entry's own `referenceNo` is an unrelated `JE-<timestamp>` string, not the invoice/APV number (§5.3). The two cash journals additionally call a local `findOffsettingAccountName()` helper that picks the journal-entry line whose `accountName` doesn't match `/cash|bank/i` as the "Account" column, since receipts/payments have no stored GL-account field of their own.

`getARAgingData`/`getAPAgingData` scan **every journal entry line** for `accountName` containing `"receivable"`/`"payable"` as a substring, bucket by the *journal entry's date* (not a stored due date) into Current/1-30/31-60/61-90/>90, keyed by `entry.customer`/`entry.customerId` (or `entry.vendor`/`entry.vendorId`) — fields that are **not populated by most of the journal-entry generators** in §5.2 (only the ones with a `nameId`/`nameType` line explicitly tagged `customer`/`vendor` carry this; the aging functions read a header-level `entry.customer`/`entry.vendor`, which none of the generators in §5.2 actually set on the entry *header* — only on individual *lines*). In practice, expect most/all aging entries to bucket under `'unknown'`.

### 5.5 Chart of Accounts taxonomy

**`accountType` is now the standard QuickBooks-style granular taxonomy, not the old 6-value set.** The Chart of Accounts form's "Account Type" dropdown, and every account-type-filtered dropdown in the app, are driven by `src/lib/utils/accountTypes.ts`'s `ACCOUNT_TYPES` — 15 values matching QuickBooks Online's own account types exactly ([Intuit reference](https://quickbooks.intuit.com/learn-support/en-us/help-article/chart-accounts/learn-account-detail-types-chart-accounts/L2gCy0rfy_US_en_US)):

- **Asset**: `bank`, `accounts-receivable`, `other-current-asset`, `fixed-asset`, `other-asset`
- **Liability**: `accounts-payable`, `credit-card`, `other-current-liability`, `long-term-liability`
- **Equity**: `equity`
- **Revenue**: `income`, `other-income`
- **Expense**: `expense`, `other-expense`
- **COGS**: `cost-of-goods-sold`

This replaced the old 6-value `asset|liability|equity|revenue|expense|cogs` set, which was never granular enough for a real Chart of Accounts and — critically — didn't recognize this app's own actual account data, which already used QuickBooks-style values (entered that way before the app's dropdown could produce them, or imported from elsewhere). Every account-type-filtered dropdown (APV's AP Account/Expense Account, Items masterlist's income/expense/inventory/cogs pickers, via `accountFilters.ts`'s `filterAccountsByType`) used to match the literal `accountType` string exactly, so an account typed `'accounts-payable'` never matched a filter asking for `'liability'` — every such dropdown rendered empty against a standards-conformant Chart of Accounts.

Each of the 15 types maps to one of the 6 broad **categories** (`asset|liability|equity|revenue|expense|cogs` — unchanged, still what drives `normalBalance` debit/credit direction) via `accountTypes.ts`'s `getAccountCategory()`, which every category-based consumer now calls instead of comparing `accountType` directly:
- `accountFilters.ts`'s `filterAccountsByType(accounts, category)` matches by category, not exact string.
- `reportingService.ts`'s `getAccountBalances` resolves `account.accountType` through `getAccountCategory()` before its debit/credit-direction switch — previously an account typed e.g. `'accounts-payable'` fell through that switch's default (`Debit`), silently inverting its balance sign in every report.

`getAccountCategory()`/`normalizeAccountType()` also tolerate the space-separated, inconsistently-pluralized values already present in existing data (`"accounts receivable"`, `"fixed assets"`, `"other current liabilities"`) via a small alias table, plus the old 6-value legacy strings (`'asset'`, `'liability'`, ...) — no one-time data migration is required for existing accounts to filter, display, and report correctly under the new taxonomy.

`fsClassification` is unchanged and separate — still what `getBalanceSheetData`/`getTrialBalanceData` actually group Balance Sheet sections by (**Current Asset**, **Non-Current Asset**, **Current Liability**, **Non-Current Liability**, **Equity**, **Revenue**, **Cost of Sales**, **Operating Expense**, **Other Income**, **Other Expense**, **Tax**) — `accountType`'s only role in the reporting engine is normal-balance direction, not section grouping.

`determineAccountTypeFromName`/`determineFSClassificationFromName` (name-substring fallback heuristics used when a journal line's account isn't found in the chart at all) still exist as a secondary path for synthesized/unmatched accounts — separate from the keyword sets Dashboard and Tax Reporting use, which are out of scope here.

**Not migrated**: account documents saved before `fsClassification` was aligned to the 11-value set above may still carry the old `balance_sheet`/`income_statement`/`cash_flow` values and won't classify correctly into Balance Sheet/Income Statement sections until re-saved through the form or migrated directly. (`accountType` itself needs no such migration — see above.)

---

## 6. Consolidated Known-Issues Catalog

Grouped by theme, deduplicated across modules, for quick scanning. Each item references where it's detailed above.

**Data-path bugs (silent, no thrown errors):**
- Inventory Adjustment's `view/+page.svelte` reads from the wrong path *and* wrong field names — fully dead relative to real data (§4.3; references `items`/`previousQty`/`newQty`/`journalEntryId`/`reference`/`locationName`, none of which the form ever saves).

**Arithmetic / persistence mismatches:**
- Receive Payment's per-invoice discount/tax adjustments are computed for display but never persisted (§3.3).

**Numbering:**
- `generateNextDocumentId`'s "transaction" provides no real concurrency protection — it never calls `transaction.get()`/`.set()` inside the callback (§5.3).
- Journal entries never use the otherwise-complete `documentIdService.ts` sequential numbering; they use an ad hoc, duplicate-defined, timestamp-derived reference instead (§5.3).
- Receiving Report reserves its sequence number on form-open rather than on save (higher orphan-gap risk than other types) (§4.2).

**Dead / vestigial code** (safe to ignore, but don't build on top of it expecting it to run):
- `createDetailedSalesInvoiceJournalEntries` (never called).
- `form/[id]` and `view/[id]` redirect-stub routes wherever a query-param form already covers the same URL space.
- Credit Memo's invoice-linking fields/handlers (UI removed, logic remains).
- Receiving Report's `handleItemChange` (defined, never wired; a separate `updateItem` handler does the real work).
- `detailedJournalEntries`-gated per-item branches in Credit Memo's and Receiving Report's JE generators (flag never set by either form).
- `sourceTypeMap` in General Journal's list page (defined, never applied to the rendered column).
- `TAX_CATEGORIES` constant in Tax Reporting (defined, never referenced — string literals used directly instead).

**Enforcement gaps (client-side only, nothing backs them at the data layer):**
- Journal-entry debit=credit balancing (General Journal form).
- Required fields on most transaction forms (HTML `required` attribute only; Sales Invoice in particular has no JS-level guard at all, unlike Credit Memo/Receive Payment which do check).
- Over-allocation prevention in payment-allocation UIs (cosmetic red-text warning only, not a save-blocker) — true on both Receive Payment and Vendor Payment.
- Document-save and journal-entry-creation are two separate, non-transactional writes throughout the codebase — any post-save error (including a closed-period rejection, §5.2) can leave a transaction document saved without a matching journal entry.
- All of the above, plus everything else in the app, ultimately rests on Firestore security rules as the only real enforcement layer — verify `firestore.rules` isn't expired before trusting it as a backstop (it has expired before, §1.1).

**UI/permission mismatch (introduced by Admin Tools, §4.7):** `firestore.rules` now restricts deletes on `transactions/**`/`inventory/**` to admins, but `ListContainer`'s per-row delete button (§2.4) still renders identically for every authenticated user regardless of role — a non-admin clicking it gets a Firestore permission-denied error instead of the button simply not being there. Hiding or disabling that button for non-admins (checking `isAdmin` from `src/lib/stores/userProfile.ts`) would close this, but hasn't been done.

---

## 7. Conventions to Follow When Extending This System

1. **Store both an ID and a denormalized display name** for every reference field (`customer`/`customerName`, `item`/`itemName`, etc.) — this is the one convention applied consistently everywhere and existing reports/views rely on the denormalized name being present. When adding a new reference field, add both.
2. **Use the 3-segment explicit path form** (`'transactions/customerCenter/salesInvoices'`) for any new collection access rather than a 2-segment path, unless the first segment is confirmed to be one of the five `ROOT_COLLECTION_MAP` keys (`masterlist`, `otherlist`, `customerCenter`, `vendorCenter`, `accounting`). This avoids the silent-fallback trap in §2.2.
3. **If adding a new transaction type**, follow the established pattern: one `form/+page.svelte` driven by `createFormModeStore()`, register it in `DocumentType`/`documentConfigs` in `documentIdService.ts` and actually call `generateNextDocumentId`, add a matching generator in `accountingService.ts` that (a) checks `getJournalEntriesForSource` before inserting and (b) writes `journalEntryId` back onto the source document — both of which existing generators do inconsistently; do it correctly in new code rather than copying whichever existing generator is closest.
4. **Don't add new hardcoded account-ID string literals** (`'accounts-receivable'`, `'inventory-asset'`, etc.) to `accountingService.ts`. These already litter the file as unresolved placeholders; prefer resolving a real account via the transaction's own selected account field or a proper Chart-of-Accounts lookup, and treat the existing literals as known debt rather than a pattern to extend. If two generators post the same conceptual liability/asset (e.g. VAT), make sure they use the *same* account id — `output-vat`/`vat-payable` used to be a real example of this drifting apart (§5.2, now unified).
5. **Any new report or list summary should query against the transaction forms' actual saved values** (`'Draft'`/`'Posted'`/`'Paid'`/`'Unpaid'`/`'Partially Paid'`, Title Case) — this is what `ListContainer` does today (§2.4); don't reintroduce a lowercase convention that won't match.
6. **Check `firestore.rules`' expiry** as a first step in any "the app isn't saving/loading data" investigation, before debugging application code.
7. **Any `columns`/`fields` array that embeds `options: someOptionsVariable` (a `TxnItemTable`/`TxnFields` config) must be declared `$: columns = [...]`, never `const columns = [...]`.** Firestore option stores populate asynchronously (`createFirestoreOptionsStore(...).subscribe(...)`) — a `const` captures whatever the options variable held *at that exact line's first execution*, almost always still `[]`, and reassigning the variable later doesn't retroactively update the array reference already copied into the const's object literal. This was a real, shipped bug in Receiving Report's form (its "Item" dropdown was permanently empty) until fixed — check for this pattern specifically whenever a dropdown "isn't loading" and the underlying option store looks fine.
8. **`createFirestoreOptionsStore(name, labelKey, valueKey, includeRawData)`'s 4th argument defaults to `false`.** Any code that reads more than `.label`/`.value` off a returned option (e.g. auto-filling other fields from the selected item, or filtering accounts by type) needs `includeRawData: true`, and must read the extra data from `.raw.<field>` — never flat on the option object, which only ever has `{label, value, raw?}` (see `mapToOptions` in `firestoreOptions.ts`). Passing `true` but then reading `option.someField` instead of `option.raw.someField` is the same bug wearing a different hat.
9. **After mutating a line item's property from a callback that lives outside `TxnItemTable` (e.g. a parent form's `updateItem(idx, key, value)` handler doing `formData.items[index].foo = x`), reassign the whole array afterward** — `formData.items = [...formData.items]` (or `lineItems = [...lineItems]`, matching whatever the form calls it). The array/object is shared by reference down through `FormSection` → `TxnItemTable` as the `items`/`rows` prop; mutating a nested property doesn't change that reference, so Svelte's prop-diffing at each component boundary sees "same array" and never re-renders the table, even though the underlying data did change correctly. This was the actual root cause of the Receiving Report auto-fill bug in point 7's fix — the field-mapping was already correct, the computed values just never reached the DOM without this line. Sales Invoice, Credit Memo, and Inventory Adjustment's equivalent handlers already do this; grep for `= [...` + the line-items variable name in a form before assuming a "compute the right value" fix is complete.
10. **Reuse `itemAutofill.ts`, `accountFilters.ts`, and `withholdingTax.ts`** (§2.5) rather than re-deriving item-field lookups, Chart-of-Accounts type filters, or the withholding-percent option list per form — this is exactly the class of independently-drifting duplication that caused points 7–9's bugs in the first place. For a transaction type with no real withholding concept in `accountingService.ts` (Receiving Report, Vendor Payment, Receive Payment), pass `FormFooter`'s `showWithholding={false}` instead of wiring up `withholdingTaxOptions` with nothing behind it.
11. **Don't rely on a child component to invent state your own array doesn't have.** `TxnItemTable` used to auto-create a default empty row whenever its `rows` prop arrived empty — but since that prop is one-way (`rows={items}`, not `bind:rows`), the synthesized row only ever existed in `TxnItemTable`'s own local copy. Receiving Report's `onMount` never seeded a starting row (unlike Sales Invoice/APV/Credit Memo/Inventory Adjustment/General Journal, which all guard `if (items.length === 0) addItem()` on mount), so the parent's real array stayed empty, and every `onUpdate(idx, key, value)` call for that first row hit an `if (formData.items[index])` guard that silently no-opped — including item selection, which looked exactly like a broken auto-fill (nothing populated, nothing errored) but was actually a row that never existed in the parent at all. Fixed by having `TxnItemTable` call `onAdd()` — the same handler the "+ Add Item" button uses — instead of synthesizing a row itself, so the first row is always created through each form's own `addItem()` into the real array. When a shared component needs to guarantee some initial state, route it through the same callback the parent already uses to create that state, don't duplicate the creation logic locally.

---

## 8. Philippine Accounting & BIR Compliance — Comparison Guide

**Purpose.** This section exists to be *diffed against*, not read once. It compares what DigiSoft CAS actually does (per §§1–7 above, re-verified against source for this section) against current Philippine statutory/BIR practice for a Computerized Accounting System, so a future review — human or agent — can check the box on what's genuinely covered and see, with a code pointer, exactly what still needs work. It is a technical comparison against publicly available BIR rules as researched **2026-08-15**, not a legal or tax opinion; treat every ❌/⚠️ below as a real, actionable item, but have an accountant or tax counsel sign off before relying on this for an actual BIR Computerized Accounting System (CAS) Acknowledgment Certificate application.

Legend: ✅ Compliant &nbsp;·&nbsp; ⚠️ Partial &nbsp;·&nbsp; ❌ Gap &nbsp;·&nbsp; — Out of scope / not applicable.

### 8.1 Invoicing (Ease of Paying Taxes Act / RA 11976, RR 3-2024, RMC 77-2024)

Since January 2024, the **Sales Invoice** — not the Official Receipt — is the document that substantiates a sale of goods *or services* for VAT purposes; an OR is now a supplementary document only.

| Requirement | Status | Notes |
|---|---|---|
| Sale substantiated by a Sales Invoice, not an OR, for both goods and services | ✅ | The system already models this correctly: Sales Invoice/Credit Memo (§3.3) are the tax-bearing documents; Receive Payment/Vendor Payment (§3.3/§3.4) are pure cash-collection/disbursement records with no VAT computation, matching the OR's post-2024 role as a supplementary collection receipt rather than the sale's tax document. This split was almost certainly accidental (the app predates knowing this distinction mattered), but it happens to land in the right place. |
| Seller's registered name, TIN, registered address, "VAT Registered" statement on the invoice face | ✅ | `/admin/companyProfile` (`companyProfileService.ts`, §4.7) captures the business's own registered name, TIN, RDO code, registered address, and VAT status; Sales Invoice's PDF output (`invoicePdfService.ts`, see below) now stamps all of it onto the actual document face. |
| Buyer's name/business name, address, TIN | ✅ / ⚠️ | `masterlist/customers` has `tax_id`, `billing_address` (§3.1) — captured, but nothing validates TIN format or requires it before save; a customer can be saved with no TIN at all and still be invoiced. The PDF pulls both onto the buyer block when present, blank otherwise. |
| Sequential, non-duplicative, non-reusable invoice numbering | ⚠️ | `documentIdService.ts` (§5.3) generates sequential `INV`/`CM`/`PR`/`APV`/`VP`/`RR` numbers, but the "transaction" wrapper never actually calls `.get()`/`.set()` inside its callback, so it provides **no real concurrency protection** — two concurrent saves can compute the same next number. Receiving Report also reserves its number on form-open rather than on save, burning a sequence gap on every abandoned draft. |
| Date of transaction | ✅ | Every transaction form. |
| Description of goods/services | ✅ | `itemName`/`description` on every line-item schema (§3.3/§3.4). |
| Breakdown of Vatable Sales / Zero-Rated Sales / VAT-Exempt Sales, with VAT amount computed per component | ✅ | `vatableSales`/`zeroRated`/`vatExempt`/`vat` are all computed and persisted on Sales Invoice/Credit Memo (§3.3), and now printed on the invoice PDF's totals block. |
| The breakdown is actually deliverable on an invoice document | ✅ / ⚠️ | **Closed for Sales Invoice.** A "Download PDF" button (view mode only, `salesInvoice/form/+page.svelte`) calls `invoicePdfService.ts`'s `generateSalesInvoicePdf()` — client-side `pdfmake` (no server; this is a static-hosted SPA, §2.6), builds seller/buyer blocks, line items, and the VAT/withholding/total breakdown, downloads a real `.pdf`. **Credit Memo, APV, and Receiving Report still have no printable output** — the same helper is designed to extend to them but hasn't yet; only Sales Invoice is done. `window.print()` still separately exists only on the 5 financial report pages (`ReportContainer.svelte`, §2.4), unrelated to this. |
| "VAT-exempt sale" / "zero-rated sale" stamped on the face of qualifying invoices | ✅ | The PDF's totals block only renders the Zero-Rated/VAT-Exempt line when that invoice actually has a nonzero amount in that category. |
| Current 12% VAT rate | ✅ | Matches the standing statutory rate (§5.1), though hardcoded at every call site rather than configurable — fine today, a real maintenance risk the day the rate ever changes. |

### 8.2 Withholding tax (Expanded/Creditable Withholding Tax, RR 2-98 as amended) & BIR Form 2307

| Requirement | Status | Notes |
|---|---|---|
| EWT withheld and netted against amount due | ✅ | Sales Invoice, Credit Memo, and APV all compute `lessWithholding` and reduce the amount due by it (§3.3/§3.4); APV's journal entry correctly credits a withholding-tax-payable account rather than double-booking it (§4.2, fixed this session). |
| EWT rate coverage | ✅ / ⚠️ | `withholdingTax.ts`'s `WITHHOLDING_TAX_OPTIONS` (§2.5) now covers the common RR 2-98 (as amended) categories — goods, services, rentals, professional/talent fees by payee type and gross-receipts threshold, commissions, contractors — not just the original 1%/2%. Still not exhaustive against the full schedule (top-withholding-agent-specific rates, less-common categories aren't enumerated), and nothing validates that the category selected actually matches the transaction's real nature — it's a rate picklist, not a rules engine. |
| Issuance of BIR Form 2307 (Certificate of Creditable Tax Withheld at Source) to payees | ❌ | PDF capability now exists (§8.1) but only for Sales Invoice — no 2307-specific template has been built yet, even though the underlying data (payee, amount, rate, period, via APV's `lessWithholding`/`withholdingTax`, §3.4) is there. `invoicePdfService.ts` is the natural place to extend for this. |

### 8.3 CAS system/technical requirements

Modern BIR guidance for a Computerized Accounting System (Acknowledgment Certificate process, replacing the old Permit-to-Use as of Dec 2020) expects: sequential/non-duplicative/non-reusable numbering, a non-resettable cumulative audit trail logging every add/edit/delete with user ID and timestamp, access controls, and backup/recovery.

| Requirement | Status | Notes |
|---|---|---|
| Sequential/non-duplicative numbering | ⚠️ | See §8.1 — real but not airtight. |
| Non-resettable audit trail of every add/edit/delete, with user + timestamp | ✅ / ⚠️ | `auditLogs` (flat top-level collection, `auditLogService.ts`, viewer at `/admin/auditLog`) now records every create/update/delete anywhere in the app — action, collection path, doc ID, actor (uid/email/displayName), timestamp, and for deletes a full pre-delete snapshot of the document. Written from the single choke point in `firestoreCrud.ts`'s three primitives (§2.2), plus the one identified bypass site (`accountingService.ts`'s journal-entry regenerate-on-edit, now routed through `deleteDocFromCollection` instead of a raw `deleteDoc`). `firestore.rules` makes the collection create-only — `allow update, delete: if false` — so not even an admin can alter or erase an entry once written; only admins can read it. Not full field-level diffing (an 'update' entry doesn't record the before/after values, only that an update happened, by whom, when), and **`/admin/resetTransactions`'s bulk wipe is deliberately excluded** — confirmed testing-only, not part of this trail. "Audit Trail" (§4.4, sidebar-labeled "Transaction Journal") remains a separate read-only viewer over `journalEntries`, not this log. |
| Access controls | ✅ / ⚠️ | Admin Tools (§4.7) added real `admin`/`user` roles enforced both client-side and in `firestore.rules` — genuine progress from having none — but it's still a single binary split (§1.1), and `firestore.rules`' actual deployed state is unverified as of this writing (§1.1). |
| Backup/recovery | ⚠️ | Firestore itself is durable/replicated infrastructure, but there's no in-app export-everything/backup feature. More pressingly, the app ships a one-click **Reset Transactions** admin tool (§4.7) that permanently, irreversibly deletes all transactional data with no soft-delete and no undo — confirmed as a testing-only tool, deliberately left outside the audit trail above and outside scope for retention hardening. |
| Retention of books/records in readable electronic form for the statutory retention period | ✅ (by default) | Firestore retains data indefinitely absent explicit deletion — undermined only by the Reset Transactions tool immediately above. |

### 8.4 Statutory books of accounts

BIR requires, at minimum, a General Journal, General Ledger, Cash Receipts Journal, and Cash Disbursements Journal; VAT-registered taxpayers additionally need a Sales Journal and Purchase Journal. A CAS Acknowledgment Certificate application itself asks for sample General Ledger and Journal reports.

| Book | Status | Notes |
|---|---|---|
| General Journal | ✅ / ⚠️ | The universal `journalEntries` collection (§3.6) plus its Audit Trail viewer (§4.4) functions as a combined general journal — every posted entry, from every module, in one place. Reasonable coverage. |
| General Ledger (per-account chronological detail with running balance) | ✅ | `/accounting/reports/generalLedger` (`getGeneralLedgerData`, §5.4) — grouped by account (not one flat date-interleaved feed — each account's activity reads together, chronological within the group), each account opening with a "Beginning Balance" line carried forward from all posted activity *before* the queried range rather than resetting to zero at the period start, then a running balance per line. Optional single-account filter. |
| Cash Receipts Journal / Cash Disbursements Journal | ✅ | `/accounting/reports/cashReceiptsJournal` / `cashDisbursementsJournal` (`getCashReceiptsJournalData`/`getCashDisbursementsJournalData`, §5.4) — one row per posted Receipt/Vendor Payment, with the offsetting (non-cash) account resolved from the underlying journal entry's lines. |
| Sales Journal / Purchase Journal | ✅ / ⚠️ | `/accounting/reports/salesJournal` / `purchaseJournal` (`getSalesJournalData`/`getPurchaseJournalData`, §5.4) — one row per posted Sales Invoice/APV, joined back to the source document for the canonical invoice/APV number and VAT figures. Sales Journal has the full vatable/zero-rated/exempt/output-VAT breakdown (Sales Invoice stores it); Purchase Journal only has net/input-VAT/total, since APV has no equivalent vatable/zero-rated/exempt split (§3.4) — Credit Memos and Receiving Reports aren't included in either. |

All five now exist as real report views built on `getJournalEntries(dateRange)` (§5.4) — the tractable part of this gap (no new data capture needed) is closed. Remaining caveats: joins back to source documents do one Firestore read per journal entry in range (fine at this app's scale, consistent with the rest of `reportingService.ts`'s style, §5.4); "Account" on the two cash journals is inferred by a name-substring heuristic (excludes anything matching `/cash|bank/i`), the same style of heuristic already used elsewhere in this file, not a stored field.

### 8.5 Chart of Accounts / financial statement classification

| Requirement | Status | Notes |
|---|---|---|
| Balance Sheet current/non-current asset & liability classification (PFRS for SMEs) | ✅ | `fsClassification`'s 11 values (§5.5) — Current Asset, Non-Current Asset, Current Liability, Non-Current Liability, Equity, Revenue, Cost of Sales, Operating Expense, Other Income, Other Expense, Tax — is exactly this scheme. Genuinely solid ground; this is the strongest-aligned part of the system. |
| Reasonable COA granularity | ✅ | `accountType`'s 15-value taxonomy (§5.5) mirrors QuickBooks' account types, which is itself a widely-used structure among PH SMEs in practice — not a PH-specific standard, but a sensible, familiar one. |
| Data migrated to the current classification | ⚠️ | Accounts saved before this taxonomy was standardized may still carry stale `fsClassification` values and won't classify correctly until re-saved (§5.5, "Not migrated"). |

### 8.6 Scope boundary: VAT-registered businesses only

The system computes 12% VAT unconditionally on every vatable line and has no Non-VAT/percentage-tax mode (the ≤₱3M-threshold Section 116 percentage tax) or 8% flat-income-tax-rate election path. This isn't a defect so much as an unstated scope boundary worth making explicit: as built, DigiSoft CAS fits a VAT-registered business, not a non-VAT one, without modification.

### 8.7 Summary scorecard

| Area | Verdict |
|---|---|
| Sales Invoice (not OR) as the VAT document | ✅ Compliant |
| Seller registration details on invoice | ⚠️ Partial — `/admin/companyProfile` now captures the data, nothing prints it yet |
| Printable/PDF invoice, credit memo, 2307 output | ✅ / ⚠️ Sales Invoice done (`invoicePdfService.ts`), Credit Memo/APV/2307 not yet |
| VAT computation & vatable/zero-rated/exempt breakdown (data layer) | ✅ Compliant |
| VAT rate | ✅ Compliant (hardcoded 12%) |
| Sequential document numbering | ⚠️ Partial — real concurrency gap |
| EWT computation & posting | ✅ Compliant |
| EWT rate coverage | ✅ / ⚠️ Common categories covered, not exhaustive |
| BIR Form 2307 issuance | ❌ Gap — no 2307-specific template built yet (PDF infra now exists) |
| Non-resettable audit trail (who/what/when) | ✅ / ⚠️ `auditLogs` + `/admin/auditLog`, create-only by rule; not field-level diffing, resetTransactions excluded |
| Access controls | ⚠️ Partial — binary role only, deployed rules unverified |
| Reset Transactions vs. retention requirement | ⚠️ Tension — irreversible, no soft-delete |
| Statutory books: General Journal | ✅ / ⚠️ Reasonable |
| Statutory books: General Ledger, Cash Receipts/Disbursements Journal, Sales/Purchase Journal | ✅ All five report views now exist (§8.4) |
| Chart of Accounts / FS classification | ✅ Compliant |
| Non-VAT/percentage-tax support | — Out of scope |

Sources consulted (2026-08-15): [HashMicro — BIR Computerized Accounting System Guide](https://www.hashmicro.com/ph/blog/bir-computerized-accounting-system/), [UNA Tax & Accounting — BIR Requirements for CAS and CBA Compliance in 2025](https://una-acctg.com/2025-bir-requirements-cas-cba/), [Grant Thornton — EOPT on CAS: Acknowledgment Certificate](https://www.grantthornton.com.ph/insights/articles-and-updates1/lets-talk-tax/eopt-on-computerized-accounting-system-cas-to-secure-or-not-to-secure-new-acknowledgment-certificate/), [Manila Times — How to comply with the BIR's invoicing requirements](https://www.manilatimes.net/2025/05/08/business/top-business/how-to-comply-with-the-birs-invoicing-requirements/2108093), [Rappler — Ease of Paying Taxes law: invoicing requirements](https://www.rappler.com/business/personal-finance/things-to-know-ease-of-paying-taxes-law-invoicing-requirements/), [CloudCFO — Sales Invoices in the Philippines (2026 Update)](https://cloudcfo.ph/blog/sales-invoices-in-the-philippines-is-your-business-complying), [Grant Thornton — BIR Revises Withholding Tax Rates for Top Withholding Agents](https://www.grantthornton.com.ph/insights/articles-and-updates1/tax-notes/bir-revises-withholding-tax-rates-for-top-withholding-agents/), [CloudCFO — Withholding Tax Philippines Guide](https://cloudcfo.ph/resources/ph-taxes/withholding-tax), [Juan.tax — BIR Form 2307](https://juan.tax/form-2307/), [Respicio & Co. — Procedure for Requesting a New BIR CAS Permit](https://www.respicio.ph/commentaries/procedure-for-requesting-a-new-bir-computerized-accounting-system-cas-permit), [FilipiKnow — Books of Accounts BIR Guide](https://filipiknow.net/books-of-accounts-bir/).
