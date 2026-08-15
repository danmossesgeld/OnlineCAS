<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { resolveItemAutofill } from '$lib/utils/itemAutofill';
  import { addDocToCollection, updateDocInCollection, getDocFromCollection } from '$lib/utils/firestoreCrud';
  import { createInventoryAdjustmentJournalEntry } from '$lib/utils/accountingService';
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
  
  // Show the actual adjustment number once known, instead of a generic "Edit/View Inventory
  // Adjustment" label — falls back to a mode label for a brand-new, not-yet-saved adjustment.
  $: pageTitle = isCreateMode
    ? 'New Inventory Adjustment'
    : (formData.originalAdjustmentNo ? formData.originalAdjustmentNo : (mode === 'view' ? 'View Inventory Adjustment' : 'Edit Inventory Adjustment'));

  // Define adjustment types
  const adjustmentTypes = [
    { label: 'Select Adjustment Type', value: '' },
    { label: 'Increase', value: 'increase' },
    { label: 'Decrease', value: 'decrease' }
  ];

  // Subscribe to Firestore option stores and use arrays for select fields
  let warehouseOptions: {label: string, value: any}[] = [];
  let itemOptions: {label: string, value: any}[] = [];
  let unitOptions: {label: string, value: any}[] = [];
  let accountOptions: {label: string, value: any}[] = [];

  // NOTE: 'warehouses' and bare 'accounts' used to resolve to unmanaged otherlist/* paths
  // (listdatabase/otherlist/warehouses, listdatabase/otherlist/accounts), which don't exist
  // anywhere else in the app, making this form unsubmittable. "Locations" is the real,
  // managed warehouse-equivalent list, and the Chart of Accounts lives under masterlist/accounts.
  createFirestoreOptionsStore('otherlist/locations', 'name', 'id').subscribe(opts => warehouseOptions = opts);
  createFirestoreOptionsStore('items', 'name', 'id', true).subscribe(opts => itemOptions = opts);
  createFirestoreOptionsStore('units').subscribe(opts => unitOptions = opts);
  createFirestoreOptionsStore('masterlist/accounts', 'name', 'id').subscribe(opts => accountOptions = opts);

  // Define the type for our form data to include all fields we need
  type FormDataType = {
    adjustmentType: string;
    adjustmentDate: string;
    warehouse: string;
    referenceNo: string;
    account: string;  // Adjustment account (expense for write-downs, income for write-ups)
    remarks: string;
    originalAdjustmentNo?: string; // Optional field to track original adjustment number in edit mode
  };

  // Initialize form data with empty values
  let formData: FormDataType = {
    adjustmentType: '',
    adjustmentDate: '',
    warehouse: '',
    referenceNo: '',
    account: '',
    remarks: '',
  };

  // Define inventory line items with required fields for FormFooter compatibility
  let lineItems: Array<{
    // Required fields for FormFooter
    item: string;          // Used for item in adjustment
    description: string;   // Used for description
    unit: string;          // Used for unit
    qty: number;           // Quantity to adjust
    price: number;         // Unit cost
    dsc: number;           // Not used in this form but required by FormFooter
    taxType: string;       // Not used in this form but required by FormFooter
    amount: number;        // Total amount/value (qty * price)
  }> = [];

  // Define type for Firestore timestamp
  type FirestoreTimestamp = {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
  
  // Define type for Adjustment document from Firestore
  type AdjustmentDocument = {
    id: string;
    adjustmentNo: string;
    adjustmentType: string;
    adjustmentDate: FirestoreTimestamp | Date;
    warehouse: string;
    warehouseName: string;
    referenceNo: string;
    account: string;
    accountName: string;
    remarks: string;
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
      amount: number;
    }>;
    itemCount: number;
    totalValue: number;
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
    if (!docId) return; // Only load if we have a document ID
    
    try {
      console.log(`Loading adjustment ${docId} in ${mode} mode...`);
      
      // Fetch document data with proper error handling
      const docData = await getDocFromCollection('inventory/transactions/adjustments', docId) as AdjustmentDocument;
      
      if (!docData) {
        throw new Error('Adjustment not found');
      }
      
      // Populate form data all at once for better performance
      const { adjustmentNo, adjustmentType, adjustmentDate, warehouse, referenceNo, account, remarks, lineItems: docLineItems } = docData;
      
      // Update form data with proper defaults
      formData = {
        adjustmentType: adjustmentType || '',
        adjustmentDate: formatFirestoreDate(adjustmentDate),
        warehouse: warehouse || '',
        referenceNo: referenceNo || '',
        account: account || '',
        remarks: remarks || '',
        // Keep track of original adjustment number for edit mode
        originalAdjustmentNo: adjustmentNo
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
      console.error('Error loading inventory adjustment:', error);
      alert(`Failed to load adjustment: ${error instanceof Error ? error.message : 'Unknown error'}`);
      goto('/inventory/adjustment/list');
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
    lineItems = [...lineItems, { 
      item: '',
      description: '',
      unit: '',
      qty: 0,
      price: 0,
      dsc: 0,
      taxType: '',
      amount: 0
    }];
  }

  function updateAmount(idx: number, key: string, value: any) {
    // Ensure the item at the given index exists before updating
    if (lineItems[idx]) {
        (lineItems[idx] as Record<string, any>)[key] = value;
        const item = lineItems[idx];

        // Autofill linked fields when an item is selected — see itemAutofill.ts. This form
        // never had this before; adding it for consistency with Sales Invoice/Credit
        // Memo/Receiving Report, which all auto-fill from the same masterlist/items record.
        // unit uses the id (this form's Unit column is a <select> against otherlist/units,
        // resolved to a display name at save time — see getUnitName below), and price
        // defaults to purchase_price (this form values inventory at cost, not sales price;
        // the column is literally labeled "Unit Cost").
        if (key === 'item') {
          const selected = itemOptions.find(i => i.value === value);
          const fields = resolveItemAutofill(selected);
          item.description = fields.description;
          if (fields.unitId) item.unit = fields.unitId;
          item.price = fields.purchasePrice;
        }

        // Calculate amount as qty * price (no discount for inventory adjustments)
        item.amount = +((item.qty || 0) * (item.price || 0)).toFixed(2);

        // Reassign the array to trigger reactivity
        lineItems = [...lineItems];
    }
  }

  // Calculate totals
  $: itemCount = lineItems.length;
  $: totalValue = lineItems.reduce((sum, i) => sum + (i.amount || 0), 0);

  /**
   * Save the inventory adjustment data to Firestore
   */
  async function handleSave() {
    try {
      // Handle view mode - just navigate back to list
      if (isViewMode) {
        goto('/inventory/adjustment/list');
        return;
      }
      
      // Validate required fields
      if (!formData.adjustmentType) {
        alert('Please select an adjustment type');
        return;
      }
      
      if (!formData.adjustmentDate) {
        alert('Please enter an adjustment date');
        return;
      }
      
      if (!formData.warehouse) {
        alert('Please select a warehouse');
        return;
      }
      
      if (!formData.account) {
        alert('Please select an adjustment account');
        return;
      }
      
      // Validate line items
      if (lineItems.length === 0 || !lineItems.some(item => item.item && item.qty > 0)) {
        alert('Please add at least one valid item with quantity greater than zero');
        return;
      }
      
      // Extract name lookup functions for better readability
      const getWarehouseName = (id: string): string => warehouseOptions.find(w => w.value === id)?.label || '';
      const getItemName = (id: string): string => itemOptions.find(i => i.value === id)?.label || '';
      const getUnitName = (id: string): string => unitOptions.find(u => u.value === id)?.label || '';
      const getAccountName = (id: string): string => accountOptions.find(a => a.value === id)?.label || '';
      
      // Prepare numeric fields - use Number() to ensure proper type conversion
      const prepareNumber = (val: any): number => Number(val) || 0;
      
      // Prepare line items with properly typed values and display names
      const preparedLineItems = lineItems.map(item => ({
        item: item.item,
        itemName: getItemName(item.item),
        description: item.description,
        unit: item.unit,
        unitName: getUnitName(item.unit),
        qty: prepareNumber(item.qty),
        price: prepareNumber(item.price),
        dsc: 0,  // Not used for inventory adjustments
        taxType: '',  // Not used for inventory adjustments
        amount: prepareNumber(item.amount)
      }));
      
      // Generate a standardized adjustment number if needed
      const generateAdjustmentNumber = () => `ADJ-${Date.now().toString().substring(7)}`;
      
      // Create a base object with common fields for both create and edit modes
      const baseAdjustmentData = {
        // Core fields with display names
        adjustmentType: formData.adjustmentType,
        adjustmentDate: formData.adjustmentDate ? new Date(formData.adjustmentDate) : new Date(),
        warehouse: formData.warehouse,
        warehouseName: getWarehouseName(formData.warehouse),
        referenceNo: formData.referenceNo,
        account: formData.account,
        accountName: getAccountName(formData.account),
        remarks: formData.remarks,
        
        // Prepared line items
        lineItems: preparedLineItems,
        
        // Calculated values
        itemCount: preparedLineItems.length,
        totalValue: preparedLineItems.reduce((sum, item) => sum + item.amount, 0),
        
        // Metadata
        updatedAt: new Date()
      };
      
      // Handle mode-specific operations
      if (isCreateMode) {
        const newAdjustmentData = {
          ...baseAdjustmentData,
          adjustmentNo: generateAdjustmentNumber(),
          createdAt: new Date(),
          status: 'Draft'
        };
        
        // Add the adjustment to Firestore and get the document reference
        const docRef = await addDocToCollection('inventory', 'transactions', 'adjustments', newAdjustmentData);
        
        // Create journal entry for the new adjustment
        const adjustmentWithId = { ...newAdjustmentData, id: docRef.id };
        const journalEntryId = await createInventoryAdjustmentJournalEntry(adjustmentWithId);
        
        // Log the result for debugging
        console.log(`Created journal entry with ID: ${journalEntryId}`);
        alert('Inventory adjustment created successfully');
      } else if (isEditMode) {
        const updateAdjustmentData = {
          ...baseAdjustmentData,
          adjustmentNo: formData.originalAdjustmentNo || generateAdjustmentNumber()
        };
        
        // Update the adjustment in Firestore
        await updateDocInCollection('inventory/transactions/adjustments', docId, updateAdjustmentData);
        
        // Create or update journal entry for the updated adjustment
        const adjustmentWithId = { ...updateAdjustmentData, id: docId };
        const journalEntryId = await createInventoryAdjustmentJournalEntry(adjustmentWithId);
        
        // Log the result for debugging
        console.log(`Updated journal entry with ID: ${journalEntryId}`);
        alert('Inventory adjustment updated successfully');
      }
      
      // Navigate to the list view after successful save
      goto('/inventory/adjustment/list');

    } catch (error) {
      console.error('Error saving inventory adjustment:', error);
      alert('Failed to save inventory adjustment: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  }

  $: fields = [
    { label: 'Adjustment Type', name: 'adjustmentType', type: 'select', options: adjustmentTypes, required: true },
    { label: 'Adjustment Date', name: 'adjustmentDate', type: 'date', required: true },
    { label: 'Warehouse', name: 'warehouse', type: 'select', options: warehouseOptions, required: true },
    { label: 'Reference #', name: 'referenceNo', type: 'text', placeholder: 'e.g. PO-001 or count reference' },
    { label: 'Adjustment Account', name: 'account', type: 'select', options: accountOptions, required: true }
  ];

  $: columns = [
    { label: 'Item', key: 'item', type: 'select', options: itemOptions, width: '25%' },
    { label: 'Description', key: 'description', type: 'text', width: '25%' },
    { label: 'Unit', key: 'unit', type: 'select', options: unitOptions, width: '10%' },
    { label: 'Quantity', key: 'qty', type: 'number', width: '15%' },
    { label: 'Unit Cost', key: 'price', type: 'number', width: '15%' },
    { label: 'Total Value', key: 'amount', width: '10%' }
  ];

  const summary = {
    'Total Items': itemCount,
    'Total Value': totalValue
  };
</script>

<FormLayout title={pageTitle} backPath="/inventory/adjustment/list">
  <svelte:fragment slot="header-actions">
    <div class="w-full sm:w-64">
      <label for="field-remarks" class="block mb-0.5 text-xs font-medium text-right" style="color: var(--color-neutral-600);">Remarks</label>
      <textarea
        id="field-remarks"
        rows="2"
        class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors resize-none"
        style="background: {isViewMode ? 'var(--color-neutral-50)' : 'var(--color-neutral-0)'}; border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
        placeholder="Add remarks or reason for adjustment"
        bind:value={formData.remarks}
        disabled={isViewMode}
      ></textarea>
    </div>
  </svelte:fragment>

  <!-- Fields section -->
  <FormSection withSeparator={false}>
    <TxnFields {fields} bind:formData disabled={isViewMode} />
  </FormSection>
  
  <!-- Line Items section -->
  <FormSection
    title="Inventory Items"
    actionButton={!isViewMode}
    actionLabel="Add Item"
    onAction={addItem}
    isItemTable={true}
    grow={true}
    columns={columns}
    items={lineItems}
    onAdd={!isViewMode ? addItem : undefined}
    onRemove={!isViewMode ? removeItem : undefined}
    onUpdate={!isViewMode ? updateAmount : undefined}
    editable={!isViewMode}
  />
  
  <!-- Footer with Buttons -->
  <FormFooter
    primaryLabel={isCreateMode ? "Create Adjustment" : "Update Adjustment"}
    secondaryLabel="Save as Draft"
    onPrimaryClick={handleSave}
    onSecondaryClick={() => { /* handle save as draft */ }}
    showSecondaryButton={!isViewMode}
    hideButtons={isViewMode}
    summaryMode="custom"
    leftSideContent={true}
    readOnly={isViewMode}
  >
    <svelte:fragment slot="summary">
      <div class="w-full p-4">
        <h3 class="text-lg font-semibold mb-3" style="color: var(--color-neutral-800);">Summary</h3>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <div class="flex items-baseline gap-1.5">
            <span style="color: var(--color-neutral-500);">Total Items:</span>
            <span class="font-semibold" style="color: var(--color-neutral-800);">{itemCount}</span>
          </div>
          <div class="flex items-baseline gap-1.5">
            <span style="color: var(--color-neutral-500);">Total Value:</span>
            <span class="font-semibold text-lg" style="color: var(--color-neutral-800);">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP' }).format(totalValue)}</span>
          </div>
        </div>
      </div>
    </svelte:fragment>
  </FormFooter>
</FormLayout>
