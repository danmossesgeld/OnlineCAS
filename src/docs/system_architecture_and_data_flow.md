# DigiSoft-CAS System Architecture and Data Flow

## Table of Contents

1. [Database Structure](#database-structure)
2. [Master Data Management](#master-data-management)
3. [Transaction Processing](#transaction-processing)
4. [Accounting Integration](#accounting-integration)
5. [Component Architecture](#component-architecture)
6. [Data Flow Patterns](#data-flow-patterns)

## Database Structure

The application uses a hierarchical Firestore database structure:

```
listdatabase (Collection)
├── masterlist (Document)
│   ├── customers (Collection)
│   ├── items (Collection)
│   ├── vendors (Collection)
│   └── othernames (Collection)
└── otherlist (Document)
    ├── categories (Collection)
    ├── discounts (Collection)
    ├── locations (Collection)
    ├── paymentmethods (Collection)
    ├── tax (Collection)
    ├── terms (Collection)
    └── units (Collection)

transactions (Collection)
├── customerCenter (Document)
│   ├── salesInvoices (Collection)
│   └── receipts (Collection)
├── vendorCenter (Document)
│   ├── bills (Collection)
│   └── payments (Collection)
└── accounting (Document)
    ├── journalEntries (Collection)
    ├── chartOfAccounts (Collection)
    └── fiscalPeriods (Collection)
```

Path mapping is automatically handled by utility functions in `firestoreCrud.ts` that translate simplified paths like `masterlist/items` to complete paths like `listdatabase/masterlist/items`.

## Master Data Management

Master data entities serve as the foundation for all transactions:

### Customers
- Stored in `listdatabase/masterlist/customers`
- Contains contact information, default terms, and account settings
- Referenced in sales invoices and customer receipts

### Items
- Stored in `listdatabase/masterlist/items`
- Contains pricing, inventory, and accounting information
- Used in sales invoices and purchase orders

### Vendors
- Stored in `listdatabase/masterlist/vendors`
- Contains supplier information and payment terms
- Referenced in bills and vendor payments

### Support Data
- Categories, discounts, payment methods, tax configurations, etc.
- Stored in respective collections under `listdatabase/otherlist`
- Provide standardized options for transactions

## Transaction Processing

### Sales Cycle
1. **Sales Invoice Creation**
   - Created in `transactions/customerCenter/salesInvoices`
   - References customer data from masterlist
   - Line items reference product data
   - Automatically generates accounting journal entries

2. **Customer Payment Processing**
   - Recorded in `transactions/customerCenter/receipts`
   - Links to outstanding invoices
   - Updates invoice status and balances
   - Generates payment journal entries

### Purchase Cycle
1. **Vendor Bill Processing**
   - Recorded in `transactions/vendorCenter/bills`
   - References vendor data from masterlist
   - Creates accounts payable entries
   - Supports expense categorization

2. **Vendor Payment Processing**
   - Recorded in `transactions/vendorCenter/payments`
   - Links to outstanding bills
   - Updates bill status and balances
   - Generates payment journal entries

## Accounting Integration

The accounting system integrates with transactions through journal entries:

### Journal Entry Creation
- Each business transaction automatically generates corresponding journal entries
- `createSalesInvoiceJournalEntry()` handles sales invoice accounting
- Journal entries stored in `transactions/accounting/journalEntries`

### Double-Entry Accounting
- Sales Invoice Example:
  - Debit: Accounts Receivable or Cash (for cash sales)
  - Credit: Sales Revenue, VAT Payable
  - Optional: Debit to Withholding Tax Receivable

- Vendor Bill Example:
  - Debit: Expense Accounts
  - Credit: Accounts Payable
  - Optional: Input VAT, Withholding Tax

### Account Structure
- Chart of accounts maintained in `transactions/accounting/chartOfAccounts`
- Standard account categories: Assets, Liabilities, Equity, Revenue, Expenses
- Accounts linked to transactions for financial reporting

## Component Architecture

The application uses reusable components for consistency:

### FireTable Component
- Core data display component that connects to Firestore
- Handles real-time updates from the database
- Formats dates, currency, and status fields
- Provides action slots for CRUD operations

### Form Components
- Standardized form structure with `FormLayout` and `FormSection`
- Reusable transaction fields with `TxnFields`
- Consistent footer actions with `FormFooter`

### Firestore Utilities
- `firestoreCrud.ts`: Handles CRUD operations with proper collection path mapping
- `firestoreStores.ts`: Creates reactive Svelte stores for Firestore data
- `firestoreOptions.ts`: Provides select options from Firestore collections

## Data Flow Patterns

### Form Data Handling
1. Options loaded from master data collections via `firestoreOptionsStore`
2. Form initialized with default values or loaded document
3. Changes in fields trigger reactive updates to calculations
4. On save, data transformed and saved to Firestore
5. Journal entries automatically created via `accountingService.ts`

### Real-time Updates
1. Components subscribe to Firestore collections via `collectionStore`
2. Firestore real-time listeners update UI when data changes
3. Tables and forms react to changes without page refresh

### Field Linking
- Master data fields automatically populate related fields
- Example: Selecting a customer populates terms and payment methods
- Item selection populates description, price, and account information
- Changes to quantity or price trigger amount recalculations

This architecture ensures data consistency, proper accounting integration, and a responsive user experience throughout the application.
