<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { addDocToCollection, updateDocInCollection, getDocFromCollection, queryCollectionDocs, type FilterCondition } from '$lib/utils/firestoreCrud';
  import { generateNextDocumentId, DocumentType } from '$lib/utils/documentIdService';
  import { createVendorPaymentJournalEntry } from '$lib/utils/accountingService';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  // Use the reusable form mode store for handling URL parameters and mode detection
  import { createFormModeStore } from '$lib/stores/formModeStore';
  const formMode = createFormModeStore();
  
  // Extract form mode values from the store using destructuring
  $: ({ docId, isViewMode, isEditMode, isCreateMode, mode } = $formMode);
  
  // Load document when the ID changes in edit or view mode
  $: if (docId && (isEditMode || isViewMode)) {
    loadDocument();
  }
  
  // Show the actual payment number once known, instead of a generic "Edit/View Vendor
  // Payment" label — falls back to a mode label for a brand-new, not-yet-saved payment.
  $: pageTitle = isCreateMode
    ? 'New Vendor Payment'
    : (formData.paymentNo ? formData.paymentNo : (mode === 'view' ? 'View Vendor Payment' : 'Edit Vendor Payment'));

  // Subscribe to Firestore option stores and use arrays for select fields
  let vendorOptions: {label: string, value: any}[] = [];
  let paymentMethodOptions: {label: string, value: any}[] = [];
  let outstandingBills: {label: string, value: any, amount: number, dueDate: any}[] = [];

  createFirestoreOptionsStore('vendors', 'name', 'id').subscribe(opts => vendorOptions = opts);
  createFirestoreOptionsStore('paymentmethods').subscribe(opts => paymentMethodOptions = opts);

  // Type for our form data
  type FormDataType = {
    vendor: string;
    paymentDate: string;
    paymentMethod: string;
    reference: string;
    memo: string;
    amount: number;
    selectedBills: string[];
    paymentNo?: string; // Tracks the saved payment number once loaded, for display in the page title
  };

  // Initialize form data with empty values
  let formData: FormDataType = {
    vendor: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: '',
    reference: '',
    memo: '',
    amount: 0,
    selectedBills: []
  };

  // For storing allocated amounts to each bill
  let billAllocations: Record<string, number> = {};
  let allocatedTotal = 0;
  let unallocatedAmount = 0;

  // Snapshot of what was actually persisted when this payment was loaded (empty in create mode).
  // Saving computes delta = current − original per bill so edits adjust the APV's balance by the
  // *change* in allocation rather than re-subtracting the full current amount on top of what a
  // prior save already subtracted.
  let originalBillPayments: Array<{ billId: string; amountPaid: number }> = [];

  // Define type for Firestore timestamp
  type FirestoreTimestamp = {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
  
  // Define type for bill (APV) data from Firestore. Field names match what the APV form actually
  // saves (apvNo/totalAmountDue) — this used to say billNo/totalDue, neither of which exists on a
  // real APV document, so every outstanding bill rendered with an undefined number and ₱0.00 due.
  type BillDocument = {
    id: string;
    apvNo: string;
    dueDate: FirestoreTimestamp | Date;
    totalAmountDue: number;
    vendor: string;
    vendorName: string;
    status: string;
    [key: string]: any;
  };
  
  // Define type for payment document from Firestore
  type PaymentDocument = {
    id: string;
    vendor: string;
    vendorName: string;
    paymentNo: string;
    paymentDate: FirestoreTimestamp | Date;
    paymentMethod: string;
    paymentMethodName: string;
    reference: string;
    memo: string;
    amount: number;
    billPayments: Array<{
      billId: string;
      billNo: string;
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
      console.log(`Loading vendor payment ${docId} in ${mode} mode...`);
      
      const docData = await getDocFromCollection('transactions/vendorCenter/payments', docId) as PaymentDocument;
      
      if (!docData) {
        throw new Error('Vendor payment not found');
      }
      
      // Populate form data
      formData = {
        vendor: docData.vendor || '',
        paymentDate: formatFirestoreDate(docData.paymentDate),
        paymentMethod: docData.paymentMethod || '',
        reference: docData.reference || '',
        memo: docData.memo || '',
        amount: docData.amount || 0,
        selectedBills: docData.billPayments?.map(bp => bp.billId) || [],
        paymentNo: docData.paymentNo || ''
      };
      
      // Populate bill allocations
      billAllocations = {};
      if (docData.billPayments && Array.isArray(docData.billPayments)) {
        docData.billPayments.forEach(payment => {
          billAllocations[payment.billId] = payment.amountPaid;
        });
      }
      // Snapshot exactly what's persisted right now, before the user edits anything further
      originalBillPayments = (docData.billPayments || []).map(p => ({ billId: p.billId, amountPaid: p.amountPaid }));
      
      // Load outstanding bills for this vendor
      if (docData.vendor) {
        await loadOutstandingBills(docData.vendor);
      }
      
      // Calculate allocated and unallocated amounts
      updateAllocationTotals();
      
    } catch (error) {
      console.error('Error loading vendor payment:', error);
      alert('Failed to load vendor payment. ' + (error as Error).message);
    }
  }

  // Load outstanding bills for selected vendor
  async function loadOutstandingBills(vendorId: string) {
    if (!vendorId) {
      outstandingBills = [];
      return;
    }
    
    try {
      // Fetch bills from Firestore with appropriate filter
      // In a real app, you'd use a query to filter by vendor and status (e.g., 'Posted' or 'Open')
      // For simplicity, we'll just simulate it
      const bills = await getOutstandingBills(vendorId);

      outstandingBills = bills.map(bill => {
        // Handle date formatting for both FirestoreTimestamp and Date objects
        const dueDate = bill.dueDate;
        const formattedDate = dueDate && 'seconds' in dueDate
          ? new Date(dueDate.seconds * 1000).toLocaleDateString()
          : dueDate instanceof Date
            ? dueDate.toLocaleDateString()
            : 'Unknown';
        const amountDue = Number(bill.totalAmountDue) || 0;

        return {
          label: `${bill.apvNo} - ${formattedDate} - ${amountDue.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}`,
          value: bill.id,
          amount: amountDue,
          dueDate: bill.dueDate
        };
      });
      
    } catch (error) {
      console.error('Error loading outstanding bills:', error);
      outstandingBills = [];
    }
  }

  // Helper function to get outstanding bills from Firestore
  async function getOutstandingBills(vendorId: string): Promise<BillDocument[]> {
    // Query by vendor only, then filter client-side — an APV that's been partially paid still
    // needs to show up here so it can receive further payments. A strict status=='Posted' filter
    // (the previous behavior) would make an APV vanish from this list the moment it's marked
    // 'Partially Paid', the same way Sales Invoice/Receive Payment keep partially-paid invoices
    // visible and only drop fully 'Paid' ones.
    const filters: FilterCondition[] = [
      { field: 'vendor', operator: '==', value: vendorId }
    ];

    try {
      const bills = await queryCollectionDocs('transactions/vendorCenter/apvs', filters) as BillDocument[];
      return (bills || []).filter(bill => {
        const status = (bill.status || '').toLowerCase();
        return status !== 'draft' && status !== 'paid' && Number(bill.totalAmountDue || 0) > 0;
      });
    } catch (error) {
      console.error('Error fetching outstanding bills:', error);
      return [];
    }
  }

  // Update allocation totals when bill allocations change
  function updateAllocationTotals() {
    allocatedTotal = Object.values(billAllocations).reduce((sum, amount) => sum + (amount || 0), 0);
    unallocatedAmount = formData.amount - allocatedTotal;
  }

  // Auto-allocate payment amount to bills
  function autoAllocate() {
    let remaining = formData.amount;
    billAllocations = {};
    
    // Sort bills by due date (earliest first)
    const sortedBills = [...outstandingBills].sort((a, b) => {
      const dateA = a.dueDate?.seconds || 0;
      const dateB = b.dueDate?.seconds || 0;
      return dateA - dateB;
    });
    
    // Allocate to each bill until payment is fully allocated
    for (const bill of sortedBills) {
      if (remaining <= 0) break;
      
      const amountToAllocate = Math.min(bill.amount, remaining);
      billAllocations[bill.value] = amountToAllocate;
      remaining -= amountToAllocate;
    }
    
    updateAllocationTotals();
  }

  // Handle vendor selection change
  $: if (formData.vendor && isCreateMode) {
    loadOutstandingBills(formData.vendor);
  }

  // Handle payment amount change
  $: if (formData.amount) {
    updateAllocationTotals();
  }

  // Generate a sequential payment number
  async function generatePaymentNumber(): Promise<string> {
    try {
      // Use the document ID service for sequential generation
      return await generateNextDocumentId(DocumentType.VENDOR_PAYMENT);
    } catch (error) {
      console.error('Error generating payment number:', error);
      // Fallback to timestamp-based generation if sequential fails
      const prefix = 'VP';
      const timestamp = Date.now().toString().substring(7);
      return `${prefix}${timestamp.padStart(9, '0')}`;
    }
  }

  // Applies the *change* in bill allocations since this payment was loaded (delta = new −
  // original) to each APV's totalAmountDue/status, fetched fresh per APV by id. Using a delta
  // rather than re-subtracting the full current allocation on every save means editing a
  // previously-saved payment adjusts the balance correctly instead of double-deducting it.
  async function applyBillBalanceDeltas(
    currentAllocations: Array<{ billId: string; amountPaid: number }>,
    originalAllocations: Array<{ billId: string; amountPaid: number }>
  ) {
    const billIds = new Set([
      ...currentAllocations.map(a => a.billId),
      ...originalAllocations.map(a => a.billId)
    ]);

    await Promise.all(Array.from(billIds).map(async (billId) => {
      const newPaid = currentAllocations.find(a => a.billId === billId)?.amountPaid || 0;
      const oldPaid = originalAllocations.find(a => a.billId === billId)?.amountPaid || 0;
      const delta = newPaid - oldPaid;
      if (delta === 0) return;

      try {
        const apvDoc = await getDocFromCollection('transactions/vendorCenter/apvs', billId) as any;
        if (!apvDoc) return;
        const currentBalance = Number(apvDoc.totalAmountDue ?? 0);
        const newBalance = Math.max(0, currentBalance - delta);
        const newStatus = newBalance <= 0 ? 'Paid' : 'Partially Paid';
        await updateDocInCollection('transactions/vendorCenter/apvs', billId, {
          totalAmountDue: newBalance,
          status: newStatus,
          updatedAt: new Date()
        });
      } catch {}
    }));
  }

  // Save the vendor payment
  async function handleSave() {
    try {
      // Handle view mode - just navigate back to list
      if (isViewMode) {
        goto('/vendorCenter/payment/list');
        return;
      }
      
      // Validate form data
      if (!formData.vendor) {
        alert('Please select a vendor');
        return;
      }
      
      if (!formData.paymentDate) {
        alert('Please enter a payment date');
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

      // Get vendor and payment method names
      const vendorName = vendorOptions.find(opt => opt.value === formData.vendor)?.label || '';
      const paymentMethodName = paymentMethodOptions.find(opt => opt.value === formData.paymentMethod)?.label || '';
      
      // Build bill payments array
      const billPayments = Object.entries(billAllocations)
        .filter(([_, amount]) => amount > 0)
        .map(([billId, amountPaid]) => {
          const bill = outstandingBills.find(b => b.value === billId);
          return {
            billId,
            billNo: bill?.label.split(' - ')[0] || 'Unknown',
            originalAmount: bill?.amount || 0,
            amountPaid
          };
        });
      
      // Create the payment data object. paymentNo/createdAt are only included in create mode —
      // Firestore's setDoc rejects `undefined` field values outright (no ignoreUndefinedProperties
      // configured, src/lib/utils/firebase.ts), so setting them to undefined here on every edit
      // meant updateDocInCollection below threw before ever reaching the balance/JE update code.
      const paymentData: Record<string, any> = {
        vendor: formData.vendor,
        vendorName,
        paymentDate: new Date(formData.paymentDate),
        paymentMethod: formData.paymentMethod,
        paymentMethodName,
        reference: formData.reference,
        memo: formData.memo,
        amount: formData.amount,
        billPayments,
        status: 'Posted',
        updatedAt: new Date()
      };
      if (isCreateMode) {
        paymentData.paymentNo = await generatePaymentNumber();
        paymentData.createdAt = new Date();
      }
      
      let docRef;
      
      if (isCreateMode) {
        // Add new payment
        docRef = await addDocToCollection('transactions/vendorCenter/payments', paymentData);

        // Create journal entry
        const journalEntryId = await createVendorPaymentJournalEntry({
          ...paymentData,
          id: docRef.id
        });

        // originalBillPayments is empty in create mode, so this delta equals the full allocated
        // amount per bill.
        await applyBillBalanceDeltas(billPayments, originalBillPayments);
      } else if (isEditMode && docId) {
        // Update existing payment
        await updateDocInCollection('transactions/vendorCenter/payments', docId, paymentData);

        await applyBillBalanceDeltas(billPayments, originalBillPayments);

        // Create/update journal entry. createVendorPaymentJournalEntry returns the existing
        // entry's id unchanged if one already exists for this payment (accountingService.ts) —
        // it won't re-sync amounts on edit, but this at least ensures one gets created if it's
        // ever missing, instead of doing nothing on every edit as before.
        await createVendorPaymentJournalEntry({
          ...paymentData,
          id: docId
        });
      }
      
      // Land on the saved payment's view page, not the list — consistent with Sales
      // Invoice/Credit Memo/APV/Inventory Adjustment/Receive Payment (BLUEPRINT.md §8.1/§4.2).
      const savedId = isCreateMode ? docRef?.id : docId;
      goto(`/vendorCenter/payment/view?id=${savedId}`);
      
    } catch (error) {
      console.error('Error saving vendor payment:', error);
      alert('Failed to save vendor payment: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  }

  // Define form fields
  $: fields = [
    { label: 'Vendor', name: 'vendor', type: 'select', options: vendorOptions, required: true },
    { label: 'Payment Date', name: 'paymentDate', type: 'date', required: true },
    { label: 'Payment Method', name: 'paymentMethod', type: 'select', options: paymentMethodOptions, required: true },
    { label: 'Reference', name: 'reference', type: 'text', placeholder: 'Check No., Transaction ID, etc.' },
    { label: 'Amount', name: 'amount', type: 'number', required: true, min: 0 }
  ];
</script>

<FormLayout title={pageTitle} backPath="/vendorCenter/payment/list">
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

  <!-- Fields section -->
  <FormSection withSeparator={false}>
    <TxnFields 
      {fields}
      bind:formData
      disabled={isViewMode} 
    />
  </FormSection>
  
  <!-- Bill allocation section -->
  <FormSection title="Bill Allocation" withSeparator={true} grow={true}>
    <div class="mb-4 flex justify-between items-center">
      <div class="text-sm" style="color: var(--color-neutral-600);">
        Total: <span class="font-semibold" style="color: var(--color-neutral-800);">{formData.amount?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span> |
        Allocated: <span class="font-semibold" style="color: var(--color-success-600);">{allocatedTotal.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span> |
        Unallocated: <span class="font-semibold" style={`color: var(${unallocatedAmount < 0 ? '--color-error-600' : '--color-primary-600'});`}>{unallocatedAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
      </div>

      {#if !isViewMode}
        <button
          class="px-4 py-2 text-white text-sm rounded transition-colors"
          style="background: var(--color-primary-600);"
          on:click={autoAllocate}
        >
          Auto Allocate
        </button>
      {/if}
    </div>

    {#if outstandingBills.length > 0}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr>
              <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Bill</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Due Date</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Amount Due</th>
              <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Payment</th>
            </tr>
          </thead>
          <tbody>
            {#each outstandingBills as bill}
              <tr>
                <td class="px-4 py-3 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{bill.label.split(' - ')[0]}</td>
                <td class="px-4 py-3 whitespace-nowrap text-sm" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                  {bill.dueDate ? new Date(bill.dueDate.seconds * 1000).toLocaleDateString() : '-'}
                </td>
                <td class="px-4 py-3 whitespace-nowrap text-sm" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                  {bill.amount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                </td>
                <td class="px-4 py-3 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                  {#if isViewMode}
                    <span class="text-sm" style="color: var(--color-neutral-600);">
                      {(billAllocations[bill.value] || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                    </span>
                  {:else}
                    <input
                      type="number"
                      min="0"
                      max={bill.amount}
                      class="w-32 rounded border text-sm focus:outline-none focus:ring-2 transition-colors"
                      style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
                      bind:value={billAllocations[bill.value]}
                      on:input={updateAllocationTotals}
                    />
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if formData.vendor}
      <div class="text-center py-8" style="color: var(--color-neutral-500);">
        No outstanding bills found for this vendor.
      </div>
    {:else}
      <div class="text-center py-8" style="color: var(--color-neutral-500);">
        Select a vendor to view outstanding bills.
      </div>
    {/if}
  </FormSection>
  
  <!-- Form footer with action buttons -->
  <div class="mt-8">
    <FormFooter 
      primaryLabel={isViewMode ? 'Back to List' : 'Save'}
      secondaryLabel="Cancel"
      onPrimaryClick={handleSave}
      onSecondaryClick={() => goto('/vendorCenter/payment/list')}
      showSecondaryButton={!isViewMode}
    />
  </div>
</FormLayout>
