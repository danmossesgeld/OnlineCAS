import { addDocToCollection, updateDocInCollection, getDocFromCollection, queryCollectionDocs, type FilterCondition } from './firestoreCrud';

/**
 * Generates a unique reference number for journal entries
 * @returns Formatted reference number
 */
function generateJournalEntryNumber(): string {
  return `JE-${Date.now().toString().substring(7)}`;
}

/**
 * Checks whether a given transaction date falls within a closed fiscal period
 * (transactions/accounting/fiscalPeriods, isClosed === true).
 * @param date - Date, Firestore timestamp, or date string to check
 * @returns Whether the date is closed, and a human-readable label for the period if so
 */
export async function isDateInClosedPeriod(date: any): Promise<{ closed: boolean; periodLabel?: string }> {
  try {
    let d: Date;
    if (date instanceof Date) {
      d = date;
    } else if (date && typeof date === 'object' && 'seconds' in date) {
      d = new Date(date.seconds * 1000);
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      return { closed: false };
    }
    if (isNaN(d.getTime())) return { closed: false };

    const filters: FilterCondition[] = [{ field: 'isClosed', operator: '==', value: true }];
    const closedPeriods = await queryCollectionDocs('accounting/fiscalPeriods', filters);

    for (const period of closedPeriods as any[]) {
      const start = period.startDate?.seconds ? new Date(period.startDate.seconds * 1000) : new Date(period.startDate);
      const end = period.endDate?.seconds ? new Date(period.endDate.seconds * 1000) : new Date(period.endDate);
      if (d >= start && d <= end) {
        const periodLabel = period.monthName ? `${period.monthName} ${period.year}` : `${period.year}-${(period.month ?? 0) + 1}`;
        return { closed: true, periodLabel };
      }
    }
    return { closed: false };
  } catch (error) {
    // If the period-status check itself fails (e.g. transient Firestore error), don't block a legitimate save.
    console.error('Error checking fiscal period status:', error);
    return { closed: false };
  }
}

/**
 * Throws if the given transaction date falls within a closed fiscal period.
 * Call this before creating/updating a journal entry so closed-period postings are rejected.
 */
async function assertPeriodOpen(date: any): Promise<void> {
  const { closed, periodLabel } = await isDateInClosedPeriod(date);
  if (closed) {
    throw new Error(`Cannot post this transaction: the fiscal period${periodLabel ? ` "${periodLabel}"` : ''} is closed. Reopen it from Period Closing or choose a different date.`);
  }
}

/**
 * Formats a description for journal entries
 * @param sourceType - Type of source document
 * @param sourceRef - Reference number of the source document
 * @returns Formatted description
 */
function formatJournalDescription(sourceType: string, sourceRef: string): string {
  const typeMap: Record<string, string> = {
    'salesInvoice': 'Sales Invoice',
    'apv': 'Accounts Payable Voucher',
    'payment': 'Payment',
    'receipt': 'Receipt',
    'general': 'General Journal'
  };
  
  const documentType = typeMap[sourceType] || sourceType;
  return `${documentType} #${sourceRef}`;
}

/**
 * Creates a journal entry for a sales invoice
 * @param invoice - The sales invoice data
 * @returns The created journal entry ID
 */
export async function createSalesInvoiceJournalEntry(invoice: any): Promise<string | null> {
  await assertPeriodOpen(invoice.invoiceDate);
  try {
    // Calculate amounts based on the correct accounting computation
    const vat = invoice.vat || 0;
    const vatableSales = invoice.vatableSales || 0;
    const zeroRated = invoice.zeroRated || 0;
    const vatExempt = invoice.vatExempt || 0;
    const lessWithholding = invoice.lessWithholding || 0;
    const totalDue = invoice.totalDue || 0;
    // Revenue/discount are split by tax category (vatable vs. zero-rated/exempt) rather than
    // treating the whole invoice as vatable — a mixed-category invoice (or any line left at the
    // default blank tax type, which counts as exempt) would otherwise credit "Sales Revenue" at
    // grossAmount/1.12 while Output VAT only covers the vatable portion, posting an unbalanced
    // entry. zeroRated/vatExempt amounts are already net-of-discount and VAT-exclusive (no VAT to
    // strip), so only the vatable portion needs the gross/discount/VAT breakout.
    const vatableGross = invoice.vatableGross || 0;
    const vatableDiscount = Math.max(0, vatableGross - vatableSales * 1.12);
    
    // Determine the main account based on cash sale or credit sale
    const mainAccountId = invoice.cashSale ? 'undeposited-cash' : 'accounts-receivable';
    const mainAccountName = invoice.cashSale ? 'Undeposited Cash' : 'Accounts Receivable';
    
    // Create the journal entry header
    const journalEntryData = {
      journalDate: invoice.invoiceDate,
      referenceNo: generateJournalEntryNumber(),
      description: formatJournalDescription('salesInvoice', invoice.invoiceNo),
      memo: invoice.memo || '',
      sourceType: 'salesInvoice',
      sourceId: invoice.id,
      totalDebit: totalDue,
      totalCredit: totalDue,
      isPosted: true,
      status: 'posted',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Create journal entry lines - Simplified Entry (as shown in the image)
    const lines: any[] = [];
    let lineCounter = 1;
    
    // 1. Debit Main Account (A/R or Undeposited Cash) - Net Amount Due
    lines.push({
      lineNo: lineCounter++,
      accountId: mainAccountId,
      accountName: mainAccountName,
      nameType: 'customer',
      nameId: invoice.customer,
      nameName: invoice.customerName,
      lineDescription: `Invoice #${invoice.invoiceNo}`,
      debit: totalDue,
      credit: 0
    });
    
    // 2. Debit Sales Discount (vatable lines only — zero-rated/exempt lines' discounts are
    // already netted into their revenue amounts below, since they have no VAT to strip out)
    if (vatableDiscount > 0) {
      const discountVatExclusive = vatableDiscount / 1.12;

      lines.push({
        lineNo: lineCounter++,
        accountId: 'sales-discount',
        accountName: 'Sales Discount',
        nameType: 'customer',
        nameId: invoice.customer,
        nameName: invoice.customerName,
        lineDescription: `Sales Discount - Invoice #${invoice.invoiceNo}`,
        debit: discountVatExclusive,
        credit: 0
      });
    }
    
    // 3. Debit CWT (BIR2307) - Withholding Tax
    if (lessWithholding > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: 'cwt-bir2307',
        accountName: 'CWT (BIR2307)',
        nameType: 'customer',
        nameId: invoice.customer,
        nameName: invoice.customerName,
        lineDescription: `Withholding Tax - Invoice #${invoice.invoiceNo}`,
        debit: lessWithholding,
        credit: 0
      });
    }
    
    // 4. Credit Output VAT
    if (vat > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: 'output-vat',
        accountName: 'Output VAT',
        lineDescription: `Output VAT - Invoice #${invoice.invoiceNo}`,
        debit: 0,
        credit: vat
      });
    }
    
    // 5. Credit Sales Revenue — split by tax category so the entry balances regardless of the
    // mix of vatable/zero-rated/exempt lines on the invoice.
    const vatableRevenue = vatableGross / 1.12;
    if (vatableRevenue > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: 'sales-revenue',
        accountName: 'Sales',
        nameType: 'customer',
        nameId: invoice.customer,
        nameName: invoice.customerName,
        lineDescription: `Sales Revenue (Vatable) - Invoice #${invoice.invoiceNo}`,
        debit: 0,
        credit: vatableRevenue
      });
    }
    if (zeroRated > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: 'sales-revenue',
        accountName: 'Sales',
        nameType: 'customer',
        nameId: invoice.customer,
        nameName: invoice.customerName,
        lineDescription: `Zero-Rated Sales - Invoice #${invoice.invoiceNo}`,
        debit: 0,
        credit: zeroRated
      });
    }
    if (vatExempt > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: 'sales-revenue',
        accountName: 'Sales',
        nameType: 'customer',
        nameId: invoice.customer,
        nameName: invoice.customerName,
        lineDescription: `VAT-Exempt Sales - Invoice #${invoice.invoiceNo}`,
        debit: 0,
        credit: vatExempt
      });
    }

    // Create the complete journal entry with lines. totalDebit/totalCredit reflect the actual
    // line sums (not just totalDue) so they stay accurate now that discount/withholding lines
    // can make total debits exceed totalDue.
    const linesTotalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const linesTotalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);
    const journalEntry = {
      ...journalEntryData,
      totalDebit: linesTotalDebit,
      totalCredit: linesTotalCredit,
      lines
    };

    // Check if a journal entry already exists for this invoice
    const existingEntries = await getJournalEntriesForSource('salesInvoice', invoice.id);

    if (existingEntries && existingEntries.length > 0) {
      // Delete existing entries to prevent duplicates
      console.log('Deleting existing journal entries for this invoice to prevent duplicates');
      const { deleteDoc, doc, getFirestore } = await import('firebase/firestore');
      const { app } = await import('$lib/firebase');
      const db = getFirestore(app);
      
      for (const existingEntry of existingEntries) {
        await deleteDoc(doc(db, 'transactions', 'accounting', 'journalEntries', existingEntry.id));
      }
    }
    
    // Add the journal entry to Firestore
    const docRef = await addDocToCollection('accounting', 'journalEntries', journalEntry);
    return docRef.id;
    
  } catch (error) {
    console.error('Error creating journal entry:', error);
    return null;
  }
}

/**
 * Creates a journal entry for an Accounts Payable Voucher (APV)
 * @param apv - The APV data
 * @returns The created journal entry ID
 */
export async function createApvJournalEntry(apv: any): Promise<string | null> {
  await assertPeriodOpen(apv.apvDate);
  try {
    // Create the journal entry header
    const journalEntryData = {
      journalDate: apv.apvDate,
      referenceNo: generateJournalEntryNumber(),
      description: formatJournalDescription('apv', apv.apvNo),
      memo: apv.memo || '',
      sourceType: 'apv',
      sourceId: apv.id,
      totalDebit: apv.totalAmountDue,
      totalCredit: apv.totalAmountDue,
      isPosted: true,
      status: 'posted',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Create journal entry lines
    const lines = [];
    let lineCounter = 1;
    
    // Process each expense line
    apv.lineItems.forEach((item: any) => {
      // Expense entry - Debit
      lines.push({
        lineNo: lineCounter++,
        accountId: item.account,
        accountName: item.accountName || 'Expense Account',
        costCenterId: item.costCenter || null,
        costCenterName: item.costCenterName || null,
        nameType: 'vendor',
        nameId: apv.supplier,
        nameName: apv.supplierName,
        lineDescription: item.description || `APV Line - ${apv.apvNo}`,
        debit: item.amount - (item.amount * (item.dsc || 0) / 100),
        credit: 0
      });
      
      // If there's a discount, add a credit entry for it
      if (item.dsc && item.dsc > 0) {
        const discountAmount = item.amount * (item.dsc / 100);
        
        // Fetch a discount account from Chart of Accounts (could be stored in settings)
        const discountAccountId = item.discount_account_id || 'purchase-discounts';
        
        lines.push({
          lineNo: lineCounter++,
          accountId: discountAccountId,
          accountName: item.discount_account_name || 'Purchase Discounts',
          lineDescription: `Discount - ${item.description || apv.apvNo}`,
          debit: 0,
          credit: discountAmount
        });
      }
      
      // If there's VAT/Tax, add a debit entry for VAT Input Tax
      if (item.taxType && item.taxType !== '') {
        // Use the tax record for proper calculations and account linkage
        const taxRate = item.taxRate || 0.12; // Default to 12% if not specified
        const taxableAmount = item.amount - (item.amount * (item.dsc || 0) / 100);
        const taxAmount = taxableAmount * taxRate;
        
        // Use the tax account from the tax type record if available
        const taxAccountId = item.tax_account_id || 'vat-input';
        
        lines.push({
          lineNo: lineCounter++,
          accountId: taxAccountId,
          accountName: item.tax_account_name || 'VAT Input Tax',
          lineDescription: `VAT - ${item.description || apv.apvNo}`,
          debit: taxAmount,
          credit: 0
        });
      }
    });
    
    // Add withholding tax entry if applicable
    if (apv.withholdingTax && parseFloat(apv.withholdingTax) > 0) {
      const withholdingRate = parseFloat(apv.withholdingTax) / 100;
      const withholdingAmount = apv.lessWithholding || (apv.netAmount * withholdingRate);
      
      // Get the withholding tax account from Chart of Accounts (should be a liability account)
      const withholdingAccountId = apv.withholding_tax_account_id || 'withholding-tax-payable';
      
      lines.push({
        lineNo: lineCounter++,
        accountId: withholdingAccountId,
        accountName: apv.withholding_tax_account_name || 'Withholding Tax Payable',
        lineDescription: `Withholding Tax - APV #${apv.apvNo}`,
        debit: 0,
        credit: withholdingAmount
      });
    }
    
    // Add the main Accounts Payable entry - Credit
    lines.push({
      lineNo: lineCounter++,
      accountId: apv.account || 'accounts-payable',
      accountName: apv.accountName || 'Accounts Payable',
      nameType: 'vendor',
      nameId: apv.supplier,
      nameName: apv.supplierName,
      lineDescription: `Payable - APV #${apv.apvNo}`,
      debit: 0,
      credit: apv.totalAmountDue
    });
    
    // Create the complete journal entry with lines
    const journalEntry = {
      ...journalEntryData,
      lines
    };
    
    // Check if a journal entry already exists for this APV
    const existingEntries = await getJournalEntriesForSource('apv', apv.id);
    
    if (existingEntries && existingEntries.length > 0) {
      // Optionally update or delete existing entries
      console.log('Journal entry already exists for this APV');
      return existingEntries[0].id;
    }
    
    // Add the journal entry to Firestore
    const docRef = await addDocToCollection('accounting', 'journalEntries', journalEntry);
    return docRef.id;
    
  } catch (error) {
    console.error('Error creating APV journal entry:', error);
    return null;
  }
}

/**
 * Creates a journal entry for an inventory adjustment
 * @param adjustment - The inventory adjustment data
 * @returns The created journal entry ID
 */
export async function createInventoryAdjustmentJournalEntry(adjustment: any): Promise<string | null> {
  await assertPeriodOpen(adjustment.adjustmentDate);
  try {
    // Create the journal entry header
    const journalEntryData = {
      journalDate: adjustment.adjustmentDate,
      referenceNo: generateJournalEntryNumber(),
      description: formatJournalDescription('inventory_adjustment', adjustment.adjustmentNo),
      memo: adjustment.remarks || '',
      sourceType: 'inventory_adjustment',
      sourceId: adjustment.id,
      totalDebit: adjustment.totalValue,
      totalCredit: adjustment.totalValue,
      isPosted: true,
      status: 'posted',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Create journal entry lines
    const lines = [];
    let lineCounter = 1;
    
    // Different journal entries based on adjustment type
    if (adjustment.adjustmentType === 'increase') {
      // For inventory increase: Debit Inventory, Credit Adjustment Income
      
      // Debit Inventory Asset
      lines.push({
        lineNo: lineCounter++,
        accountId: 'inventory-asset', // This should be a proper inventory asset account
        accountName: 'Inventory Asset',
        lineDescription: `Inventory Increase - ${adjustment.adjustmentNo}`,
        debit: adjustment.totalValue,
        credit: 0
      });
      
      // Credit Adjustment Income (or specified account)
      lines.push({
        lineNo: lineCounter++,
        accountId: adjustment.account || 'inventory-adjustment-income',
        accountName: adjustment.accountName || 'Inventory Adjustment Income',
        lineDescription: `Adjustment Income - ${adjustment.adjustmentNo}`,
        debit: 0,
        credit: adjustment.totalValue
      });
    } else if (adjustment.adjustmentType === 'decrease') {
      // For inventory decrease: Debit Adjustment Expense, Credit Inventory
      
      // Debit Adjustment Expense (or specified account)
      lines.push({
        lineNo: lineCounter++,
        accountId: adjustment.account || 'inventory-adjustment-expense',
        accountName: adjustment.accountName || 'Inventory Adjustment Expense',
        lineDescription: `Adjustment Expense - ${adjustment.adjustmentNo}`,
        debit: adjustment.totalValue,
        credit: 0
      });
      
      // Credit Inventory Asset
      lines.push({
        lineNo: lineCounter++,
        accountId: 'inventory-asset', // This should be a proper inventory asset account
        accountName: 'Inventory Asset',
        lineDescription: `Inventory Decrease - ${adjustment.adjustmentNo}`,
        debit: 0,
        credit: adjustment.totalValue
      });
    }
    
    // Create the complete journal entry with lines
    const journalEntry = {
      ...journalEntryData,
      lines
    };
    
    // Check if a journal entry already exists for this adjustment
    const existingEntries = await getJournalEntriesForSource('inventory_adjustment', adjustment.id);
    
    if (existingEntries && existingEntries.length > 0) {
      // Optionally update or delete existing entries
      console.log('Journal entry already exists for this adjustment');
      return existingEntries[0].id;
    }
    
    // Add the journal entry to Firestore
    const docRef = await addDocToCollection('accounting', 'journalEntries', journalEntry);
    return docRef.id;
    
  } catch (error) {
    console.error('Error creating inventory adjustment journal entry:', error);
    return null;
  }
}

/**
 * Gets journal entries for a specific source document
 * @param sourceType - Type of source document
 * @param sourceId - ID of the source document
 * @returns Array of matching journal entries
 */
/**
 * Creates a journal entry for a customer payment receipt
 * @param receipt - The payment receipt data
 * @returns The created journal entry ID
 */
export async function createReceiptJournalEntry(receipt: any): Promise<string | null> {
  await assertPeriodOpen(receipt.receiptDate);
  try {
    // Determine the cash account based on payment method
    // In a real app, this would come from a mapping of payment methods to accounts
    let cashAccountId = 'cash';
    let cashAccountName = 'Cash';

    // Payment method specific accounts
    switch(receipt.paymentMethod) {
      case 'check':
        cashAccountId = 'bank';
        cashAccountName = 'Bank Account';
        break;
      case 'credit-card':
        cashAccountId = 'credit-card-receivable';
        cashAccountName = 'Credit Card Receivable';
        break;
      case 'online':
        cashAccountId = 'online-payments';
        cashAccountName = 'Online Payment Account';
        break;
      default:
        // Default to cash
        break;
    }
    
    // Calculate total transaction amount (cash + applied credits)
    const totalTransactionAmount = receipt.amount + (receipt.totalAppliedCredit || 0);
    
    // Create the journal entry header
    const journalEntryData = {
      journalDate: receipt.receiptDate,
      referenceNo: generateJournalEntryNumber(),
      description: formatJournalDescription('receipt', receipt.receiptNo),
      memo: receipt.memo || '',
      sourceType: 'receipt',
      sourceId: receipt.id,
      totalDebit: totalTransactionAmount,
      totalCredit: totalTransactionAmount,
      isPosted: true,
      status: 'posted',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Create journal entry lines
    const lines = [];
    let lineCounter = 1;
    
    // Main entry - Debit Cash/Bank (only if there's a cash payment)
    if (receipt.amount > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: cashAccountId,
        accountName: cashAccountName,
        nameType: 'customer',
        nameId: receipt.customer,
        nameName: receipt.customerName,
        lineDescription: `Receipt #${receipt.receiptNo} - Cash Payment`,
        debit: receipt.amount,
        credit: 0
      });
    }
    
    // Handle applied credits - these should be credited to their respective sources
    if (receipt.appliedCredits && Array.isArray(receipt.appliedCredits)) {
      receipt.appliedCredits.forEach((credit: any) => {
        if (credit.type === 'credit_memo') {
          // Debit Accounts Receivable (reduce customer debt)
          lines.push({
            lineNo: lineCounter++,
            accountId: 'accounts-receivable',
            accountName: 'Accounts Receivable',
            nameType: 'customer',
            nameId: receipt.customer,
            nameName: receipt.customerName,
            lineDescription: `Applied Credit Memo ${credit.reference}`,
            debit: credit.appliedAmount,
            credit: 0
          });
          
          // Credit the Credit Memo account (reduce the liability)
          lines.push({
            lineNo: lineCounter++,
            accountId: 'customer-credit-balance',
            accountName: 'Customer Credit Balance',
            nameType: 'customer',
            nameId: receipt.customer,
            nameName: receipt.customerName,
            lineDescription: `Applied Credit Memo ${credit.reference}`,
            debit: 0,
            credit: credit.appliedAmount
          });
        } else if (credit.type === 'advance_payment') {
          // Debit Accounts Receivable (reduce customer debt)
          lines.push({
            lineNo: lineCounter++,
            accountId: 'accounts-receivable',
            accountName: 'Accounts Receivable',
            nameType: 'customer',
            nameId: receipt.customer,
            nameName: receipt.customerName,
            lineDescription: `Applied Advance Payment ${credit.reference}`,
            debit: credit.appliedAmount,
            credit: 0
          });
          
          // Credit the Customer Deposits account (reduce the liability)
          lines.push({
            lineNo: lineCounter++,
            accountId: 'customer-deposits',
            accountName: 'Customer Deposits',
            nameType: 'customer',
            nameId: receipt.customer,
            nameName: receipt.customerName,
            lineDescription: `Applied Advance Payment ${credit.reference}`,
            debit: 0,
            credit: credit.appliedAmount
          });
        }
      });
    }
    
    // Add credit entries for each invoice payment
    if (receipt.invoicePayments && Array.isArray(receipt.invoicePayments)) {
      receipt.invoicePayments.forEach((payment: { invoiceNo: string; amountPaid: number }) => {
        lines.push({
          lineNo: lineCounter++,
          accountId: 'accounts-receivable',
          accountName: 'Accounts Receivable',
          nameType: 'customer',
          nameId: receipt.customer,
          nameName: receipt.customerName,
          lineDescription: `Payment for Invoice #${payment.invoiceNo}`,
          debit: 0,
          credit: payment.amountPaid
        });
      });
    } else {
      // If no invoice allocations, credit A/R with the full transaction amount
      lines.push({
        lineNo: lineCounter++,
        accountId: 'accounts-receivable',
        accountName: 'Accounts Receivable',
        nameType: 'customer',
        nameId: receipt.customer,
        nameName: receipt.customerName,
        lineDescription: `Receipt #${receipt.receiptNo}`,
        debit: 0,
        credit: totalTransactionAmount
      });
    }
    
    // Create the complete journal entry with lines
    const journalEntry = {
      ...journalEntryData,
      lines
    };
    
    // Check if a journal entry already exists for this receipt
    const existingEntries = await getJournalEntriesForSource('receipt', receipt.id);
    
    if (existingEntries && existingEntries.length > 0) {
      console.log('Journal entry already exists for this receipt');
      return existingEntries[0].id;
    }
    
    // Add the journal entry to Firestore
    const docRef = await addDocToCollection('accounting', 'journalEntries', journalEntry);
    return docRef.id;
    
  } catch (error) {
    console.error('Error creating receipt journal entry:', error);
    return null;
  }
}

/**
 * Creates a journal entry for a vendor payment
 * @param payment - The vendor payment data
 * @returns The created journal entry ID
 */
export async function createVendorPaymentJournalEntry(payment: any): Promise<string | null> {
  await assertPeriodOpen(payment.paymentDate);
  try {
    // Determine the cash account based on payment method
    // In a real app, this would come from a mapping of payment methods to accounts
    let cashAccountId = 'cash';
    let cashAccountName = 'Cash';

    // Payment method specific accounts
    switch(payment.paymentMethod) {
      case 'check':
        cashAccountId = 'bank';
        cashAccountName = 'Bank Account';
        break;
      case 'credit-card':
        cashAccountId = 'credit-card';
        cashAccountName = 'Credit Card';
        break;
      case 'online':
        cashAccountId = 'online-payments';
        cashAccountName = 'Online Payment Account';
        break;
      default:
        // Default to cash
        break;
    }
    
    // Create the journal entry header
    const journalEntryData = {
      journalDate: payment.paymentDate,
      referenceNo: generateJournalEntryNumber(),
      description: formatJournalDescription('payment', payment.paymentNo),
      memo: payment.memo || '',
      sourceType: 'payment',
      sourceId: payment.id,
      totalDebit: payment.amount,
      totalCredit: payment.amount,
      isPosted: true,
      status: 'posted',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Create journal entry lines
    const lines = [];
    
    // Main entry - Credit Cash/Bank
    lines.push({
      lineNo: 1,
      accountId: cashAccountId,
      accountName: cashAccountName,
      nameType: 'vendor',
      nameId: payment.vendor,
      nameName: payment.vendorName,
      lineDescription: `Payment #${payment.paymentNo}`,
      debit: 0,
      credit: payment.amount
    });
    
    let lineCounter = 2;
    
    // Add debit entries for each bill payment
    if (payment.billPayments && Array.isArray(payment.billPayments)) {
      payment.billPayments.forEach((billPayment: { billNo: string; amountPaid: number }) => {
        lines.push({
          lineNo: lineCounter++,
          accountId: 'accounts-payable',
          accountName: 'Accounts Payable',
          nameType: 'vendor',
          nameId: payment.vendor,
          nameName: payment.vendorName,
          lineDescription: `Payment for Bill #${billPayment.billNo}`,
          debit: billPayment.amountPaid,
          credit: 0
        });
      });
    } else {
      // If no bill allocations, debit A/P with the full amount
      lines.push({
        lineNo: lineCounter++,
        accountId: 'accounts-payable',
        accountName: 'Accounts Payable',
        nameType: 'vendor',
        nameId: payment.vendor,
        nameName: payment.vendorName,
        lineDescription: `Payment #${payment.paymentNo}`,
        debit: payment.amount,
        credit: 0
      });
    }
    
    // Create the complete journal entry with lines
    const journalEntry = {
      ...journalEntryData,
      lines
    };
    
    // Check if a journal entry already exists for this payment
    const existingEntries = await getJournalEntriesForSource('payment', payment.id);
    
    if (existingEntries && existingEntries.length > 0) {
      console.log('Journal entry already exists for this payment');
      return existingEntries[0].id;
    }
    
    // Add the journal entry to Firestore
    const docRef = await addDocToCollection('accounting', 'journalEntries', journalEntry);
    return docRef.id;
    
  } catch (error) {
    console.error('Error creating vendor payment journal entry:', error);
    return null;
  }
}

export async function getJournalEntriesForSource(sourceType: string, sourceId: string): Promise<any[]> {
  try {
    // Import the necessary Firestore functions
    const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');
    const { app } = await import('$lib/firebase');
    
    const db = getFirestore(app);
    const journalEntriesRef = collection(db, 'transactions', 'accounting', 'journalEntries');
    const q = query(journalEntriesRef, where('sourceType', '==', sourceType), where('sourceId', '==', sourceId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting journal entries:', error);
    return [];
  }
}

/**
 * Creates a journal entry for a credit memo
 * @param creditMemo - The credit memo data
 * @returns The created journal entry ID
 */
export async function createCreditMemoJournalEntry(creditMemo: any): Promise<string | null> {
  await assertPeriodOpen(creditMemo.cmDate);
  try {
    // Create the journal entry header
    const journalEntryData = {
      journalDate: creditMemo.cmDate,
      referenceNo: generateJournalEntryNumber(),
      description: formatJournalDescription('creditMemo', creditMemo.cmNo),
      memo: creditMemo.memo || '',
      sourceType: 'creditMemo',
      sourceId: creditMemo.id,
      totalDebit: creditMemo.totalAmount,
      totalCredit: creditMemo.totalAmount,
      isPosted: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Initialize lines array for journal entry
    const lines = [];
    
    // Compute core amounts using saved aggregates with safe fallbacks
    const netSales = typeof creditMemo.subtotal === 'number'
      ? creditMemo.subtotal
      : Array.isArray(creditMemo.items)
        ? creditMemo.items.reduce((sum: number, i: any) => sum + (i.amount || (i.quantity || 0) * (i.unitPrice || 0)), 0)
        : 0;
    const vat = typeof creditMemo.taxAmount === 'number' ? creditMemo.taxAmount : 0;
    const withholdingRate = creditMemo.withholdingTax ? parseFloat(String(creditMemo.withholdingTax)) / 100 : 0;
    const lessWithholding = +(netSales * (withholdingRate || 0)).toFixed(2);
    const totalDue = +(netSales + vat - lessWithholding).toFixed(2);

    // Accounts (could be settings-driven in the future)
    const salesAccountId = 'sales-revenue';
    const salesAccountName = 'Sales Revenue';
    const vatPayableAccountId = 'vat-payable';
    const vatPayableAccountName = 'VAT Payable';
    const arAccountId = 'accounts-receivable';
    const arAccountName = 'Accounts Receivable';
    const whtReceivableAccountId = 'withholding-tax-receivable';
    const whtReceivableAccountName = 'Withholding Tax Receivable';

    let lineCounter = 1;

    // Reverse revenue (Debit Sales Revenue)
    if (netSales > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: salesAccountId,
        accountName: salesAccountName,
        nameType: 'customer',
        nameId: creditMemo.customer,
        nameName: creditMemo.customerName,
        lineDescription: `Sales reversal - CM #${creditMemo.cmNo}`,
        debit: netSales,
        credit: 0
      });
    }

    // Reverse VAT payable (Debit VAT Payable)
    if (vat > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: vatPayableAccountId,
        accountName: vatPayableAccountName,
        lineDescription: `VAT reversal - CM #${creditMemo.cmNo}`,
        debit: vat,
        credit: 0
      });
    }

    // Reverse Withholding receivable if any (Credit)
    if (lessWithholding > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: whtReceivableAccountId,
        accountName: whtReceivableAccountName,
        lineDescription: `Withholding reversal - CM #${creditMemo.cmNo}`,
        debit: 0,
        credit: lessWithholding
      });
    }

    // Credit Accounts Receivable by total due
    lines.push({
      lineNo: lineCounter++,
      accountId: arAccountId,
      accountName: arAccountName,
      nameType: 'customer',
      nameId: creditMemo.customer,
      nameName: creditMemo.customerName,
      lineDescription: `Credit Memo #${creditMemo.cmNo}`,
      debit: 0,
      credit: totalDue
    });
    
    // Handle items with individual entries if needed for detailed reporting
    if (creditMemo.items && creditMemo.items.length > 0 && creditMemo.detailedJournalEntries) {
      // Reset lines if we're going to do detailed entries
      lines.length = 0;
      
      let lineCounter = 0;
      
      // For each item, create a separate debit entry for the appropriate revenue account
      for (const item of creditMemo.items) {
        lineCounter++;
        const itemTotal = item.quantity * item.unitPrice;
        
        // Get the specific revenue account if items have different accounts
        const itemSalesAccountId = item.salesAccountId || salesAccountId;
        const itemSalesAccountName = item.salesAccountName || salesAccountName;
        
        lines.push({
          lineNo: lineCounter,
          accountId: itemSalesAccountId,
          accountName: itemSalesAccountName,
          nameType: 'customer',
          nameId: creditMemo.customer,
          nameName: creditMemo.customerName,
          lineDescription: `${item.itemName} - ${item.quantity} ${item.unitName} @ ${item.unitPrice}`,
          debit: itemTotal,
          credit: 0
        });
      }
      
      // Add a single credit entry for Accounts Receivable
      lineCounter++;
      lines.push({
        lineNo: lineCounter,
        accountId: arAccountId,
        accountName: arAccountName,
        nameType: 'customer',
        nameId: creditMemo.customer,
        nameName: creditMemo.customerName,
        lineDescription: `Credit Memo #${creditMemo.cmNo}`,
        debit: 0,
        credit: creditMemo.totalAmount
      });
    }
    
    // Save the journal entry to Firestore
    const docRef = await addDocToCollection('accounting', 'journalEntries', { ...journalEntryData, lines });
    const journalEntryId = docRef.id;
    
    // Update the credit memo with the journal entry ID reference
    if (journalEntryId && creditMemo.id) {
      await updateDocInCollection('customerCenter/creditMemos', String(creditMemo.id), {
        journalEntryId,
        status: 'Posted',
        updatedAt: new Date()
      });
    }
    
    return journalEntryId;
  } catch (error) {
    console.error('Error creating credit memo journal entry:', error);
    return null;
  }
}

/**
 * Creates a journal entry for a receiving report
 * @param receivingReport - The receiving report data
 * @returns The created journal entry ID
 */
export async function createReceivingReportJournalEntry(receivingReport: any): Promise<string | null> {
  await assertPeriodOpen(receivingReport.rrDate);
  try {
    // Create the journal entry header
    const journalEntryData = {
      journalDate: receivingReport.rrDate,
      referenceNo: generateJournalEntryNumber(),
      description: formatJournalDescription('receivingReport', receivingReport.rrNo),
      memo: receivingReport.memo || '',
      sourceType: 'receivingReport',
      sourceId: receivingReport.id,
      totalDebit: receivingReport.totalAmount,
      totalCredit: receivingReport.totalAmount,
      isPosted: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Initialize lines array for journal entry
    const lines = [];
    
    // Line 1: Debit Inventory (Asset account)
    // We need to get the account ID for Inventory
    const inventoryAccountId = 'inventory'; // This should be configured or retrieved
    const inventoryAccountName = 'Inventory'; // This should be configured or retrieved
    
    lines.push({
      lineNo: 1,
      accountId: inventoryAccountId,
      accountName: inventoryAccountName,
      nameType: 'vendor',
      nameId: receivingReport.vendor,
      nameName: receivingReport.vendorName,
      lineDescription: `Receiving Report #${receivingReport.rrNo}`,
      debit: receivingReport.totalAmount,
      credit: 0
    });
    
    // Line 2: Credit Accounts Payable (Liability account)
    const apAccountId = 'accounts-payable'; // This should be configured or retrieved
    const apAccountName = 'Accounts Payable'; // This should be configured or retrieved
    
    lines.push({
      lineNo: 2,
      accountId: apAccountId,
      accountName: apAccountName,
      nameType: 'vendor',
      nameId: receivingReport.vendor,
      nameName: receivingReport.vendorName,
      lineDescription: `Receiving Report #${receivingReport.rrNo}`,
      debit: 0,
      credit: receivingReport.totalAmount
    });
    
    // Handle inventory items with individual entries if needed
    if (receivingReport.items && receivingReport.items.length > 0 && receivingReport.detailedJournalEntries) {
      // Reset lines if we're going to do detailed entries
      // This is optional and depends on accounting preferences
      lines.length = 0;
      
      let lineCounter = 0;
      
      // For each inventory item, create a separate debit entry
      for (const item of receivingReport.items) {
        lineCounter++;
        const itemTotal = item.quantity * item.unitCost;
        
        // Get the specific inventory account if items have different accounts
        const itemInventoryAccountId = item.inventoryAccountId || inventoryAccountId;
        const itemInventoryAccountName = item.inventoryAccountName || inventoryAccountName;
        
        lines.push({
          lineNo: lineCounter,
          accountId: itemInventoryAccountId,
          accountName: itemInventoryAccountName,
          nameType: 'vendor',
          nameId: receivingReport.vendor,
          nameName: receivingReport.vendorName,
          lineDescription: `${item.itemName} - ${item.quantity} ${item.unitName} @ ${item.unitCost}`,
          debit: itemTotal,
          credit: 0
        });
      }
      
      // Add a single credit entry for Accounts Payable
      lineCounter++;
      lines.push({
        lineNo: lineCounter,
        accountId: apAccountId,
        accountName: apAccountName,
        nameType: 'vendor',
        nameId: receivingReport.vendor,
        nameName: receivingReport.vendorName,
        lineDescription: `Receiving Report #${receivingReport.rrNo}`,
        debit: 0,
        credit: receivingReport.totalAmount
      });
    }
    
    // Save the journal entry to Firestore
    const docRef = await addDocToCollection('accounting', 'journalEntries', { ...journalEntryData, lines });
    const journalEntryId = docRef.id;
    
    // Update the receiving report with the journal entry ID reference
    if (journalEntryId && receivingReport.id) {
      await updateDocInCollection('vendorCenter/receivingReports', String(receivingReport.id), {
        journalEntryId,
        status: 'Posted',
        updatedAt: new Date()
      });
    }
    
    return journalEntryId;
  } catch (error) {
    console.error('Error creating receiving report journal entry:', error);
    return null;
  }
}
