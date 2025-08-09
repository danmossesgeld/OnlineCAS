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
  let outstandingInvoices: {label: string, value: any, amount: number, dueDate: any}[] = [];

  createFirestoreOptionsStore('customers', 'name', 'id').subscribe(opts => customerOptions = opts);
  createFirestoreOptionsStore('paymentmethods').subscribe(opts => paymentMethodOptions = opts);

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
      
      // Load outstanding invoices for this customer
      if (docData.customer) {
        await loadOutstandingInvoices(docData.customer);
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
        { field: 'customer', operator: '==', value: customerId },
        { field: 'status', operator: '==', value: 'Posted' }
      ];
      
      const invoices = await queryCollectionDocs('transactions/customerCenter/salesInvoices', filters) as OutstandingInvoice[];
      
      outstandingInvoices = invoices.map((inv: OutstandingInvoice) => ({
        label: `${inv.invoiceNo} - ${new Date(inv.dueDate.seconds * 1000).toLocaleDateString()} - ${inv.totalDue.toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}`,
        value: inv.id,
        amount: inv.totalDue,
        dueDate: inv.dueDate
      }));
      
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
  function updateAllocationTotals() {
    allocatedTotal = Object.values(invoiceAllocations).reduce((sum, amount) => sum + (amount || 0), 0);
    unallocatedAmount = formData.amount - allocatedTotal;
  }

  // Auto-allocate payment amount to invoices
  function autoAllocate() {
    let remaining = formData.amount;
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
      
      const amountToAllocate = Math.min(invoice.amount, remaining);
      invoiceAllocations[invoice.value] = amountToAllocate;
      remaining -= amountToAllocate;
    }
    
    updateAllocationTotals();
  }

  // Handle customer selection change
  $: if (formData.customer && isCreateMode) {
    loadOutstandingInvoices(formData.customer);
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
          invoicePayments: allocationArray,
          status: 'Draft',
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
          invoicePayments: allocationArray,
          status: 'Draft',
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
        
        // Update invoice statuses and balances
        // This would be a separate function in a real application
        // updateInvoiceBalances(invoicePayments);
      } else if (isEditMode && docId) {
        // Update existing receipt
        await updateDocInCollection('transactions/customerCenter/receipts', docId, receiptData);
        
        // Update journal entry
        // This would require handling existing journal entries
        // updateReceiptJournalEntry(docId, receiptData);
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
    { label: 'Amount', name: 'amount', type: 'number', min: 0, step: 0.01, onChange: updateAllocationTotals },
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
              <button 
                type="button" 
                class="inline-flex items-center px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                on:click={autoAllocate}
              >
                <iconify-icon icon="material-symbols:auto-fix" class="mr-1" width="18"></iconify-icon>
                Auto Allocate
              </button>
            {/if}
          </div>
          
          <!-- Allocation Summary -->
          <div class="mb-4 p-3 bg-gray-50 rounded-md">
            <div class="flex flex-wrap gap-4 text-sm">
              <div>
                <span class="text-gray-500">Total:</span> 
                <span class="font-semibold text-gray-800 ml-1">{formData.amount?.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) || '₱0.00'}</span>
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
          
          <!-- Outstanding Invoices Table -->
          <div class="overflow-x-auto">
            {#if outstandingInvoices.length > 0}
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                    <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Due</th>
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
                          <span class="text-sm text-gray-600">
                            {(invoiceAllocations[invoice.value] || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}
                          </span>
                        {:else}
                          <input 
                            type="number"
                            min="0"
                            max={invoice.amount}
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
