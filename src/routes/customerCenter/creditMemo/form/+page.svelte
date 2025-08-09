<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import { 
    addDocToCollection, 
    getDocFromCollection, 
    updateDocInCollection,
    queryCollectionDocs,
    type FilterCondition
  } from '$lib/utils/firestoreCrud';
  import { generateNextDocumentId, DocumentType } from '$lib/utils/documentIdService';
  import { formatCurrency, formatDate, formatDateForInput } from '$lib/utils/formatters';
  import { createCreditMemoJournalEntry } from '$lib/utils/accountingService';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { createFormModeStore } from '$lib/stores/formModeStore';
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  
  // Use the reusable form mode store for handling URL parameters and mode detection
  const formMode = createFormModeStore();
  
  // Extract form mode values from the store using destructuring
  $: ({ docId, mode } = $formMode);
  
  // Reactive declarations for form mode
  $: isViewMode = mode === 'view';
  $: isEditMode = mode === 'edit';
  $: isCreateMode = mode === 'create';
  $: isEditing = mode === 'edit';
  $: pageTitle = {
    'create': 'Create Credit Memo',
    'edit': 'Edit Credit Memo',
    'view': 'View Credit Memo'
  }[mode];
  
  // Load document when the ID changes in edit or view mode
  $: if (docId && (isEditMode || isViewMode)) {
    loadCreditMemo(docId);
  }
  
  // Adjust page title based on mode
  
  // Get options from the Firestore options store
  let customerOptions: {label: string, value: string}[] = [];
  let itemOptions: {label: string, value: string, description?: string, unitName?: string, unitId?: string, price?: number}[] = [];
  let invoiceOptions: {label: string, value: string}[] = [];

  // Initialize subscription to Firestore options
  createFirestoreOptionsStore('customers', 'name', 'id').subscribe(opts => customerOptions = opts);
  createFirestoreOptionsStore('items', 'name', 'id').subscribe(opts => itemOptions = opts);

  // Form state
  let formData: any = {
    cmNo: '',
    cmDate: new Date(),
    customer: '',
    customerName: '',
    reference: '',
    invoiceId: '',
    invoiceNo: '',
    status: 'Draft',
    memo: '',
    items: [],
    subtotal: 0,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  let isLoading = true;
  let isSaving = false;
  let error = '';
  let originalData = null;
  let customerInvoices: any[] = [];

  // Initialize form with unique credit memo number
  async function initializeForm() {
    try {
      // Generate a sequential CM number
      formData.cmNo = await generateNextDocumentId(DocumentType.CREDIT_MEMO);
      formData.cmDate = new Date();
    } catch (error) {
      console.error('Error generating credit memo number:', error);
      // Fallback to date-based number if sequential generation fails
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      formData.cmNo = `CM-${year}${month}${day}-${random}`;
    } finally {
      isLoading = false;
    }
  }

  // Define form fields for TxnFields component
  $: fields = [
    { label: 'CM No', name: 'cmNo', type: 'text', required: true, disabled: mode === 'edit' },
    { label: 'CM Date', name: 'cmDate', type: 'date', required: true },
    { label: 'Customer', name: 'customer', type: 'select', options: customerOptions, required: true, onChange: handleCustomerChange },
    { label: 'Invoice', name: 'invoiceId', type: 'select', options: customerInvoices, onChange: handleInvoiceChange, disabled: !formData.customer },
    { label: 'Reference', name: 'reference', type: 'text' },
    { label: 'Memo', name: 'memo', type: 'textarea', rows: 3 }
  ];
  
  // Define columns for the line items table
  const columns = [
    { label: 'Item', key: 'itemId', type: 'select', options: itemOptions, width: '25%' },
    { label: 'Description', key: 'description', type: 'text', width: '25%' },
    { label: 'Quantity', key: 'quantity', type: 'number', width: '10%' },
    { label: 'Unit', key: 'unitName', type: 'text', width: '10%', readonly: true },
    { label: 'Unit Price', key: 'unitPrice', type: 'number', width: '15%' },
    { label: 'Amount', key: 'amount', width: '15%', readonly: true }
  ];

  // Load existing credit memo data for editing
  async function loadCreditMemo(id: string) {
    try {
      const data = await getDocFromCollection('transactions/customerCenter/creditMemos', id);
      if (!data) {
        throw new Error('Credit Memo not found');
      }
      
      // Create a properly typed credit memo object
      interface CreditMemo {
        id: string;
        cmNo: string;
        cmDate: Date | { seconds: number; nanoseconds: number };
        customer: string;
        customerName: string;
        reference: string;
        invoiceId: string;
        invoiceNo: string;
        status: string;
        memo: string;
        items: any[];
        subtotal: number;
        taxRate: number;
        taxAmount: number;
        totalAmount: number;
        createdAt: Date | { seconds: number; nanoseconds: number };
        updatedAt: Date | { seconds: number; nanoseconds: number };
        [key: string]: any;
      }
      
      // Type assertion
      const typedData = data as unknown as CreditMemo;
      
      // Convert timestamps to Date objects
      if (typedData.cmDate && 'seconds' in typedData.cmDate) {
        typedData.cmDate = new Date(typedData.cmDate.seconds * 1000);
      }
      
      // Store original data for comparison
      originalData = JSON.parse(JSON.stringify(typedData));
      
      // Populate form data
      formData = {
        ...typedData,
        // Ensure items array exists
        items: typedData.items || []
      };
      
      // Load customer invoices if customer is selected
      if (formData.customer) {
        await loadCustomerInvoices(formData.customer);
      }
      
      isEditing = true;
      isLoading = false;
    } catch (err) {
      error = (err as Error).message;
      isLoading = false;
    }
  }

  // Handle customer selection
  async function handleCustomerChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedCustomer = customerOptions.find(c => c.value === select.value);
    
    if (selectedCustomer) {
      formData.customer = selectedCustomer.value;
      formData.customerName = selectedCustomer.label;
      
      // Reset invoice selection when customer changes
      formData.invoiceId = '';
      formData.invoiceNo = '';
      
      // Load customer's invoices
      await loadCustomerInvoices(selectedCustomer.value);
    } else {
      formData.customer = '';
      formData.customerName = '';
      customerInvoices = [];
    }
  }

  // Load customer's invoices for selection
  async function loadCustomerInvoices(customerId: string) {
    try {
      // Query for invoices belonging to this customer using queryCollectionDocs
      const filters: FilterCondition[] = [
        { field: 'customer', operator: '==', value: customerId },
        { field: 'status', operator: '==', value: 'Posted' }
      ];
      
      const invoices = await queryCollectionDocs('transactions/customerCenter/salesInvoices', filters);

      if (invoices && Array.isArray(invoices)) {
        // Type assertion to ensure TypeScript knows the structure of the invoice data
        type Invoice = {
          id: string;
          invoiceNo: string;
          invoiceDate: { seconds: number; nanoseconds: number } | Date;
          totalDue: number;
          [key: string]: any;
        };
        
        customerInvoices = invoices.map((invoice: any) => {
          const typedInvoice = invoice as unknown as Invoice;
          return {
            value: typedInvoice.id,
            label: `${typedInvoice.invoiceNo} - ${formatDate(typedInvoice.invoiceDate)} (${formatCurrency(typedInvoice.totalDue)})`,
            ...typedInvoice
          };
        });
      } else {
        customerInvoices = [];
      }
    } catch (err) {
      console.error('Error loading customer invoices:', err);
      customerInvoices = [];
    }
  }

  // Handle invoice selection
  function handleInvoiceChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedInvoice = customerInvoices.find(inv => inv.value === select.value);
    
    if (selectedInvoice) {
      formData.invoiceId = selectedInvoice.value;
      formData.invoiceNo = selectedInvoice.invoiceNo;
      
      // Pre-populate items from the invoice
      if (selectedInvoice.items && Array.isArray(selectedInvoice.items) && formData.items.length === 0) {
        formData.items = selectedInvoice.items.map((item: any) => ({
          ...item,
          quantity: 0, // Start with zero quantity
          amount: 0,   // Reset amount
          maxQuantity: item.quantity // Set max quantity to original quantity
        }));
      }
      
      // Set tax rate from invoice
      formData.taxRate = selectedInvoice.taxRate || 0;
      
      calculateTotals();
    } else {
      formData.invoiceId = '';
      formData.invoiceNo = '';
    }
  }

  // Add a new item row to the form
  function addItem() {
    formData.items = [
      ...formData.items,
      {
        itemId: '',
        description: '',
        quantity: 1,
        unitName: '',
        unitPrice: 0,
        amount: 0,
        maxQuantity: Infinity
      }
    ];
  }

  // Remove an item row from the form
  function removeItem(index: number) {
    formData.items = formData.items.filter((_: any, i: number) => i !== index);
    calculateTotals();
  }

  // Handle item selection
  function handleItemChange(index: number, itemId: string) {
    const selectedItem = itemOptions.find(item => item.value === itemId);
    
    if (selectedItem) {
      formData.items[index].itemId = selectedItem.value;
      formData.items[index].description = selectedItem.description || '';
      formData.items[index].unitName = selectedItem.unitName || '';
      formData.items[index].unitPrice = selectedItem.price || 0;
      
      // If not from an invoice, set maxQuantity to infinity
      if (!formData.items[index].maxQuantity) {
        formData.items[index].maxQuantity = Infinity;
      }

      calculateLineTotal(index);
    }
  }

  // Update line amounts when quantity or unit price changes
  function calculateLineTotal(index: number) {
    const item = formData.items[index];
    if (item) {
      item.amount = (item.quantity || 0) * (item.unitPrice || 0);
      calculateTotals();
    }
  }

  // Update item for TxnItemTable component
  function updateItem(index: number, key: string, value: any) {
    if (formData.items[index]) {
      formData.items[index][key] = value;
      
      // If item ID is updated, handle related field updates
      if (key === 'itemId') {
        handleItemChange(index, value);
      } 
      // If quantity or unitPrice changes, recalculate totals
      else if (key === 'quantity' || key === 'unitPrice') {
        calculateLineTotal(index);
      }
    }
  }

  // Calculate subtotal, tax, and total
  function calculateTotals() {
    // Calculate subtotal
    formData.subtotal = formData.items.reduce((total: number, item: any) => total + (item.amount || 0), 0);
    
    // Calculate tax amount based on tax rate
    formData.taxAmount = formData.subtotal * (formData.taxRate / 100);
    
    // Calculate total amount
    formData.totalAmount = formData.subtotal + formData.taxAmount;
  }

  // Save the credit memo
  async function saveCreditMemo() {
    try {
      if (isViewMode) {
        goto('/customerCenter/creditMemo/list');
        return;
      }
      
      isSaving = true;
      
      // Validate required fields
      if (!formData.customer) {
        alert('Please select a customer');
        isSaving = false;
        return;
      }
      
      if (formData.items.length === 0) {
        alert('Please add at least one item');
        isSaving = false;
        return;
      }
      
      // Calculate totals one last time
      calculateTotals();
      
      // Prepare data for save
      const creditMemoData = {
        ...formData,
        updatedAt: new Date()
      };
      
      // Create or update
      let savedDocId;
      if (isEditMode && formData.id) {
        // For edit mode, use the existing credit memo number
        savedDocId = formData.id;
        await updateDocInCollection('transactions/customerCenter/creditMemos', savedDocId, creditMemoData);
      } else {
        // For create mode, make sure we have a sequential credit memo number
        if (!creditMemoData.cmNo || !creditMemoData.cmNo.startsWith('CM')) {
          creditMemoData.cmNo = await generateNextDocumentId(DocumentType.CREDIT_MEMO);
        }
        const docRef = await addDocToCollection('transactions/customerCenter/creditMemos', creditMemoData);
        savedDocId = docRef.id;
      }
      
      // Create journal entry if the status is being set to Posted
      if (formData.status === 'Posted') {
        await createCreditMemoJournalEntry({
          id: savedDocId,
          ...creditMemoData
        });
        
        // Update the document status to reflect it's been posted
        await updateDocInCollection(
          'transactions/customerCenter/creditMemos',
          savedDocId,
          { status: 'Posted' }
        );
      }
      
      // Navigate back to list
      goto('/customerCenter/creditMemo/list');
    } catch (error) {
      console.error('Error saving credit memo:', error);
      alert('Failed to save credit memo: ' + error);
    } finally {
      isSaving = false;
    }
  }

  // Handle form submission
  function handleSubmit(status: string) {
    formData.status = status;
    saveCreditMemo();
  }

  // Adjust fields based on view mode
  $: {
    if (fields && fields.length) {
      fields.forEach(field => {
        if (field.name === 'cmNo') {
          field.disabled = isEditMode || isViewMode;
        } else if (field.name === 'invoiceId') {
          field.disabled = !formData.customer || isViewMode;
        } else {
          field.disabled = isViewMode;
        }
      });
    }
  }

  onMount(() => {
    const id = $page.url.searchParams.get('id');
    if (id) {
      loadCreditMemo(id);
    } else {
      initializeForm();
    }
  });
</script>

<FormLayout title={pageTitle} backPath="/customerCenter/creditMemo/list">
  {#if isLoading}
    <div class="flex justify-center items-center h-64">
      <p class="text-gray-600">Loading...</p>
    </div>
  {:else}
    <!-- Document header fields section -->
    <FormSection withSeparator={false}>
      <TxnFields {fields} bind:formData disabled={isViewMode} />
    </FormSection>
    
    <!-- Line Items section using the standard TxnItemTable component -->
    <FormSection
      title="Line Items"
      withSeparator={true}
      actionButton={!isViewMode}
      actionLabel="Add Item"
      actionIcon="material-symbols:add"
      onAction={addItem}
      isItemTable={true}
      columns={columns}
      items={formData.items}
      onRemove={!isViewMode ? removeItem : null}
      onUpdate={!isViewMode ? updateItem : null}
      onAdd={!isViewMode ? addItem : null}
      editable={!isViewMode}
    />
    
    <!-- Form Footer with transaction summary and buttons -->
    <FormFooter 
      primaryLabel={isViewMode ? 'Back to List' : (isSaving ? 'Saving...' : (isEditMode ? 'Update Credit Memo' : 'Create Credit Memo'))}
      secondaryLabel="Cancel"
      onPrimaryClick={isViewMode ? () => goto('/customerCenter/creditMemo/list') : saveCreditMemo}
      onSecondaryClick={() => goto('/customerCenter/creditMemo/list')}
      showSecondaryButton={!isViewMode}
      readOnly={isViewMode}
      leftSideContent={true}
      summaryMode="transaction"
      lineItems={formData.items}
      grossAmount={formData.subtotal}
      vatRate={formData.taxRate / 100}
      vat={formData.taxAmount}
      totalDue={formData.totalAmount}
    />
  {/if}
</FormLayout>
