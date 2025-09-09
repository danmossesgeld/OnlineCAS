# DigiSoft CAS - Complete System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Customer Center Module](#customer-center-module)
4. [Vendor Center Module](#vendor-center-module)
5. [Inventory Module](#inventory-module)
6. [Accounting Module](#accounting-module)
7. [Master Lists Module](#master-lists-module)
8. [Other Lists Module](#other-lists-module)
9. [Accounting Flow](#accounting-flow)
10. [Technical Implementation](#technical-implementation)
11. [Database Structure](#database-structure)
12. [User Interface Guidelines](#user-interface-guidelines)

---

## System Overview

DigiSoft CAS (Computerized Accounting System) is a comprehensive web-based accounting application designed for small to medium-sized businesses. Built with modern web technologies (SvelteKit, TypeScript, Firebase), it provides a complete solution for financial management, inventory tracking, and business operations.

### Key Features
- **Multi-mode Forms**: Create, Edit, and View modes for all transactions
- **Automated Journal Entries**: Automatic double-entry bookkeeping
- **Real-time Calculations**: Dynamic totals and tax calculations
- **Document Management**: Sequential numbering and document tracking
- **Comprehensive Reporting**: Financial statements and operational reports
- **Cloud-based**: Firebase Firestore for scalability and reliability
- **Responsive Design**: Modern UI that works on all devices

### Technology Stack
- **Frontend**: SvelteKit, TypeScript, Tailwind CSS
- **Backend**: Firebase (Firestore, Functions, Hosting)
- **Authentication**: Firebase Auth
- **State Management**: Svelte stores
- **UI Components**: Custom component library

---

## Architecture

### Project Structure
```
src/
├── routes/                 # Page routes (SvelteKit routing)
│   ├── customerCenter/     # Customer-related transactions
│   ├── vendorCenter/       # Vendor-related transactions
│   ├── inventory/          # Inventory management
│   ├── accounting/         # Accounting functions
│   ├── masterlist/         # Master data management
│   └── otherlist/          # Supporting lists
├── lib/
│   ├── components/         # Reusable UI components
│   ├── utils/              # Utility functions
│   └── stores/             # State management
└── app.html               # Main application template
```

### Form Architecture
All transaction forms follow a consistent three-mode pattern:
- **Create Mode**: `/form` - New transaction entry
- **Edit Mode**: `/form/[id]` - Modify existing transaction
- **View Mode**: `/view/[id]` - Read-only transaction display

---

## Customer Center Module

The Customer Center handles all customer-related transactions and maintains accounts receivable.

### 1. Sales Invoice

**Purpose**: Record sales transactions to customers, generating invoices for goods or services sold.

**Form Fields**:
- **Customer** (Required): Select from customer master list
- **Invoice Date** (Required): Date of the invoice
- **Due Date** (Required): Payment due date
- **Payment Terms**: Credit terms (e.g., Net 30, COD)
- **Payment Method**: How payment will be received
- **PO Number**: Customer's purchase order reference
- **Memo**: Additional notes or description

**Line Items**:
- **Item**: Product or service from items master list
- **Description**: Item description (auto-filled or custom)
- **Unit**: Unit of measure
- **Quantity**: Number of units
- **Price**: Unit price
- **Discount %**: Line-level discount percentage
- **Tax Type**: VAT classification (Vatable, Zero-rated, Exempt)
- **Amount**: Calculated line total (Qty × Price - Discount)

**Calculations**:
- **Gross Amount**: Sum of all line amounts
- **Discount**: Total discount amount
- **Net Sales**: Gross amount minus discount
- **VAT**: 12% on vatable sales
- **Vatable Sales**: Sales subject to VAT
- **Zero-rated**: VAT-exempt export sales
- **VAT-Exempt**: Non-taxable sales
- **Less: Withholding Tax**: Tax withheld by customer (1% or 2%)
- **Total Amount Due**: Final amount customer owes

**Accounting Flow**:
```
Dr. Accounts Receivable (or Cash)     XXX.XX
    Cr. Sales Revenue                         XXX.XX
    Cr. VAT Payable                          XXX.XX
Dr. Withholding Tax Receivable        XXX.XX (if applicable)
```

### 2. Credit Memo

**Purpose**: Record returns, allowances, or corrections that reduce customer balances.

**Form Fields**:
- **Customer** (Required): Customer receiving the credit
- **Credit Date** (Required): Date of the credit memo
- **Reference Invoice**: Original invoice being credited
- **Reason**: Reason for the credit (return, allowance, etc.)
- **Memo**: Additional details

**Line Items**: Similar to sales invoice but for returned/credited items

**Accounting Flow**:
```
Dr. Sales Returns and Allowances      XXX.XX
Dr. VAT Payable                       XXX.XX
    Cr. Accounts Receivable                   XXX.XX
```

### 3. Receive Payment

**Purpose**: Record customer payments against outstanding invoices.

**Form Fields**:
- **Customer** (Required): Customer making payment
- **Receipt Date** (Required): Date payment received
- **Payment Method** (Required): Cash, check, bank transfer, etc.
- **Reference**: Check number, transaction ID, etc.
- **Amount** (Required): Total payment amount
- **Memo**: Additional notes

**Invoice Allocation**:
- Displays outstanding invoices for selected customer
- Allows allocation of payment amount across multiple invoices
- Shows allocated vs. unallocated amounts
- Prevents over-allocation

**Accounting Flow**:
```
Dr. Cash (or Bank)                    XXX.XX
    Cr. Accounts Receivable                   XXX.XX
```

---

## Vendor Center Module

The Vendor Center manages all vendor-related transactions and maintains accounts payable.

### 1. APV (Accounts Payable Voucher)

**Purpose**: Record purchases and expenses from vendors, creating liability for amounts owed.

**Form Fields**:
- **Supplier** (Required): Vendor from vendor master list
- **AP Account** (Required): Accounts payable account (liability)
- **APV Date** (Required): Date of the voucher
- **Due Date** (Required): Payment due date
- **Payment Terms**: Credit terms with vendor
- **Payment Method**: How payment will be made
- **Reference #**: Vendor invoice number
- **PO #**: Purchase order reference
- **Memo**: Additional notes

**Line Items (Expense Items)**:
- **Account**: Expense account to charge
- **Cost Center**: Department or cost center
- **Description**: Expense description
- **Amount**: Expense amount
- **Discount %**: Line-level discount
- **Tax Type**: VAT treatment
- **Total**: Calculated line total

**Calculations**:
- **Gross Amount**: Sum of all expense amounts
- **Discount**: Total discount amount
- **Net Amount**: Gross amount minus discount
- **VAT**: Input VAT (if applicable)
- **Less: Withholding Tax**: Tax to be withheld from vendor
- **Total Amount Due**: Net amount payable to vendor

**Accounting Flow**:
```
Dr. Expense Accounts                  XXX.XX
Dr. Input VAT                         XXX.XX
    Cr. Accounts Payable                      XXX.XX
    Cr. Withholding Tax Payable              XXX.XX
```

### 2. Vendor Payment

**Purpose**: Record payments made to vendors against outstanding APVs.

**Form Fields**:
- **Vendor** (Required): Vendor being paid
- **Payment Date** (Required): Date of payment
- **Payment Method** (Required): Cash, check, bank transfer
- **Reference**: Check number, transaction reference
- **Amount** (Required): Total payment amount

**APV Allocation**: Similar to customer payments, allocates payment across outstanding APVs

**Accounting Flow**:
```
Dr. Accounts Payable                  XXX.XX
    Cr. Cash (or Bank)                        XXX.XX
```

### 3. Receiving Report

**Purpose**: Record receipt of goods from vendors, updating inventory and creating payable liability.

**Form Fields**:
- **Vendor** (Required): Supplier of goods
- **RR Date** (Required): Date goods received
- **Reference**: Delivery receipt, invoice number
- **PO Reference**: Related purchase order
- **Memo**: Additional notes

**Line Items**:
- **Item**: Inventory item received
- **Description**: Item description
- **Unit**: Unit of measure
- **Quantity Received**: Actual quantity received
- **Unit Cost**: Cost per unit
- **Total**: Calculated line total

**Accounting Flow**:
```
Dr. Inventory                         XXX.XX
    Cr. Accounts Payable                      XXX.XX
```

---

## Inventory Module

### Inventory Adjustment

**Purpose**: Record changes to inventory quantities due to physical counts, damage, theft, or other adjustments.

**Form Fields**:
- **Adjustment Date** (Required): Date of adjustment
- **Reference**: Adjustment reference number
- **Reason**: Reason for adjustment (physical count, damage, etc.)
- **Memo**: Additional details

**Line Items**:
- **Item**: Inventory item being adjusted
- **Current Qty**: Current system quantity
- **Actual Qty**: Physical count or adjusted quantity
- **Variance**: Difference (Actual - Current)
- **Unit Cost**: Cost per unit
- **Total Adjustment**: Variance × Unit Cost

**Accounting Flow**:
For positive adjustments (increases):
```
Dr. Inventory                         XXX.XX
    Cr. Inventory Adjustment Income           XXX.XX
```

For negative adjustments (decreases):
```
Dr. Inventory Adjustment Expense      XXX.XX
    Cr. Inventory                             XXX.XX
```

---

## Accounting Module

### 1. General Journal

**Purpose**: Record manual journal entries for transactions not covered by other modules.

**Form Fields**:
- **Journal Date** (Required): Date of the entry
- **Reference**: Reference number or description
- **Description**: Entry description
- **Memo**: Additional notes

**Journal Lines**:
- **Line #**: Sequential line number
- **Account**: Chart of accounts selection
- **Name**: Customer/vendor if applicable
- **Description**: Line description
- **Debit**: Debit amount
- **Credit**: Credit amount

**Validation**: Total debits must equal total credits

### 2. Reports

#### Trial Balance
- Lists all accounts with debit and credit balances
- Verifies that total debits equal total credits
- Filters by date range

#### Balance Sheet
- Shows financial position at a specific date
- Assets = Liabilities + Equity
- Organized by account classification

#### Income Statement
- Shows revenues and expenses for a period
- Calculates net income/loss
- Organized by account type

#### AR Aging
- Shows customer balances by age (current, 30, 60, 90+ days)
- Helps manage collections

#### AP Aging
- Shows vendor balances by age
- Helps manage cash flow and payments

### 3. Audit Trail
- Complete transaction history
- Shows all changes to financial data
- User and timestamp tracking

### 4. Period Closing
- Closes accounting periods
- Prevents changes to closed periods
- Generates closing entries

---

## Master Lists Module

### 1. Chart of Accounts

**Purpose**: Define the complete chart of accounts for the organization.

**Fields**:
- **Code** (Required): Account code/number
- **Name** (Required): Account name
- **Description**: Detailed description
- **Account Type** (Required): Asset, Liability, Equity, Revenue, Expense, COGS
- **FS Classification**: Balance Sheet, Income Statement, Cash Flow
- **Parent Account**: For sub-accounts
- **GL Code/Name**: General ledger integration
- **SL Code/Name**: Sub-ledger integration
- **Active**: Whether account is active
- **System**: Whether it's a system-required account

**Account Types**:
- **Asset**: Resources owned (Cash, Inventory, Equipment)
- **Liability**: Amounts owed (Accounts Payable, Loans)
- **Equity**: Owner's interest (Capital, Retained Earnings)
- **Revenue**: Income from operations (Sales, Service Revenue)
- **Expense**: Costs of operations (Rent, Utilities, Salaries)
- **COGS**: Direct costs of goods sold

### 2. Customers

**Fields**:
- **Name** (Required): Customer name
- **Code**: Customer code
- **Contact Information**: Address, phone, email
- **Tax Information**: TIN, tax classification
- **Credit Terms**: Default payment terms
- **Credit Limit**: Maximum credit allowed
- **Status**: Active/Inactive

### 3. Vendors

**Fields**:
- **Name** (Required): Vendor name
- **Code**: Vendor code
- **Contact Information**: Address, phone, email
- **Tax Information**: TIN, tax classification
- **Payment Terms**: Default payment terms
- **Status**: Active/Inactive

### 4. Items

**Fields**:
- **Name** (Required): Item name
- **Code**: Item code/SKU
- **Description**: Detailed description
- **Category**: Item category
- **Unit**: Default unit of measure
- **Cost**: Standard cost
- **Price**: Selling price
- **Tax Type**: VAT classification
- **Track Inventory**: Whether to track quantities
- **Status**: Active/Inactive

---

## Other Lists Module

### Supporting Lists

1. **Terms**: Payment terms (Net 30, COD, etc.)
2. **Payment Methods**: Cash, Check, Bank Transfer, etc.
3. **Tax Types**: VAT classifications (Vatable, Zero-rated, Exempt)
4. **Units**: Units of measure (pcs, kg, liter, etc.)
5. **Categories**: Item categories
6. **Locations**: Storage locations
7. **Cost Centers**: Departments or cost centers
8. **Discounts**: Discount types and rates

---

## Accounting Flow

### Double-Entry Bookkeeping

The system automatically generates journal entries for all transactions, ensuring proper double-entry bookkeeping:

#### Sales Cycle
1. **Sales Invoice** → Dr. A/R, Cr. Sales Revenue
2. **Receive Payment** → Dr. Cash, Cr. A/R
3. **Credit Memo** → Dr. Sales Returns, Cr. A/R

#### Purchase Cycle
1. **Receiving Report** → Dr. Inventory, Cr. A/P
2. **APV** → Dr. Expenses, Cr. A/P
3. **Vendor Payment** → Dr. A/P, Cr. Cash

#### Inventory Cycle
1. **Inventory Adjustment** → Dr./Cr. Inventory, Cr./Dr. Adjustment Account

### Journal Entry Generation

The `accountingService.ts` utility automatically creates journal entries for:
- Sales invoices (cash and credit sales)
- APVs (expense vouchers)
- Inventory adjustments
- Customer payment receipts
- Vendor payments
- Credit memos
- Receiving reports

Each journal entry includes:
- Header information (date, reference, description)
- Line items with account, amounts, and descriptions
- Source document references
- Automatic posting status

---

## Technical Implementation

### Form Architecture

All forms use a consistent pattern with three components:

1. **FormLayout**: Provides the overall page structure
2. **FormSection**: Groups related fields and line items
3. **FormFooter**: Contains action buttons and summary information

### Form Modes

Forms support three modes controlled by URL parameters:
- **Create**: `/form` - New transaction
- **Edit**: `/form/[id]` - Modify existing transaction
- **View**: `/view/[id]` - Read-only display

### State Management

- **FormModeStore**: Manages form mode and document ID
- **FirestoreOptionsStore**: Provides dropdown options from Firestore
- **Reactive Calculations**: Real-time updates using Svelte reactivity

### Data Validation

- **Required Fields**: Enforced at form level
- **Business Rules**: Custom validation logic
- **Data Types**: TypeScript ensures type safety
- **Totals Validation**: Automatic calculation verification

### Document Numbering

Sequential document numbers are generated using `documentIdService.ts`:
- Sales invoices: SI-YYYYMMDD-001
- APVs: APV-YYYYMMDD-001
- Payment receipts: PR-YYYYMMDD-001
- Credit memos: CM-YYYYMMDD-001

---

## Database Structure

### Firestore Collections

```
listdatabase/
├── masterlist/
│   ├── accounts/           # Chart of accounts
│   ├── customers/          # Customer master
│   ├── vendors/            # Vendor master
│   └── items/              # Item master
├── otherlist/
│   ├── terms/              # Payment terms
│   ├── paymentmethods/     # Payment methods
│   ├── tax/                # Tax types
│   └── units/              # Units of measure
└── transactions/
    ├── customerCenter/
    │   ├── salesInvoices/  # Sales invoices
    │   ├── receipts/       # Payment receipts
    │   └── creditMemos/    # Credit memos
    ├── vendorCenter/
    │   ├── apvs/           # APVs
    │   ├── payments/       # Vendor payments
    │   └── receivingReports/ # Receiving reports
    ├── inventory/
    │   └── adjustments/    # Inventory adjustments
    └── accounting/
        └── journalEntries/ # Journal entries
```

### Document Structure

Each transaction document contains:
- **Header fields**: Date, reference, parties involved
- **Line items**: Array of transaction details
- **Totals**: Calculated amounts
- **Status**: Draft, Posted, Void
- **Audit fields**: Created/updated timestamps, user info
- **Journal reference**: Link to generated journal entry

### Path Mapping System

The `firestoreCrud.ts` utility contains a `ROOT_COLLECTION_MAP` that automatically maps simplified collection paths to their full Firestore structure:

```javascript
const ROOT_COLLECTION_MAP: Record<string, string> = {
  'masterlist': 'listdatabase',
  'otherlist': 'listdatabase',
  'customerCenter': 'transactions',
  'vendorCenter': 'transactions',
  'inventory': 'transactions',
  'accounting': 'transactions'
};
```

This allows code to use simplified paths like `masterlist/items` which get automatically translated to `listdatabase/masterlist/items`.

---

## Component Architecture

The application uses a comprehensive set of reusable components for consistency and maintainability:

### Core Components

#### 1. FireTable (`$lib/components/FireTable.svelte`)
- **Purpose**: Primary data display component that connects to Firestore collections
- **Features**:
  - Real-time updates from Firestore listeners
  - Automatic data formatting (dates, currency, status)
  - Sortable columns with custom sort functions
  - Action slots for CRUD operations
  - Loading states and error handling
  - Pagination support for large datasets

#### 2. ModalForm (`$lib/components/ModalForm.svelte`)
- **Purpose**: Creates modal dialogs for adding/editing records
- **Features**:
  - Dynamic form field rendering based on configuration
  - Built-in validation with error display
  - Support for multiple field types (text, select, date, number, textarea)
  - Save/cancel operations with confirmation dialogs
  - Responsive design for different screen sizes

#### 3. FormLayout (`$lib/components/FormLayout.svelte`)
- **Purpose**: Standardized form structure with consistent styling
- **Features**:
  - Responsive grid layout
  - Integrated form validation and error display
  - Consistent spacing and typography
  - Support for form sections and grouping

#### 4. TxnFields (`$lib/components/TxnFields.svelte`)
- **Purpose**: Reusable transaction fields component
- **Features**:
  - Common transaction data handling (dates, references, amounts)
  - Consistent validation and formatting
  - Auto-population of related fields
  - Integration with master data options

#### 5. ListButtons (`$lib/components/ListButtons.svelte`)
- **Purpose**: Renders action buttons with consistent styling
- **Features**:
  - Support for custom icons and actions
  - Responsive button layout
  - Consistent hover and focus states
  - Accessibility compliance

### Utility Services

#### 1. firestoreCrud.ts
- **CRUD Operations**: Create, read, update, delete operations
- **Collection Path Mapping**: Automatic path translation
- **Error Handling**: Consistent error management
- **Batch Operations**: Support for bulk operations

#### 2. firestoreStores.ts
- **Reactive Stores**: Creates Svelte stores for Firestore data
- **Real-time Updates**: Automatic UI updates when data changes
- **Collection Subscriptions**: Manages Firestore listeners
- **Derived Stores**: Computed values from base stores

#### 3. firestoreOptions.ts
- **Option Generation**: Transforms collection data into select options
- **Label/Value Mapping**: Flexible field mapping for options
- **Reactive Options**: Options update when master data changes
- **Caching**: Efficient option caching and updates

#### 4. accountingService.ts
- **Journal Entry Creation**: Automated double-entry bookkeeping
- **Transaction-specific Logic**: Different journal entry patterns per transaction type
- **Account Mapping**: Links transactions to appropriate accounts
- **Tax Calculations**: Handles VAT and withholding tax entries

#### 5. documentNumbering.ts
- **Sequential Numbering**: Generates unique document numbers
- **Format Patterns**: Configurable numbering patterns
- **Collision Prevention**: Ensures unique document IDs
- **Date-based Sequences**: Incorporates date into numbering

---

## Data Flow Patterns

### Master Data to Form Fields Flow

The system implements a sophisticated data flow from master data collections to form fields:

#### 1. Option Store Creation
```javascript
// firestoreOptions.ts
export function firestoreOptionsStore(collection, labelField = 'name', valueField = 'id') {
  const { subscribe } = derived(collectionStore(collection), items => {
    return items.map(item => ({
      label: item[labelField] || 'Unnamed',
      value: item[valueField]
    }));
  });
  return { subscribe };
}

// Pre-defined stores for common options
export const customerOptions = firestoreOptionsStore('masterlist/customers', 'name', 'id');
export const itemOptions = firestoreOptionsStore('masterlist/items', 'name', 'id');
export const categoryOptions = firestoreOptionsStore('otherlist/categories');
```

#### 2. Form Integration
```javascript
// In transaction forms (e.g., salesInvoice/form/+page.svelte)
firestoreOptionsStore('masterlist/customers', 'name', 'id').subscribe(opts => customerOptions = opts);
firestoreOptionsStore('otherlist/terms').subscribe(opts => termsOptions = opts);

$: fields = [
  { label: 'Customer', name: 'customer', type: 'select', options: customerOptions, required: true },
  { label: 'Payment Terms', name: 'selectedTerms', type: 'select', options: termsOptions },
  // other fields...
];
```

#### 3. Data Binding Flow
1. **Data Storage**: Master data stored in Firestore collections
2. **Option Stores**: `firestoreOptionsStore` creates reactive stores transforming data into label/value pairs
3. **Form Configuration**: Forms use option stores to populate select fields
4. **User Selection**: When users select options, both ID and display name are stored
5. **Real-time Updates**: Changes to master data automatically update form options

### Transaction Processing Flow

#### 1. Form Initialization
```javascript
// Load master data options
firestoreOptionsStore('masterlist/customers').subscribe(opts => customerOptions = opts);
firestoreOptionsStore('masterlist/items').subscribe(opts => itemOptions = opts);

// Initialize form data
if (isEditMode) {
  // Load existing document
  const doc = await getDocFromCollection(collectionPath, docId);
  formData = { ...doc };
} else {
  // Initialize with defaults
  formData = getDefaultFormData();
}
```

#### 2. Real-time Calculations
```javascript
// Reactive calculations
$: {
  // Line item calculations
  lineItems = lineItems.map(item => ({
    ...item,
    amount: (item.quantity || 0) * (item.price || 0) * (1 - (item.discount || 0) / 100)
  }));
  
  // Document totals
  grossAmount = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  vatAmount = lineItems.reduce((sum, item) => {
    return sum + (item.taxType === 'vatable' ? (item.amount || 0) * 0.12 : 0);
  }, 0);
  totalAmount = grossAmount + vatAmount;
}
```

#### 3. Save Process
```javascript
async function handleSave() {
  // 1. Validation
  if (!validateForm()) return;
  
  // 2. Data preparation
  const documentData = {
    ...formData,
    lineItems: preparedLineItems,
    totals: calculatedTotals,
    status: 'posted'
  };
  
  // 3. Document save
  const docId = await addDocToCollection(collectionPath, documentData);
  
  // 4. Journal entry creation
  await createJournalEntry(documentData);
  
  // 5. Document numbering
  await assignDocumentNumber(docId);
}
```

### Field Linking and Dependencies

#### Customer Selection Impact
When a customer is selected, multiple fields are automatically populated:

```javascript
$: if (formData.customer) {
  const selectedCustomer = customerOptions.find(c => c.value === formData.customer);
  if (selectedCustomer) {
    // Auto-populate related fields
    formData.selectedTerms = selectedCustomer.defaultTerms;
    formData.paymentMethod = selectedCustomer.defaultPaymentMethod;
    formData.taxSettings = selectedCustomer.taxSettings;
  }
}
```

#### Item Selection Impact
Item selection triggers multiple field updates:

```javascript
function handleItemChange(index, itemId) {
  const selectedItem = itemOptions.find(i => i.value === itemId);
  if (selectedItem) {
    lineItems[index] = {
      ...lineItems[index],
      item: itemId,
      itemName: selectedItem.label,
      description: selectedItem.description,
      price: selectedItem.price,
      unit: selectedItem.defaultUnit,
      taxType: selectedItem.taxType,
      account: selectedItem.revenueAccount
    };
  }
}
```

#### Calculation Dependencies
The system maintains a hierarchy of calculations:

```javascript
// Line level calculations
$: lineItems = lineItems.map(item => ({
  ...item,
  lineTotal: (item.quantity || 0) * (item.price || 0),
  discountAmount: ((item.quantity || 0) * (item.price || 0)) * ((item.discount || 0) / 100),
  amount: ((item.quantity || 0) * (item.price || 0)) * (1 - ((item.discount || 0) / 100))
}));

// Document level calculations
$: grossAmount = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
$: vatableAmount = lineItems.filter(item => item.taxType === 'vatable')
                           .reduce((sum, item) => sum + (item.amount || 0), 0);
$: vatAmount = vatableAmount * 0.12;
$: totalAmount = grossAmount + vatAmount;
```

This comprehensive data flow ensures that the system maintains data integrity, provides real-time updates, and creates a seamless user experience across all transaction types.

---

## Best Practices and Data Integrity

### Data Storage Patterns

#### Dual Reference Storage
The system follows a consistent pattern of storing both IDs and display names for all references:

```javascript
// When saving transaction data
const transactionData = {
  customer: formData.customer,           // ID reference for relations
  customerName: getCustomerName(formData.customer), // Display name for UI
  selectedTerms: formData.selectedTerms, // ID reference
  termsName: getTermsName(formData.selectedTerms),   // Display name
  // ... other fields
};

// Helper function to get display names
function getCustomerName(customerId) {
  const customer = customerOptions.find(c => c.value === customerId);
  return customer ? customer.label : '';
}
```

**Benefits**:
1. **Relational Integrity**: IDs maintain proper relationships
2. **Performance**: Display names avoid additional lookups in lists
3. **Historical Accuracy**: Data remains accurate even if master data changes
4. **Offline Capability**: UI can display data without master data lookups

#### Line Item Reference Storage
Line items store comprehensive reference data:

```javascript
const preparedLineItems = lineItems.map(item => ({
  ...item,
  itemName: getItemName(item.item),         // Display name
  unitName: getUnitName(item.unit),         // Unit display name
  taxTypeName: getTaxTypeName(item.taxType), // Tax type display name
  categoryName: getCategoryName(item.category), // Category display name
  // Calculated fields
  lineTotal: item.quantity * item.price,
  discountAmount: (item.quantity * item.price) * (item.discount / 100),
  amount: (item.quantity * item.price) * (1 - item.discount / 100)
}));
```

### Form Validation Patterns

#### Multi-level Validation
```javascript
function validateForm() {
  const errors = [];
  
  // 1. Required field validation
  if (!formData.customer) errors.push('Customer is required');
  if (!formData.invoiceDate) errors.push('Invoice date is required');
  
  // 2. Business rule validation
  if (formData.dueDate && formData.dueDate < formData.invoiceDate) {
    errors.push('Due date cannot be before invoice date');
  }
  
  // 3. Line item validation
  if (lineItems.length === 0) {
    errors.push('At least one line item is required');
  }
  
  lineItems.forEach((item, index) => {
    if (!item.item) errors.push(`Item is required for line ${index + 1}`);
    if (!item.quantity || item.quantity <= 0) {
      errors.push(`Valid quantity is required for line ${index + 1}`);
    }
  });
  
  // 4. Total validation
  const calculatedTotal = calculateTotal();
  if (Math.abs(calculatedTotal - formData.totalAmount) > 0.01) {
    errors.push('Total amount does not match calculated total');
  }
  
  if (errors.length > 0) {
    showErrorMessages(errors);
    return false;
  }
  
  return true;
}
```

### Option Store Management

#### Consistent Option Store Usage
```javascript
// Define option stores at module level
let customerOptions = [];
let itemOptions = [];
let termsOptions = [];
let unitOptions = [];

// Subscribe to option stores
firestoreOptionsStore('masterlist/customers', 'name', 'id').subscribe(opts => customerOptions = opts);
firestoreOptionsStore('masterlist/items', 'name', 'id').subscribe(opts => itemOptions = opts);
firestoreOptionsStore('otherlist/terms').subscribe(opts => termsOptions = opts);
firestoreOptionsStore('otherlist/units').subscribe(opts => unitOptions = opts);

// Use reactive statements for field configuration
$: fields = [
  { label: 'Customer', name: 'customer', type: 'select', options: customerOptions, required: true },
  { label: 'Terms', name: 'selectedTerms', type: 'select', options: termsOptions },
  // ... other fields
];

$: lineItemColumns = [
  { label: 'Item', key: 'item', type: 'select', options: itemOptions, width: '25%' },
  { label: 'Unit', key: 'unit', type: 'select', options: unitOptions, width: '10%' },
  // ... other columns
];
```

### Error Handling Patterns

#### Comprehensive Error Management
```javascript
async function handleSave() {
  try {
    // 1. Pre-save validation
    if (!validateForm()) return;
    
    // 2. Show loading state
    isLoading = true;
    errorMessage = '';
    
    // 3. Prepare data
    const documentData = prepareDocumentData();
    
    // 4. Save with error handling
    const docId = await addDocToCollection(collectionPath, documentData);
    
    // 5. Create journal entry
    await createJournalEntry(documentData);
    
    // 6. Success handling
    showSuccessMessage('Document saved successfully');
    goto('/customerCenter/salesInvoice/list');
    
  } catch (error) {
    console.error('Save error:', error);
    errorMessage = `Failed to save: ${error.message}`;
  } finally {
    isLoading = false;
  }
}
```

### Performance Optimization

#### Efficient Data Loading
```javascript
// Use derived stores for computed values
const totalAmount = derived(
  [lineItemsStore, taxSettingsStore],
  ([$lineItems, $taxSettings]) => {
    return calculateTotalAmount($lineItems, $taxSettings);
  }
);

// Debounce expensive calculations
let calculationTimeout;
function debouncedCalculation() {
  clearTimeout(calculationTimeout);
  calculationTimeout = setTimeout(() => {
    recalculateTotals();
  }, 300);
}

// Use reactive statements efficiently
$: if (formData.customer) {
  loadCustomerDefaults(formData.customer);
}

$: if (lineItems.length > 0) {
  debouncedCalculation();
}
```

### Code Organization Standards

#### Consistent File Structure
```javascript
// 1. Imports
import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { firestoreOptionsStore } from '$lib/utils/firestoreOptions';

// 2. Component props
export let docId = '';

// 3. State variables
let formData = getDefaultFormData();
let lineItems = [];
let isLoading = false;
let errorMessage = '';

// 4. Option stores
let customerOptions = [];
let itemOptions = [];

// 5. Reactive statements
$: isEditMode = !!docId;
$: fields = getFieldConfiguration();
$: totalAmount = calculateTotal();

// 6. Functions
function getDefaultFormData() { /* ... */ }
function validateForm() { /* ... */ }
async function handleSave() { /* ... */ }

// 7. Lifecycle
onMount(async () => {
  await loadInitialData();
});
```

### Security and Access Control

#### Data Validation and Sanitization
```javascript
function sanitizeFormData(data) {
  return {
    ...data,
    // Trim string fields
    customerName: data.customerName?.trim() || '',
    memo: data.memo?.trim() || '',
    // Ensure numeric fields are numbers
    totalAmount: parseFloat(data.totalAmount) || 0,
    // Validate dates
    invoiceDate: isValidDate(data.invoiceDate) ? data.invoiceDate : null,
    // Remove any potentially harmful fields
    ...Object.fromEntries(
      Object.entries(data).filter(([key]) => !key.startsWith('_'))
    )
  };
}
```

#### Access Control Patterns
```javascript
// Check user permissions before allowing operations
function canUserEdit(documentType, userId) {
  const userRole = getUserRole(userId);
  const permissions = getPermissions(userRole);
  return permissions.includes(`edit_${documentType}`);
}

// Implement in forms
if (!canUserEdit('salesInvoice', currentUser.uid)) {
  goto('/unauthorized');
}
```

These best practices ensure the DigiSoft CAS system maintains high data quality, provides excellent user experience, and remains maintainable as it grows.

---

## User Interface Guidelines

### Design Principles

1. **Consistency**: All forms follow the same layout and interaction patterns
2. **Clarity**: Clear labels, helpful placeholders, and validation messages
3. **Efficiency**: Keyboard shortcuts, auto-completion, and smart defaults
4. **Responsiveness**: Works on desktop, tablet, and mobile devices

### Form Layout

1. **Header**: Page title and navigation
2. **Main Fields**: Primary transaction information
3. **Line Items**: Detailed transaction lines with add/remove functionality
4. **Summary**: Calculated totals and tax information
5. **Actions**: Save, cancel, and other action buttons

### Color Coding

- **Primary Blue**: Main actions and highlights
- **Green**: Success states and positive amounts
- **Red**: Errors and negative amounts
- **Gray**: Secondary information and disabled states

### Accessibility

- **Keyboard Navigation**: Full keyboard support
- **Screen Readers**: Proper ARIA labels and semantic HTML
- **Color Contrast**: WCAG compliant color combinations
- **Focus Management**: Clear focus indicators

---

## Conclusion

DigiSoft CAS provides a comprehensive accounting solution with modern web technologies. The system's modular design, automated journal entries, and consistent user interface make it suitable for businesses requiring robust financial management capabilities.

The documentation serves as both a user guide and technical reference, ensuring proper understanding of the system's functionality and accounting flows. Regular updates to this documentation should accompany system enhancements and new feature additions.
