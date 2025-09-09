import { addDocToCollection, updateDocInCollection, getDocFromCollection } from './firestoreCrud';

/**
 * Generates a unique reference number for journal entries
 * @returns Formatted reference number
 */
function generateJournalEntryNumber(): string {
  return `JE-${Date.now().toString().substring(7)}`;
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
  try {
    // Determine the accounts based on invoice properties
    const drAccountId = invoice.cashSale ? 'cash' : 'accounts-receivable';
    const drAccountName = invoice.cashSale ? 'Cash' : 'Accounts Receivable';
    
    // Create the journal entry header
    const journalEntryData = {
      journalDate: invoice.invoiceDate,
      referenceNo: generateJournalEntryNumber(),
      description: formatJournalDescription('salesInvoice', invoice.invoiceNo),
      memo: invoice.memo || '',
      sourceType: 'salesInvoice',
      sourceId: invoice.id,
      totalDebit: invoice.totalDue,
      totalCredit: invoice.totalDue,
      isPosted: true,
      status: 'posted',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Create journal entry lines
    const lines: any[] = [];
    
    // Main entry - Debit A/R or Cash
    lines.push({
      lineNo: 1,
      accountId: drAccountId,
      accountName: drAccountName,
      nameType: 'customer',
      nameId: invoice.customer,
      nameName: invoice.customerName,
      lineDescription: `Invoice #${invoice.invoiceNo}`,
      debit: invoice.totalDue,
      credit: 0
    });
    
    let lineCounter = 2;
    
    // Add sales revenue entries
    // Group by income account for simpler entries
    const salesByAccount: Record<string, number> = {};
    
    invoice.lineItems.forEach((item: any) => {
      // We're using a simplified account model - in a real system you'd get these from the item setup
      const incomeAccountId = 'sales-revenue';
      const incomeAccountName = 'Sales Revenue';
      
      // Add the item amount to the appropriate income account
      const itemNetAmount = item.amount || 0;
      if (!salesByAccount[incomeAccountId]) {
        salesByAccount[incomeAccountId] = 0;
      }
      salesByAccount[incomeAccountId] += itemNetAmount;
    });
    
    // Create revenue credit entries - one per account
    Object.entries(salesByAccount).forEach(([accountId, amount]) => {
      lines.push({
        lineNo: lineCounter++,
        accountId,
        accountName: accountId === 'sales-revenue' ? 'Sales Revenue' : accountId,
        lineDescription: `Sales - Invoice #${invoice.invoiceNo}`,
        debit: 0,
        credit: amount
      });
    });
    
    // Add withholding tax entry if applicable
    if (invoice.lessWithholding && invoice.lessWithholding > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: 'withholding-tax-receivable',
        accountName: 'Withholding Tax Receivable',
        lineDescription: `Withholding Tax - Invoice #${invoice.invoiceNo}`,
        debit: invoice.lessWithholding,
        credit: 0
      });
    }
    
    // Add VAT entry if applicable
    if (invoice.vat && invoice.vat > 0) {
      lines.push({
        lineNo: lineCounter++,
        accountId: 'vat-payable',
        accountName: 'VAT Payable',
        lineDescription: `VAT - Invoice #${invoice.invoiceNo}`,
        debit: 0,
        credit: invoice.vat
      });
    }
    
    // Create the complete journal entry with lines
    const journalEntry = {
      ...journalEntryData,
      lines
    };
    
    // Check if a journal entry already exists for this invoice
    const existingEntries = await getJournalEntriesForSource('salesInvoice', invoice.id);
    
    if (existingEntries && existingEntries.length > 0) {
      // Optionally update or delete existing entries
      console.log('Journal entry already exists for this invoice');
      return existingEntries[0].id;
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
    // For a real implementation, use the Firestore query API with where clauses
    // Using transactions/accounting/journalEntries path
    // Here's a placeholder that would be implemented with actual Firestore query code
    
    // Example of how this would be implemented with Firestore:
    // const db = getFirestore(app);
    // const journalEntriesRef = collection(db, 'transactions', 'accounting', 'journalEntries');
    // const q = query(journalEntriesRef, where('sourceType', '==', sourceType), where('sourceId', '==', sourceId));
    // const querySnapshot = await getDocs(q);
    // return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // For now, returning empty array
    return [];
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
