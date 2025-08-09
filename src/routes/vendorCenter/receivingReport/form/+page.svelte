<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { 
    addDocToCollection, 
    getDocFromCollection, 
    updateDocInCollection 
  } from '$lib/utils/firestoreCrud';
  import { generateNextDocumentId, DocumentType } from '$lib/utils/documentIdService';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import { createReceivingReportJournalEntry } from '$lib/utils/accountingService';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { createFormModeStore } from '$lib/stores/formModeStore';
  
  // Use the reusable form mode store for handling URL parameters and mode detection
  const formMode = createFormModeStore();
  
  // Extract form mode values from the store using destructuring
  $: ({ docId, isViewMode, isEditMode, isCreateMode, mode } = $formMode);
  
  // Load document when the ID changes in edit or view mode
  $: if (docId && (isEditMode || isViewMode)) {
    loadReceivingReport(docId);
  }
  
  // Adjust page title based on mode
  $: pageTitle = {
    'create': 'Create Receiving Report',
    'edit': 'Edit Receiving Report',
    'view': 'View Receiving Report'
  }[mode];

  // Get options from the Firestore options store with proper type definitions
  let vendorOptions: {label: string, value: string}[] = [];
  let itemOptions: {label: string, value: string, description?: string, unit?: string, unitCost?: number}[] = [];
  let locationOptions: {label: string, value: string}[] = [];

  // Initialize subscription to Firestore options with createFirestoreOptionsStore
  createFirestoreOptionsStore('vendors', 'name', 'id').subscribe(opts => vendorOptions = opts);
  createFirestoreOptionsStore('items', 'name', 'id').subscribe(opts => itemOptions = opts);
  createFirestoreOptionsStore('locations').subscribe(opts => locationOptions = opts);

  // Form data interface
  interface ReceivingReportItem {
    id: string;
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    amount: number;
  }

  interface ReceivingReportData {
    id?: string;
    rrNo: string;
    rrDate: Date;
    vendor: string;
    items: ReceivingReportItem[];
    vendorName: string;
    reference: string;
    poNo: string;
    location: string;
    locationName: string;
    status: string;
    memo: string;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    createdAt: Date;
    updatedAt: Date;
  }
  
  // Form state with proper type definition
  let formData: ReceivingReportData = {
    rrNo: '',
    rrDate: new Date(),
    vendor: '',
    items: [],
    vendorName: '',
    reference: '',
    poNo: '',
    location: '',
    locationName: '',
    status: 'Draft',
    memo: '',
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

  // Initialize form with unique RR number
  async function initializeForm() {
    try {
      // Generate a sequential RR number
      formData.rrNo = await generateNextDocumentId(DocumentType.RECEIVING_REPORT);
      formData.rrDate = new Date();
    } catch (error) {
      console.error('Error generating receiving report number:', error);
      // Fallback to date-based number if sequential generation fails
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      formData.rrNo = `RR-${year}${month}${day}-${random}`;
    } finally {
      isLoading = false;
    }
  }
  
  // Define form fields for TxnFields component
  $: fields = [
    { label: 'RR No', name: 'rrNo', type: 'text', required: true, disabled: isEditMode },
    { label: 'RR Date', name: 'rrDate', type: 'date', required: true },
    { label: 'Vendor', name: 'vendor', type: 'select', options: vendorOptions, required: true, onChange: handleVendorChange },
    { label: 'Location', name: 'location', type: 'select', options: locationOptions, onChange: handleLocationChange },
    { label: 'Reference', name: 'reference', type: 'text' },
    { label: 'PO No', name: 'poNo', type: 'text' },
    { label: 'Memo', name: 'memo', type: 'textarea', rows: 3 }
  ];
  
  // Define columns for the line items table
  const columns = [
    { label: 'Item', key: 'id', type: 'select', options: itemOptions, width: '25%' },
    { label: 'Description', key: 'description', type: 'text', width: '25%' },
    { label: 'Quantity', key: 'quantity', type: 'number', width: '10%' },
    { label: 'Unit', key: 'unit', type: 'text', width: '10%' },
    { label: 'Unit Cost', key: 'unitCost', type: 'number', width: '15%' },
    { label: 'Amount', key: 'amount', width: '15%' }
  ];

  // Load existing RR data for editing
  async function loadReceivingReport(id: string) {
    try {
      isLoading = true;
      const data = await getDocFromCollection('transactions/vendorCenter/receivingReports', id) as Partial<ReceivingReportData>;
      if (!data) {
        throw new Error('Receiving Report not found');
      }
      
      // Convert timestamps to Date objects
      if (data.rrDate && typeof data.rrDate === 'object' && 'seconds' in data.rrDate) {
        const seconds = data.rrDate.seconds;
        if (typeof seconds === 'number') {
          data.rrDate = new Date(seconds * 1000);
        } else {
          data.rrDate = new Date();
        }
      }
      
      // Store original data for comparison
      originalData = JSON.parse(JSON.stringify(data));
      
      // Update form data with the loaded document
      formData = { ...formData, ...data } as ReceivingReportData;
      
      // Ensure items array exists
      if (!formData.items) {
        formData.items = [];
      }
      
      // Calculate totals
      calculateTotals();
    } catch (error) {
      console.error('Error loading receiving report:', error);
      alert('Failed to load receiving report: ' + (error as Error).message);
    } finally {
      isLoading = false;
    }
  }

  function handleVendorChange() {
    const selectedVendor = vendorOptions.find(v => v.value === formData.vendor);
    if (selectedVendor) {
      formData.vendorName = selectedVendor.label;
    }
  }

  function handleLocationChange() {
    const selectedLocation = locationOptions.find(l => l.value === formData.location);
    if (selectedLocation) {
      formData.locationName = selectedLocation.label;
    }
  }
  
  function handleItemChange(index: number, itemId: string) {
    const selectedItem = itemOptions.find(opt => opt.value === itemId);
    if (selectedItem) {
      formData.items[index].description = selectedItem.description || '';
      formData.items[index].unit = selectedItem.unit || '';
      formData.items[index].unitCost = selectedItem.unitCost || 0;
      calculateLineTotal(index);
    }
  }

  function addItem() {
    formData.items = [...formData.items, {
      id: '',
      description: '',
      quantity: 1,
      unit: '',
      unitCost: 0,
      amount: 0
    }];
  }

  function removeItem(index: number) {
    formData.items = formData.items.filter((_, i) => i !== index);
    calculateTotals();
  }

  function calculateLineTotal(index: number) {
    const item = formData.items[index];
    if (item) {
      item.amount = item.quantity * item.unitCost;
      calculateTotals();
    }
  }

  // Update item for TxnItemTable component
  function updateItem(index: number, key: string, value: any) {
    if (formData.items[index]) {
      // Type assertion to allow dynamic property access
      (formData.items[index] as any)[key] = value;
      
      // If item ID is updated, handle related field updates
      if (key === 'id') {
        const selectedItem = itemOptions.find(item => item.value === value);
        if (selectedItem) {
          formData.items[index].description = selectedItem.description || '';
          formData.items[index].unit = selectedItem.unit || '';
          formData.items[index].unitCost = selectedItem.unitCost || 0;
        }
      } 
      // If quantity or unitCost changes, recalculate totals
      else if (key === 'quantity' || key === 'unitCost') {
        calculateLineTotal(index);
      }
    }
  }

  function calculateTotals() {
    // Calculate subtotal
    formData.subtotal = formData.items.reduce(
      (sum, item) => sum + (Number(item.amount) || 0), 
      0
    );
    
    // Calculate tax amount
    formData.taxAmount = formData.subtotal * (formData.taxRate / 100);
    
    // Calculate total amount
    formData.totalAmount = formData.subtotal + formData.taxAmount;
  }

  async function saveReceivingReport() {
    try {
      if (isViewMode) {
        goto('/vendorCenter/receivingReport/list');
        return;
      }
      
      isSaving = true;
      
      // Validate required fields
      if (!formData.vendor) {
        alert('Please select a vendor');
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
      const receivingReportData = {
        ...formData,
        updatedAt: new Date()
      };
      
      // Create or update
      let savedDocId;
      if (isEditMode && formData.id) {
        savedDocId = formData.id;
        await updateDocInCollection('transactions/vendorCenter/receivingReports', savedDocId, receivingReportData);
      } else {
        // For create mode, make sure we have a sequential RR number
        if (!receivingReportData.rrNo || !receivingReportData.rrNo.startsWith('RR')) {
          receivingReportData.rrNo = await generateNextDocumentId(DocumentType.RECEIVING_REPORT);
        }
        
        // Add new document with generated ID
        const docRef = await addDocToCollection(
          'transactions/vendorCenter/receivingReports',
          receivingReportData
        );
        savedDocId = docRef.id;
      }
      
      // Create journal entry if the document is being posted
      if (formData.status === 'Posted') {
        await createReceivingReportJournalEntry({
          id: savedDocId,
          ...receivingReportData
        });
        
        // Update the document status to reflect it's been posted
        await updateDocInCollection(
          'transactions/vendorCenter/receivingReports',
          savedDocId,
          { status: 'Posted' }
        );
      }
      
      // Navigate back to list
      goto('/vendorCenter/receivingReport/list');
    } catch (error) {
      console.error('Error saving receiving report:', error);
      alert('Failed to save receiving report: ' + (error as Error).message);
    } finally {
      isSaving = false;
    }
  }
  
  // Initialize on mount
  onMount(() => {
    if (!docId) {
      initializeForm();
    }
  });
</script>

<FormLayout title={pageTitle} backPath="/vendorCenter/receivingReport/list">
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
      primaryLabel={isViewMode ? 'Back to List' : (isSaving ? 'Saving...' : (isEditMode ? 'Update Receiving Report' : 'Create Receiving Report'))}
      secondaryLabel="Cancel"
      onPrimaryClick={isViewMode ? () => goto('/vendorCenter/receivingReport/list') : saveReceivingReport}
      onSecondaryClick={() => goto('/vendorCenter/receivingReport/list')}
      showSecondaryButton={!isViewMode}
      readOnly={isViewMode}
      leftSideContent={true}
      summaryMode="transaction"
      lineItems={formData.items.map(item => ({
        item: item.id,
        description: item.description,
        unit: item.unit,
        qty: item.quantity,
        price: item.unitCost,
        dsc: 0,
        taxType: 'vat',
        amount: item.amount
      }))}
      grossAmount={formData.subtotal}
      vatRate={formData.taxRate / 100}
      vat={formData.taxAmount}
      totalDue={formData.totalAmount}
    />
  {/if}
</FormLayout>
