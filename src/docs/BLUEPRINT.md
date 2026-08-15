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

1. **RBAC is basic: a binary `admin`/`user` role plus an `isActive` flag** (Admin Tools, §4.7), enforced both client-side and in `firestore.rules`. What's missing is any finer-grained permission model (e.g. bookkeepers who can post but not void, or per-transaction-type rights) — today it's admin or non-admin, nothing between. Building that out is a product-scope decision.
2. **No inventory quantity/stock ledger exists anywhere in the codebase.** "Inventory Adjustment" and "Receiving Report" are both purely GL/value postings; neither touches an item's on-hand quantity (there is no on-hand-quantity field on the Item schema at all). This is a real feature to design and build (schema, which transactions move stock, what reports are needed) — it needs product scoping before implementation.

**Check `firestore.rules`' expiry first** in any "the app isn't saving/loading data" investigation, before debugging application code — it has expired before, silently blocking all reads/writes.

**`firestore.rules` has real, role-aware rules (§4.7) — but whether they're actually deployed is unverified.** The file has a note at its top explaining why: the app's Firestore rules have historically also been edited directly in the Firebase Console, bypassing this repo entirely, so the committed file may not match what's actually live. Check before assuming either way, and don't `firebase deploy --only firestore:rules` blind.

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
- Exceptions to the single-form pattern: **Credit Memo, Receive Payment, and Vendor Payment** have genuinely separate, hand-built `view/+page.svelte` read-only pages (not a redirect, not the form-in-view-mode) that independently re-fetch the document and re-implement their own display markup (own `onMount` fetch, own `handleEdit`/`handleBack`). None of the three has an `[id]` folder at all — the form-in-view-mode branch each of their `form/+page.svelte` also happens to support internally is effectively unreachable via normal navigation, since every list page's `viewButtonPath` points at the separate `view/` page instead. **Sales Invoice, APV, Inventory Adjustment, and Receiving Report** reuse the form component itself for viewing (`disabled={isViewMode}` throughout) — Receiving Report and Inventory Adjustment in particular have no `view/` directory of any kind, just `form/` and `list/` (§4.3, §6).

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

**The trap:** because the map's fallback is `|| 'listdatabase'`, calling a 2-segment path whose first segment *isn't* a map key (e.g. `'transactions/creditMemo'`, `'inventory/adjustments'`) silently resolves to `listdatabase/transactions/creditMemo` or `listdatabase/inventory/adjustments` — a plausible-looking but *wrong* path that fails silently (empty query results, `null` doc reads) rather than throwing. **When writing new code, either use the full, explicit 3-segment path, or double-check that the first segment of any 2-segment path is actually one of `masterlist | otherlist | customerCenter | vendorCenter | accounting`.**

**The other outlier:** Inventory Adjustment's *form* (not its broken view page) uses the 4-argument call form `addDocToCollection('inventory', 'transactions', 'adjustments', data)`, which is `firestoreCrud.ts`'s explicit "Case 1: three-level format" — this makes `'inventory'` a literal **top-level root collection**, sitting outside `listdatabase` entirely and outside the `ROOT_COLLECTION_MAP` pattern used everywhere else. Real path: **`inventory/transactions/adjustments`** (collection `inventory` → doc `transactions` → subcollection `adjustments`). This is intentional-but-inconsistent; don't "fix" it to match the masterlist/otherlist convention without also updating every reader.

`firestoreCrud.ts` exports: `addDocToCollection`, `updateDocInCollection` (always `setDoc(..., {merge:true})` — never a destructive overwrite), `deleteDocFromCollection`, `getDocFromCollection`, `queryCollectionDocs(path, FilterCondition[])`. All accept either the segmented-path string form or explicit multi-argument forms; see the file for the exact overload behavior summarized above.

**Every branch of `addDocToCollection`/`updateDocInCollection`/`deleteDocFromCollection` also calls `writeAuditLog()`** (`auditLogService.ts`, §8.3) after the real Firestore operation succeeds — this is the audit trail's single choke point. `deleteDocFromCollection` additionally `getDoc`s the target *before* deleting it so the audit entry can carry a full snapshot of what was removed. Code that bypasses these three functions and talks to `firebase/firestore` directly silently skips the audit trail — don't add a new one without either going through these functions or calling `writeAuditLog()` manually.

`firestoreStores.ts` exports `collectionStore(parentCollection, subCollectionName, queryOptions?, rootCollection?)` — a Svelte `readable` wrapping a live `onSnapshot` listener, used by `FireTable` and every option-store factory. Same path-resolution rules apply.

### 2.3 Auth flow

`src/routes/+layout.svelte`: on mount, subscribes to `onAuthStateChanged` (using `src/lib/firebase.ts`). If unauthenticated and not on `/`, redirect to `/`. If authenticated and on `/`, redirect to `/main/dashboard`. Renders `<Sidebar/>` + wrapped `<main>` only when a user is present and not on `/`; otherwise renders a bare `<slot/>` (the login page, `src/routes/+page.svelte` → `<LoginForm/>`). Every `onAuthStateChanged` firing also calls `loadUserProfile()` (§4.7) — if the resulting profile has `isActive:false`, it force-signs the user back out immediately. Beyond that and the `/admin/*` route guard (§4.7), there is no per-route or per-role gating anywhere else in the app — every non-admin route trusts that if you're rendering, you're an authenticated, active user, nothing more specific.

**The actual post-login redirect has two independent hops, not one.** `LoginForm.svelte`'s `handleLogin` calls `goto('/main')` on success — not `/main/dashboard` directly — landing on `main/+page.svelte`, a ~5-line stub whose only job is `onMount(() => goto('/main/dashboard'))`. `+layout.svelte`'s own `onAuthStateChanged`-driven redirect (described above) is a *second*, separate path to the same destination, used for the hard-refresh-while-already-authenticated case rather than the fresh-login case. Both exist; neither is dead.

`src/routes/+error.svelte`: a 404 (`$page.status === 404`) renders a friendly "Under Construction" panel rather than a generic error. `src/routes/[...catchall]/+page.svelte`: catches any unmatched path *within* the route tree and renders the identical "Under Construction" UI (duplicated markup, not a shared component) — so broken/future sidebar links degrade gracefully instead of 404ing.

### 2.4 Shared component library (`src/lib/components/`)

| Component | Role |
|---|---|
| `FireTable.svelte` | Realtime table bound directly to a `collectionStore`. Auto-formats: date-like keys, PHP currency for the **hardcoded key allowlist** `amount/totalDue/grossAmount/netSales` only (a `col.type:'currency'` declaration elsewhere is silently ignored — confirmed dead config on Inventory Adjustment's list), and colored pills for a `status` column. Supports optional parent/child hierarchy rendering via a `parentId` field (used by Chart of Accounts for sub-accounts). |
| `ListContainer.svelte` | Full list-page chrome for **transactions**: summary cards (Total/Posted/Draft/Pending/Overdue), search+status+date filters, buttons, wraps `FireTable`. Posted/Draft counts query Title-Case `'Posted'`/`'Draft'`, matching what every transaction form actually saves. Pending/Overdue are derived client-side from the already-fetched total snapshot: any document whose status is neither `'draft'` nor `'paid'` (case-insensitive) counts as pending — covering Sales Invoice's `Unpaid`/`Partially Paid` and APV's `Posted`/`Partially Paid` alike — and of those, one past its `dueDateField` counts as overdue. |
| `MasterListContainer.svelte` | Simpler list-page chrome for **masterlist/otherlist** entities: search only, `New {X}` button, delegates edit/delete to a slot. No summary cards. |
| `ModalForm.svelte` | Generic add/edit modal driven entirely by a `fields: [{label,name,type,options,required,section}]` config array — used by every masterlist/otherlist page. `section:'advanced'` fields render in a second column. |
| `FormLayout.svelte` | Page chrome for transaction forms: back button + title + white card wrapper + `<form>`. |
| `FormSection.svelte` | Groups fields under a heading; `isItemTable=true` mode delegates straight to `TxnItemTable` for line-item grids. |
| `TxnFields.svelte` | Renders a `fields[]` array in a responsive 1–3 column grid; fields can be pinned to the same visual row via a `row` key. |
| `TxnItemTable.svelte` | The editable line-item grid (add/remove rows, per-cell text/number/select inputs, accounting-formatted `amount` column with comma-formatting on blur). Its `rows` prop is one-way (`rows={items}`, not `bind:rows`); when it receives zero rows it calls `onAdd()` — the same callback the "+ Add Item" button uses — rather than synthesizing a row locally, so the first row always lands in the parent's real array. See §7 point 11 for the bug this replaced. |
| `FormFooter.svelte` | Bottom bar: Save/Cancel buttons **and** (when `summaryMode="transaction"`) a self-contained Gross/Discount/Net/VAT/Vatable/Zero-rated/Exempt/Withholding/Total summary panel that **independently recomputes its own totals from `lineItems`** rather than purely trusting the parent's numbers (parent-supplied `grossAmount`/`vat`/etc. props override the internal computation when passed). The internal fallback computation filters `lineItems` by `taxType === 'vat'`/`'zero'`/`'exempt'` literal values that no form's `taxType` field (a Firestore option id) ever actually equals, so any form that doesn't pass explicit totals gets a silently-wrong VAT figure — Sales Invoice and APV both pass their own computed `grossAmount`/`discount`/`netSales`/`vat`/`vatableSales`/`lessWithholding`/`totalDue`/etc. explicitly rather than relying on the fallback. `showWithholding` (default `true`) gates both the withholding `<select>` and the "Less: Withholding Tax" line — not every transaction type has a withholding concept in the accounting engine (Receiving Report never did; see `createReceivingReportJournalEntry`, §5.2). Pass `showWithholding={false}` for a transaction type without real withholding logic, don't just omit the other withholding props. |
| `reports/ReportContainer.svelte` | Generic wrapper for the 5 financial report pages: date-range **or** as-of-date parameter inputs, a `generateReport` event, a `print` button (`window.print()`), an `export` event (each report page implements its own hand-rolled CSV, not a shared exporter). |
| `Sidebar.svelte` | Static, hardcoded nav tree (not data-driven) mirroring the route structure; highlights active section by `$page.url.pathname` prefix match. Structure: Dashboard (direct link) → Masterlist (dropdown) → Customer Center (dropdown) → Vendor Center (dropdown) → Reports (dropdown) → Inventory (dropdown) → Accounting (dropdown) → Other List (dropdown) → Admin Tools (dropdown, `$isAdmin`-gated). "Chart of Accounts" appears twice (once under Masterlist, once under Accounting) — both real links to the same page, not a bug. |
| `LoginForm.svelte` | Email/password form calling `signInWithEmailAndPassword` directly. |

Every top-level nav section (Masterlist, Customer Center, Vendor Center, Reports, Inventory, Accounting, Other List, Admin Tools) is a dropdown-toggle `<button>` straight to its leaf pages — none of them is itself a link to an index/hub page, so there's no `/masterlist`, `/otherlist`, or `/admin` landing route to visit directly; going to one of those URLs falls through to the catch-all "Under Construction" page (§2.3) like any other undefined route.

### 2.5 Shared utility library (`src/lib/utils/`)

| File | Role |
|---|---|
| `firestoreCrud.ts` | See §2.2. |
| `firestoreStores.ts` | See §2.2. `collectionStore()`. |
| `firestoreOptions.ts` | `createFirestoreOptionsStore(collectionName, labelKey='name', valueKey='id', includeRawData=false)` — the workhorse option-store factory used by nearly every form. **Bare collection names** (no `/`) are routed by a hardcoded array check: `['customers','items','vendors','othernames'].includes(name)` → `masterlist/{name}`, else → `otherlist/{name}`. Note the array says `othernames` while the real page/collection is `masterlist/others` — calling `createFirestoreOptionsStore('others')` bare would mis-resolve to `otherlist/others` (doesn't appear to be called this way anywhere today, but is a trap for new code). Also exports a small set of pre-built, rarely-used legacy stores (`customerOptionsStore`, `itemOptionsStore`, etc.) built directly off `collectionStore`, kept for backward compatibility. |
| `optionStores.ts` | A second, smaller registry of pre-built stores (`categoryOptions`, `unitOptions`, `customerOptions`, `termsOptions`, `paymentMethodOptions`, `itemOptions`, `taxTypeOptions`) built via `createFirestoreOptionsStore`. Functionally overlapping with the legacy stores in `firestoreOptions.ts` — most forms actually call `createFirestoreOptionsStore(...)` directly inline rather than importing from either registry file, so both files are partially vestigial; don't assume every form uses them. |
| `itemAutofill.ts` | `resolveItemAutofill(selectedOption)` — the one place that knows the real `masterlist/items` field names (`description`, `unit_id`/`unit_name`, `sales_price`/`purchase_price`, ...). Every item-linked line-item table (Sales Invoice, Credit Memo, Receiving Report, Inventory Adjustment) calls this when its Item combobox changes, instead of re-deriving its own fallback chain. See §7 point 7 for why this exists and the reactivity gotcha it doesn't (can't) solve on its own. |
| `accountTypes.ts` | The canonical Chart-of-Accounts taxonomy — `ACCOUNT_TYPES` (15 QuickBooks-style values), `normalizeAccountType()`, `getAccountTypeDef()`, `getAccountCategory()`, `formatAccountType()`. See §5.5. |
| `accountFilters.ts` | `filterAccountsByType(accounts, category, emptyLabel?)` — filters a raw Chart-of-Accounts option list (from `createFirestoreOptionsStore('masterlist/accounts', ..., true)`) down to one or more broad categories (`'liability'`, `['cogs','expense']`, ...) via `accountTypes.ts`'s `getAccountCategory()`, formatted as `{label, value}`. Used by APV's AP Account/Expense Account dropdowns and the Items masterlist's income/expense/inventory/cogs account pickers. Optional third arg returns a single placeholder option instead of `[]` when nothing matches, so a genuinely-empty Chart of Accounts of that category reads as a hint rather than a silently-empty dropdown. |
| `withholdingTax.ts` | `WITHHOLDING_TAX_OPTIONS` — the RR 2-98 (as amended) rate schedule every transaction type with a real withholding concept (Sales Invoice, Credit Memo, APV) passes to `FormFooter`'s `withholdingTaxOptions` prop. Covers the common categories in practice: 1% goods, 2% services/contractors, 5% rentals, 5%/10%/15% professional/talent fees (by payee type and gross-receipts threshold), 10% commissions. `value` stays a plain percent string (multiple labels intentionally share a value, e.g. two 2% categories) — every calc site does `parseFloat(value)/100 * amount` and doesn't care which category produced the rate. |
| `accountingService.ts` | All journal-entry generation, plus `voidJournalEntriesForSource(sourceType, sourceId)` — deletes a source transaction's posted journal entry(ies), used when a transaction is edited back down to a non-posting status like Draft — and `postJournalEntryOrRollback({postFn, rollbackFn, isCreate})` — the non-atomic-write mitigation every generator-backed form's save handler now routes through (§5.2). See §5/§5.6. |
| `reportingService.ts` | All report aggregation (Trial Balance, Balance Sheet, Income Statement, AR/AP Aging) plus the `AccountType`/`FSClassification` enums. See §5.4. |
| `documentIdService.ts` | `generateNextDocumentId(DocumentType)` — sequential document numbering via a real transactional counter document. See §5.3. |
| `formatters.ts` | `formatCurrency` (₱, `en-PH`), `formatDate`, `formatDateForInput`, `formatNumber`, `formatQuantity`. All handle both JS `Date` and Firestore `{seconds,nanoseconds}` timestamp shapes. |
| `csvExporter.ts` | `convertToCSV`, `downloadCSV`, `exportFirestoreCollectionToCSV`. **Only actually used by the masterlist CSV-import/export buttons** (Accounts/Customers/Items/Vendors/Others). Every report page and Audit Trail/Tax Reporting instead hand-roll their own Blob/`<a download>` CSV export inline, duplicating this same pattern rather than reusing it. |
| `csvParser.ts` | `parseCSV`/`parseCSVToRecords` — a real quoted-field-aware CSV parser (handles embedded commas/quotes), used by the masterlist CSV importers. |
| `fileEncoding.ts` | `readFileAsTextSmart(file)` — tries UTF-8/Windows-1252/ISO-8859-1 and picks whichever produces the fewest `U+FFFD` replacement characters. Used by Accounts/Customers/Vendors CSV import; Items/Others CSV import use plain `file.text()` instead (inconsistent, but low-impact). |
| `adminService.ts` | Admin Tools' backing service — user account creation (via a throwaway secondary Firebase app instance, §4.7), profile role/active updates, password-reset emails, and the bulk `resetAllTransactions` delete. See §4.7. |
| `companyProfileService.ts` | `getCompanyProfile()`/`saveCompanyProfile()` — the business's own BIR identity, a singleton doc at `listdatabase/companyProfile`, admin-write-only. See §4.7. |
| `auditLogService.ts` | `writeAuditLog()`/`getAuditLogs()` — the audit trail. `writeAuditLog` is called internally by `firestoreCrud.ts`'s three primitives (create/update/delete), not by page code directly. See §4.7/§8.3. |
| `documentPdfService.ts` | `generateSalesInvoicePdf`/`generateCreditMemoPdf`/`generateApvPdf(data, companyProfile, action)` — client-side `pdfmake` document generation (fonts shipped via `pdfmake/build/vfs_fonts`, no server involved — this is a static-hosted SPA, §2.6). Each shares a common header builder (Company Profile seller block + doc title/number/dates) and a common `emit()` that either `.download()`s a real `.pdf` file or `.print()`s it directly (opens the browser print dialog against the same generated document — no separate printable-HTML layout, one document definition drives both actions). Only Sales Invoice, Credit Memo, and APV are wired up (their respective view/edit UIs, see §4.1/§4.2); BIR Form 2307 isn't. See §8.1. |

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
`code*, name*, description, accountType* (15-value QuickBooks-style taxonomy — `bank`, `accounts-receivable`, `accounts-payable`, ... — see §5.5), fsClassification (current-asset|non-current-asset|current-liability|non-current-liability|equity|revenue|cost-of-sales|operating-expense|other-income|other-expense|tax — see §5.5), parentId (self-referencing, drives FireTable's hierarchy rendering), parentName (denormalized), glCode, glName, slCode, slName, isActive (bool, default true), isSystem (bool; purely informational — does not restrict editing or deletion, an explicit product decision; the only place it's still set is `reportingService.ts`'s auto-created "Retained Earnings" account, §5.4), createdAt, updatedAt`.

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

**`payments`** (Vendor Payment) — `vendor, vendorName, paymentNo (VP+9digits, only included in create mode — omitted entirely on update rather than set to `undefined`, since Firestore's `setDoc` rejects `undefined` field values and this app doesn't set `ignoreUndefinedProperties`; setting it to `undefined` on every edit would make the update call throw before anything else in the save runs), paymentDate (Date), paymentMethod, paymentMethodName, reference, memo, amount, billPayments[] ({billId,billNo,originalAmount,amountPaid}), status (always 'Posted'), createdAt (create mode only, same reason), updatedAt`. No tax/discount math at all — pure cash-out + allocation record, same shape as Receive Payment. Its outstanding-bills query filters by vendor and excludes `'draft'`/`'paid'` statuses client-side (matching Receive Payment's outstanding-invoice convention), so a partially-paid APV stays visible for further payment rather than disappearing the moment its status leaves `'Posted'`. On save (create **and** edit), a delta-based helper decrements each allocated APV's `totalAmountDue` and updates its status; edit-mode also calls `createVendorPaymentJournalEntry`, which — per its dedup behavior in §5.2 — returns the existing entry's id unchanged rather than re-syncing amounts if one already exists.

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

### 3.7 Cross-transaction links — what actually references what

Every transaction links to **exactly one** thing automatically: its own generated journal entry, via `sourceType`/`sourceId` on the `journalEntries` document (§3.6) — this is the one universal link, and it's one-directional in storage (the JE points back at its source; the source document never stores its JE's id, except Credit Memo and Receiving Report, §5.2's "writes `journalEntryId` back?" column). Beyond that, real inter-transaction links are narrow and specific:

| Link | Carried on | Row shape | UI navigation between the two? |
|---|---|---|---|
| Receive Payment → Sales Invoice(s) it pays | `receipts.invoicePayments[]` | `{invoiceId, invoiceNo, originalAmount, amountPaid}` | **One direction**: the Receipt view page's Invoice No. cell links to `salesInvoice/form?id=...&viewMode=true` when `invoiceId` is present. No link the other way (Sales Invoice's view has no "payments applied against this" section). |
| Receive Payment → Credit Memo(s) applied as payment | `receipts.appliedCredits[]` | `{id, type:'credit_memo', reference, appliedAmount}` | **No** — `appliedCredits[]` isn't even rendered on the Receipt view page at all, let alone linked. |
| Receive Payment → prior Receipt's unapplied balance ("advance payment") applied as payment | `receipts.appliedCredits[]` | `{id, type:'advance_payment', reference, appliedAmount}` | **No**, same as above — a Receipt can reference *another* Receipt this way, with no navigation to it. |
| Vendor Payment → APV(s) it pays | `payments.billPayments[]` | `{billId, billNo, originalAmount, amountPaid}` | **One direction**: the Payment view page's Bill No. cell links to `apv/form?id=...&viewMode=true` when `billId` is present. No link the other way (APV's view has no "payments applied against this" section). |
| *(intended, not implemented)* Credit Memo → the Sales Invoice it credits | `creditMemos.invoiceId`/`invoiceNo` fields still exist in the schema and their load/handler code is still present | — | The UI for selecting/showing this link was explicitly removed (in-code comment); the fields are dead-but-present (§3.3, §6). |

**Explicitly *not* linked, despite both hitting the same AP liability:** Receiving Report and APV. Confirmed by reading Receiving Report's form component in full — no `apvId`, `apvNo`, or any APV-related field, import, or query exists anywhere in it. The two are independent purchase-side postings (RR books Dr. Inventory/Cr. AP for goods received; APV books the expense/liability side for the vendor's actual bill) with no data-level relationship connecting a specific RR to the APV that eventually settles the same purchase — matching a purely value-based, not document-matched, purchasing flow.

**Still no reverse-direction navigation anywhere** — a Sales Invoice's view has no section listing the Receipts that partially paid it, and an APV's view has no section listing the Vendor Payments applied to it. Building that would need a new query shape (find every Receipt/Vendor Payment whose `invoicePayments[]`/`billPayments[]` contains this document's id — not a natural Firestore query against an array of objects) rather than just a template change, so it's out of scope for the one-directional fix above.

---

## 4. Module Walkthroughs

### 4.1 Customer Center

| Transaction | Collection | Doc-number prefix | Draft support | JE generator | JE ID written back? |
|---|---|---|---|---|---|
| Sales Invoice | `transactions/customerCenter/salesInvoices` | `INV` | Yes (only one with a working Save-as-Draft) | `createSalesInvoiceJournalEntry` (simplified single-entry variant; a `createDetailedSalesInvoiceJournalEntries` 3-entry variant exists in `accountingService.ts` but is never called by the form) | No |
| Credit Memo | `transactions/customerCenter/creditMemos` | `CM` | No (always saved `Posted`) | `createCreditMemoJournalEntry` | **Yes** |
| Receive Payment | `transactions/customerCenter/receipts` | `PR` | No (always `Posted`) | `createReceiptJournalEntry` | No |

**Sales Invoice — UI fields**: header `fields[]` — Cash Sale (select, Yes/No), Customer (select, `required`), Invoice Date (date, `required`), Due Date (date, `required`, auto-computed from Payment Terms), Payment Terms (select), Payment Method (select, hidden via a `class` toggle unless Cash Sale is Yes), PO # (text). Line `columns[]` — Item (select), Description (text), Unit (select), Qty (number), Price (number), DSC % (select against `otherlist/discounts`), Tax Type (select against `otherlist/tax`), Amount.

**Credit Memo — UI fields**: header `fields[]` — CM No (text, `required`, disabled once in edit mode), CM Date (date, `required`), Customer (select, `required`), Reference (text). Line `columns[]` — Item (select), Description (text), Quantity (number), Unit (select), Unit Price (number), DSC % (select), Tax Type (select), Amount.

**APV — UI fields**: header `fields[]` — Supplier (select, `required`), AP Account (select against liability-category accounts, `required`), APV Date (date, `required`), Due Date (date, `required`), Payment Terms (select), Payment Method (select), Reference # (text), PO # (text). Line `columns[]` — Account (select against expense-category accounts), Cost Center (select against `otherlist/costcenters`), Description (text), Amount (number, base pre-discount price), DSC % (number, plain input — not a select against `otherlist/discounts` the way every other form's discount column is), Tax Type (select), Total.

**Printing**: Sales Invoice (`salesInvoice/form/+page.svelte`) has "Print" and "Download PDF" buttons in `FormLayout`'s header-actions slot, shown whenever the invoice has been saved (`!isCreateMode` — both view **and edit** mode, not view-only), calling `documentPdfService.ts`'s `generateSalesInvoicePdf()` (§8.1). Fetches `companyProfileService.getCompanyProfile()` for the seller block and, if the invoice has a linked customer, a live `masterlist/customers` read for buyer address/TIN (not otherwise loaded into this form). Line items prefer each saved line's own `itemName`/`unitName` over a fresh option-store lookup, so the PDF reflects what the item/unit were actually called at save time. Credit Memo has the same buttons on its separate hand-built view page (`creditMemo/view/+page.svelte`, below) via `generateCreditMemoPdf()` — its PDF has no vatable/zero/exempt breakdown line since that data isn't persisted for Credit Memo (§8.1).

**Post-save navigation**: every transaction type lands on the just-saved document after a successful save, rather than the list — Sales Invoice/APV/Inventory Adjustment/Receiving Report/General Journal navigate to their own `?viewMode=true`; Credit Memo/Receive Payment/Vendor Payment (whose form and view are separate pages, §2.1) navigate to their `view?id=...` page. This matters because the Print/Download PDF buttons (§8.1) only render once a document has a saved ID, so landing anywhere else would mean never being able to reach them right after saving.

**Sales cycle in practice:** Sales Invoice creates AR (or, if `cashSale`, an "Undeposited Cash" debit and immediate `status:'Paid'`) → Receive Payment allocates cash/credits against outstanding invoices and, on **both create and edit**, updates each allocated invoice's `totalDue`/`status` (`Partially Paid`/`Paid`) via a delta-based helper (`applyInvoiceBalanceDeltas`) that adjusts by the *change* in allocation since the receipt was loaded, rather than re-applying the full current amount on every save. The same delta approach applies to credit-memo/advance-payment `appliedAmount` tracking (`applyCreditDeltas`) — re-adding the full amount on every edit would double-count a credit that hasn't actually changed. Credit Memo reverses revenue/VAT against AR; Receive Payment's "Apply Credit" flow reads/writes Credit Memos and prior Receipts at their real Firestore paths (§3.3).

**Receive Payment — UI fields and allocation mechanics** (`customerCenter/receivePayment/form/+page.svelte`, separate view page per §2.1): header `fields[]` — Customer (select), Receipt Date (date), Payment Method (select), Amount (number, `onChange` recomputes allocation totals), Reference (text) — **none marked `required: true`**, unlike most other transaction forms; Memo lives outside `fields`, bound directly in `FormLayout`'s header-actions slot like every other form.
- **Outstanding invoices table**: Invoice | Due Date | Amount Due | Credit | Disc % | Tax % | Payable | Payment. `payable = amount − credit − amount·disc% − amount·tax%` (clamped ≥0) is computed live for display only — per §3.3, none of Credit/Disc%/Tax% survive to Firestore, only the final `amountPaid`. An "Auto-Allocate" action greedily fills payment amounts oldest-due-first from the entered Amount plus any applied credit.
- **Apply Credit modal**: lists two pools for the current customer — unapplied Credit Memos (`totalAmount − appliedAmount`) and unapplied prior Receipts ("advance payments", `amount − appliedAmount`) — each row checkbox/amount-input mutates `appliedCredits[]` live; the modal's own footer buttons only close it, they don't separately "confirm" anything.
- Saved allocation row shape: `invoicePayments[]` = `{invoiceId, invoiceNo, originalAmount, amountPaid}` (§3.7). Its view page links each row's Invoice No. straight to that Sales Invoice's view (§3.7).
- Delta functions (exact names): `applyInvoiceBalanceDeltas(current, original)` and `applyCreditDeltas(current, original)` — both diff against a snapshot taken at document load (`originalInvoicePayments`/`originalAppliedCredits`), so repeated edit/save cycles adjust by the *change* only, not the full amount; on create, the "original" snapshot is empty, so the delta equals the full allocation, unifying create/edit into one code path.
- **No Print/Download PDF button** (confirmed — no `documentPdfService` import anywhere in this form or its view page).

**Editing behavior differs by type:** editing a Sales Invoice **deletes and regenerates** its journal entry from scratch (`accountingService.ts` explicitly deletes prior entries for the same `sourceId` before inserting). Editing a Receipt **does not** — `createReceiptJournalEntry` detects an existing entry for the source and just returns its ID unchanged, leaving a stale JE after any allocation edit. Editing a Credit Memo always re-derives amounts and re-posts (no dedup-and-skip logic in its generator, unlike Receipt/APV).

**Hard delete only, everywhere.** Deleting any transaction via `ListContainer` is a true Firestore delete with a plain `confirm()` — no soft-delete/void flag exists — but `confirmDelete()` also calls `voidJournalEntriesForSource()` (`accountingService.ts`, §5.6) right after, mapping the component's `documentType` prop to the matching `sourceType` string so the deleted transaction's journal entry gets removed too, rather than staying posted forever for a document that no longer exists. General Journal is deliberately excluded from this mapping — deleting a GJ entry already deletes the ledger record directly, since that document *is* the journal entry (§4.4). If the void itself fails, the document delete (already committed) isn't rolled back — the user gets a distinct alert telling them to check the General Ledger for an orphaned entry, rather than a silent gap. Deletes can still leave **stale counterpart statuses** (e.g. deleting an invoice that a Receipt already partially paid doesn't touch that Receipt's `invoicePayments[]` entry) — that part of this gap remains open.

### 4.2 Vendor Center

| Transaction | Collection | Doc-number prefix | Ever reaches "Posted"? | JE generator | JE ID written back? | Duplicate-JE guard on re-save? |
|---|---|---|---|---|---|---|
| APV | `transactions/vendorCenter/apvs` | `APV` | **Yes** — primary Save posts `'Posted'`; secondary "Save as Draft" saves `'Draft'` | `createApvJournalEntry` | No | Yes (returns existing ID, doesn't update) |
| Vendor Payment | `transactions/vendorCenter/payments` | `VP` | Always (`'Posted'` unconditionally) | `createVendorPaymentJournalEntry` | No | Yes (returns existing ID, doesn't update) |
| Receiving Report | `transactions/vendorCenter/receivingReports` | `RR` | **Yes** — primary Save posts `'Posted'`; secondary "Save as Draft" saves `'Draft'` | `createReceivingReportJournalEntry` | **Yes** | **Yes** — checks `getJournalEntriesForSource` and returns the existing entry's id, same as APV/Vendor Payment |

**Purchase cycle in practice:** Receiving Report books Dr. Inventory (hardcoded GL account) / Cr. AP for goods received, with no stock-quantity effect. APV books the expense/liability side, now including a real VAT-input debit (12% of net-of-line-discount amount, for any line with a taxType selected) and a real withholding-tax credit that's actually subtracted from the AP credit rather than double-booked (see below). Vendor Payment allocates cash against outstanding APVs by querying vendor + excluding `'draft'`/`'paid'` client-side (so a partially-paid APV stays visible, rather than the previous strict `status=='Posted'` filter that would drop it the instant a payment partially applied). On save it decrements each allocated APV's `totalAmountDue` and updates its status (`'Paid'`/`'Partially Paid'`) via a delta-based helper, on both create and edit. Receiving Report and APV are **not linked to each other** at the data level (§3.7) — both independently hit AP with no document-matching between them.

**Vendor Payment — UI fields and allocation mechanics** (`vendorCenter/payment/form/+page.svelte`, separate view page per §2.1): header `fields[]` — Vendor (select, `required`), Payment Date (date, `required`), Payment Method (select, `required`), Reference (text), Amount (number, `required`) — unlike Receive Payment, most fields here **are** marked required. Memo lives outside `fields`, same header-actions-slot pattern as everywhere else.
- **Outstanding bills table**: Bill | Due Date | Amount Due | Payment — simpler than Receive Payment's, since **Vendor Payment has no per-line discount/tax adjustment UI and no Apply-Credit feature at all** — there is no vendor-side equivalent of Credit Memo anywhere in this app (§3.7). Auto-Allocate greedily fills oldest-due-first from the entered Amount.
- Saved allocation row shape: `billPayments[]` = `{billId, billNo, originalAmount, amountPaid}` (§3.7). Its view page links each row's Bill No. straight to that APV's view (§3.7).
- Delta function: `applyBillBalanceDeltas(current, original)` — same load-time-snapshot delta pattern as Receive Payment's `applyInvoiceBalanceDeltas`, against the APV's `totalAmountDue`.
- **No Print/Download PDF button**.

**Receiving Report — UI fields** (`vendorCenter/receivingReport/form/+page.svelte`, form-in-view-mode per §2.1): header `fields[]` — RR No (text, `required`, disabled once in edit mode), RR Date (date, `required`), Vendor (select, `required`), Location (select, **not** required, unlike Vendor), Reference (text), PO No (text). Line `columns[]` — Item (select against `masterlist/items`, keyed `id` not `item` with `displayField:'itemName'` — a deliberate workaround since `TxnItemTable`'s view-mode fallback only special-cases columns literally keyed `item`/`unit`/`taxType`, §7 point 7), Description (text), Quantity (number), Unit (**free text**, auto-filled with the selected item's unit *name*, not a select against `otherlist/units`), Unit Cost (number, from the item's `purchase_price`), Amount (no explicit type, default numeric rendering).
- Save only validates Vendor and at least one line item — `rrDate`/`location` aren't actually checked at save time despite `rrDate` being marked `required` on the field config.
- No Print/Download PDF button.

**Printing**: APV (`apv/form/+page.svelte`) has the same "Print"/"Download PDF" buttons as Sales Invoice (§4.1), shown whenever `!isCreateMode`, calling `documentPdfService.ts`'s `generateApvPdf()`. Its printout labels the counterparty block "Payee" rather than "Bill To" (an APV is a disbursement voucher, not a sale) and resolves address/TIN from a live `masterlist/vendors` read; the totals block is flat Gross/Discount/Net/VAT/Withholding/Total, since APV has no vatable/zero-rated/exempt split to show (§3.4).

**APV's journal entry balances correctly even when withholding tax and/or line discounts apply.** The form computes real `vat`/`lessWithholding`/`totalAmountDue` (§3.4) rather than hardcoding any of them, and `createApvJournalEntry` debits each line's expense at the pre-discount `price` while crediting the discount separately, rather than re-discounting an already-net amount — so neither the withholding credit nor the line discount gets double-applied. Draft-status posting is gated the same way as Sales Invoice's — see §5.6 for the shared mechanism.

### 4.3 Inventory

Only one transaction type: **Inventory Adjustment** (`inventory/transactions/adjustments`, prefix `ADJ`, see §3.5). Purely a value posting (`createInventoryAdjustmentJournalEntry`): increase → Dr. hardcoded "Inventory Asset" / Cr. user-selected account; decrease → reverse. Its Warehouse and Account dropdowns are sourced from the real, managed `otherlist/locations` and `masterlist/accounts` collections. There's no stock-quantity ledger anywhere in the app to adjust against (§1.1) — this module computes and posts a value with no linkage to real inventory counts.

**UI fields** (`inventory/adjustment/form/+page.svelte`, form-in-view-mode per §2.1): header `fields[]` — Adjustment Type (select: Increase/Decrease, `required`), Adjustment Date (date, `required`), Warehouse (select against `otherlist/locations`, `required` — a code comment explicitly documents a prior bug where a bare `'warehouses'` string mis-resolved to an unmanaged `otherlist/warehouses` path), Reference # (text), Adjustment Account (select against `masterlist/accounts`, `required`). Line `columns[]` — Item (select), Description (text), **Unit (select against `otherlist/units` — an actual id, unlike Receiving Report's free-text unit name)**, Quantity (number), Unit Cost (number), Total Value (default rendering).

**Has a real Draft/Posted status, matching Receiving Report/APV.** `handleSave(status: 'Draft' | 'Posted' = 'Posted')` — the primary button calls it with `'Posted'`, the secondary "Save as Draft" button calls it with `'Draft'`. The journal entry is only posted when `status === 'Posted'`; saving as Draft on an edit that had already posted a journal entry calls `voidJournalEntriesForSource('inventory_adjustment', docId)` (`accountingService.ts`, §5.6) to remove it rather than leaving it stale.

Has no separate view page — viewing an adjustment goes through the form-in-view-mode pattern like Sales Invoice/APV (§2.1). No Print/Download PDF button.

### 4.4 Accounting

- **General Journal** (`transactions/accounting/journalEntries`, `sourceType:'general'`): the only place journal entries are hand-authored directly by a user rather than generated by a transaction — the only one of the 8 transaction forms that writes straight to the universal ledger collection rather than a source-transaction collection. UI fields — Journal Date (date, `required`), Reference No (text, auto-generated if left empty), Description (text), Status (select: Draft/Posted); memo lives outside the field grid like every other form. Line columns are a raw GL-posting row, not item-based: Account (select against Chart of Accounts, grouped by `accountType` with disabled separator rows), Entity Type (select: none/customer/vendor/other), Entity (select, options resolved dynamically from the chosen Entity Type against `masterlist/customers`/`vendors`/`others`, disabled until a type is picked), Description, Debit, Credit — entering a nonzero value in one of Debit/Credit zeroes the other immediately (not just at save time). Balance check is the exact tolerance comparison `Math.abs(totalDebit-totalCredit) < 0.01`, enforced both in `handleSave()` and by disabling the submit button directly off the same reactive predicate.
  **Closed-period check is precise, not the same call path as generated JEs**: the GJ form calls `isDateInClosedPeriod(date)` (`accountingService.ts`) **directly** and handles the `{closed, periodLabel}` result with its own `alert()`, rather than calling the private `assertPeriodOpen()` wrapper every JE *generator* uses internally (§5.2) — `assertPeriodOpen` isn't exported, so the form can't call it even if it wanted to. Functionally equivalent (same underlying query against `fiscalPeriods`), just a different call site than a first read of "also blocked by `assertPeriodOpen`" would suggest. All of this is client-side only — no Firestore rule backs any of it up.
  `documentIdService.ts` has a fully-configured `DocumentType.JOURNAL_ENTRY` (prefix `JE`, field `journalNo`) that is **never actually called** — real journal entries (both manual and generated) use an ad hoc, non-sequential, timestamp-derived `referenceNo` instead (`JE-${Date.now().toString().substring(7)}`), duplicated independently in both the GJ form and `accountingService.ts`. The form's `summaryMode="custom"` slot hand-rolls its own balanced/unbalanced indicator rather than using `FormFooter`'s built-in transaction summary. No Print/Download PDF button.
- **Reports** (`reports/apAging`, `arAging`, `balanceSheet`, `incomeStatement`, `trialBalance`, `generalLedger`, `salesJournal`, `purchaseJournal`, `cashReceiptsJournal`, `cashDisbursementsJournal`): all thin wrappers around `ReportContainer` + a `reportingService.ts` data function (see §5.4). AR/AP Aging bucket by a crude **substring match** on `line.accountName` containing `"receivable"`/`"payable"` — not by any real account-type/classification field, and not by actual invoice/APV due dates (age is computed from the *journal entry's* date, not a per-document due date). Every report's CSV export is hand-rolled inline (Blob + synthetic `<a download>`), not routed through `csvExporter.ts`. The five statutory-book reports (§8.4) are the same shape/pattern as the original three, just newer.
- **Audit Trail** (sidebar label "Transaction Journal"): a filterable/sortable/paginated **read-only viewer** over the entire `journalEntries` collection (fetched unfiltered, filtered client-side), re-deriving debit/credit totals per entry from `lines[]` rather than trusting the stored header totals, flagging out-of-balance entries. Has full CSV export. This is *not* a change-history/who-edited-what audit log — there's no such feature anywhere in the app.
- **Data Auditor**: a **data-quality scanner**, functionally distinct from Audit Trail — runs 9 independent checks (missing required fields, duplicate reference numbers / account codes, journal lines referencing account names absent from the Chart of Accounts, items missing a sales price under any of several historical field-name aliases, etc.) across journal entries and every masterlist collection, and offers advisory (non-writing) account-code suggestions for orphaned account names. Embeds a smaller, duplicate copy of the same balance-check journal table Audit Trail shows, without Audit Trail's filtering/export.
- **Period Closing**: real writes to `fiscalPeriods`, enforces sequential close/reopen order and blocks closing a period containing unposted (`isPosted:false`) journal entries. Every JE generator plus the General Journal form enforces this at post time too, via `assertPeriodOpen` (§5.2) — closing a period actually blocks new postings into it, not just on-page copy.
- **Tax Reporting**: derives Output VAT / Input VAT / Withholding Tax purely by **substring-matching `accountName`** on posted journal entries (e.g. `"output vat"`, `"vat payable"`, `"withholding"`), not from any dedicated tax collection or from the `otherlist/tax` master list. Produces a monthly rollup plus three detail tables.

### 4.5 Masterlist & Otherlist

Every page follows: `MasterListContainer` (search + New button) + local `ModalForm` (add/edit) + inline delete + (for Accounts/Customers/Items/Vendors/Others only) inline CSV import/export handlers. See §3.1/§3.2 for schemas. **CSV import is inconsistent**: Customers and Vendors **destructively wipe the entire collection** before importing (behind a `confirm()`); Accounts, Items, and Others are append-only with no upsert-by-code, so re-running an import duplicates records. None of the eight otherlist entities (including Cost Centers, `otherlist/costcenters`) have CSV support.

Accounts' "Sample CSV" download button generates correct 12-field rows, including for top-level (no-`parentId`) accounts.

**`isSystem` doesn't restrict anything — full user control over the Chart of Accounts is an explicit product decision.** It's purely informational, settable via its own checkbox in the form; `ModalForm.svelte` never reads a field's `disabled` property for any field type, so nothing in this form can be conditionally locked via that config either way. The one place `isSystem` still matters is `reportingService.ts`, which sets it on the auto-created "Retained Earnings" account (§5.4) — purely a marker, nothing reads it back.

### 4.6 Dashboard (`main/dashboard`)

Live-Firestore-driven (not static). **Cash/A-R/A-P and the two ratio tiles are real figures from the reporting engine.** They come from `getAllAccounts()` cross-referenced against `getAccountBalances()` (`reportingService.ts`, §5.4) to sum only accounts actually typed `'bank'` / `'accounts-receivable'` / `'accounts-payable'` via `normalizeAccountType()` (`accountTypes.ts`, §5.5) — computed as of today (all activity from account inception, not just the current year, since a cash/A-R/A-P balance is a point-in-time balance-sheet figure, not a year-to-date flow) — and `getBalanceSheetData()` for the ratios (current ratio = current assets ÷ current liabilities; quick ratio additionally excludes inventory-named current-asset accounts). Revenue/expense monthly-chart data and the "Top Customers"/"Top Vendors" tables still key off `entry.customer`/`entry.vendorId` on the journal-entry *header* (fields no generator sets, unlike the line-level `nameId`/`nameName` tagging AR/AP Aging uses, §5.4), so they commonly display `"unknown"`. Charts are two Chart.js canvases (Revenue-vs-Expense line, AR-vs-AP bar) using the CDN-loaded library described in §1.

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

**`/admin/companyProfile`** (`companyProfileService.ts`): the business's own BIR identity — `registeredName*, tradeName, tin*, rdoCode, registeredAddress*, vatStatus ('vat'|'non-vat'), lineOfBusiness, contactNumber, email, updatedAt, updatedBy` — stored as a single singleton document at `listdatabase/companyProfile`, not a masterlist/otherlist entity (there's exactly one company, no code/list semantics apply). Closes the §8.1 "no seller-identification data anywhere" gap: `documentPdfService.ts`'s Sales Invoice/Credit Memo/APV print/PDF output (§4.1/§4.2) all read it for the seller header block. BIR Form 2307 generation would still need it too, but doesn't exist yet (§8.2). Unlike every other `listdatabase` doc — where any active user can read/write per `firestore.rules` — writes to this one are restricted to `isAdmin()`; reads stay open to any active user, exactly because print/PDF generation outside `/admin/*` needs it.

---

## 5. The Accounting Engine

### 5.1 Tax-rate handling — a systemic pattern to know

VAT is **hardcoded at 12%** in every calculation site (Sales Invoice's reactive block, Credit Memo's reactive block, `accountingService.ts`'s `grossAmount/1.12` sales-revenue split), regardless of whatever numeric rate a given `otherlist/tax` record might notionally represent — because, per §3.2, `otherlist/tax` records don't even have a rate field; they're name-only. Classification of a line as vatable/zero-rated/exempt is done by matching the *label text* of the selected tax option, not a stored rate or type code. If you're asked to make VAT-rate-configurable, this is the single hardcoded assumption threaded through the most call sites.

### 5.2 Journal-entry generators (`accountingService.ts`) — quick reference

All generators share the shape: call `assertPeriodOpen(date)` first (via `isDateInClosedPeriod`, which checks `transactions/accounting/fiscalPeriods` for a closed period spanning the transaction date, §3.6) and throw before building anything if the period is closed; then build a header + `lines[]`; call `getJournalEntriesForSource(sourceType, sourceId)` to check for an existing entry (behavior on collision **varies by generator** — see table below); then `addDocToCollection('accounting','journalEntries', entry)`.

**Known limitation:** document-save and journal-entry-creation are two separate, non-transactional writes throughout this codebase — there's no backend to wrap them in one real Firestore transaction (§1). Every generator-backed form's save handler routes its JE-posting call through `postJournalEntryOrRollback()` (`accountingService.ts`) to at least avoid *silent* failure: on **create**, a posting failure deletes the document that was just created (a compensating rollback, via `deleteDocFromCollection` so it's still audit-logged) so the whole save fails together instead of leaving an orphaned document with no ledger entry; on **edit**, there's no snapshot of the prior state to restore, so the user instead gets a message distinct from every other error, telling them the document change saved but the ledger may now be out of sync. This isn't full atomicity — that needs a backend (Cloud Functions) to make the two writes genuinely transactional — it only guarantees the failure is visible rather than silent.

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

Sales Invoice and Credit Memo both post Output VAT to the same `output-vat` account id, so a credit memo nets against the liability balance the original invoice posted to.

**Payment-method → cash/bank account resolution matches on the payment method's actual label text.** `createReceiptJournalEntry`/`createVendorPaymentJournalEntry` read `receipt.paymentMethodName`/`payment.paymentMethodName` (the denormalized display name already stored on every receipt/payment, §3.3/§3.4) and match by lowercase substring — `"check"`/`"cheque"` → Bank, `"credit card"` → Credit Card (Receivable), `"online"`/`"bank transfer"`/`"gcash"`/`"e-wallet"` → Online Payment Account, `"bank"` → Bank, else → Cash — the same label-substring-matching convention already used for tax classification (§5.1).

`getJournalEntriesForSource(sourceType, sourceId)` — used both internally and by view pages (Credit Memo, Receiving Report) to fetch an entry's JE for display — queries `transactions/accounting/journalEntries` with `where('sourceType','==',...)` + `where('sourceId','==',...)`.

### 5.3 Document numbering (`documentIdService.ts`)

`generateNextDocumentId(DocumentType)` increments a real per-doc-type counter document at `counters/{docType}` (`{lastNumber, prefix, updatedAt}`) via `transaction.get()`/`transaction.set()` inside `runTransaction` — Firestore's transaction retry mechanism has something to actually act on, so two concurrent saves can't compute the same next number. The one non-transactional read is `getCurrentMaxFromCollection()`, called once *before* the transaction starts to seed the counter document the very first time a given `DocumentType` is used (so an app with existing documents doesn't restart numbering at 1) — a race here is possible only on that one-time seed, not on every future save. `firestore.rules` has a matching `counters/{docType}` rule (`allow read, write: if isActiveUser()`). `DocumentType` → prefix/collection/field map:

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

**`getTrialBalanceData` never plugs imbalances.** A Trial Balance's entire purpose is proving debits equal credits, so silently forcing the two to match would hide the one class of bug that report exists to catch. It returns the true `totalDebit`/`totalCredit` plus an `isBalanced` flag; the report page shows an explicit warning banner whenever `isBalanced` is false.

**`getBalanceSheetData` computes a real Retained Earnings figure, not a balancing plug.** It runs an Income Statement (`getIncomeStatementData`) over everything posted *before* the report's date range and adds that actual cumulative prior-period net income as the Retained Earnings line — the textbook-correct way to derive it. It's added whenever there's real prior-period income to fold in, not only when the sheet is out of balance. It also returns `isBalanced`; if the sheet doesn't reconcile even with the correctly-computed Retained Earnings, that's surfaced as a warning rather than plugged away.

**Statutory books** (`getGeneralLedgerData`, `getSalesJournalData`, `getPurchaseJournalData`, `getCashReceiptsJournalData`, `getCashDisbursementsJournalData`, §8.4): all built on `getJournalEntries(dateRange)` directly, none go through `getAccountBalances`. `getGeneralLedgerData` makes a second `getJournalEntries` call for everything posted *before* the range to seed a per-account beginning balance, groups the range's lines by account (code, falling back to name) so the report reads as one ledger per account rather than every account's activity interleaved together, sorts chronologically within each group, and computes a running balance per line using the same `getAccountCategory()`-resolved normal-balance direction as `getAccountBalances`. The Sales/Purchase Journal and Cash Receipts/Disbursements Journal functions instead filter `getJournalEntries` results by `sourceType` (`'salesInvoice'`/`'apv'`/`'receipt'`/`'payment'`) and, for each matching entry, do one extra `getDocFromCollection` read back to the source document (`transactions/customerCenter/salesInvoices`, etc.) to pull the human-readable document number and stored VAT/amount fields — the journal entry's own `referenceNo` is an unrelated `JE-<timestamp>` string, not the invoice/APV number (§5.3). The two cash journals additionally call a local `findOffsettingAccountName()` helper that picks the journal-entry line whose `accountName` doesn't match `/cash|bank/i` as the "Account" column, since receipts/payments have no stored GL-account field of their own.

`getARAgingData`/`getAPAgingData` scan **every journal entry line** for `accountName` containing `"receivable"`/`"payable"` as a substring, bucket by the *journal entry's date* (not a stored due date) into Current/1-30/31-60/61-90/>90, and key each bucket by the matching line's own `nameId`/`nameName` — every generator that posts to A/R or A/P tags that exact line with `nameType`/`nameId`/`nameName` (§5.2). Falls back to a `masterlist/customers`/`masterlist/vendors` lookup by id, then the raw id, only for older/manually-entered journal entries that predate this line-level tagging.

### 5.5 Chart of Accounts taxonomy

**`accountType` uses the standard QuickBooks-style granular taxonomy.** The Chart of Accounts form's "Account Type" dropdown, and every account-type-filtered dropdown in the app, are driven by `src/lib/utils/accountTypes.ts`'s `ACCOUNT_TYPES` — 15 values matching QuickBooks Online's own account types exactly ([Intuit reference](https://quickbooks.intuit.com/learn-support/en-us/help-article/chart-accounts/learn-account-detail-types-chart-accounts/L2gCy0rfy_US_en_US)):

- **Asset**: `bank`, `accounts-receivable`, `other-current-asset`, `fixed-asset`, `other-asset`
- **Liability**: `accounts-payable`, `credit-card`, `other-current-liability`, `long-term-liability`
- **Equity**: `equity`
- **Revenue**: `income`, `other-income`
- **Expense**: `expense`, `other-expense`
- **COGS**: `cost-of-goods-sold`

Every account-type-filtered dropdown (APV's AP Account/Expense Account, Items masterlist's income/expense/inventory/cogs pickers, via `accountFilters.ts`'s `filterAccountsByType`) matches by category via `getAccountCategory()`, not the literal `accountType` string — this is what lets a standards-conformant Chart of Accounts (e.g. an account typed `'accounts-payable'`) populate correctly wherever a filter asks for the `'liability'` category.

Each of the 15 types maps to one of the 6 broad **categories** (`asset|liability|equity|revenue|expense|cogs`, still what drives `normalBalance` debit/credit direction) via `accountTypes.ts`'s `getAccountCategory()`, which every category-based consumer calls instead of comparing `accountType` directly:
- `accountFilters.ts`'s `filterAccountsByType(accounts, category)` matches by category, not exact string.
- `reportingService.ts`'s `getAccountBalances` resolves `account.accountType` through `getAccountCategory()` before its debit/credit-direction switch, so an account typed e.g. `'accounts-payable'` resolves to the correct category rather than falling through to the switch's default (`Debit`).

`getAccountCategory()`/`normalizeAccountType()` also tolerate the space-separated, inconsistently-pluralized values already present in existing data (`"accounts receivable"`, `"fixed assets"`, `"other current liabilities"`) via a small alias table, plus the old 6-value legacy strings (`'asset'`, `'liability'`, ...) — no one-time data migration is required for existing accounts to filter, display, and report correctly under the new taxonomy.

`fsClassification` is unchanged and separate — still what `getBalanceSheetData`/`getTrialBalanceData` actually group Balance Sheet sections by (**Current Asset**, **Non-Current Asset**, **Current Liability**, **Non-Current Liability**, **Equity**, **Revenue**, **Cost of Sales**, **Operating Expense**, **Other Income**, **Other Expense**, **Tax**) — `accountType`'s only role in the reporting engine is normal-balance direction, not section grouping.

`determineAccountTypeFromName`/`determineFSClassificationFromName` (name-substring fallback heuristics used when a journal line's account isn't found in the chart at all) still exist as a secondary path for synthesized/unmatched accounts — separate from the keyword sets Dashboard and Tax Reporting use, which are out of scope here.

**Not migrated**: account documents saved before `fsClassification` was aligned to the 11-value set above may still carry the old `balance_sheet`/`income_statement`/`cash_flow` values and won't classify correctly into Balance Sheet/Income Statement sections until re-saved through the form or migrated directly. (`accountType` itself needs no such migration — see above.)

### 5.6 End-to-end data flow

The pipeline every transaction goes through, start to finish — this is the shape to have in mind before touching anything in `accountingService.ts` or `reportingService.ts`:

```
Transaction form save (create or edit)
   │  addDocToCollection / updateDocInCollection — §2.2
   ▼
Firestore document
   transactions/customerCenter/*  |  transactions/vendorCenter/*  |  inventory/transactions/adjustments
   │  the SAME save handler then calls that form's JE generator directly, synchronously,
   │  in the same client-side code path — there is no trigger, function, or queue (§1)
   ▼
accountingService.ts generator — §5.2
   assertPeriodOpen(date) → throw if closed
   → build header + lines[]
   → getJournalEntriesForSource(sourceType, sourceId) dedup check (behavior varies by generator, §5.2)
   → addDocToCollection('accounting','journalEntries', entry)
   ▼
transactions/accounting/journalEntries — the universal ledger, §3.6
   │
   ├─► reportingService.ts's getJournalEntries(dateRange) — §5.4, the shared base for:
   │      • getAccountBalances → Trial Balance, Balance Sheet, Income Statement
   │      • getGeneralLedgerData → General Ledger (+ a 2nd call for pre-range beginning balances)
   │      • getSalesJournalData / getPurchaseJournalData → Sales/Purchase Journal (+1 read back to source doc per entry)
   │      • getCashReceiptsJournalData / getCashDisbursementsJournalData → Cash Receipts/Disbursements Journal
   │      • getARAgingData / getAPAgingData → AR/AP Aging
   ├─► Audit Trail / Data Auditor (§4.4) — read the collection directly, bypass reportingService.ts entirely
   ├─► Tax Reporting (§4.4) — substring-matches accountName directly, bypasses reportingService.ts too
   └─► Dashboard (§4.6) — substring-matches accountName directly, current-year only, also bypasses reportingService.ts
```

**Saving a transaction as `'Draft'` reliably keeps it out of the ledger, across every generator-backed form.** Every JE generator sets `isPosted:true` unconditionally when it runs (§3.6) — nothing in `accountingService.ts` itself reads the source document's own `status` — so the gating happens in each *form's* save handler before it decides whether to call the generator at all:
- **Sales Invoice and APV** — only call their JE generator when the actual saved status isn't `'Draft'` (Sales Invoice additionally accounts for Cash Sale forcing an actual status of `'Paid'` even when the "Save as Draft" button was clicked, so the gate checks the real saved status, not the raw button choice).
- **Inventory Adjustment** — has a real Draft/Posted status like Receiving Report/APV (§4.3); the primary button posts `'Posted'` and a JE, the secondary "Save as Draft" button genuinely saves Draft and skips posting.
- **Receiving Report** — only calls `createReceivingReportJournalEntry` when `status === 'Posted'`.
- **Reverting a posted transaction back to Draft** on edit voids its existing journal entry via `voidJournalEntriesForSource(sourceType, sourceId)` (`accountingService.ts`) — routed through `deleteDocFromCollection` so it's captured in the audit trail — rather than leaving a stale "posted" entry behind in the ledger. This applies to Sales Invoice, APV, and Inventory Adjustment, the three forms that can transition away from Draft.
- Vendor Payment, Receive Payment, and Credit Memo are moot on this point — none of the three ever reaches a `'Draft'` status in the first place (all always save `'Posted'`, §4.1/§4.2).

"Draft" means the same thing everywhere a generator-backed transaction type has one: genuinely not posted, matching how the manual General Journal already works (it honors its own Draft/Posted select before setting `isPosted`, §4.4).

---

## 6. Consolidated Known-Issues Catalog

Grouped by theme, deduplicated across modules, for quick scanning. Each item references where it's detailed above.

**Arithmetic / persistence mismatches:**
- Receive Payment's per-invoice discount/tax adjustments are computed for display but never persisted (§3.3).

**Navigation:**
- One-directional only: Receive Payment → Sales Invoice and Vendor Payment → APV are now clickable (§3.7), but nothing links the other way (no "payments applied against this" section on Sales Invoice/APV), and nothing links Receive Payment to the Credit Memos/prior Receipts it applies as credit.

**Numbering:**
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
- **Document-save and journal-entry-creation are two separate, non-transactional writes throughout the codebase, but a posting failure doesn't fail silently.** Every generator-backed form routes JE-posting through `postJournalEntryOrRollback()` (§5.2) — a create-mode failure deletes the just-created document (compensating rollback) rather than leaving it orphaned; an edit-mode failure gets a distinct, honest error message instead of the generic "saved successfully." True atomicity (batched writes spanning both the source document and its JE, across every generator and every form) still needs a backend this app doesn't have — this mitigates the silent-failure symptom, it doesn't fix the underlying architecture.
- All of the above, plus everything else in the app, ultimately rests on Firestore security rules as the only real enforcement layer — verify `firestore.rules` isn't expired before trusting it as a backstop (it has expired before, §1.1).

**UI/permission mismatch:** `firestore.rules` restricts deletes on `transactions/**`/`inventory/**` to admins, but `ListContainer`'s per-row delete button (§2.4) renders identically for every authenticated user regardless of role — a non-admin clicking it gets a Firestore permission-denied error instead of the button simply not being there. Hiding or disabling that button for non-admins (checking `isAdmin` from `src/lib/stores/userProfile.ts`) would close this, but hasn't been done.

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
| Seller's registered name, TIN, registered address, "VAT Registered" statement on the invoice face | ✅ | `/admin/companyProfile` (`companyProfileService.ts`, §4.7) captures the business's own registered name, TIN, RDO code, registered address, and VAT status; Sales Invoice/Credit Memo/APV's PDF+print output (`documentPdfService.ts`, see below) all stamp it onto the actual document face. |
| Buyer's name/business name, address, TIN | ✅ / ⚠️ | `masterlist/customers` has `tax_id`, `billing_address` (§3.1) — captured, but nothing validates TIN format or requires it before save; a customer can be saved with no TIN at all and still be invoiced. The PDF pulls both onto the buyer block when present, blank otherwise. |
| Sequential, non-duplicative, non-reusable invoice numbering | ✅ / ⚠️ | `documentIdService.ts` (§5.3) generates sequential `INV`/`CM`/`PR`/`APV`/`VP`/`RR` numbers via a real transactional counter document — two concurrent saves can no longer compute the same next number. Receiving Report still reserves its number on form-open rather than on save, burning a sequence gap on every abandoned draft (unrelated to the concurrency fix, still open). |
| Date of transaction | ✅ | Every transaction form. |
| Description of goods/services | ✅ | `itemName`/`description` on every line-item schema (§3.3/§3.4). |
| Breakdown of Vatable Sales / Zero-Rated Sales / VAT-Exempt Sales, with VAT amount computed per component | ✅ / ⚠️ | `vatableSales`/`zeroRated`/`vatExempt`/`vat` are computed and persisted on **Sales Invoice only** (§3.3) — Credit Memo's reactive block computes the same split for its on-screen summary but only ever persists the flat `subtotal`/`taxAmount`/`totalAmount` trio, not the three-way split, so it isn't available to print later (its PDF, below, reflects this — no vatable/zero/exempt breakdown line, just Net Sales/VAT/Total). APV has no such split at all, by design (§3.4) — flat `netAmount`/`vat` only. |
| The breakdown is actually deliverable on an invoice document | ✅ | **Closed for Sales Invoice, Credit Memo, and APV.** Each has a "Print" and "Download PDF" button (`documentPdfService.ts`'s `generateSalesInvoicePdf`/`generateCreditMemoPdf`/`generateApvPdf`) — Sales Invoice and APV in their form component (view **and edit** mode, not just view — `salesInvoice/form/+page.svelte`, `apv/form/+page.svelte`), Credit Memo in its separate hand-built view page (`creditMemo/view/+page.svelte`, §2.1). "Print" calls pdfmake's `.print()` (opens the browser print dialog against the same generated document) and "Download PDF" calls `.download()` — same underlying document either way, not two separate layouts. Receiving Report and BIR Form 2307 still have no printable output. `window.print()` still separately exists only on the 5 financial report pages (`ReportContainer.svelte`, §2.4), unrelated to this. |
| "VAT-exempt sale" / "zero-rated sale" stamped on the face of qualifying invoices | ✅ | The PDF's totals block only renders the Zero-Rated/VAT-Exempt line when that invoice actually has a nonzero amount in that category. |
| Current 12% VAT rate | ✅ | Matches the standing statutory rate (§5.1), though hardcoded at every call site rather than configurable — fine today, a real maintenance risk the day the rate ever changes. |

### 8.2 Withholding tax (Expanded/Creditable Withholding Tax, RR 2-98 as amended) & BIR Form 2307

| Requirement | Status | Notes |
|---|---|---|
| EWT withheld and netted against amount due | ✅ | Sales Invoice, Credit Memo, and APV all compute `lessWithholding` and reduce the amount due by it (§3.3/§3.4); APV's journal entry correctly credits a withholding-tax-payable account rather than double-booking it (§4.2). |
| EWT rate coverage | ✅ / ⚠️ | `withholdingTax.ts`'s `WITHHOLDING_TAX_OPTIONS` (§2.5) now covers the common RR 2-98 (as amended) categories — goods, services, rentals, professional/talent fees by payee type and gross-receipts threshold, commissions, contractors — not just the original 1%/2%. Still not exhaustive against the full schedule (top-withholding-agent-specific rates, less-common categories aren't enumerated), and nothing validates that the category selected actually matches the transaction's real nature — it's a rate picklist, not a rules engine. |
| Issuance of BIR Form 2307 (Certificate of Creditable Tax Withheld at Source) to payees | ❌ | PDF capability now exists for Sales Invoice/Credit Memo/APV (§8.1), including APV's own withholding data (`lessWithholding`/`withholdingTax`, §3.4) on its printout — but no 2307-specific template (a distinct BIR form with its own required fields, not just a print of the source APV) has been built yet. `documentPdfService.ts` is the natural place to extend for this. |

### 8.3 CAS system/technical requirements

Modern BIR guidance for a Computerized Accounting System (Acknowledgment Certificate process, replacing the old Permit-to-Use as of Dec 2020) expects: sequential/non-duplicative/non-reusable numbering, a non-resettable cumulative audit trail logging every add/edit/delete with user ID and timestamp, access controls, and backup/recovery.

| Requirement | Status | Notes |
|---|---|---|
| Sequential/non-duplicative numbering | ✅ / ⚠️ | See §8.1 — concurrency-safe now; Receiving Report's reserve-on-open sequence-gap risk is the one remaining caveat. |
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
| Printable/PDF invoice, credit memo, 2307 output | ✅ / ⚠️ Sales Invoice/Credit Memo/APV done (`documentPdfService.ts`, print + download), 2307 not yet |
| VAT computation & vatable/zero-rated/exempt breakdown (data layer) | ✅ Compliant |
| VAT rate | ✅ Compliant (hardcoded 12%) |
| Sequential document numbering | ✅ / ⚠️ Concurrency-safe now; RR reserve-on-open gap risk remains |
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
