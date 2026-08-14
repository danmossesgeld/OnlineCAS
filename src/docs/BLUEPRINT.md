# DigiSoft CAS — System Blueprint (for AI Agents)

> **Purpose of this document.** This is a verified, code-level reference to how DigiSoft CAS actually works today — not an aspirational spec. Every claim below was produced by reading the real source files (paths and line ranges are noted where it matters), not by inferring "how an accounting system should work." Where the code is inconsistent, incomplete, or buggy, that is documented explicitly rather than smoothed over, because an AI agent editing this codebase needs to know what's really there before touching it.
>
> Other files in `src/docs/` (`SYSTEM_DOCUMENTATION.md`, `system_architecture_and_data_flow.md`, `masterlist and field linking.md`) predate this document and contain idealized/illustrative code samples that do not always match the live implementation (e.g. they reference a `ListButtons.svelte` component and a `documentNumbering.ts` file that do not exist, and describe collection paths and validation flows that differ from what's actually coded). Prefer this document when the two disagree.
>
> Last verified: 2026-08-14, against the `main` branch.

---

## 1. System Overview

**DigiSoft CAS** ("Computerized Accounting System") is a Philippine-context small-business accounting app: sales, purchases, inventory value adjustments, general ledger, and standard financial reports (Trial Balance, Balance Sheet, Income Statement, AR/AP Aging, Tax Reporting).

**Stack:**
- **SvelteKit 2 / Svelte 5**, TypeScript, Tailwind CSS 4 + DaisyUI 5
- **`@sveltejs/adapter-static`** (`svelte.config.js`) with SPA fallback (`fallback: 'index.html'`) — this is a **fully static single-page app**, not an SSR server. All data access happens client-side, in the browser, directly against Firestore.
- **Firebase**: Firestore (data), Firebase Auth (email/password login only — `signInWithEmailAndPassword`), Firebase Hosting (`firebase.json`, `apphosting.yaml`)
- No backend server, no Cloud Functions found in the repo, no API routes (`src/routes/**/+server.ts` — none exist). All business logic — validation, journal-entry generation, report aggregation — runs **in the browser**.
- Charting: Chart.js is **not** an npm dependency; the dashboard lazy-loads it from a CDN (`cdn.jsdelivr.net/npm/chart.js@4.4.1`) at runtime via an injected `<script>` tag.

### 1.1 ⚠️ Critical / operationally significant issues

Read this section before assuming anything else in the codebase is production-safe. **Items 1, 3–6, 8, 9 below were fixed on 2026-08-14** (see the "Fixed" note under each); items 2 and 7 are still open and require a product/scope decision before anyone implements them (see the note after the list).

1. **`firestore.rules` is expired.** ~~The deployed rule is `allow read, write: if request.time < timestamp.date(2025, 6, 22);`~~. **Fixed** — resolved outside this repo's tracked history.
2. **The entire app is a client-only SPA with no server-side authorization.** Firestore security rules are the *only* access control layer. There is no role/permission system anywhere in the app code itself (no `canUserEdit`-style checks — that pattern shown in the older docs does not exist in the real code). **Open.** Building real RBAC requires deciding what roles/permissions the business actually needs (e.g. can any authenticated user post/void any transaction, or do bookkeepers vs. approvers need different rights?) before it can be designed — that's a product decision, not a bug fix.
3. **Outstanding-bills-for-payment is non-functional.** APVs were created with `status: 'Draft'` and no code path ever transitioned an APV to `status: 'Posted'`, so Vendor Payment's `where('status','==','Posted')` query always returned zero rows. **Fixed** — `vendorCenter/apv/form/+page.svelte`'s `handleSave` now takes a `status` parameter; the primary button posts (`'Posted'`), and the previously-inert "Save as Draft" button now actually saves as `'Draft'` (mirroring Sales Invoice's pattern, including using a `'DRAFT'` placeholder number until first posted, so abandoned drafts don't burn a real sequence number).
4. **Credit application in Receive Payment was silently broken.** The "Apply Credit" flow read/wrote Credit Memos and prior Receipts via the 2-segment path `'transactions/creditMemo'` / `'transactions/receivePayment'`, which resolved to `listdatabase/transactions/creditMemo` (nothing is ever written there) instead of the real `transactions/customerCenter/creditMemos` / `transactions/customerCenter/receipts`. **Fixed** — `customerCenter/receivePayment/form/+page.svelte` now uses the correct paths everywhere (query, get, update), plus the field-name mismatches that would have still broken display after the path fix (`doc.creditNo` → `doc.cmNo`, `doc.creditDate` → `doc.cmDate` with defensive Timestamp/string parsing since `cmDate` can be a raw string on newer credit memos).
5. **Inventory Adjustment's own form was unsubmittable out of the box.** Its Warehouse and Account dropdowns were populated via `createFirestoreOptionsStore('warehouses', ...)` and `createFirestoreOptionsStore('accounts', ...)`, resolving to unmanaged `listdatabase/otherlist/warehouses` / `listdatabase/otherlist/accounts` paths. **Fixed** — now sourced from `otherlist/locations` (the real, managed warehouse-equivalent list — its own subtitle says "Manage your business locations and warehouses") and `masterlist/accounts` (the real Chart of Accounts).
6. **Chart of Accounts values didn't match the taxonomy the reporting engine expects.** The form wrote `fsClassification` as one of `balance_sheet|income_statement|cash_flow` (which *statement*) while `reportingService.ts`'s `FSClassification` enum expected eleven granular kebab-case values (`current-asset`, `operating-expense`, etc. — what the account *is*), and `accountType` used `'revenue'` while the enum's matching member was `Income = 'income'` (so real revenue accounts silently got the wrong normal-balance sign — a debit instead of credit — in every balance calculation). **Fixed** — `masterlist/accounts/+page.svelte`'s `fsClassification` select now offers the eleven real `FSClassification` values, and `reportingService.ts`'s `AccountType` enum was changed to `Revenue = 'revenue'` (matching what the app already writes everywhere, including the Items masterlist's income-account filter) with a new `Cogs = 'cogs'` member added and included in the debit-normal-balance case. This is a forward-looking fix for accounts created from now on; it does not migrate any `fsClassification`/`accountType` values already stored on existing documents.
7. **No inventory quantity/stock ledger exists anywhere in the codebase.** "Inventory Adjustment" and "Receiving Report" are both purely GL/value postings; neither touches an item's on-hand quantity (there is no on-hand-quantity field on the Item schema at all). **Open** — this is a real feature to design and build (schema, which transactions move stock, what reports are needed), not a one-line fix; needs product scoping before implementation.
8. **Two files initialize Firebase** (`src/lib/firebase.ts` and `src/lib/utils/firebase.ts`), functionally identical, both reading the same `VITE_FIREBASE_*` env vars. **Fixed** — `src/lib/firebase.ts` now just re-exports `app` from `./utils/firebase` instead of calling `initializeApp` a second time, so there's a single source of truth. All existing import paths (`$lib/firebase`, `../firebase`) keep working unchanged.
9. **Period Closing had no enforcement.** Closing a fiscal period set `isClosed: true` on a document in `transactions/accounting/fiscalPeriods` and nothing else in the codebase read that flag, despite on-page copy claiming closed periods block new postings. **Fixed** — `accountingService.ts` now exports `isDateInClosedPeriod(date)` and every journal-entry generator (`createSalesInvoiceJournalEntry`, `createApvJournalEntry`, `createInventoryAdjustmentJournalEntry`, `createReceiptJournalEntry`, `createVendorPaymentJournalEntry`, `createCreditMemoJournalEntry`, `createReceivingReportJournalEntry`, and the dead-code `createDetailedSalesInvoiceJournalEntries`) now throws before posting if the transaction's date falls inside a closed period; the General Journal form checks the same way before its manual save. Every calling form's catch block was updated to surface `error.message` (previously most showed a generic "please try again" with no detail) so the closed-period message is actually visible to the user. **Known limitation**: because document-save and journal-entry-creation are two separate, non-transactional writes throughout this codebase (not something introduced by this fix), a closed-period block still leaves the source transaction document saved in Firestore without a matching journal entry — the same failure mode as any other post-save error that already existed here. Making the whole save pipeline atomic would be a larger, separate refactor.

Items 2 and 7 remain open. Both require a scope/design decision (what roles does the business need; what should a stock ledger track and which transactions should move it) rather than a contained code fix, so they were intentionally left for a future task once that scope is decided.

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
- Exceptions to the single-form pattern: **Credit Memo** and **Vendor Payment/Receiving Report** have genuinely separate, hand-built `view/+page.svelte` read-only pages (not a redirect, not the form-in-view-mode) that independently re-fetch the document and re-implement their own display markup. Vendor Payment/Receiving Report have no `[id]` folder at all. Sales Invoice and Inventory Adjustment reuse the form component itself for viewing (`disabled={isViewMode}` throughout).

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

**The trap:** because the map's fallback is `|| 'listdatabase'`, calling a 2-segment path whose first segment *isn't* a map key (e.g. `'transactions/creditMemo'`, `'inventory/adjustments'`) silently resolves to `listdatabase/transactions/creditMemo` or `listdatabase/inventory/adjustments` — a plausible-looking but *wrong* path that fails silently (empty query results, `null` doc reads) rather than throwing. This exact mistake is the root cause of the broken Receive-Payment credit application (§1.4) and the broken Inventory Adjustment view page (§6.3). **When writing new code, either use the full, explicit 3-segment path, or double-check that the first segment of any 2-segment path is actually one of `masterlist | otherlist | customerCenter | vendorCenter | accounting`.**

**The other outlier:** Inventory Adjustment's *form* (not its broken view page) uses the 4-argument call form `addDocToCollection('inventory', 'transactions', 'adjustments', data)`, which is `firestoreCrud.ts`'s explicit "Case 1: three-level format" — this makes `'inventory'` a literal **top-level root collection**, sitting outside `listdatabase` entirely and outside the `ROOT_COLLECTION_MAP` pattern used everywhere else. Real path: **`inventory/transactions/adjustments`** (collection `inventory` → doc `transactions` → subcollection `adjustments`). This is intentional-but-inconsistent; don't "fix" it to match the masterlist/otherlist convention without also updating every reader.

`firestoreCrud.ts` exports: `addDocToCollection`, `updateDocInCollection` (always `setDoc(..., {merge:true})` — never a destructive overwrite), `deleteDocFromCollection`, `getDocFromCollection`, `queryCollectionDocs(path, FilterCondition[])`. All accept either the segmented-path string form or explicit multi-argument forms; see the file for the exact overload behavior summarized above.

`firestoreStores.ts` exports `collectionStore(parentCollection, subCollectionName, queryOptions?, rootCollection?)` — a Svelte `readable` wrapping a live `onSnapshot` listener, used by `FireTable` and every option-store factory. Same path-resolution rules apply.

### 2.3 Auth flow

`src/routes/+layout.svelte`: on mount, subscribes to `onAuthStateChanged` (using `src/lib/firebase.ts`). If unauthenticated and not on `/`, redirect to `/`. If authenticated and on `/`, redirect to `/main/dashboard`. Renders `<Sidebar/>` + wrapped `<main>` only when a user is present and not on `/`; otherwise renders a bare `<slot/>` (the login page, `src/routes/+page.svelte` → `<LoginForm/>`). This is the **entire** access-control layer in application code — everything downstream trusts that if you're rendering, you're authenticated. There is no per-route or per-role gating.

`src/routes/+error.svelte`: a 404 (`$page.status === 404`) renders a friendly "Under Construction" panel rather than a generic error. `src/routes/[...catchall]/+page.svelte`: catches any unmatched path *within* the route tree and renders the identical "Under Construction" UI (duplicated markup, not a shared component) — so broken/future sidebar links degrade gracefully instead of 404ing.

### 2.4 Shared component library (`src/lib/components/`)

| Component | Role |
|---|---|
| `FireTable.svelte` | Realtime table bound directly to a `collectionStore`. Auto-formats: date-like keys, PHP currency for the **hardcoded key allowlist** `amount/totalDue/grossAmount/netSales` only (a `col.type:'currency'` declaration elsewhere is silently ignored — confirmed dead config on Inventory Adjustment's list), and colored pills for a `status` column. Supports optional parent/child hierarchy rendering via a `parentId` field (used by Chart of Accounts for sub-accounts). |
| `ListContainer.svelte` | Full list-page chrome for **transactions**: summary cards (Total/Posted/Draft/Pending/Overdue), search+status+date filters, buttons, wraps `FireTable`. **Its Posted/Draft counts query lowercase `'posted'`/`'draft'`, but every transaction form in the app saves Title-Case `'Posted'`/`'Draft'` — so these summary cards read 0 everywhere, on every list page that uses this component.** Pending/Overdue counts additionally rely on an `isPaid` boolean field that no transaction form ever writes. |
| `MasterListContainer.svelte` | Simpler list-page chrome for **masterlist/otherlist** entities: search only, `New {X}` button, delegates edit/delete to a slot. No summary cards. |
| `ModalForm.svelte` | Generic add/edit modal driven entirely by a `fields: [{label,name,type,options,required,section}]` config array — used by every masterlist/otherlist page. `section:'advanced'` fields render in a second column. |
| `FormLayout.svelte` | Page chrome for transaction forms: back button + title + white card wrapper + `<form>`. |
| `FormSection.svelte` | Groups fields under a heading; `isItemTable=true` mode delegates straight to `TxnItemTable` for line-item grids. |
| `TxnFields.svelte` | Renders a `fields[]` array in a responsive 1–3 column grid; fields can be pinned to the same visual row via a `row` key. |
| `TxnItemTable.svelte` | The editable line-item grid (add/remove rows, per-cell text/number/select inputs, accounting-formatted `amount` column with comma-formatting on blur). |
| `FormFooter.svelte` | Bottom bar: Save/Cancel buttons **and** (when `summaryMode="transaction"`) a self-contained Gross/Discount/Net/VAT/Vatable/Zero-rated/Exempt/Withholding/Total summary panel that **independently recomputes its own totals from `lineItems`** rather than purely trusting the parent's numbers (parent-supplied `grossAmount`/`vat`/etc. props override the internal computation only if explicitly passed — APV's form passes none of these, so `FormFooter` silently free-computes and displays numbers the APV save logic doesn't actually persist; see §6.2). |
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
| `accountingService.ts` | All journal-entry generation. See §5. |
| `reportingService.ts` | All report aggregation (Trial Balance, Balance Sheet, Income Statement, AR/AP Aging) plus the `AccountType`/`FSClassification` enums. See §5.4. |
| `documentIdService.ts` | `generateNextDocumentId(DocumentType)` — sequential document numbering. See §5.5 for its concurrency gap. |
| `formatters.ts` | `formatCurrency` (₱, `en-PH`), `formatDate`, `formatDateForInput`, `formatNumber`, `formatQuantity`. All handle both JS `Date` and Firestore `{seconds,nanoseconds}` timestamp shapes. |
| `csvExporter.ts` | `convertToCSV`, `downloadCSV`, `exportFirestoreCollectionToCSV`. **Only actually used by the masterlist CSV-import/export buttons** (Accounts/Customers/Items/Vendors/Others). Every report page and Audit Trail/Tax Reporting instead hand-roll their own Blob/`<a download>` CSV export inline, duplicating this same pattern rather than reusing it. |
| `csvParser.ts` | `parseCSV`/`parseCSVToRecords` — a real quoted-field-aware CSV parser (handles embedded commas/quotes), used by the masterlist CSV importers. |
| `fileEncoding.ts` | `readFileAsTextSmart(file)` — tries UTF-8/Windows-1252/ISO-8859-1 and picks whichever produces the fewest `U+FFFD` replacement characters. Used by Accounts/Customers/Vendors CSV import; Items/Others CSV import use plain `file.text()` instead (inconsistent, but low-impact). |

### 2.6 Design system

`src/app.css` (440 lines): Tailwind 4 + a CSS-custom-property design-token system (`--color-primary-*`, `--color-neutral-*`, semantic success/warning/error scales, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--transition-*`), Inter font loaded from Google Fonts CDN. DaisyUI classes (`select-bordered`, `input-bordered`, `btn-ghost`, etc.) are mixed freely with raw Tailwind utility classes and inline `style="..."` attributes using the CSS variables — there is no single consistent styling approach across components (some use Tailwind classes, some use inline `var(--...)` styles, some use DaisyUI component classes). `iconify-icon` custom elements are used throughout for icons (Material Symbols icon set), not an SVG-sprite or bundled-icon-component approach.

---

## 3. Firestore Data Model

Two root collections carry essentially all data: **`listdatabase`** (reference/master data) and **`transactions`** (business documents). A third, **`inventory`**, exists only for Inventory Adjustment (an inconsistency — see §2.2).

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
    └── units

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
```

### 3.1 `listdatabase/masterlist/*` schemas (as actually captured by each page's `ModalForm` fields)

**`accounts`** (Chart of Accounts) — the only masterlist entity with rich structure and hierarchy support:
`code*, name*, description, accountType* (asset|liability|equity|revenue|expense|cogs — see §1.6 mismatch), fsClassification (balance_sheet|income_statement|cash_flow — see §1.6), parentId (self-referencing, drives FireTable's hierarchy rendering), parentName (denormalized), glCode, glName, slCode, slName, isActive (bool, default true), isSystem (bool; UI-locked once true — cannot be deleted or its `isSystem` flag changed once set), createdAt, updatedAt`.

**`customers`**: `code*, name*, contact_person, phone, email, billing_address, shipping_address, tax_id, is_active (bool, default true), created_at, updated_at`.

**`vendors`**: `code*, name*, contact_person, phone, email, address (single field, no billing/shipping split), tax_id, is_active, created_at, updated_at`.

**`others`** ("Other Names"): `code*, name*, type (free text, not a select), contact_person, phone, email, address, status (free text, not a checkbox/select — no `is_active` boolean here)`.

**`items`**: `code*, name*, description, category (select → otherlist/categories id), category_name (denormalized), unit_id (select → otherlist/units id), unit_name (denormalized), is_inventory (bool, default false — but note §1.7: nothing consumes this flag for actual stock tracking), is_sellable (bool, default true), is_purchasable (bool, default true), sales_price, purchase_price, income_account_id (select, filtered to masterlist/accounts where accountType==='revenue'), expense_account_id (filtered accountType==='expense'), inventory_account_id (filtered accountType==='asset'), cogs_account_id (filtered accountType==='cogs'||'expense'), average_cost (number, UI `readonly:true`, default 0 — never programmatically updated anywhere in the codebase), is_active (default true)`.

### 3.2 `listdatabase/otherlist/*` schemas

**`categories`, `discounts`, `locations`, `paymentmethods`, `tax`, `terms`, `units`** are all **structurally identical and minimal**: the only field is `{ name: string }` (via a single `ModalForm` field `{label:'Name*', name:'name', type:'text', required:true}`). No code, no active flag, no description, no rate/percentage/day-count values — notably, `tax` has no numeric rate field and `terms` has no day-count field; both are pure name-only lookup lists. (Line-item tax calculations elsewhere in the app classify a selected tax option by matching its **label text**, e.g. looking for the substring "vat"/"zero"/"0%", rather than reading a stored numeric rate — see §5.1.) None of these seven pages have CSV import/export.

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
`taxCategory(line)` classifies by the selected tax option's **rate** (if `rate>0` → vatable) or its **label text** (contains "zero"/"0%" → zero-rated; else → exempt) — not by an explicit type field.

**`creditMemos`** — header: `cmNo (CM+9digits), cmDate (⚠ saved as a raw string, not a Date/Timestamp, for newly-created memos — the form never calls `new Date()` on it), customer, customerName, reference, status (always forced to `'Posted'` at save — no working draft path despite the field nominally supporting `'Draft'`), memo, items[], subtotal, taxRate, taxAmount, totalAmount, withholdingTax, journalEntryId (only transaction type in Customer Center where this is actually written back), createdAt, updatedAt`. Items: `itemId, description, quantity, unit, unitPrice, discount (⚠ saved as the raw discount-**option ID**, not a percent — inconsistent with Sales Invoice's line items), taxType, amount, maxQuantity`. Same gross/discount/net/VAT/WHT formula shape as Sales Invoice. An `invoiceId`/`invoiceNo` linking field and all its supporting load/handler code still exist but are **not exposed in the UI** (explicitly removed per an in-code comment) — dead-but-present code.

**`receipts`** — header: `customer, customerName, receiptNo (PR+9digits, generated with an extra Firestore-side uniqueness re-check loop, unlike the other document types), receiptDate (Date), paymentMethod, paymentMethodName, reference, memo, amount, appliedCredits[] ({id,type:'credit_memo'|'advance_payment',reference,appliedAmount} — `availableAmount` is computed for display but stripped before save), totalAppliedCredit, invoicePayments[] ({invoiceId,invoiceNo,originalAmount,amountPaid}), status (always `'Posted'`), createdAt, updatedAt`. No VAT/discount computation at this level — this document just records cash-in and its allocation. Per-invoice ad hoc discount/tax adjustments computed live in the allocation UI (`payable = amount − credit − amount·discount% − amount·tax%`) are **never persisted** — only `originalAmount`/`amountPaid` survive to Firestore.

### 3.4 `transactions/vendorCenter/*` schemas

**`apvs`** — header: `supplier, supplierName, account (AP liability account id), accountName, selectedTerms, termsName, paymentMethod, paymentMethodName, apvDate (Date), dueDate (Date), referenceNo, poNumber, memo, withholdingTax (string %), apvNo (APV+9digits), status ('Draft' — ⚠ never transitions to 'Posted' anywhere in the app), grossAmount, discount, netAmount, vat (⚠ hardcoded 0 in the save payload — see §1.3/§5.2), lessWithholding (⚠ hardcoded 0), totalAmountDue (= netAmount, since WHT is never actually subtracted), createdAt, updatedAt`. Line items: `item?, description, unit, qty, price, dsc, taxType, amount, account (expense GL account id), accountName, costCenter, costCenterName, taxTypeName, total`. **No `taxRate`, `tax_account_id`, `discount_account_id`, or `withholding_tax_account_id` are ever saved** — `accountingService.ts`'s generator expects these and always falls back to hardcoded placeholder account IDs when they're absent (see §5.2).

**`payments`** (Vendor Payment) — `vendor, vendorName, paymentNo (VP+9digits), paymentDate (Date), paymentMethod, paymentMethodName, reference, memo, amount, billPayments[] ({billId,billNo,originalAmount,amountPaid}), status (always 'Posted'), createdAt, updatedAt`. No tax/discount math at all — pure cash-out + allocation record, same shape as Receive Payment. Bill-balance-update-after-payment and journal-entry-update-on-edit are both **explicitly commented-out TODOs** in the save handler, not implemented.

**`receivingReports`** — `rrNo (RR+9digits — ⚠ reserved eagerly on form-open, not on save, so abandoned new-RR sessions permanently burn a sequence number), rrDate (Date), vendor, vendorName, items[] ({id (masterlist item doc id — confusingly named), description, quantity, unit, unitCost, amount} — ⚠ no `itemName`/`unitName` denormalized fields are ever saved, which breaks the view page's display of those columns), reference, poNo, location, locationName, status ('Draft' — no UI control ever sets it to 'Posted'), memo, subtotal, taxRate (no UI field for this — always 0 on new docs), taxAmount (always 0), totalAmount (= subtotal), createdAt, updatedAt`.

### 3.5 `inventory/transactions/adjustments` schema

`adjustmentNo (ADJ+timestamp — NOT via documentIdService, a different ad hoc generator), adjustmentType ('increase'|'decrease'), adjustmentDate (Date), warehouse (id — ⚠ see §1.5, unmanaged collection), warehouseName, referenceNo, account (id — the GL account to move value into/out of), accountName, remarks, lineItems[] ({item,itemName,description,unit,unitName,qty,price,dsc:0,taxType:'',amount = qty×price}), itemCount, totalValue (Σ line amounts), status ('Draft', never advanced), createdAt, updatedAt`. No variance-vs-prior-quantity concept — `amount` (qty×unit cost) is used directly as the journal debit/credit value; there's nothing to compare against because there's no stock ledger.

### 3.6 `transactions/accounting/*` schemas

**`journalEntries`** — the universal ledger, written by every module. Header:
```
journalDate (Date), referenceNo (string, format 'JE-<timestamp-derived>' — see §5.5 for the numbering inconsistency),
description, memo, sourceType ('salesInvoice'|'apv'|'payment'|'receipt'|'creditMemo'|'receivingReport'|'inventory_adjustment'|'general'),
sourceId (doc id of the originating transaction, or absent for manual GJ entries),
totalDebit, totalCredit, isPosted (bool), status ('draft'|'posted' — only set by the manual General Journal form; generator functions set isPosted:true but not always a matching status string),
lines: JournalEntryLine[], createdAt, updatedAt
```
`JournalEntryLine`: `lineNo, accountId, accountName, nameType? ('customer'|'vendor'|'other'), nameId?, nameName?, lineDescription, debit, credit` (APV's generator additionally sets optional `costCenterId`/`costCenterName`, not used by any other generator).

**`fiscalPeriods`** — `{ id, year, month, monthName, startDate, endDate, isClosed, closedDate, closedBy }`. `closedBy` is hardcoded to the literal string `'current-user-id'`, never resolved from the actual authenticated user. As noted in §1.9, nothing else reads `isClosed`.

---

## 4. Module Walkthroughs

### 4.1 Customer Center

| Transaction | Collection | Doc-number prefix | Draft support | JE generator | JE ID written back? |
|---|---|---|---|---|---|
| Sales Invoice | `transactions/customerCenter/salesInvoices` | `INV` | Yes (only one with a working Save-as-Draft) | `createSalesInvoiceJournalEntry` (simplified single-entry variant; a `createDetailedSalesInvoiceJournalEntries` 3-entry variant exists in `accountingService.ts` but is never called by the form) | No |
| Credit Memo | `transactions/customerCenter/creditMemos` | `CM` | No (always saved `Posted`) | `createCreditMemoJournalEntry` | **Yes** |
| Receive Payment | `transactions/customerCenter/receipts` | `PR` | No (always `Posted`) | `createReceiptJournalEntry` | No |

**Sales cycle in practice:** Sales Invoice creates AR (or, if `cashSale`, an "Undeposited Cash" debit and immediate `status:'Paid'`) → Receive Payment allocates cash/credits against outstanding invoices and, **on create only** (not on edit), updates each allocated invoice's `totalDue`/`status` (`Partially Paid`/`Paid`). Credit Memo reverses revenue/VAT against AR but, per §1.4, its intended consumption path through Receive Payment's "Apply Credit" is broken by a path-resolution bug.

**Editing behavior differs by type:** editing a Sales Invoice **deletes and regenerates** its journal entry from scratch (`accountingService.ts` explicitly deletes prior entries for the same `sourceId` before inserting). Editing a Receipt **does not** — `createReceiptJournalEntry` detects an existing entry for the source and just returns its ID unchanged, leaving a stale JE after any allocation edit. Editing a Credit Memo always re-derives amounts and re-posts (no dedup-and-skip logic in its generator, unlike Receipt/APV).

**Hard delete only, everywhere:** deleting any transaction via `ListContainer` is a true Firestore delete with a plain `confirm()` — no soft-delete/void flag exists, and no code anywhere cleans up the corresponding `journalEntries` document, so deletes can leave orphaned journal entries and stale counterpart statuses (e.g. deleting an invoice that a Receipt already partially paid).

### 4.2 Vendor Center

| Transaction | Collection | Doc-number prefix | Ever reaches "Posted"? | JE generator | JE ID written back? | Duplicate-JE guard on re-save? |
|---|---|---|---|---|---|---|
| APV | `transactions/vendorCenter/apvs` | `APV` | **No** — nothing in the codebase sets this | `createApvJournalEntry` | No | Yes (returns existing ID, doesn't update) |
| Vendor Payment | `transactions/vendorCenter/payments` | `VP` | Always (`'Posted'` unconditionally) | `createVendorPaymentJournalEntry` | No | Yes (returns existing ID, doesn't update) |
| Receiving Report | `transactions/vendorCenter/receivingReports` | `RR` | Only if externally set — no UI control does this | `createReceivingReportJournalEntry` | **Yes** | **No** — re-saving a Posted RR duplicates its JE |

**Purchase cycle in practice:** Receiving Report books Dr. Inventory (hardcoded GL account) / Cr. AP for goods received, with no stock-quantity effect. APV books the expense/liability side. Vendor Payment is meant to allocate cash against outstanding APVs — but since APVs never reach `'Posted'` and Vendor Payment's outstanding-bills query filters on exactly that status, **the bill-payment-allocation feature cannot surface any bills in practice** (§1.3). Vendor Payment's own "update the APV's balance after paying it" step is explicitly commented-out TODO code, so even if the status issue were fixed, balances wouldn't reconcile automatically yet.

**APV's journal entry is arithmetically unbalanced whenever withholding tax applies:** the AP credit line books the *full* `netAmount` (because `totalAmountDue` never actually subtracts `lessWithholding`, which is hardcoded to 0 in the saved doc), while a *separate* withholding-tax credit line is also booked — double-crediting the withholding amount with no offsetting debit. This is a real debit≠credit defect in a subset of real journal entries, not just a display quirk.

### 4.3 Inventory

Only one transaction type: **Inventory Adjustment** (`inventory/transactions/adjustments`, prefix `ADJ`, see §3.5). Purely a value posting (`createInventoryAdjustmentJournalEntry`): increase → Dr. hardcoded "Inventory Asset" / Cr. user-selected account; decrease → reverse. As noted in §1.5/§1.7, the form's own Warehouse/Account dropdowns point at unmanaged collections, and there's no stock-quantity ledger anywhere to adjust against — this module computes and posts a value with no linkage to real inventory counts.

### 4.4 Accounting

- **General Journal** (`transactions/accounting/journalEntries`, `sourceType:'general'`): the only place journal entries are hand-authored directly by a user rather than generated by a transaction. UI enforces balance (`Math.abs(totalDebit-totalCredit) < 0.01`) and per-line "exactly one of debit/credit" before allowing save — client-side only, no Firestore rule backs this up. `documentIdService.ts` has a fully-configured `DocumentType.JOURNAL_ENTRY` (prefix `JE`, field `journalNo`) that is **never actually called** — real journal entries (both manual and generated) use an ad hoc, non-sequential, timestamp-derived `referenceNo` instead (`JE-${Date.now().toString().substring(7)}`), duplicated independently in both the GJ form and `accountingService.ts`.
- **Reports** (`reports/apAging`, `arAging`, `balanceSheet`, `incomeStatement`, `trialBalance`): all thin wrappers around `ReportContainer` + a `reportingService.ts` data function (see §5.4). AR/AP Aging bucket by a crude **substring match** on `line.accountName` containing `"receivable"`/`"payable"` — not by any real account-type/classification field, and not by actual invoice/APV due dates (age is computed from the *journal entry's* date, not a per-document due date). Every report's CSV export is hand-rolled inline (Blob + synthetic `<a download>`), not routed through `csvExporter.ts`.
- **Audit Trail** (sidebar label "Transaction Journal"): a filterable/sortable/paginated **read-only viewer** over the entire `journalEntries` collection (fetched unfiltered, filtered client-side), re-deriving debit/credit totals per entry from `lines[]` rather than trusting the stored header totals, flagging out-of-balance entries. Has full CSV export. This is *not* a change-history/who-edited-what audit log — there's no such feature anywhere in the app.
- **Data Auditor**: a **data-quality scanner**, functionally distinct from Audit Trail — runs 9 independent checks (missing required fields, duplicate reference numbers / account codes, journal lines referencing account names absent from the Chart of Accounts, items missing a sales price under any of several historical field-name aliases, etc.) across journal entries and every masterlist collection, and offers advisory (non-writing) account-code suggestions for orphaned account names. Embeds a smaller, duplicate copy of the same balance-check journal table Audit Trail shows, without Audit Trail's filtering/export.
- **Period Closing**: real writes to `fiscalPeriods`, enforces sequential close/reopen order and blocks closing a period containing unposted (`isPosted:false`) journal entries — but has **zero enforcement effect anywhere else** in the app (§1.9).
- **Tax Reporting**: derives Output VAT / Input VAT / Withholding Tax purely by **substring-matching `accountName`** on posted journal entries (e.g. `"output vat"`, `"vat payable"`, `"withholding"`), not from any dedicated tax collection or from the `otherlist/tax` master list. Produces a monthly rollup plus three detail tables.

### 4.5 Masterlist & Otherlist

Every page follows: `MasterListContainer` (search + New button) + local `ModalForm` (add/edit) + inline delete + (for Accounts/Customers/Items/Vendors/Others only) inline CSV import/export handlers. See §3.1/§3.2 for schemas. **CSV import is inconsistent**: Customers and Vendors **destructively wipe the entire collection** before importing (behind a `confirm()`); Accounts, Items, and Others are append-only with no upsert-by-code, so re-running an import duplicates records. The seven otherlist entities have no CSV support at all.

### 4.6 Dashboard (`main/dashboard`)

Live-Firestore-driven (not static), but its KPIs are computed by **keyword-substring-matching `accountName` across all posted journal entries for the current year** rather than by real account-type joins — and several figures are explicit placeholders acknowledged in the source's own comments: `cashBalance = totalAssets` ("simplified"), `arTotal = totalRevenue` ("simplified — use revenue as AR"), `apTotal = totalLiabilities`, `quickRatio` computed identically to `currentRatio`. "Top Customers"/"Top Vendors" tables key off `entry.customer`/`entry.vendorId` on journal-entry documents (fields that generator functions do set for customer/vendor-linked entries, but which display as the raw ID — or the literal string `"unknown"` — since no lookup against `masterlist/customers`/`masterlist/vendors` is performed to resolve a display name). Charts are two Chart.js canvases (Revenue-vs-Expense line, AR-vs-AP bar) using the CDN-loaded library described in §1.

---

## 5. The Accounting Engine

### 5.1 Tax-rate handling — a systemic pattern to know

VAT is **hardcoded at 12%** in every calculation site (Sales Invoice's reactive block, Credit Memo's reactive block, `accountingService.ts`'s `grossAmount/1.12` sales-revenue split), regardless of whatever numeric rate a given `otherlist/tax` record might notionally represent — because, per §3.2, `otherlist/tax` records don't even have a rate field; they're name-only. Classification of a line as vatable/zero-rated/exempt is done by matching the *label text* of the selected tax option, not a stored rate or type code. If you're asked to make VAT-rate-configurable, this is the single hardcoded assumption threaded through the most call sites.

### 5.2 Journal-entry generators (`accountingService.ts`) — quick reference

All generators share the shape: build a header + `lines[]`, call `getJournalEntriesForSource(sourceType, sourceId)` first to check for an existing entry (behavior on collision **varies by generator** — see table below), then `addDocToCollection('accounting','journalEntries', entry)`.

| Function | Called from | On existing JE for same source | Writes `journalEntryId` back to source doc? | Notable hardcoded fallback account IDs |
|---|---|---|---|---|
| `createSalesInvoiceJournalEntry` | Sales Invoice form | **Deletes old entries, re-creates** | No | `accounts-receivable`, `undeposited-cash`, `sales-discount`, `cwt-bir2307`, `output-vat`, `sales-revenue` |
| `createDetailedSalesInvoiceJournalEntries` | *(nothing — dead code, never imported by any route)* | n/a | n/a | same set, split across 3 entries |
| `createApvJournalEntry` | APV form | Returns existing ID unchanged | No | `purchase-discounts`, `vat-input`, `withholding-tax-payable`, `accounts-payable` (only if line lacks its own account) |
| `createInventoryAdjustmentJournalEntry` | Inventory Adjustment form | Returns existing ID unchanged | No | `inventory-asset` (always, regardless of any real account) |
| `createReceiptJournalEntry` | Receive Payment form | Returns existing ID unchanged (**edit never regenerates**) | No | `cash`, `bank`, `credit-card-receivable`, `online-payments`, `accounts-receivable`, `customer-credit-balance`, `customer-deposits` |
| `createVendorPaymentJournalEntry` | Vendor Payment form (create only — edit path is commented out) | Returns existing ID unchanged | No | `cash`, `bank`, `credit-card`, `online-payments`, `accounts-payable` |
| `createCreditMemoJournalEntry` | Credit Memo form | *(no dedup check — always inserts)* | **Yes** | `sales-revenue`, `vat-payable`, `withholding-tax-receivable`, `accounts-receivable` |
| `createReceivingReportJournalEntry` | Receiving Report form (only reachable when `status==='Posted'`, which nothing in the UI sets) | *(no dedup check at all — re-saving duplicates)* | **Yes** | `inventory`, `accounts-payable` |

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

`getAllAccounts()` reads `masterlist/accounts` verbatim and casts `accountType`/`fsClassification` to the enum types with **no validation** — given the mismatch in §1.6, most real accounts won't match the enum values used by downstream `switch`/`===` logic. `getAccountBalances(dateRange)` walks every posted journal entry line, matching against a chart-of-accounts-seeded balance map **by account name first, then by account ID**; for any line whose account isn't found in either, it synthesizes a new balance bucket on the fly using `determineAccountTypeFromName`/`determineFSClassificationFromName` — keyword-heuristic functions (e.g. name contains "cash"/"bank"/"receivable"/"inventory" → Asset/CurrentAsset) that are, in practice, doing more of the real classification work than the Chart of Accounts data itself, precisely because of the §1.6 mismatch.

`getTrialBalanceData` / `getBalanceSheetData` both **auto-plug a synthetic "Retained Earnings" line** (creating the account in `masterlist/accounts` on first use if it doesn't exist, code `3500`) whenever debits≠credits or assets≠liabilities+equity, forcing the report to visually balance rather than surfacing the imbalance to the user. Given the known unbalanced-APV-with-withholding case (§4.2) and other loose ends cataloged above, **a nonzero "Retained Earnings" plug should be read as a symptom of an upstream unbalanced entry, not a real equity balance**, until the underlying issues are fixed.

`getARAgingData`/`getAPAgingData` scan **every journal entry line** for `accountName` containing `"receivable"`/`"payable"` as a substring, bucket by the *journal entry's date* (not a stored due date) into Current/1-30/31-60/61-90/>90, keyed by `entry.customer`/`entry.customerId` (or `entry.vendor`/`entry.vendorId`) — fields that are **not populated by most of the journal-entry generators** in §5.2 (only the ones with a `nameId`/`nameType` line explicitly tagged `customer`/`vendor` carry this; the aging functions read a header-level `entry.customer`/`entry.vendor`, which none of the generators in §5.2 actually set on the entry *header* — only on individual *lines*). In practice, expect most/all aging entries to bucket under `'unknown'`.

### 5.5 Chart of Accounts taxonomy — fixed 2026-08-14

This used to be a real mismatch between what the Chart of Accounts form wrote and what `reportingService.ts`'s enums expected. It's now aligned:

| Concept | Chart of Accounts **form** writes | `reportingService.ts` **`AccountType`/`FSClassification`** enums |
|---|---|---|
| Account type | `asset`, `liability`, `equity`, `revenue`, `expense`, `cogs` | `asset`, `liability`, `equity`, `revenue`, `expense`, `cogs` (enum member `Revenue = 'revenue'`, `Cogs = 'cogs'` added) |
| FS classification | `current-asset`, `non-current-asset`, `current-liability`, `non-current-liability`, `equity`, `revenue`, `cost-of-sales`, `operating-expense`, `other-income`, `other-expense`, `tax` | Same eleven kebab-case values |

`determineAccountTypeFromName`/`determineFSClassificationFromName` (the name-substring fallback heuristics used when a journal line's account isn't found in the chart) still exist and are unaffected by this fix — they remain a secondary path for synthesized/unmatched accounts, separate from the keyword sets in Dashboard and Tax Reporting which are out of scope here.

**Not migrated**: any account documents already saved in Firestore before this fix still have the old `balance_sheet`/`income_statement`/`cash_flow` or `income` values and won't classify correctly into report sections until re-saved through the form (which now writes the correct values) or migrated directly.

---

## 6. Consolidated Known-Issues Catalog

Grouped by theme, deduplicated across modules, for quick scanning. Each item references where it's detailed above.

**Data-path bugs (silent, no thrown errors):**
- ~~Receive Payment's credit-application reads/writes at the wrong Firestore path~~ **Fixed 2026-08-14** (§1.4).
- Inventory Adjustment's `view/+page.svelte` reads from the wrong path *and* wrong field names — fully dead relative to real data (§4.3, and see the removed old-doc detail: it references `items`/`previousQty`/`newQty`/`journalEntryId`/`reference`/`locationName` — none of which the form ever saves). **Still open** — this dead view page itself was not touched.
- ~~Inventory Adjustment's Warehouse/Account dropdowns resolve to unmanaged `otherlist/warehouses`/`otherlist/accounts`~~ **Fixed 2026-08-14** (§1.5).

**Broken/incomplete cross-module workflows:**
- ~~APV never reaches `'Posted'` → Vendor Payment's outstanding-bills query always returns empty~~ **Fixed 2026-08-14** — APV can now be saved as Posted or Draft (§1.3, §4.2).
- Vendor Payment's post-payment APV-balance update and edit-mode journal-entry update are both commented-out TODOs (§4.2). **Still open.**
- Receive Payment's invoice-balance update only runs on create, not edit (§4.1).
- Receiving Report's journal entry only ever posts if `status==='Posted'`, which no UI control sets (§3.4).

**Arithmetic / persistence mismatches:**
- APV's `vat`/`lessWithholding` are hardcoded `0` in the saved document while `FormFooter` visibly computes and displays nonzero values on screen (§4.2, §3.4).
- APV's journal entry is unbalanced (debit≠credit) whenever withholding tax applies (§4.2).
- Receive Payment's per-invoice discount/tax adjustments are computed for display but never persisted (§3.3).
- Sales Invoice's `dsc` (numeric percent) vs. Credit Memo's `discount` (raw option ID) — same concept, two different stored shapes across the two forms (§4.1).

**Status/summary-card mismatches:**
- `ListContainer`'s Posted/Draft counts query lowercase status values against Title-Case saved data → always 0 (§2.4).
- `ListContainer`'s Pending/Overdue counts depend on an `isPaid` field no form ever writes (§2.4).

**Taxonomy mismatch:**
- ~~Chart of Accounts form vocabulary vs. `reportingService.ts` enum vocabulary~~ **Fixed 2026-08-14** (§5.5) — new accounts now classify correctly; existing accounts saved before the fix are not migrated.

**Numbering:**
- `generateNextDocumentId`'s "transaction" provides no real concurrency protection (§5.3).
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
- ~~Fiscal-period enforcement — the write path is real, the read/enforcement path doesn't exist yet~~ **Fixed 2026-08-14** (§1.9) — `accountingService.ts`'s `isDateInClosedPeriod`/`assertPeriodOpen` now blocks posting new journal entries (from any transaction type, plus the manual General Journal form) into a closed period.

**Enforcement gaps (client-side only, nothing backs them at the data layer):**
- Journal-entry debit=credit balancing (General Journal form).
- Required fields on most transaction forms (HTML `required` attribute only; Sales Invoice in particular has no JS-level guard at all, unlike Credit Memo/Receive Payment which do check).
- Over-allocation prevention in payment-allocation UIs (cosmetic red-text warning only, not a save-blocker) — true on both Receive Payment and Vendor Payment.
- All of the above, plus everything else in the app, ultimately rests on Firestore security rules as the only real enforcement layer — and see §1.1, those rules are currently expired.

---

## 7. Conventions to Follow When Extending This System

1. **Store both an ID and a denormalized display name** for every reference field (`customer`/`customerName`, `item`/`itemName`, etc.) — this is the one convention applied consistently everywhere and existing reports/views rely on the denormalized name being present. When adding a new reference field, add both.
2. **Use the 3-segment explicit path form** (`'transactions/customerCenter/salesInvoices'`) for any new collection access rather than a 2-segment path, unless the first segment is confirmed to be one of the five `ROOT_COLLECTION_MAP` keys (`masterlist`, `otherlist`, `customerCenter`, `vendorCenter`, `accounting`). This avoids the silent-fallback trap in §2.2.
3. **If adding a new transaction type**, follow the established pattern: one `form/+page.svelte` driven by `createFormModeStore()`, register it in `DocumentType`/`documentConfigs` in `documentIdService.ts` and actually call `generateNextDocumentId`, add a matching generator in `accountingService.ts` that (a) checks `getJournalEntriesForSource` before inserting and (b) writes `journalEntryId` back onto the source document — both of which existing generators do inconsistently; do it correctly in new code rather than copying whichever existing generator is closest.
4. **Don't add new hardcoded account-ID string literals** (`'accounts-receivable'`, `'inventory-asset'`, etc.) to `accountingService.ts`. These already litter the file as unresolved placeholders; prefer resolving a real account via the transaction's own selected account field or a proper Chart-of-Accounts lookup, and treat the existing literals as known debt rather than a pattern to extend.
5. **Any new report or list summary should query against the transaction forms' actual saved values** (`'Draft'`/`'Posted'`/`'Paid'`/`'Unpaid'`/`'Partially Paid'`, Title Case) — not the lowercase convention `ListContainer` currently (incorrectly) assumes.
6. **Check `firestore.rules`' expiry** as a first step in any "the app isn't saving/loading data" investigation, before debugging application code.
