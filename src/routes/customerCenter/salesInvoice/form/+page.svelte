<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { firestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { addDocToCollection, updateDocInCollection, getDocFromCollection } from '$lib/utils/firestoreCrud';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  // Use the reusable form mode store for handling URL parameters and mode detection
  import { createFormModeStore } from '$lib/stores/formModeStore';
  const formMode = createFormModeStore();
  
  // Extract form mode values from the store using destructuring
  // This creates reactive local variables that update when the store changes
  $: ({ docId, isViewMode, isEditMode, isCreateMode, mode } = $formMode);
  
  // Load document when the ID changes in edit or view mode
  $: if (docId && (isEditMode || isViewMode)) {
    loadDocument();
  }
  
  // Adjust page title based on mode
  $: pageTitle = {
    'create': 'Create Invoice',
    'edit': 'Edit Invoice',
    'view': 'View Invoice'
  }[mode];

  // Subscribe to Firestore option stores and use arrays for select fields
  let customerOptions: {label: string, value: any}[] = [];
  let termsOptions: {label: string, value: any}[] = [];
  let paymentMethodOptions: {label: string, value: any}[] = [];
  let itemOptions: {label: string, value: any}[] = [];
  let unitOptions: {label: string, value: any}[] = [];
  let taxTypeOptions: {label: string, value: any}[] = [];

  firestoreOptionsStore('customers', 'name', 'id').subscribe(opts => customerOptions = opts);
  firestoreOptionsStore('terms').subscribe(opts => termsOptions = opts);
  firestoreOptionsStore('paymentmethods').subscribe(opts => paymentMethodOptions = opts);
  firestoreOptionsStore('items', 'name', 'id').subscribe(opts => itemOptions = opts);
  firestoreOptionsStore('units').subscribe(opts => unitOptions = opts);
  firestoreOptionsStore('tax', 'name', 'id').subscribe(opts => taxTypeOptions = opts);

  const withholdingTaxOptions = [
    { label: 'Select Withholding Tax', value: '' },
    { label: '1%', value: '1' },
    { label: '2%', value: '2' }
  ];

  // Define the type for our form data to include all fields we need
  type FormDataType = {
    customer: string;
    invoiceDate: string;
    dueDate: string;
    selectedTerms: string;
    paymentMethod: string;
    poNumber: string;
    memo: string;
    cashSale: boolean;
    withholdingTax: string;
    originalInvoiceNo?: string; // Optional field to track original invoice number in edit mode
  };

  // Initialize form data with empty values
  let formData: FormDataType = {
    customer: '',
    invoiceDate: '',
    dueDate: '',
    selectedTerms: '',
    paymentMethod: '',
    poNumber: '',
    memo: '',
    cashSale: false,
    withholdingTax: '',
  };

  let lineItems: Array<{
    item: string;
    description: string;
    unit: string;
    qty: number;
    price: number;
    dsc: number;
    taxType: string;
    amount: number;
  }> = [];

  // Define type for Firestore timestamp
  type FirestoreTimestamp = {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
  
  // Define type for invoice document from Firestore
  type InvoiceDocument = {
    id: string;
    customer: string;
    customerName: string;
    invoiceNo: string;
    invoiceDate: FirestoreTimestamp | Date;
    dueDate: FirestoreTimestamp | Date;
    selectedTerms: string;
    termsName: string;
    paymentMethod: string;
    paymentMethodName: string;
    poNumber: string;
    memo: string;
    cashSale: boolean;
    withholdingTax: string;
    lineItems: Array<{
      item: string;
      itemName: string;
      description: string;
      unit: string;
      unitName: string;
      qty: number;
      price: number;
      dsc: number;
      taxType: string;
      taxTypeName: string;
      amount: number;
    }>;
    grossAmount: number;
    discount: number;
    netSales: number;
    vat: number;
    vatableSales: number;
    zeroRated: number;
    vatExempt: number;
    lessWithholding: number;
    totalDue: number;
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

  // Load document data when in edit or view mode - optimized for performance
  async function loadDocument() {
    if (!docId) return; // Only load if we have a document ID
    
    try {
      // Show loading indicator (could use a toast notification if available)
      console.log(`Loading invoice ${docId} in ${mode} mode...`);
      
      // Fetch document data with proper error handling
      const docData = await getDocFromCollection('transactions/customerCenter/salesInvoices', docId) as InvoiceDocument;
      
      if (!docData) {
        throw new Error('Invoice not found');
      }
      
      // Populate form data all at once for better performance
      const { invoiceNo, customer, invoiceDate, dueDate, selectedTerms, paymentMethod, poNumber, memo, cashSale, withholdingTax, lineItems: docLineItems } = docData;
      
      // Update form data with proper defaults
      formData = {
        customer: customer || '',
        invoiceDate: formatFirestoreDate(invoiceDate),
        dueDate: formatFirestoreDate(dueDate),
        selectedTerms: selectedTerms || '',
        paymentMethod: paymentMethod || '',
        poNumber: poNumber || '',
        memo: memo || '',
        cashSale: cashSale || false,
        withholdingTax: withholdingTax || '',
        // Keep track of original invoice number for edit mode
        originalInvoiceNo: invoiceNo
      };
      
      // Handle line items with deep copy to prevent reference issues
      if (docLineItems && Array.isArray(docLineItems)) {
        // Use structured clone for better deep copy performance
        lineItems = structuredClone(docLineItems);
      } else if (isEditMode && (!lineItems.length || lineItems.length === 0)) {
        // Ensure at least one empty line item in edit mode
        addItem();
      }
      
      // Update computed values
      updateTotals();
      
    } catch (error) {
      console.error('Error loading invoice:', error);
      alert(`Failed to load invoice: ${error instanceof Error ? error.message : 'Unknown error'}`);
      goto('/customerCenter/salesInvoice/list');
    }
  }
  
  // Helper function to update totals when line items change
  function updateTotals() {
    // This will trigger the reactive declarations for totals
    lineItems = [...lineItems];
  }
  
  onMount(() => {
    // If in edit or view mode, load the document
    if (docId) {
      loadDocument();
    }
    // Add a default row if lineItems is empty and in create mode
    else if (lineItems.length === 0) {
      addItem();
    }
  });

  function removeItem(idx: number) {
    lineItems = lineItems.filter((_, i) => i !== idx);
    // Add a default row if the last item was removed
    if (lineItems.length === 0) {
        addItem();
    }
  }

  // Function to add a new empty line item
  function addItem() {
    lineItems = [...lineItems, { item: '', description: '', unit: '', qty: 0, price: 0, dsc: 0, taxType: '', amount: 0 }];
  }

  function updateAmount(idx: number, key: string, value: any) {
    // Ensure the item at the given index exists before updating
    if (lineItems[idx]) {
        (lineItems[idx] as Record<string, any>)[key] = value;
        const item = lineItems[idx];
        const discounted = (item.price || 0) * (1 - (item.dsc || 0) / 100);
        item.amount = +(discounted * (item.qty || 0)).toFixed(2);
        // Reassign the array to trigger reactivity
        lineItems = [...lineItems];
    }
  }

  $: grossAmount = lineItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  $: discount = 0;
  $: netSales = grossAmount - discount;
  $: vat = 0;
  $: vatableSales = 0;
  $: zeroRated = 0;
  $: vatExempt = 0;
  $: lessWithholding = 0;
  $: totalDue = netSales - lessWithholding;

  /**
   * Save the invoice data to Firestore
   */
  // Handle saving, updating, or navigating based on current mode
  async function handleSave() {
    try {
      // Handle view mode - just navigate back to list
      if (isViewMode) {
        goto('/customerCenter/salesInvoice/list');
        return;
      }
      
      // Extract name lookup functions for better readability
      const getCustomerName = (id: string): string => customerOptions.find(c => c.value === id)?.label || '';
      const getTermsName = (id: string): string => termsOptions.find(t => t.value === id)?.label || '';
      const getPaymentMethodName = (id: string): string => paymentMethodOptions.find(p => p.value === id)?.label || '';
      const getItemName = (id: string): string => itemOptions.find(i => i.value === id)?.label || '';
      const getUnitName = (id: string): string => unitOptions.find(u => u.value === id)?.label || '';
      const getTaxTypeName = (id: string): string => taxTypeOptions.find(t => t.value === id)?.label || '';
      
      // Prepare numeric fields - use Number() to ensure proper type conversion
      const prepareNumber = (val: any): number => Number(val) || 0;
      
      // Prepare line items with properly typed values and display names
      const preparedLineItems = lineItems.map(item => ({
        ...item,
        itemName: getItemName(item.item),
        unitName: getUnitName(item.unit),
        taxTypeName: getTaxTypeName(item.taxType),
        qty: prepareNumber(item.qty),
        price: prepareNumber(item.price),
        dsc: prepareNumber(item.dsc),
        amount: prepareNumber(item.amount)
      }));
      
      // Create a base object with common fields for both create and edit modes
      const baseInvoiceData = {
        // Core fields with display names
        customer: formData.customer,
        customerName: getCustomerName(formData.customer),
        selectedTerms: formData.selectedTerms,
        termsName: getTermsName(formData.selectedTerms),
        paymentMethod: formData.paymentMethod,
        paymentMethodName: getPaymentMethodName(formData.paymentMethod),
        
        // Dates - convert to proper format for Firestore
        invoiceDate: formData.invoiceDate ? new Date(formData.invoiceDate) : new Date(),
        dueDate: formData.dueDate ? new Date(formData.dueDate) : new Date(),
        
        // Other form fields
        poNumber: formData.poNumber,
        memo: formData.memo,
        cashSale: formData.cashSale,
        withholdingTax: formData.withholdingTax,
        
        // Prepared line items
        lineItems: preparedLineItems,
        
        // Totals with proper number conversion
        grossAmount: prepareNumber(grossAmount),
        discount: prepareNumber(discount),
        netSales: prepareNumber(netSales),
        vat: prepareNumber(vat),
        vatableSales: prepareNumber(vatableSales),
        zeroRated: prepareNumber(zeroRated),
        vatExempt: prepareNumber(vatExempt),
        lessWithholding: prepareNumber(lessWithholding),
        totalDue: prepareNumber(totalDue),
        
        // Metadata
        updatedAt: new Date()
      };

      // Generate a standardized invoice number if needed
      const generateInvoiceNumber = () => `INV-${Date.now().toString().substring(7)}`;
      
      // Handle mode-specific operations
      if (isCreateMode) {
        const newInvoiceData = {
          ...baseInvoiceData,
          invoiceNo: generateInvoiceNumber(),
          createdAt: new Date(),
          status: 'Draft'
        };
        
        await addDocToCollection('transactions', 'customerCenter', 'salesInvoices', newInvoiceData);
        alert('Invoice created successfully');
      } else if (isEditMode) {
        const updateInvoiceData = {
          ...baseInvoiceData,
          invoiceNo: formData.originalInvoiceNo || generateInvoiceNumber()
        };
        
        await updateDocInCollection('transactions/customerCenter/salesInvoices', docId, updateInvoiceData);
        alert('Invoice updated successfully');
      }
      
      // Navigate to the list view after successful save
      goto('/customerCenter/salesInvoice/list');

    } catch (error) {
      console.error('Error saving sales invoice:', error);
      // Handle errors, e.g., show an error message to the user
      alert('Failed to save sales invoice. Please try again.');
    }
  }

  $: fields = [
    { label: 'Customer', name: 'customer', type: 'select', options: customerOptions, required: true },
    { label: 'Invoice Date', name: 'invoiceDate', type: 'date', required: true },
    { label: 'Due Date', name: 'dueDate', type: 'date', required: true },
    { label: 'Payment Terms', name: 'selectedTerms', type: 'select', options: termsOptions },
    { label: 'Payment Method', name: 'paymentMethod', type: 'select', options: paymentMethodOptions },
    { label: 'PO #', name: 'poNumber', type: 'text', placeholder: 'e.g PO-0001' },
    { label: 'Memo', name: 'memo', type: 'textarea', placeholder: 'Add a memo' }
  ];

  $: columns = [
    { label: 'Item', key: 'item', type: 'select', options: itemOptions, width: '25%' },
    { label: 'Description', key: 'description', type: 'text', width: '25%' },
    { label: 'Unit', key: 'unit', type: 'select', options: unitOptions, width: '10%' },
    { label: 'Qty', key: 'qty', type: 'number', width: '8%' },
    { label: 'Price', key: 'price', type: 'number', width: '10%' },
    { label: 'DSC %', key: 'dsc', type: 'number', width: '8%' },
    { label: 'Tax Type', key: 'taxType', type: 'select', options: taxTypeOptions, width: '14%' },
    { label: 'Amount', key: 'amount', width: '10%' }
  ];

  const summary = {
    'Gross Amount': grossAmount,
    'Discount': discount,
    'Net Sales': netSales,
    'VAT': vat,
    'Vatable Sales': vatableSales,
    'Zero-rated': zeroRated,
    'VAT-Exempt': vatExempt,
    'Less: Withholding Tax': lessWithholding,
    'Total Amount Due': totalDue
  };
</script>

<FormLayout title={pageTitle} backPath="/customerCenter/salesInvoice/list">
  <!-- Fields section -->
  <FormSection withSeparator={false}>
    <TxnFields {fields} bind:formData disabled={isViewMode} />
  </FormSection>
  
  <!-- Line Items section -->
  <FormSection
    title="Line Items"
    actionButton={!isViewMode}
    actionLabel="Add Item"
    onAction={addItem}
    isItemTable={true}
    columns={columns}
    items={lineItems}
    onAdd={!isViewMode ? addItem : undefined}
    onRemove={!isViewMode ? removeItem : undefined}
    onUpdate={!isViewMode ? updateAmount : undefined}
    editable={!isViewMode}
  />
  
  <!-- Footer with integrated Summary and Buttons -->
  <FormFooter
    primaryLabel={isCreateMode ? "Create Invoice" : "Update Invoice"}
    secondaryLabel="Save as Draft"
    onPrimaryClick={handleSave}
    onSecondaryClick={() => { /* handle save as draft */ }}
    showSecondaryButton={!isViewMode}
    hideButtons={isViewMode}
    summaryMode="transaction"
    {lineItems}
    discountRate={0}
    vatRate={0.12}
    withholdingRate={formData.withholdingTax ? parseFloat(formData.withholdingTax) / 100 : 0}
    withholdingLabel={`Less: Withholding Tax${formData.withholdingTax ? ` (${formData.withholdingTax}%)` : ''}`}
    bind:withholdingTax={formData.withholdingTax}
    bind:cashSale={formData.cashSale}
    {withholdingTaxOptions}
    readOnly={isViewMode}
  />
</FormLayout>