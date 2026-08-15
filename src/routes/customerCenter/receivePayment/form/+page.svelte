<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { addDocToCollection, updateDocInCollection, getDocFromCollection, queryCollectionDocs, deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import type { FilterCondition } from '$lib/utils/firestoreCrud';
  import { generateNextDocumentId, DocumentType } from '$lib/utils/documentIdService';
  import { createReceiptJournalEntry, postJournalEntryOrRollback } from '$lib/utils/accountingService';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  // Use the reusable form mode store for handling URL parameters and mode detection
  import { createFormModeStore } from '$lib/stores/formModeStore';
  const formMode = createFormModeStore();
  
  // UI state
  let isLoading = false;
  let isSaving = false;
  
  // Extract form mode values from the store using destructuring
  $: ({ docId, isViewMode, isEditMode, isCreateMode, mode } = $formMode);
  
  // Load document when the ID changes in edit or view mode
  $: if (docId && (isEditMode || isViewMode)) {
    loadDocument();
  }
  
  // Show the actual receipt number once known, instead of a generic "Edit/View Payment
  // Receipt" label — falls back to a mode label for a brand-new, not-yet-saved receipt.
  $: pageTitle = isCreateMode
    ? 'New Payment Receipt'
    : (formData.receiptNo ? formData.receiptNo : (mode === 'view' ? 'View Payment Receipt' : 'Edit Payment Receipt'));

  // Subscribe to Firestore option stores and use arrays for select fields
  let customerOptions: {label: string, value: any}[] = [];
  let paymentMethodOptions: {label: string, value: any}[] = [];
  let outstandingInvoices: Array<{label: string, value: any, amount: number, dueDate: any, credit?: number, discountPercent?: number, discountId?: any, taxPercent?: number, taxTypeId?: any, payable?: number}> = [];
  let discountOptions: { label: string; value: any }[] = [];
  let taxTypeOptions: { label: string; value: any; raw?: any }[] = [];
  let availableCredit = 0;
  let remainingCredit = 0;

  createFirestoreOptionsStore('customers', 'name', 'id').subscribe(opts => customerOptions = opts);
  createFirestoreOptionsStore('paymentmethods').subscribe(opts => paymentMethodOptions = opts);
  createFirestoreOptionsStore('otherlist/discounts', 'name', 'id').subscribe(opts => { discountOptions = [{ label: 'N/A', value: '' }, ...opts]; });
  createFirestoreOptionsStore('tax', 'name', 'id', true).subscribe(opts => { taxTypeOptions = [{ label: 'N/A', value: '' }, ...opts]; });

  // Type for our form data
  type FormDataType = {
    customer: string;
    receiptDate: string;
    paymentMethod: string;
    reference: string;
    memo: string;
    amount: number;
    selectedInvoices: string[];
    receiptNo?: string; // Tracks the saved receipt number once loaded, for display in the page title
  };

  // Types for credit system
  type CreditMemo = {
    id: string;
    creditNo: string;
    amount: number;
    availableAmount: number;
    date: Date;
    customer: string;
  };

  type AdvancePayment = {
    id: string;
    reference: string;
    amount: number;
    availableAmount: number;
    date: Date;
    customer: string;
  };

  type AppliedCredit = {
    id: string;
    type: 'credit_memo' | 'advance_payment';
    reference: string;
    availableAmount: number;
    appliedAmount: number;
  };

  // Initialize form data with empty values
  let formData: FormDataType = {
    customer: '',
    receiptDate: new Date().toISOString().split('T')[0],
    paymentMethod: '',
    reference: '',
    memo: '',
    amount: 0,
    selectedInvoices: []
  };

  // For storing allocated amounts to each invoice
  let invoiceAllocations: Record<string, number> = {};
  let allocatedTotal = 0;
  let unallocatedAmount = 0;

  // Snapshots of what was actually persisted when this receipt was loaded (empty in create mode).
  // Saving computes delta = current − original per invoice/credit so edits adjust balances by the
  // *change* rather than re-applying the full current amount on top of what a prior save already
  // applied — the latter double-counted on every edit and, for invoices, never ran at all.
  let originalInvoicePayments: Array<{ invoiceId: string; amountPaid: number }> = [];
  let originalAppliedCredits: Array<{ id: string; type: 'credit_memo' | 'advance_payment'; appliedAmount: number }> = [];

  // Credit system variables
  let availableCreditMemos: CreditMemo[] = [];
  let availableAdvancePayments: AdvancePayment[] = [];
  let appliedCredits: AppliedCredit[] = [];
  let totalAppliedCredit = 0;
  let showApplyCreditModal = false;
  let creditSearchTerm = '';
  let selectedInvoiceForCredit: string | null = null;

  // Define type for Firestore timestamp
  type FirestoreTimestamp = {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
  
  // Define type for receipt document from Firestore
  type ReceiptDocument = {
    id: string;
    customer: string;
    customerName: string;
    receiptNo: string;
    receiptDate: FirestoreTimestamp | Date;
    paymentMethod: string;
    paymentMethodName: string;
    reference: string;
    memo: string;
    amount: number;
    appliedCredits?: Array<{
      id: string;
      type: 'credit_memo' | 'advance_payment';
      reference: string;
      appliedAmount: number;
    }>;
    totalAppliedCredit?: number;
    invoicePayments: Array<{
      invoiceId: string;
      invoiceNo: string;
      originalAmount: number;
      amountPaid: number;
    }>;
    status: string;
    createdAt: FirestoreTimestamp | Date;
    updatedAt: FirestoreTimestamp | Date;
  };

  // Helper function to format Firestore date
  function formatFirestoreDate(dateField: FirestoreTimestamp | Date | undefined | null): string {
    if (!dateField) return '';
    
    // Handle Firestore timestamp
    if (dateField && 'toDate' in dateField && typeof dateField.toDate === 'function') {
      return dateField.toDate().toISOString().split('T')[0];
    }
    
    // Handle JavaScript Date
    if (dateField instanceof Date) {
      return dateField.toISOString().split('T')[0];
    }
    
    return '';
  }

  // Load document data when in edit or view mode
  async function loadDocument() {
    if (!docId) return;
    
    try {
      console.log(`Loading payment receipt ${docId} in ${mode} mode...`);
      
      const docData = await getDocFromCollection('transactions/customerCenter/receipts', docId) as ReceiptDocument;
      
      if (!docData) {
        throw new Error('Payment receipt not found');
      }
      
      // Populate form data
      formData = {
        customer: docData.customer || '',
        receiptDate: formatFirestoreDate(docData.receiptDate),
        paymentMethod: docData.paymentMethod || '',
        reference: docData.reference || '',
        memo: docData.memo || '',
        amount: docData.amount || 0,
        selectedInvoices: docData.invoicePayments?.map(ip => ip.invoiceId) || [],
        receiptNo: docData.receiptNo || ''
      };
      
      // Populate invoice allocations
      invoiceAllocations = {};
      if (docData.invoicePayments && Array.isArray(docData.invoicePayments)) {
        docData.invoicePayments.forEach(payment => {
          invoiceAllocations[payment.invoiceId] = payment.amountPaid;
        });
      }
      // Snapshot exactly what's persisted right now, before the user edits anything further
      originalInvoicePayments = (docData.invoicePayments || []).map(p => ({ invoiceId: p.invoiceId, amountPaid: p.amountPaid }));

      // Populate applied credits
      appliedCredits = [];
      totalAppliedCredit = 0;
      if (docData.appliedCredits && Array.isArray(docData.appliedCredits)) {
        appliedCredits = docData.appliedCredits.map(credit => ({
          id: credit.id,
          type: credit.type,
          reference: credit.reference,
          availableAmount: credit.appliedAmount, // For display purposes
          appliedAmount: credit.appliedAmount
        }));
        totalAppliedCredit = docData.totalAppliedCredit || appliedCredits.reduce((sum, c) => sum + c.appliedAmount, 0);
      }
      // Snapshot exactly what's persisted right now, before the user edits anything further
      originalAppliedCredits = (docData.appliedCredits || []).map(c => ({ id: c.id, type: c.type, appliedAmount: c.appliedAmount }));
      
      // Load outstanding invoices and available credits for this customer
      if (docData.customer) {
        await loadOutstandingInvoices(docData.customer);
        await loadAvailableCredits();
      }
      
      // Calculate allocated and unallocated amounts
      updateAllocationTotals();
      
    } catch (error) {
      console.error('Error loading payment receipt:', error);
      alert('Failed to load payment receipt. ' + (error as Error).message);
    }
  }

  // Load outstanding invoices for selected customer
  async function loadOutstandingInvoices(customerId: string) {
    if (!customerId) {
      outstandingInvoices = [];
      return;
    }
    
    try {
      // Query Firestore for outstanding invoices for this customer
      // Filter to only get invoices that are posted and have an outstanding balance
      const filters: FilterCondition[] = [
        { field: 'customer', operator: '==', value: customerId }
      ];
      const invoices = await queryCollectionDocs('transactions/customerCenter/salesInvoices', filters) as any[];
      // Show only unpaid invoices (cash sales are automatically marked as paid)
      const filtered = (invoices || []).filter(inv => {
        const status = (inv?.status || '').toLowerCase();
        return status !== 'paid' && status !== 'draft' && Number(inv?.totalDue || 0) > 0;
      });
      outstandingInvoices = filtered.map((inv: any) => ({
        label: `${inv.invoiceNo} - ${new Date((inv.dueDate?.seconds || 0) * 1000).toLocaleDateString()} - ${(Number(inv.totalDue) || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}`,
        value: inv.id,
        amount: Number(inv.totalDue) || 0,
        dueDate: inv.dueDate,
        credit: 0,
        discountPercent: 0,
        discountId: '',
        taxPercent: 0,
        taxTypeId: '',
        payable: Number(inv.totalDue) || 0
      }));
      await loadAvailableCredits();
      
    } catch (error) {
      console.error('Error loading outstanding invoices:', error);
      outstandingInvoices = [];
    }
  }

  // Define type for invoice data
  interface OutstandingInvoice {
    id: string;
    invoiceNo: string;
    dueDate: {
      seconds: number;
      nanoseconds: number;
    };
    totalDue: number;
  }


  
  // Update allocation totals when invoice allocations change
  function computePayable(amount: number, credit = 0, discountPercent = 0, taxPercent = 0): number {
    const discount = amount * ((Number(discountPercent) || 0) / 100);
    const tax = amount * ((Number(taxPercent) || 0) / 100);
    const res = amount - (Number(credit) || 0) - discount - tax;
    return Math.max(0, Number(res.toFixed(2)));
  }

  function getDiscountPercentFromId(id: any): number {
    const found = discountOptions.find(d => String(d.value) === String(id));
    if (!found || found.label === 'N/A') return 0;
    const m = found.label.match(/(\d+(?:\.\d+)?)%?/);
    return m ? parseFloat(m[1]) : 0;
  }

  function getTaxPercentFromTypeId(id: any): number {
    const found = taxTypeOptions.find(t => String(t.value) === String(id));
    if (!found) return 0;
    const raw: any = (found as any).raw;
    if (raw && typeof raw.rate === 'number') return raw.rate * 100;
    const m = found.label?.match(/(\d+(?:\.\d+)?)%?/);
    return m ? parseFloat(m[1]) : 0;
  }

  function updateAllocationTotals() {
    // Update available credit from applied credits
    availableCredit = totalAppliedCredit;
    
    // Clamp credits to available pool and recompute payable
    let usedCredit = 0;
    outstandingInvoices = outstandingInvoices.map(inv => {
      // Map selected ids to percents
      if (inv.discountId !== undefined) inv.discountPercent = getDiscountPercentFromId(inv.discountId);
      if (inv.taxTypeId !== undefined) inv.taxPercent = getTaxPercentFromTypeId(inv.taxTypeId);
      
      // For now, we'll use the credit from the invoice object
      // In a full implementation, this would be distributed from appliedCredits
      const creditClamped = Math.min(Number(inv.credit) || 0, availableCredit - usedCredit);
      usedCredit += creditClamped;
      inv.credit = creditClamped;
      
      const payable = computePayable(inv.amount, inv.credit, inv.discountPercent, inv.taxPercent);
      
      // If allocation exceeds new payable, clamp it
      const currentAlloc = Number(invoiceAllocations[inv.value] || 0);
      if (currentAlloc > payable) {
        invoiceAllocations[inv.value] = payable;
      }
      
      return { ...inv, payable };
    });
    
    allocatedTotal = Object.values(invoiceAllocations).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
    const totalAvailable = Number(formData.amount) + totalAppliedCredit;
    unallocatedAmount = Number((totalAvailable - allocatedTotal).toFixed(2));
  }

  // Load available credits for the selected customer
  async function loadAvailableCredits() {
    if (!formData.customer) {
      availableCreditMemos = [];
      availableAdvancePayments = [];
      return;
    }

    try {
      // Load credit memos
      const creditMemoFilters: FilterCondition[] = [
        { field: 'customer', operator: '==', value: formData.customer },
        { field: 'status', operator: 'in', value: ['Posted', 'Partially Applied'] }
      ];
      const creditMemoResults = await queryCollectionDocs('transactions/customerCenter/creditMemos', creditMemoFilters);
      availableCreditMemos = creditMemoResults.map((doc: any) => ({
        id: doc.id,
        creditNo: doc.cmNo || doc.id,
        amount: doc.totalAmount || 0,
        availableAmount: (doc.totalAmount || 0) - (doc.appliedAmount || 0),
        date: doc.cmDate?.toDate ? doc.cmDate.toDate() : (doc.cmDate ? new Date(doc.cmDate) : new Date()),
        customer: doc.customer
      })).filter(memo => memo.availableAmount > 0);

      // Load advance payments (overpayments from previous receipts)
      const advanceFilters: FilterCondition[] = [
        { field: 'customer', operator: '==', value: formData.customer },
        { field: 'status', operator: '==', value: 'Posted' }
      ];
      const advanceResults = await queryCollectionDocs('transactions/customerCenter/receipts', advanceFilters);
      availableAdvancePayments = advanceResults.map((doc: any) => ({
        id: doc.id,
        reference: doc.reference || doc.receiptNo || doc.id,
        amount: doc.amount || 0,
        availableAmount: (doc.amount || 0) - (doc.appliedAmount || 0),
        date: doc.receiptDate?.toDate ? doc.receiptDate.toDate() : (doc.receiptDate ? new Date(doc.receiptDate) : new Date()),
        customer: doc.customer
      })).filter(payment => payment.availableAmount > 0);

    } catch (error) {
      console.error('Error loading available credits:', error);
    }
  }

  // Apply selected credits
  function applyCredit(creditId: string, type: 'credit_memo' | 'advance_payment', amount: number) {
    const existingIndex = appliedCredits.findIndex(c => c.id === creditId && c.type === type);
    
    if (existingIndex >= 0) {
      appliedCredits[existingIndex].appliedAmount = amount;
    } else {
      const sourceCredit = type === 'credit_memo' 
        ? availableCreditMemos.find(c => c.id === creditId)
        : availableAdvancePayments.find(c => c.id === creditId);
      
      if (sourceCredit) {
        const reference = type === 'credit_memo' 
          ? (sourceCredit as CreditMemo).creditNo || sourceCredit.id
          : (sourceCredit as AdvancePayment).reference || sourceCredit.id;
        
        appliedCredits.push({
          id: creditId,
          type,
          reference,
          availableAmount: sourceCredit.availableAmount,
          appliedAmount: amount
        });
      }
    }
    
    // Remove credits with zero amount
    appliedCredits = appliedCredits.filter(c => c.appliedAmount > 0);
    
    // Update total applied credit
    totalAppliedCredit = appliedCredits.reduce((sum, c) => sum + c.appliedAmount, 0);
    updateAllocationTotals();
  }

  // Remove applied credit
  function removeAppliedCredit(creditId: string, type: 'credit_memo' | 'advance_payment') {
    appliedCredits = appliedCredits.filter(c => !(c.id === creditId && c.type === type));
    totalAppliedCredit = appliedCredits.reduce((sum, c) => sum + c.appliedAmount, 0);
    updateAllocationTotals();
  }

  // Auto-allocate payment amount to invoices
  function autoAllocate() {
    let remaining = formData.amount + totalAppliedCredit;
    invoiceAllocations = {};
    
    // Sort invoices by due date (earliest first)
    const sortedInvoices = [...outstandingInvoices].sort((a, b) => {
      const dateA = a.dueDate?.seconds || 0;
      const dateB = b.dueDate?.seconds || 0;
      return dateA - dateB;
    });
    
    // Allocate to each invoice until payment is fully allocated
    for (const invoice of sortedInvoices) {
      if (remaining <= 0) break;
      const base = invoice.amount; // Use original amount, not adjusted for credit
      const amountToAllocate = Math.min(base, remaining);
      // Round to 2 decimal places to avoid floating point precision issues
      invoiceAllocations[invoice.value] = Math.round(amountToAllocate * 100) / 100;
      remaining -= amountToAllocate;
    }
    
    updateAllocationTotals();
  }

  // Handle customer selection change
  $: if (formData.customer && isCreateMode) {
    loadOutstandingInvoices(formData.customer);
    loadAvailableCredits();
  }

  // Handle payment amount change
  $: if (formData.amount) {
    updateAllocationTotals();
  }

  // Format amount for display with accounting format
  $: formattedAmount = formData.amount ? formData.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  
  // Helper function to format amounts in accounting format
  function formatAccountingAmount(amount: number): string {
    if (amount === 0) return '0.00';
    return amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2,
      style: 'decimal',
      currency: 'USD',
      currencyDisplay: 'symbol'
    });
  }

  // Check if a receipt number already exists
  async function isReceiptNumberExists(receiptNo: string): Promise<boolean> {
    try {
      const filters: FilterCondition[] = [
        { field: 'receiptNo', operator: '==', value: receiptNo }
      ];
      const existingReceipts = await queryCollectionDocs('transactions/customerCenter/receipts', filters);
      return existingReceipts.length > 0;
    } catch (error) {
      console.error('Error checking receipt number:', error);
      return false; // Default to allowing the save if there's an error checking
    }
  }

  // Generate a guaranteed unique receipt number using a transaction
  async function generateReceiptNumber(): Promise<string> {
    const MAX_ATTEMPTS = 5;
    let attempts = 0;
    
    while (attempts < MAX_ATTEMPTS) {
      try {
        // Generate a new receipt number
        const receiptNo = await generateNextDocumentId(DocumentType.PAYMENT_RECEIPT);
        
        // Check if this number already exists in the database
        const exists = await isReceiptNumberExists(receiptNo);
        
        if (!exists) {
          // If it doesn't exist, we can use it
          return receiptNo;
        }
        
        // If we get here, the number exists, so we'll try again
        attempts++;
        
        // Add a small delay before retrying to avoid tight loops
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Error in receipt number generation attempt:', error);
        attempts++;
      }
    }
    
    // If we've exhausted all attempts, throw an error
    throw new Error('Unable to generate a unique receipt number after multiple attempts. Please try again.');
  }

  // Applies the *change* in applied-credit amounts since the receipt was loaded (delta = new −
  // original) to each credit memo's/advance payment's cumulative appliedAmount. Re-adding the full
  // current amount on every save (the previous behavior) double-counted a credit that was already
  // applied by a prior save of this same receipt whenever it was edited and re-saved unchanged.
  async function applyCreditDeltas(
    currentCredits: AppliedCredit[],
    originalCredits: Array<{ id: string; type: 'credit_memo' | 'advance_payment'; appliedAmount: number }>
  ) {
    const keys = new Set([
      ...currentCredits.map(c => `${c.type}:${c.id}`),
      ...originalCredits.map(c => `${c.type}:${c.id}`)
    ]);

    for (const key of keys) {
      const sep = key.indexOf(':');
      const type = key.slice(0, sep) as 'credit_memo' | 'advance_payment';
      const id = key.slice(sep + 1);
      const newAmount = currentCredits.find(c => c.id === id && c.type === type)?.appliedAmount || 0;
      const oldAmount = originalCredits.find(c => c.id === id && c.type === type)?.appliedAmount || 0;
      const delta = newAmount - oldAmount;
      if (delta === 0) continue;

      const collectionPath = type === 'credit_memo' ? 'transactions/customerCenter/creditMemos' : 'transactions/customerCenter/receipts';
      const doc = await getDocFromCollection(collectionPath, id) as any;
      if (!doc) continue;

      const newApplied = Math.max(0, (doc.appliedAmount || 0) + delta);
      const totalAmount = (type === 'credit_memo' ? doc.totalAmount : doc.amount) || 0;

      let newStatus = doc.status;
      if (totalAmount > 0 && newApplied >= totalAmount) {
        newStatus = 'Fully Applied';
      } else if (newApplied > 0) {
        newStatus = 'Partially Applied';
      } else {
        newStatus = 'Posted';
      }

      await updateDocInCollection(collectionPath, id, {
        appliedAmount: newApplied,
        status: newStatus,
        updatedAt: new Date()
      });
    }
  }

  // Applies the *change* in invoice allocations since the receipt was loaded (delta = new −
  // original) to each sales invoice's totalDue/status. Fetches each invoice fresh by id rather
  // than reading from outstandingInvoices, which excludes invoices this same receipt already paid
  // off (status 'Paid' is filtered out of that list) and would otherwise be silently skipped here.
  async function applyInvoiceBalanceDeltas(
    currentAllocations: Array<{ invoiceId: string; amountPaid: number }>,
    originalAllocations: Array<{ invoiceId: string; amountPaid: number }>
  ) {
    const invoiceIds = new Set([
      ...currentAllocations.map(a => a.invoiceId),
      ...originalAllocations.map(a => a.invoiceId)
    ]);

    await Promise.all(Array.from(invoiceIds).map(async (invoiceId) => {
      const newPaid = currentAllocations.find(a => a.invoiceId === invoiceId)?.amountPaid || 0;
      const oldPaid = originalAllocations.find(a => a.invoiceId === invoiceId)?.amountPaid || 0;
      const delta = newPaid - oldPaid;
      if (delta === 0) return;

      try {
        const invoiceDoc = await getDocFromCollection('transactions/customerCenter/salesInvoices', invoiceId) as any;
        if (!invoiceDoc) return;
        const currentBalance = Number(invoiceDoc.totalDue ?? 0);
        const newBalance = Math.max(0, currentBalance - delta);
        const newStatus = newBalance <= 0 ? 'Paid' : 'Partially Paid';
        await updateDocInCollection('transactions/customerCenter/salesInvoices', invoiceId, {
          totalDue: newBalance,
          status: newStatus,
          updatedAt: new Date()
        });
      } catch {}
    }));
  }

  // Save the payment receipt
  async function handleSave() {
    try {
      // Handle view mode - just navigate back to list
      if (isViewMode) {
        goto('/customerCenter/receivePayment/list');
        return;
      }
      
      // Validate form data
      if (!formData.customer) {
        alert('Please select a customer');
        return;
      }
      
      if (!formData.receiptDate) {
        alert('Please enter a receipt date');
        return;
      }
      
      if (!formData.paymentMethod) {
        alert('Please select a payment method');
        return;
      }
      
      if (!formData.amount || formData.amount <= 0) {
        alert('Please enter a valid payment amount');
        return;
      }

      // Get customer and payment method names
      const selectedCustomer = customerOptions.find(opt => opt.value === formData.customer);
      const selectedPaymentMethod = paymentMethodOptions.find(opt => opt.value === formData.paymentMethod);
      
      // Build invoice payments array
      const allocationArray = Object.entries(invoiceAllocations)
        .filter(([_, amount]) => amount > 0)
        .map(([invoiceId, amountPaid]) => {
          const invoice = outstandingInvoices.find(inv => inv.value === invoiceId);
          return {
            invoiceId,
            invoiceNo: invoice?.label.split(' - ')[0] || 'Unknown',
            originalAmount: invoice?.amount || 0,
            amountPaid
          };
        });
      
      // Create the receipt data object
      let receiptData: any;
      if (isCreateMode) {
        // Generate a guaranteed unique receipt number
        const receiptNo = await generateReceiptNumber();
        
        // Create a new receipt document
        receiptData = {
          customer: formData.customer,
          customerName: selectedCustomer?.label || '',
          receiptNo,
          receiptDate: new Date(formData.receiptDate),
          paymentMethod: formData.paymentMethod,
          paymentMethodName: selectedPaymentMethod?.label || '',
          reference: formData.reference,
          memo: formData.memo,
          amount: Number(formData.amount),
          appliedCredits: appliedCredits.map(credit => ({
            id: credit.id,
            type: credit.type,
            reference: credit.reference,
            appliedAmount: credit.appliedAmount
          })),
          totalAppliedCredit: totalAppliedCredit,
          invoicePayments: allocationArray,
          status: 'Posted',
          createdAt: new Date(),
          updatedAt: new Date()
        };
      } else if (isEditMode && docId) {
        // Update existing receipt
        receiptData = {
          customer: formData.customer,
          customerName: selectedCustomer?.label || '',
          receiptDate: new Date(formData.receiptDate),
          paymentMethod: formData.paymentMethod,
          paymentMethodName: selectedPaymentMethod?.label || '',
          reference: formData.reference,
          memo: formData.memo,
          amount: Number(formData.amount),
          appliedCredits: appliedCredits.map(credit => ({
            id: credit.id,
            type: credit.type,
            reference: credit.reference,
            appliedAmount: credit.appliedAmount
          })),
          totalAppliedCredit: totalAppliedCredit,
          invoicePayments: allocationArray,
          status: 'Posted',
          updatedAt: new Date()
        };
      }
      
      let docRef: any;

      if (isCreateMode) {
        // Add new receipt
        docRef = await addDocToCollection('transactions/customerCenter/receipts', receiptData);

        // Create journal entry. See postJournalEntryOrRollback for why a create-mode failure
        // here rolls back the receipt document — run before the balance deltas below, so a
        // failed post never touches any invoice/credit-memo balances at all.
        const jeResult = await postJournalEntryOrRollback({
          postFn: () => createReceiptJournalEntry({ ...receiptData, id: docRef.id }),
          rollbackFn: () => deleteDocFromCollection('transactions/customerCenter/receipts', docRef.id),
          isCreate: true
        });
        if (!jeResult.ok) {
          alert(jeResult.message);
          return;
        }

        // originalAppliedCredits/originalInvoicePayments are empty in create mode, so these
        // deltas equal the full applied/allocated amounts — same effect as before, just unified
        // with the edit-mode path below.
        await applyCreditDeltas(appliedCredits, originalAppliedCredits);
        await applyInvoiceBalanceDeltas(allocationArray, originalInvoicePayments);
      } else if (isEditMode && docId) {
        // Update existing receipt
        await updateDocInCollection('transactions/customerCenter/receipts', docId, receiptData);

        await applyCreditDeltas(appliedCredits, originalAppliedCredits);
        await applyInvoiceBalanceDeltas(allocationArray, originalInvoicePayments);

        // Create/update journal entry for edit mode
        const jeResult = await postJournalEntryOrRollback({
          postFn: () => createReceiptJournalEntry({ ...receiptData, id: docId }),
          rollbackFn: async () => {}, // no snapshot of the prior state to restore on edit — see postJournalEntryOrRollback
          isCreate: false
        });
        if (!jeResult.ok) {
          alert(jeResult.message);
          return;
        }
      }
      
      // Land on the saved receipt's view page, not the list — consistent with Sales
      // Invoice/Credit Memo/APV/Inventory Adjustment (BLUEPRINT.md §8.1/§4.1).
      const savedId = isCreateMode ? docRef?.id : docId;
      goto(`/customerCenter/receivePayment/view?id=${savedId}`);

    } catch (error) {
      console.error('Error saving payment receipt:', error);
      alert('Failed to save payment receipt: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  }

  // Define fields for TxnFields component
  $: fields = [
    { label: 'Customer', name: 'customer', type: 'select', options: customerOptions },
    { label: 'Receipt Date', name: 'receiptDate', type: 'date' },
    { label: 'Payment Method', name: 'paymentMethod', type: 'select', options: paymentMethodOptions },
    { label: 'Amount', name: 'amount', type: 'number', min: 0, step: 0.01, onChange: updateAllocationTotals, format: 'accounting' },
    { label: 'Reference', name: 'reference', type: 'text', placeholder: 'Check No., Transaction ID, etc.' }
  ];
  
</script>

<FormLayout title={pageTitle} backPath="/customerCenter/receivePayment/list">
  <svelte:fragment slot="header-actions">
    <div class="w-full sm:w-72 flex items-center gap-2">
      <label for="field-memo" class="text-xs font-medium whitespace-nowrap" style="color: var(--color-neutral-600);">Memo</label>
      <textarea
        id="field-memo"
        rows="1"
        class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors resize-none"
        style="background: {isViewMode ? 'var(--color-neutral-50)' : 'var(--color-neutral-0)'}; border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
        placeholder="Add a memo"
        bind:value={formData.memo}
        disabled={isViewMode}
      ></textarea>
    </div>
  </svelte:fragment>

  {#if isLoading}
    <div class="flex justify-center items-center h-64">
      <p style="color: var(--color-neutral-600);">Loading...</p>
    </div>
  {:else}
    <!-- Document header fields section -->
    <FormSection withSeparator={false}>
      <TxnFields {fields} bind:formData disabled={isViewMode} />
        
        <!-- Invoice Allocation Section -->
        <div>
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-medium" style="color: var(--color-neutral-800);">Invoice Allocation</h2>
            {#if !isViewMode}
              <div class="flex gap-2">
                <button
                  type="button"
                  class="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium text-white transition-colors"
                  style="background: var(--color-success-600);"
                  on:click={() => showApplyCreditModal = true}
                >
                  <iconify-icon icon="material-symbols:credit-card" class="mr-1" width="18"></iconify-icon>
                  Apply Credit
                </button>
              <button
                type="button"
                class="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium text-white transition-colors"
                style="background: var(--color-primary-600);"
                on:click={autoAllocate}
              >
                <iconify-icon icon="material-symbols:auto-fix" class="mr-1" width="18"></iconify-icon>
                Auto Allocate
              </button>
              </div>
            {/if}
          </div>

          <!-- Allocation Summary — plain text, no card -->
          <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 text-sm">
            <div class="flex items-baseline gap-1.5">
              <span style="color: var(--color-neutral-500);">Cash Payment:</span>
              <span class="font-semibold" style="color: var(--color-neutral-800);">{formData.amount?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span style="color: var(--color-neutral-500);">Credits Applied:</span>
              <span class="font-semibold" style="color: var(--color-primary-600);">{totalAppliedCredit?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span style="color: var(--color-neutral-500);">Total Available:</span>
              <span class="font-semibold" style="color: var(--color-primary-600);">{(formData.amount + totalAppliedCredit)?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span style="color: var(--color-neutral-500);">Allocated:</span>
              <span class="font-semibold" style="color: var(--color-success-600);">{allocatedTotal.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span style="color: var(--color-neutral-500);">Unallocated:</span>
              <span class="font-semibold" style={`color: var(${unallocatedAmount < 0 ? '--color-error-600' : '--color-primary-600'});`}>{unallocatedAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
            </div>
          </div>

          <!-- Applied Credits Section -->
          {#if appliedCredits.length > 0}
            <div class="mb-4">
              <h3 class="text-sm font-medium mb-2" style="color: var(--color-neutral-700);">Applied Credits</h3>
              <div class="space-y-2">
                {#each appliedCredits as credit}
                  <div class="flex justify-between items-center p-2 rounded" style="background: color-mix(in srgb, var(--color-primary-600) 8%, transparent);">
                    <div class="flex-1">
                      <span class="text-sm font-medium" style="color: var(--color-primary-700);">
                        {credit.type === 'credit_memo' ? 'Credit Memo' : 'Advance Payment'}: {credit.reference}
                      </span>
                      <span class="text-xs ml-2" style="color: var(--color-neutral-500);">
                        (Available: {credit.availableAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })})
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold" style="color: var(--color-primary-700);">
                        {credit.appliedAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                      </span>
                      {#if !isViewMode}
                        <button
                          type="button"
                          style="color: var(--color-error-600);"
                          aria-label="Remove applied credit"
                          on:click={() => removeAppliedCredit(credit.id, credit.type)}
                        >
                          <iconify-icon icon="material-symbols:close" width="16"></iconify-icon>
                        </button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          
          <!-- Outstanding Invoices Table -->
          <div class="overflow-x-auto">
            {#if outstandingInvoices.length > 0}
              <table class="min-w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Invoice</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Due Date</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Amount Due</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Credit</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Disc %</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Tax %</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Payable</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {#each outstandingInvoices as invoice}
                    <tr>
                      <td class="px-3 py-2 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{invoice.label.split(' - ')[0]}</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                        {invoice.dueDate ? new Date(invoice.dueDate.seconds * 1000).toLocaleDateString() : '-'}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                        {invoice.amount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                        {#if isViewMode}
                          <span class="text-sm font-mono" style="color: var(--color-neutral-800);">{formatAccountingAmount(invoice.credit || 0)}</span>
                        {:else}
                          <button
                            type="button"
                            class="w-28 px-3 py-1.5 text-sm font-medium text-white rounded-md transition-colors duration-150"
                            style="background: var(--color-primary-600);"
                            on:click={() => {
                              // Open credit selection modal for this specific invoice
                              selectedInvoiceForCredit = invoice.value;
                              showApplyCreditModal = true;
                            }}
                          >
                            <div class="flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              Select Credits
                            </div>
                          </button>
                        {/if}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                        {#if isViewMode}
                          <span class="text-sm font-medium" style="color: var(--color-neutral-700);">{invoice.discountPercent || 0}%</span>
                        {:else}
                          <select class="w-28 rounded border text-sm focus:outline-none focus:ring-2 transition-colors" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);" bind:value={invoice.discountId} on:change={updateAllocationTotals}>
                            {#each discountOptions as opt}
                              <option value={opt.value}>{opt.label}</option>
                            {/each}
                          </select>
                        {/if}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                        {#if isViewMode}
                          <span class="text-sm" style="color: var(--color-neutral-600);">{invoice.taxPercent || 0}%</span>
                        {:else}
                          <select class="w-28 rounded border text-sm focus:outline-none focus:ring-2 transition-colors" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);" bind:value={invoice.taxTypeId} on:change={updateAllocationTotals}>
                            {#each taxTypeOptions as opt}
                              <option value={opt.value}>{opt.label}</option>
                            {/each}
                          </select>
                        {/if}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm" style="color: var(--color-neutral-700); border-bottom: 1px solid var(--color-neutral-100);">
                        {invoice.payable?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                        {#if isViewMode}
                          <span class="text-sm" style="color: var(--color-neutral-600);">
                            {(invoiceAllocations[invoice.value] || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                          </span>
                        {:else}
                          <input
                            type="number"
                            min="0"
                            max={invoice.payable || invoice.amount}
                            step="0.01"
                            class="w-32 rounded border text-sm focus:outline-none focus:ring-2 transition-colors"
                            style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
                            bind:value={invoiceAllocations[invoice.value]}
                            on:input={updateAllocationTotals}
                            on:blur={(e) => {
                              // Format to 2 decimal places on blur
                              const target = e.target as HTMLInputElement;
                              if (target) {
                                const value = parseFloat(target.value);
                                if (!isNaN(value)) {
                                  invoiceAllocations[invoice.value] = Math.round(value * 100) / 100;
                                  updateAllocationTotals();
                                }
                              }
                            }}
                            placeholder="0.00"
                          />
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else if formData.customer}
              <div class="text-center py-8" style="color: var(--color-neutral-500);">
                No outstanding invoices found for this customer.
              </div>
            {:else}
              <div class="text-center py-8" style="color: var(--color-neutral-500);">
                Select a customer to view outstanding invoices.
              </div>
            {/if}
          </div>
        </div>
    </FormSection>
    
    <!-- Form Footer with buttons -->
    <FormFooter 
      primaryLabel={isViewMode ? 'Back to List' : (isSaving ? 'Saving...' : (isEditMode ? 'Update Payment Receipt' : 'Create Payment Receipt'))}
      secondaryLabel="Cancel"
      onPrimaryClick={isViewMode ? () => goto('/customerCenter/receivePayment/list') : handleSave}
      onSecondaryClick={() => goto('/customerCenter/receivePayment/list')}
      showSecondaryButton={!isViewMode}
      readOnly={isViewMode}
      leftSideContent={false}
    />
  {/if}
</FormLayout>

<!-- Apply Credit Modal -->
{#if showApplyCreditModal}
  <div class="fixed inset-0 overflow-y-auto h-full w-full z-50" style="background: rgba(15, 23, 42, 0.55);">
    <div class="relative top-20 mx-auto p-5 rounded-md w-11/12 max-w-4xl" style="background: var(--color-neutral-0); border: 1px solid var(--color-neutral-200); box-shadow: var(--shadow-lg);">
      <div class="mt-3">
        <!-- Modal Header -->
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium" style="color: var(--color-neutral-800);">Apply Credit</h3>
          <button
            type="button"
            style="color: var(--color-neutral-400);"
            aria-label="Close modal"
            on:click={() => showApplyCreditModal = false}
          >
            <iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
          </button>
        </div>

        <!-- Search Bar -->
        <div class="mb-4">
          <input
            type="text"
            placeholder="Search credit # / type ..."
            class="w-full rounded border text-sm focus:outline-none focus:ring-2 transition-colors"
            style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
            bind:value={creditSearchTerm}
          />
        </div>

        <!-- Credit Memos Section -->
        <div class="mb-6">
          <h4 class="text-sm font-medium mb-3" style="color: var(--color-neutral-700);">Select Credit Memos</h4>
          <p class="text-xs mb-3" style="color: var(--color-neutral-500);">Check rows and type an amount (auto-fills to max).</p>

          {#if availableCreditMemos.length > 0}
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">
                      <input
                        type="checkbox"
                        style="accent-color: var(--color-primary-600);"
                        on:change={(e) => {
                          const target = e.target as HTMLInputElement;
                          const filteredMemos = availableCreditMemos.filter(memo => 
                            !creditSearchTerm || memo.creditNo.toLowerCase().includes(creditSearchTerm.toLowerCase()) || 
                            'credit memo'.includes(creditSearchTerm.toLowerCase())
                          );
                          filteredMemos.forEach(memo => {
                            const currentAmount = appliedCredits.find(c => c.id === memo.id && c.type === 'credit_memo')?.appliedAmount || 0;
                            if (target.checked && currentAmount === 0) {
                              applyCredit(memo.id, 'credit_memo', memo.availableAmount);
                            } else if (!target.checked && currentAmount > 0) {
                              applyCredit(memo.id, 'credit_memo', 0);
                            }
                          });
                        }}
                      />
                    </th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Credit #</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Type</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Available</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Apply Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {#each availableCreditMemos.filter(memo => !creditSearchTerm || memo.creditNo.toLowerCase().includes(creditSearchTerm.toLowerCase()) || 'credit memo'.includes(creditSearchTerm.toLowerCase())) as memo}
                    {@const currentApplied = appliedCredits.find(c => c.id === memo.id && c.type === 'credit_memo')?.appliedAmount || 0}
                    <tr style={currentApplied > 0 ? 'background: color-mix(in srgb, var(--color-primary-600) 8%, transparent);' : ''}>
                      <td class="px-3 py-2 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                        <input
                          type="checkbox"
                          style="accent-color: var(--color-primary-600);"
                          checked={currentApplied > 0}
                          on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            if (target.checked) {
                              applyCredit(memo.id, 'credit_memo', memo.availableAmount);
                            } else {
                              applyCredit(memo.id, 'credit_memo', 0);
                            }
                          }}
                        />
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm font-medium" style="color: var(--color-primary-600); border-bottom: 1px solid var(--color-neutral-100);">{memo.creditNo}</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">item</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                        {formatAccountingAmount(memo.availableAmount)}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                        <input
                          type="number"
                          min="0"
                          max={memo.availableAmount}
                          step="0.01"
                          class="w-24 rounded border text-sm focus:outline-none focus:ring-2 transition-colors"
                          style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
                          value={currentApplied}
                          on:input={(e) => {
                            const target = e.target as HTMLInputElement;
                            const amount = parseFloat(target.value) || 0;
                            applyCredit(memo.id, 'credit_memo', amount);
                          }}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="text-center py-4" style="color: var(--color-neutral-500);">
              No credit memos available for this customer.
            </div>
          {/if}
        </div>

        <!-- Advance Payments Section -->
        <div class="mb-6">
          <h4 class="text-sm font-medium mb-3" style="color: var(--color-neutral-700);">Select Advance Payments</h4>
          <p class="text-xs mb-3" style="color: var(--color-neutral-500);">You can combine multiple advances.</p>

          {#if availableAdvancePayments.length > 0}
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">
                      <input
                        type="checkbox"
                        style="accent-color: var(--color-primary-600);"
                        on:change={(e) => {
                          const target = e.target as HTMLInputElement;
                          const filteredPayments = availableAdvancePayments.filter(payment => 
                            !creditSearchTerm || payment.reference.toLowerCase().includes(creditSearchTerm.toLowerCase()) || 
                            'advance payment'.includes(creditSearchTerm.toLowerCase()) || 
                            'overpayment'.includes(creditSearchTerm.toLowerCase())
                          );
                          filteredPayments.forEach(payment => {
                            const currentAmount = appliedCredits.find(c => c.id === payment.id && c.type === 'advance_payment')?.appliedAmount || 0;
                            if (target.checked && currentAmount === 0) {
                              applyCredit(payment.id, 'advance_payment', payment.availableAmount);
                            } else if (!target.checked && currentAmount > 0) {
                              applyCredit(payment.id, 'advance_payment', 0);
                            }
                          });
                        }}
                      />
                    </th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Reference</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Type</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Available</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Apply Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {#each availableAdvancePayments.filter(payment => !creditSearchTerm || payment.reference.toLowerCase().includes(creditSearchTerm.toLowerCase()) || 'advance payment'.includes(creditSearchTerm.toLowerCase()) || 'overpayment'.includes(creditSearchTerm.toLowerCase())) as payment}
                    {@const currentApplied = appliedCredits.find(c => c.id === payment.id && c.type === 'advance_payment')?.appliedAmount || 0}
                    <tr style={currentApplied > 0 ? 'background: color-mix(in srgb, var(--color-primary-600) 8%, transparent);' : ''}>
                      <td class="px-3 py-2 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                        <input
                          type="checkbox"
                          style="accent-color: var(--color-primary-600);"
                          checked={currentApplied > 0}
                          on:change={(e) => {
                            const target = e.target as HTMLInputElement;
                            if (target.checked) {
                              applyCredit(payment.id, 'advance_payment', payment.availableAmount);
                            } else {
                              applyCredit(payment.id, 'advance_payment', 0);
                            }
                          }}
                        />
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm font-medium" style="color: var(--color-primary-600); border-bottom: 1px solid var(--color-neutral-100);">{payment.reference}</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">Overpayment</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                        {formatAccountingAmount(payment.availableAmount)}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                        <input
                          type="number"
                          min="0"
                          max={payment.availableAmount}
                          step="0.01"
                          class="w-24 rounded border text-sm focus:outline-none focus:ring-2 transition-colors"
                          style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
                          value={currentApplied}
                          on:input={(e) => {
                            const target = e.target as HTMLInputElement;
                            const amount = parseFloat(target.value) || 0;
                            applyCredit(payment.id, 'advance_payment', amount);
                          }}
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="text-center py-4" style="color: var(--color-neutral-500);">
              No advance payments available for this customer.
            </div>
          {/if}
        </div>

        <!-- Modal Summary -->
        <div class="mb-4 p-3 rounded" style="background: var(--color-neutral-50); border: 1px solid var(--color-neutral-200);">
          <div class="space-y-1 text-sm" style="color: var(--color-neutral-700);">
            <div class="flex justify-between">
              <span>Credits Applied:</span>
              <span class="font-semibold" style="color: var(--color-neutral-800);">{formatAccountingAmount(totalAppliedCredit)}</span>
            </div>
            <div class="flex justify-between">
              <span>Discount:</span>
              <span class="font-semibold" style="color: var(--color-neutral-800);">0.00</span>
            </div>
            <div class="flex justify-between">
              <span>Advances Applied:</span>
              <span class="font-semibold" style="color: var(--color-neutral-800);">{formatAccountingAmount(appliedCredits.filter(c => c.type === 'advance_payment').reduce((sum, c) => sum + c.appliedAmount, 0))}</span>
            </div>
            <div class="flex justify-between pt-1" style="border-top: 1px solid var(--color-neutral-200);">
              <span class="font-medium" style="color: var(--color-neutral-800);">Total Applied:</span>
              <span class="font-semibold" style="color: var(--color-neutral-800);">{formatAccountingAmount(totalAppliedCredit)}</span>
            </div>
          </div>
          <p class="text-xs mt-2" style="color: var(--color-neutral-600);">Make sure your total applied doesn't exceed the invoice balance.</p>
        </div>

        <!-- Modal Footer -->
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium rounded-md transition-colors"
            style="color: var(--color-neutral-700); background: var(--color-neutral-100);"
            on:click={() => showApplyCreditModal = false}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors"
            style="background: var(--color-primary-600);"
            on:click={() => showApplyCreditModal = false}
          >
            ✓ Apply
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
