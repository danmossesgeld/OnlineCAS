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
  
  // Adjust page title based on mode
  $: pageTitle = {
    'create': 'Create Vendor Payment',
    'edit': 'Edit Vendor Payment',
    'view': 'View Vendor Payment'
  }[mode];

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

  // Define type for Firestore timestamp
  type FirestoreTimestamp = {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
  
  // Define type for bill data from Firestore
  type BillDocument = {
    id: string;
    billNo: string;
    dueDate: FirestoreTimestamp | Date;
    totalDue: number;
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
        selectedBills: docData.billPayments?.map(bp => bp.billId) || []
      };
      
      // Populate bill allocations
      billAllocations = {};
      if (docData.billPayments && Array.isArray(docData.billPayments)) {
        docData.billPayments.forEach(payment => {
          billAllocations[payment.billId] = payment.amountPaid;
        });
      }
      
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
            
        return {
          label: `${bill.billNo} - ${formattedDate} - ${bill.totalDue.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}`,
          value: bill.id,
          amount: bill.totalDue,
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
    // Define filters for outstanding bills (Posted status and matching vendor)
    const filters: FilterCondition[] = [
      { field: 'vendor', operator: '==', value: vendorId },
      { field: 'status', operator: '==', value: 'Posted' }
    ];
    
    // Query Firestore for outstanding bills for this vendor
    try {
      const bills = await queryCollectionDocs('transactions/vendorCenter/apvs', filters) as BillDocument[];
      return bills || [];
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
      
      // Create the payment data object
      const paymentData = {
        vendor: formData.vendor,
        vendorName,
        paymentNo: isCreateMode ? await generatePaymentNumber() : undefined,
        paymentDate: new Date(formData.paymentDate),
        paymentMethod: formData.paymentMethod,
        paymentMethodName,
        reference: formData.reference,
        memo: formData.memo,
        amount: formData.amount,
        billPayments,
        status: 'Posted',
        createdAt: isCreateMode ? new Date() : undefined,
        updatedAt: new Date()
      };
      
      let docRef;
      
      if (isCreateMode) {
        // Add new payment
        docRef = await addDocToCollection('transactions/vendorCenter/payments', paymentData);
        
        // Create journal entry
        const journalEntryId = await createVendorPaymentJournalEntry({
          ...paymentData,
          id: docRef.id
        });
        
        // Update bill statuses and balances
        // This would be a separate function in a real application
        // updateBillBalances(billPayments);
      } else if (isEditMode && docId) {
        // Update existing payment
        await updateDocInCollection('transactions/vendorCenter/payments', docId, paymentData);
        
        // Update journal entry
        // This would require handling existing journal entries
        // updateVendorPaymentJournalEntry(docId, paymentData);
      }
      
      // Navigate back to list
      goto('/vendorCenter/payment/list');
      
    } catch (error) {
      console.error('Error saving vendor payment:', error);
      alert('Failed to save vendor payment. Please try again.');
    }
  }

  // Define form fields
  $: fields = [
    { label: 'Vendor', name: 'vendor', type: 'select', options: vendorOptions, required: true },
    { label: 'Payment Date', name: 'paymentDate', type: 'date', required: true },
    { label: 'Payment Method', name: 'paymentMethod', type: 'select', options: paymentMethodOptions, required: true },
    { label: 'Reference', name: 'reference', type: 'text', placeholder: 'Check No., Transaction ID, etc.' },
    { label: 'Memo', name: 'memo', type: 'textarea', rows: 2 },
    { label: 'Amount', name: 'amount', type: 'number', required: true, min: 0 }
  ];
</script>

<FormLayout title={pageTitle} backPath="/vendorCenter/payment/list">
  <!-- Fields section -->
  <FormSection withSeparator={false}>
    <TxnFields 
      {fields}
      bind:formData
      disabled={isViewMode} 
    />
  </FormSection>
  
  <!-- Bill allocation section -->
  <FormSection title="Bill Allocation" withSeparator={true}>
    <div class="mb-4 flex justify-between items-center">
      <div class="text-sm text-gray-600">
        Total: <span class="font-semibold text-gray-800">{formData.amount?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span> | 
        Allocated: <span class="font-semibold text-green-600">{allocatedTotal.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span> | 
        Unallocated: <span class="font-semibold {unallocatedAmount < 0 ? 'text-red-600' : 'text-blue-600'}">{unallocatedAmount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
      </div>
      
      {#if !isViewMode}
        <button 
          class="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          on:click={autoAllocate}
        >
          Auto Allocate
        </button>
      {/if}
    </div>
    
    {#if outstandingBills.length > 0}
      <div class="bg-white rounded-lg shadow overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bill</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Due</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each outstandingBills as bill}
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{bill.label.split(' - ')[0]}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {bill.dueDate ? new Date(bill.dueDate.seconds * 1000).toLocaleDateString() : '-'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {bill.amount.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  {#if isViewMode}
                    <span class="text-sm text-gray-600">
                      {(billAllocations[bill.value] || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                    </span>
                  {:else}
                    <input 
                      type="number"
                      min="0"
                      max={bill.amount}
                      class="w-32 rounded border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
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
      <div class="text-center py-8 text-gray-500">
        No outstanding bills found for this vendor.
      </div>
    {:else}
      <div class="text-center py-8 text-gray-500">
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
