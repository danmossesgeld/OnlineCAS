<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { addDocToCollection, updateDocInCollection, getDocFromCollection, queryCollectionDocs } from '$lib/utils/firestoreCrud';
  import type { FilterCondition } from '$lib/utils/firestoreCrud';
  import { generateNextDocumentId, DocumentType } from '$lib/utils/documentIdService';
  import { createReceiptJournalEntry } from '$lib/utils/accountingService';
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
  
  // Adjust page title based on mode
  $: pageTitle = {
    'create': 'Create Payment Receipt',
    'edit': 'Edit Payment Receipt',
    'view': 'View Payment Receipt'
  }[mode];

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

  // Credit system variables
  let availableCreditMemos: CreditMemo[] = [];
  let availableAdvancePayments: AdvancePayment[] = [];
  let appliedCredits: AppliedCredit[] = [];
  let totalAppliedCredit = 0;
  let showApplyCreditModal = false;
  let creditSearchTerm = '';

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
        selectedInvoices: docData.invoicePayments?.map(ip => ip.invoiceId) || []
      };
      
      // Populate invoice allocations
      invoiceAllocations = {};
      if (docData.invoicePayments && Array.isArray(docData.invoicePayments)) {
        docData.invoicePayments.forEach(payment => {
          invoiceAllocations[payment.invoiceId] = payment.amountPaid;
        });
      }
      
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
      // Show all invoices with outstanding balance (status not Paid and totalDue > 0)
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
    // Clamp credits to available pool and recompute payable
    let usedCredit = 0;
    outstandingInvoices = outstandingInvoices.map(inv => {
      // Map selected ids to percents
      if (inv.discountId !== undefined) inv.discountPercent = getDiscountPercentFromId(inv.discountId);
      if (inv.taxTypeId !== undefined) inv.taxPercent = getTaxPercentFromTypeId(inv.taxTypeId);
      // Clamp credit so cumulative does not exceed availableCredit
      const maxForThis = Math.max(0, availableCredit - usedCredit);
      const creditClamped = Math.min(Number(inv.credit) || 0, maxForThis);
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
      const creditMemoResults = await queryCollectionDocs('transactions/creditMemo', creditMemoFilters);
      availableCreditMemos = creditMemoResults.map((doc: any) => ({
        id: doc.id,
        creditNo: doc.creditNo || doc.id,
        amount: doc.totalAmount || 0,
        availableAmount: (doc.totalAmount || 0) - (doc.appliedAmount || 0),
        date: doc.creditDate?.toDate() || new Date(),
        customer: doc.customer
      })).filter(memo => memo.availableAmount > 0);

      // Load advance payments (overpayments from previous receipts)
      const advanceFilters: FilterCondition[] = [
        { field: 'customer', operator: '==', value: formData.customer },
        { field: 'status', operator: '==', value: 'Posted' }
      ];
      const advanceResults = await queryCollectionDocs('transactions/receivePayment', advanceFilters);
      availableAdvancePayments = advanceResults.map((doc: any) => ({
        id: doc.id,
        reference: doc.reference || doc.receiptNo || doc.id,
        amount: doc.amount || 0,
        availableAmount: (doc.amount || 0) - (doc.appliedAmount || 0),
        date: doc.receiptDate?.toDate() || new Date(),
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
      invoiceAllocations[invoice.value] = amountToAllocate;
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

  // Generate a sequential receipt number
  async function generateReceiptNumber(): Promise<string> {
    try {
      // Use the document ID service for sequential generation
      return await generateNextDocumentId(DocumentType.PAYMENT_RECEIPT);
    } catch (error) {
      console.error('Error generating receipt number:', error);
      // Fallback to timestamp-based generation if sequential fails
      const prefix = 'PR';
      const timestamp = Date.now().toString().substring(7);
      return `${prefix}${timestamp.padStart(9, '0')}`;
    }
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
      let receiptData;
      if (isCreateMode) {
        // Generate a sequential receipt number
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
      
      let docRef;
      
      if (isCreateMode) {
        // Add new receipt
        docRef = await addDocToCollection('transactions/customerCenter/receipts', receiptData);
        
        // Create journal entry
        const journalEntryId = await createReceiptJournalEntry({
          ...receiptData,
          id: docRef.id
        });
        
        // Update applied amounts and statuses on credit memos and advance payments
        for (const credit of appliedCredits) {
          if (credit.type === 'credit_memo') {
            // Update credit memo applied amount and status
            const creditMemoDoc = await getDocFromCollection('transactions/creditMemo', credit.id) as any;
            if (creditMemoDoc) {
              const currentApplied = creditMemoDoc.appliedAmount || 0;
              const newApplied = currentApplied + credit.appliedAmount;
              const totalAmount = creditMemoDoc.totalAmount || 0;
              
              // Determine new status based on applied amount
              let newStatus = creditMemoDoc.status;
              if (newApplied >= totalAmount) {
                newStatus = 'Fully Applied';
              } else if (newApplied > 0) {
                newStatus = 'Partially Applied';
              }
              
              await updateDocInCollection('transactions/creditMemo', credit.id, {
                appliedAmount: newApplied,
                status: newStatus,
                updatedAt: new Date()
              });
            }
          } else if (credit.type === 'advance_payment') {
            // Update advance payment applied amount and status
            const paymentDoc = await getDocFromCollection('transactions/receivePayment', credit.id) as any;
            if (paymentDoc) {
              const currentApplied = paymentDoc.appliedAmount || 0;
              const newApplied = currentApplied + credit.appliedAmount;
              const totalAmount = paymentDoc.amount || 0;
              
              // Determine new status based on applied amount
              let newStatus = paymentDoc.status;
              if (newApplied >= totalAmount) {
                newStatus = 'Fully Applied';
              } else if (newApplied > 0) {
                newStatus = 'Partially Applied';
              }
              
              await updateDocInCollection('transactions/receivePayment', credit.id, {
                appliedAmount: newApplied,
                status: newStatus,
                updatedAt: new Date()
              });
            }
          }
        }
        
        // Update invoice statuses and balances to reflect payments
        await Promise.all(
          allocationArray.map(async (payment) => {
            try {
              const inv = (outstandingInvoices.find(i => i.value === payment.invoiceId));
              const newBalance = Math.max(0, Number((inv?.payable ?? inv?.amount ?? 0) - payment.amountPaid));
              const newStatus = newBalance <= 0 ? 'Paid' : 'Partially Paid';
              await updateDocInCollection('transactions/customerCenter/salesInvoices', payment.invoiceId, {
                totalDue: newBalance,
                status: newStatus,
                updatedAt: new Date()
              });
            } catch {}
          })
        );
      } else if (isEditMode && docId) {
        // Update existing receipt
        await updateDocInCollection('transactions/customerCenter/receipts', docId, receiptData);
        
        // Update applied amounts and statuses on credit memos and advance payments
        for (const credit of appliedCredits) {
          if (credit.type === 'credit_memo') {
            // Update credit memo applied amount and status
            const creditMemoDoc = await getDocFromCollection('transactions/creditMemo', credit.id) as any;
            if (creditMemoDoc) {
              const currentApplied = creditMemoDoc.appliedAmount || 0;
              const newApplied = currentApplied + credit.appliedAmount;
              const totalAmount = creditMemoDoc.totalAmount || 0;
              
              // Determine new status based on applied amount
              let newStatus = creditMemoDoc.status;
              if (newApplied >= totalAmount) {
                newStatus = 'Fully Applied';
              } else if (newApplied > 0) {
                newStatus = 'Partially Applied';
              }
              
              await updateDocInCollection('transactions/creditMemo', credit.id, {
                appliedAmount: newApplied,
                status: newStatus,
                updatedAt: new Date()
              });
            }
          } else if (credit.type === 'advance_payment') {
            // Update advance payment applied amount and status
            const paymentDoc = await getDocFromCollection('transactions/receivePayment', credit.id) as any;
            if (paymentDoc) {
              const currentApplied = paymentDoc.appliedAmount || 0;
              const newApplied = currentApplied + credit.appliedAmount;
              const totalAmount = paymentDoc.amount || 0;
              
              // Determine new status based on applied amount
              let newStatus = paymentDoc.status;
              if (newApplied >= totalAmount) {
                newStatus = 'Fully Applied';
              } else if (newApplied > 0) {
                newStatus = 'Partially Applied';
              }
              
              await updateDocInCollection('transactions/receivePayment', credit.id, {
                appliedAmount: newApplied,
                status: newStatus,
                updatedAt: new Date()
              });
            }
          }
        }
        
        // Create/update journal entry for edit mode
        const journalEntryId = await createReceiptJournalEntry({
          ...receiptData,
          id: docId
        });
      }
      
      // Navigate back to list
      goto('/customerCenter/receivePayment/list');
      
    } catch (error) {
      console.error('Error saving payment receipt:', error);
      alert('Failed to save payment receipt. Please try again.');
    }
  }

  // Define fields for TxnFields component
  $: fields = [
    { label: 'Customer', name: 'customer', type: 'select', options: customerOptions },
    { label: 'Receipt Date', name: 'receiptDate', type: 'date' },
    { label: 'Payment Method', name: 'paymentMethod', type: 'select', options: paymentMethodOptions },
    { label: 'Amount', name: 'amount', type: 'number', min: 0, step: 0.01, onChange: updateAllocationTotals, format: 'currency' },
    { label: 'Reference', name: 'reference', type: 'text', placeholder: 'Check No., Transaction ID, etc.' },
    { label: 'Memo', name: 'memo', type: 'textarea', rows: 3 }
  ];
  
  // Form fields array for invoices
  $: invoiceFields = [
    { label: 'Customer', name: 'customer', type: 'select', options: customerOptions, required: true },
    { label: 'Receipt Date', name: 'receiptDate', type: 'date', required: true },
    { label: 'Payment Method', name: 'paymentMethod', type: 'select', options: paymentMethodOptions, required: true },
    { label: 'Reference', name: 'reference', type: 'text', placeholder: 'Check No., Transaction ID, etc.' },
    { label: 'Memo', name: 'memo', type: 'textarea', rows: 2 },
  ];
</script>

<FormLayout title={pageTitle} backPath="/customerCenter/receivePayment/list">
  {#if isLoading}
    <div class="flex justify-center items-center h-64">
      <p class="text-gray-600">Loading...</p>
    </div>
  {:else}
    <!-- Document header fields section -->
    <FormSection withSeparator={false}>
      <TxnFields {fields} bind:formData disabled={isViewMode} />
        
        <!-- Invoice Allocation Section -->
        <div>
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-medium text-gray-900">Invoice Allocation</h2>
            {#if !isViewMode}
              <div class="flex gap-2">
                <button 
                  type="button" 
                  class="inline-flex items-center px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  on:click={() => showApplyCreditModal = true}
                >
                  <iconify-icon icon="material-symbols:credit-card" class="mr-1" width="18"></iconify-icon>
                  Apply Credit
                </button>
              <button 
                type="button" 
                class="inline-flex items-center px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                on:click={autoAllocate}
              >
                <iconify-icon icon="material-symbols:auto-fix" class="mr-1" width="18"></iconify-icon>
                Auto Allocate
              </button>
              </div>
            {/if}
          </div>
          
          <!-- Allocation Summary -->
          <div class="mb-4 p-3 bg-gray-50 rounded-md">
            <div class="flex flex-wrap gap-4 text-sm">
              <div>
                <span class="text-gray-500">Cash Payment:</span> 
                <span class="font-semibold text-gray-800 ml-1">{formData.amount?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span>
              </div>
              <div>
                <span class="text-gray-500">Credits Applied:</span> 
                <span class="font-semibold text-purple-600 ml-1">{totalAppliedCredit?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span>
              </div>
              <div>
                <span class="text-gray-500">Total Available:</span> 
                <span class="font-semibold text-blue-600 ml-1">{(formData.amount + totalAppliedCredit)?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span>
              </div>
              <div>
                <span class="text-gray-500">Allocated:</span> 
                <span class="font-semibold text-green-600 ml-1">{allocatedTotal.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
              </div>
              <div>
                <span class="text-gray-500">Unallocated:</span> 
                <span class="font-semibold ml-1 {unallocatedAmount < 0 ? 'text-red-600' : 'text-blue-600'}">{unallocatedAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
              </div>
            </div>
          </div>

          <!-- Applied Credits Section -->
          {#if appliedCredits.length > 0}
            <div class="mb-4">
              <h3 class="text-sm font-medium text-gray-700 mb-2">Applied Credits</h3>
              <div class="space-y-2">
                {#each appliedCredits as credit}
                  <div class="flex justify-between items-center bg-purple-50 p-2 rounded">
                    <div class="flex-1">
                      <span class="text-sm font-medium text-purple-700">
                        {credit.type === 'credit_memo' ? 'Credit Memo' : 'Advance Payment'}: {credit.reference}
                      </span>
                      <span class="text-xs text-gray-500 ml-2">
                        (Available: {credit.availableAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })})
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-purple-700">
                        {credit.appliedAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                      </span>
                      {#if !isViewMode}
                        <button
                          type="button"
                          class="text-red-500 hover:text-red-700"
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
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Due</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disc %</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tax %</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payable</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  {#each outstandingInvoices as invoice}
                    <tr>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-800">{invoice.label.split(' - ')[0]}</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                        {invoice.dueDate ? new Date(invoice.dueDate.seconds * 1000).toLocaleDateString() : '-'}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                        {invoice.amount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        {#if isViewMode}
                          <span class="text-sm text-gray-600">{invoice.discountPercent || 0}%</span>
                        {:else}
                          <select class="w-28 rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-200 focus:ring-opacity-50" bind:value={invoice.discountId} on:change={updateAllocationTotals}>
                            {#each discountOptions as opt}
                              <option value={opt.value}>{opt.label}</option>
                            {/each}
                          </select>
                        {/if}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        {#if isViewMode}
                          <span class="text-sm text-gray-600">{invoice.taxPercent || 0}%</span>
                        {:else}
                          <select class="w-28 rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-200 focus:ring-opacity-50" bind:value={invoice.taxTypeId} on:change={updateAllocationTotals}>
                            {#each taxTypeOptions as opt}
                              <option value={opt.value}>{opt.label}</option>
                            {/each}
                          </select>
                        {/if}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm">
                        {invoice.payable?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        {#if isViewMode}
                          <span class="text-sm text-gray-600">
                            {(invoiceAllocations[invoice.value] || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                          </span>
                        {:else}
                          <input 
                            type="number"
                            min="0"
                            max={invoice.payable || invoice.amount}
                            class="w-32 rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-200 focus:ring-opacity-50"
                            bind:value={invoiceAllocations[invoice.value]}
                            on:input={updateAllocationTotals}
                          />
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else if formData.customer}
              <div class="text-center py-8 text-gray-500 bg-gray-50 rounded-md">
                No outstanding invoices found for this customer.
              </div>
            {:else}
              <div class="text-center py-8 text-gray-500 bg-gray-50 rounded-md">
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
  <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
    <div class="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
      <div class="mt-3">
        <!-- Modal Header -->
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-gray-900">Apply Credit</h3>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-600"
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
            class="w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-200 focus:ring-opacity-50"
            bind:value={creditSearchTerm}
          />
        </div>

        <!-- Credit Memos Section -->
        <div class="mb-6">
          <h4 class="text-sm font-medium text-gray-700 mb-3">Select Credit Memos</h4>
          <p class="text-xs text-gray-500 mb-3">Check rows and type an amount (auto-fills to max).</p>
          
          {#if availableCreditMemos.length > 0}
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit #</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Apply Amount</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  {#each availableCreditMemos.filter(memo => !creditSearchTerm || memo.creditNo.toLowerCase().includes(creditSearchTerm.toLowerCase()) || 'credit memo'.includes(creditSearchTerm.toLowerCase())) as memo}
                    <tr>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-blue-600 font-medium">{memo.creditNo}</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-600">Credit Memo</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                        {memo.availableAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          max={memo.availableAmount}
                          step="0.01"
                          class="w-24 rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-200 focus:ring-opacity-50"
                          value={appliedCredits.find(c => c.id === memo.id && c.type === 'credit_memo')?.appliedAmount || 0}
                          on:input={(e) => {
                            const target = e.target as HTMLInputElement;
                            const amount = parseFloat(target.value) || 0;
                            applyCredit(memo.id, 'credit_memo', amount);
                          }}
                        />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="text-center py-4 text-gray-500 bg-gray-50 rounded">
              No credit memos available for this customer.
            </div>
          {/if}
        </div>

        <!-- Advance Payments Section -->
        <div class="mb-6">
          <h4 class="text-sm font-medium text-gray-700 mb-3">Select Advance Payments</h4>
          <p class="text-xs text-gray-500 mb-3">You can combine multiple advances.</p>
          
          {#if availableAdvancePayments.length > 0}
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                    <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Apply Amount</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  {#each availableAdvancePayments.filter(payment => !creditSearchTerm || payment.reference.toLowerCase().includes(creditSearchTerm.toLowerCase()) || 'advance payment'.includes(creditSearchTerm.toLowerCase()) || 'overpayment'.includes(creditSearchTerm.toLowerCase())) as payment}
                    <tr>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-blue-600 font-medium">{payment.reference}</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-600">Overpayment</td>
                      <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-600">
                        {payment.availableAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                      </td>
                      <td class="px-3 py-2 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          max={payment.availableAmount}
                          step="0.01"
                          class="w-24 rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-200 focus:ring-opacity-50"
                          value={appliedCredits.find(c => c.id === payment.id && c.type === 'advance_payment')?.appliedAmount || 0}
                          on:input={(e) => {
                            const target = e.target as HTMLInputElement;
                            const amount = parseFloat(target.value) || 0;
                            applyCredit(payment.id, 'advance_payment', amount);
                          }}
                        />
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="text-center py-4 text-gray-500 bg-gray-50 rounded">
              No advance payments available for this customer.
            </div>
          {/if}
        </div>

        <!-- Modal Summary -->
        <div class="mb-4 p-3 bg-blue-50 rounded">
          <div class="flex justify-between text-sm">
            <span>Credits Applied:</span>
            <span class="font-semibold">{totalAppliedCredit.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            on:click={() => showApplyCreditModal = false}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            on:click={() => showApplyCreditModal = false}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
