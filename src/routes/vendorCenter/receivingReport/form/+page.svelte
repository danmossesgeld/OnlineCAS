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
  import { resolveItemAutofill } from '$lib/utils/itemAutofill';
  import { createFormModeStore } from '$lib/stores/formModeStore';
  
  // Use the reusable form mode store for handling URL parameters and mode detection
  const formMode = createFormModeStore();
  
  // Extract form mode values from the store using destructuring
  $: ({ docId, isViewMode, isEditMode, isCreateMode, mode } = $formMode);
  
  // Load document when the ID changes in edit or view mode
  $: if (docId && (isEditMode || isViewMode)) {
    loadReceivingReport(docId);
  }
  
  // Show the actual receiving report number once known, instead of a generic "Edit/View
  // Receiving Report" label — falls back to a mode label for a brand-new, not-yet-saved report.
  $: pageTitle = isCreateMode
    ? 'New Receiving Report'
    : (formData.rrNo ? formData.rrNo : (mode === 'view' ? 'View Receiving Report' : 'Edit Receiving Report'));

  // Get options from the Firestore options store with proper type definitions
  let vendorOptions: {label: string, value: string}[] = [];
  let itemOptions: {label: string, value: string, raw?: any}[] = [];
  let locationOptions: {label: string, value: string}[] = [];

  // Initialize subscription to Firestore options with createFirestoreOptionsStore. items needs
  // includeRawData:true (the 4th arg) so updateItem's auto-fill below has description/unit/cost
  // to read — without it every option here only ever carries {label, value}.
  createFirestoreOptionsStore('vendors', 'name', 'id').subscribe(opts => vendorOptions = opts);
  createFirestoreOptionsStore('items', 'name', 'id', true).subscribe(opts => itemOptions = opts);
  createFirestoreOptionsStore('locations').subscribe(opts => locationOptions = opts);

  // Form data interface
  interface ReceivingReportItem {
    id: string;
    itemName: string;
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
    { label: 'PO No', name: 'poNo', type: 'text' }
  ];
  
  // Define columns for the line items table. Must be reactive ($:), not a plain const — itemOptions
  // starts as [] and is only populated asynchronously once the Firestore subscription above
  // resolves; a const here would capture that initial empty array by value and the Item dropdown
  // would stay empty forever, since reassigning the itemOptions variable later doesn't retroactively
  // update an object literal that already copied its old reference.
  $: columns = [
    // displayField tells TxnItemTable what to show in read-only/view mode instead of the raw
    // value — without it, viewing a saved RR showed the item's bare Firestore doc id (row.id)
    // in this column instead of its name, since TxnItemTable's built-in fallback only special-
    // cases a column literally keyed 'item', not 'id'.
    { label: 'Item', key: 'id', type: 'select', options: itemOptions, displayField: 'itemName', width: '25%' },
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
  
  function addItem() {
    formData.items = [...formData.items, {
      id: '',
      itemName: '',
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
      
      // If item ID is updated, auto-fill the linked fields via the shared resolver (see
      // itemAutofill.ts for why this is centralized).
      if (key === 'id') {
        const selectedItem = itemOptions.find(item => item.value === value);
        const fields = resolveItemAutofill(selectedItem);
        formData.items[index].itemName = fields.itemName;
        formData.items[index].description = fields.description;
        formData.items[index].unit = fields.unitName; // plain display text, not an id — RR's Unit column is free text, not a <select>
        formData.items[index].unitCost = fields.purchasePrice; // receiving goods = what it costs us, not sales_price
        // Selecting an item changes unitCost, so the line's amount needs recalculating too —
        // otherwise it stays at whatever it was (usually 0) until quantity/unitCost is touched
        // separately.
        calculateLineTotal(index);
      }
      // If quantity or unitCost changes, recalculate totals
      else if (key === 'quantity' || key === 'unitCost') {
        calculateLineTotal(index);
      }

      // Reassign the array to trigger reactivity. formData.items[index].foo = x above mutates
      // the existing array/object in place — the *reference* passed down through
      // FormSection -> TxnItemTable as the `items`/`rows` prop never changes, so Svelte's
      // prop-diffing at each component boundary sees "same array" and never re-renders the
      // table. This was the actual bug: the auto-fill values above were being computed
      // correctly all along, they just never reached the DOM without this line. Sales
      // Invoice's and Credit Memo's equivalent handlers already do this; this one didn't.
      formData.items = [...formData.items];
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

    // Calculate total amount. No withholding tax here — createReceivingReportJournalEntry has
    // no withholding logic at all (unlike Sales Invoice/APV/Credit Memo, which do), because a
    // Receiving Report is a goods-receipt document, not a bill/invoice; withholding is applied
    // where the actual payable obligation is recognized (APV), not here. See FormFooter's
    // showWithholding prop, set to false below, for why the withholding UI doesn't render on
    // this form at all rather than rendering a deduction with no accounting effect.
    formData.totalAmount = formData.subtotal + formData.taxAmount;
  }

  // status defaults to 'Posted' (the primary Create/Update button); the secondary
  // "Save as Draft" button passes 'Draft' explicitly. Previously formData.status was
  // hardcoded to 'Draft' at init and never changed, so the journal-entry-on-post branch
  // below was permanently dead — Receiving Reports never reached the GL.
  async function saveReceivingReport(status: 'Draft' | 'Posted' = 'Posted') {
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
        status,
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
      if (status === 'Posted') {
        await createReceivingReportJournalEntry({
          id: savedDocId,
          ...receivingReportData
        });
      }

      alert(status === 'Draft' ? 'Receiving report saved as draft' : 'Receiving report saved successfully');

      // Land on the saved report's view mode, not the list — consistent with every other
      // transaction type (BLUEPRINT.md §8.1/§4.2).
      goto(`/vendorCenter/receivingReport/form?id=${savedDocId}&viewMode=true`);
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
      grow={true}
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
      secondaryLabel="Save as Draft"
      onPrimaryClick={isViewMode ? () => goto('/vendorCenter/receivingReport/list') : () => saveReceivingReport('Posted')}
      onSecondaryClick={() => saveReceivingReport('Draft')}
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
      showWithholding={false}
      totalDue={formData.totalAmount}
    />
  {/if}
</FormLayout>
