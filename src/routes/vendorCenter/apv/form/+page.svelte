<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { addDocToCollection, updateDocInCollection, getDocFromCollection } from '$lib/utils/firestoreCrud';
  import { generateNextDocumentId, DocumentType } from '$lib/utils/documentIdService';
  import { createApvJournalEntry } from '$lib/utils/accountingService';
  import { filterAccountsByType } from '$lib/utils/accountFilters';
  import { WITHHOLDING_TAX_OPTIONS } from '$lib/utils/withholdingTax';
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
  
  // Show the actual APV number once known, instead of a generic "Edit/View APV"
  // label — falls back to a mode label for a brand-new, not-yet-saved APV.
  $: pageTitle = isCreateMode
    ? 'New APV'
    : (formData.originalApvNo && formData.originalApvNo !== 'DRAFT' ? formData.originalApvNo : (mode === 'view' ? 'View APV' : 'Edit APV'));

  // Subscribe to Firestore option stores and use arrays for select fields
  let supplierOptions: {label: string, value: any}[] = [];
  let accountOptions: {label: string, value: any}[] = [];
  let termsOptions: {label: string, value: any}[] = [];
  let paymentMethodOptions: {label: string, value: any}[] = [];
  let expenseAccountOptions: {label: string, value: any}[] = [];
  let costCenterOptions: {label: string, value: any}[] = [];
  let taxTypeOptions: {label: string, value: any}[] = [];

  // Get all accounts with raw data to filter by type
  const accountsStore = createFirestoreOptionsStore('masterlist/accounts', 'name', 'id', true);
  
  // Filter AP accounts (liability type accounts for AP) — see accountFilters.ts. Matches by
  // broad category, so accounts typed with the standard granular values (Accounts Payable,
  // Credit Card, Other Current Liability, ...) match 'liability' correctly, not just the old
  // literal 'liability' value.
  $: accountOptions = filterAccountsByType($accountsStore, 'liability', 'No liability accounts found — add one in Chart of Accounts');

  // Filter expense accounts for line items
  $: expenseAccountOptions = filterAccountsByType($accountsStore, 'expense', 'No expense accounts found — add one in Chart of Accounts');

  // Diagnostic only, shown inline below when either dropdown above is empty (see template) —
  // if this keeps happening after the accountType-filtering fixes, the fastest way to tell "no
  // matching accounts exist yet" apart from "something's still broken" is to see exactly what
  // accountType values are actually loaded, rather than guess again.
  $: accountTypeCounts = $accountsStore.reduce((counts: Record<string, number>, acc) => {
    const t = String(acc.raw?.accountType || '(none)');
    counts[t] = (counts[t] || 0) + 1;
    return counts;
  }, {});

  // Other options (using correct paths for Firestore)
  createFirestoreOptionsStore('masterlist/vendors', 'name', 'id').subscribe(opts => supplierOptions = opts);
  createFirestoreOptionsStore('otherlist/terms').subscribe(opts => termsOptions = opts);
  createFirestoreOptionsStore('otherlist/paymentmethods').subscribe(opts => paymentMethodOptions = opts);
  createFirestoreOptionsStore('otherlist/costcenters').subscribe(opts => costCenterOptions = opts);
  createFirestoreOptionsStore('otherlist/tax', 'name', 'id').subscribe(opts => taxTypeOptions = opts);

  const withholdingTaxOptions = WITHHOLDING_TAX_OPTIONS;

  // Define the type for our form data to include all fields we need
  type FormDataType = {
    supplier: string;
    account: string;
    apvDate: string;
    dueDate: string;
    selectedTerms: string;
    paymentMethod: string;
    referenceNo: string;
    poNumber: string;
    memo: string;
    withholdingTax: string;
    originalApvNo?: string; // Optional field to track original APV number in edit mode
    status?: string; // Tracks the currently-saved status when loading an existing APV
  };

  // Initialize form data with empty values
  let formData: FormDataType = {
    supplier: '',
    account: '',
    apvDate: '',
    dueDate: '',
    selectedTerms: '',
    paymentMethod: '',
    referenceNo: '',
    poNumber: '',
    memo: '',
    withholdingTax: '',
  };

  // Define APV line items with required fields for FormFooter compatibility
  let lineItems: Array<{
    // Required fields for FormFooter
    item: string;          // Used for account in APV
    description: string;   // Used for description in APV
    unit: string;          // Used for costCenter in APV
    qty: number;           // Set to 1 for APV
    price: number;         // Used for amount in APV
    dsc: number;           // Used for discount in APV
    taxType: string;       // Used for tax type in APV
    amount: number;        // Calculated amount after discount
    // APV-specific fields
    account: string;       // Expense account
    costCenter: string;    // Cost center
    total: number;         // Total amount for line
  }> = [];

  // Define type for Firestore timestamp
  type FirestoreTimestamp = {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
  
  // Define type for APV document from Firestore
  type ApvDocument = {
    id: string;
    supplier: string;
    supplierName: string;
    account: string;
    accountName: string;
    apvNo: string;
    apvDate: FirestoreTimestamp | Date;
    dueDate: FirestoreTimestamp | Date;
    selectedTerms: string;
    termsName: string;
    paymentMethod: string;
    paymentMethodName: string;
    referenceNo: string;
    poNumber: string;
    memo: string;
    withholdingTax: string;
    lineItems: Array<{
      account: string;
      accountName: string;
      costCenter: string;
      costCenterName: string;
      description: string;
      amount: number;
      dsc: number;
      taxType: string;
      taxTypeName: string;
      total: number;
    }>;
    grossAmount: number;
    discount: number;
    netAmount: number;
    vat: number;
    lessWithholding: number;
    totalAmountDue: number;
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
      console.log(`Loading APV ${docId} in ${mode} mode...`);
      
      // Fetch document data with proper error handling
      const docData = await getDocFromCollection('transactions/vendorCenter/apvs', docId) as ApvDocument;
      
      if (!docData) {
        throw new Error('APV not found');
      }
      
      // Populate form data all at once for better performance
      const { apvNo, supplier, account, apvDate, dueDate, selectedTerms, paymentMethod, referenceNo, poNumber, memo, withholdingTax, status, lineItems: docLineItems } = docData;

      // Update form data with proper defaults
      formData = {
        supplier: supplier || '',
        account: account || '',
        apvDate: formatFirestoreDate(apvDate),
        dueDate: formatFirestoreDate(dueDate),
        selectedTerms: selectedTerms || '',
        paymentMethod: paymentMethod || '',
        referenceNo: referenceNo || '',
        poNumber: poNumber || '',
        memo: memo || '',
        withholdingTax: withholdingTax || '',
        // Keep track of original APV number and status for edit mode
        originalApvNo: apvNo,
        status: status || 'Draft'
      };
      
      // Handle line items with deep copy to prevent reference issues
      if (docLineItems && Array.isArray(docLineItems)) {
        // Map the loaded line items to match our expected structure
        lineItems = docLineItems.map(item => ({
          // Required fields for FormFooter
          item: item.account || '',
          description: item.description || '',
          unit: item.costCenter || '',
          qty: 1,
          price: item.amount || 0,
          dsc: item.dsc || 0,
          taxType: item.taxType || '',
          amount: item.total || 0,
          // APV-specific fields
          account: item.account || '',
          costCenter: item.costCenter || '',
          total: item.total || 0
        }));
      } else if (isEditMode && (!lineItems.length || lineItems.length === 0)) {
        // Ensure at least one empty line item in edit mode
        addItem();
      }
      
      // Update computed values
      updateTotals();
      
    } catch (error) {
      console.error('Error loading APV:', error);
      alert(`Failed to load APV: ${error instanceof Error ? error.message : 'Unknown error'}`);
      goto('/vendorCenter/apv/list');
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
      // Required fields for FormFooter
      item: '',           // Will store account ID
      description: '',    // Description field
      unit: '',           // Will store costCenter ID
      qty: 1,             // Always 1 for APV lines
      price: 0,           // Will store base amount
      dsc: 0,             // Discount percentage
      taxType: '',        // Tax type
      amount: 0,          // Calculated total
      // APV-specific fields
      account: '',        // Expense account
      costCenter: '',     // Cost center
      total: 0            // Total for the line
    }];
  }

  function updateTotal(idx: number, key: string, value: any) {
    // Ensure the item at the given index exists before updating
    if (lineItems[idx]) {
        (lineItems[idx] as Record<string, any>)[key] = value;
        const item = lineItems[idx];
        
        // Sync the FormFooter-required fields with APV-specific fields
        if (key === 'account') {
          item.item = value; // Store account ID in item field for FormFooter
        } else if (key === 'costCenter') {
          item.unit = value; // Store costCenter ID in unit field for FormFooter
        } else if (key === 'amount') {
          item.price = value; // Store base amount in price field for FormFooter
        }
        
        // Calculate total with discount
        const discounted = (item.price || 0) * (1 - (item.dsc || 0) / 100);
        item.total = +(discounted).toFixed(2);
        item.amount = item.total; // Update amount field for FormFooter
        
        // Reassign the array to trigger reactivity
        lineItems = [...lineItems];
    }
  }

  $: grossAmount = lineItems.reduce((sum, i) => sum + (i.price || 0), 0);
  $: discount = lineItems.reduce((sum, i) => sum + (((i.price || 0) * (i.dsc || 0)) / 100), 0);
  $: netAmount = grossAmount - discount;
  // Lines with a tax type selected are treated as vatable at a flat 12%, computed on the
  // net-of-line-discount amount — this must match createApvJournalEntry's per-line VAT math
  // (accountingService.ts) so what's saved here is exactly what the journal entry posts.
  $: vatableSales = lineItems
    .filter((i) => i.taxType)
    .reduce((sum, i) => sum + (i.price || 0) * (1 - (i.dsc || 0) / 100), 0);
  $: vat = vatableSales * 0.12;
  // Withholding is computed on net purchase amount (before VAT), matching FormFooter's own
  // display convention — kept in sync here so the saved value equals what's shown on screen.
  $: lessWithholding = formData.withholdingTax ? netAmount * (parseFloat(formData.withholdingTax) / 100) : 0;
  $: totalAmountDue = netAmount + vat - lessWithholding;

  /**
   * Save the APV data to Firestore
   */
  // Handle saving, updating, or navigating based on current mode
  // status defaults to 'Posted' (the primary Create/Update button); the secondary
  // "Save as Draft" button passes 'Draft' explicitly.
  async function handleSave(status: 'Draft' | 'Posted' = 'Posted') {
    try {
      // Handle view mode - just navigate back to list
      if (isViewMode) {
        goto('/vendorCenter/apv/list');
        return;
      }
      
      // Extract name lookup functions for better readability
      const getSupplierName = (id: string): string => supplierOptions.find(c => c.value === id)?.label || '';
      const getAccountName = (id: string): string => accountOptions.find(a => a.value === id)?.label || '';
      const getTermsName = (id: string): string => termsOptions.find(t => t.value === id)?.label || '';
      const getPaymentMethodName = (id: string): string => paymentMethodOptions.find(p => p.value === id)?.label || '';
      const getExpenseAccountName = (id: string): string => expenseAccountOptions.find(a => a.value === id)?.label || '';
      const getCostCenterName = (id: string): string => costCenterOptions.find(c => c.value === id)?.label || '';
      const getTaxTypeName = (id: string): string => taxTypeOptions.find(t => t.value === id)?.label || '';
      
      // Prepare numeric fields - use Number() to ensure proper type conversion
      const prepareNumber = (val: any): number => Number(val) || 0;
      
      // Prepare line items with properly typed values and display names
      const preparedLineItems = lineItems.map(item => ({
        // Required fields for the FormFooter component
        item: item.account,
        description: item.description,
        unit: item.costCenter,
        qty: 1,
        price: prepareNumber(item.price),
        dsc: prepareNumber(item.dsc),
        taxType: item.taxType,
        amount: prepareNumber(item.total),
        
        // APV-specific fields
        account: item.account,
        accountName: getExpenseAccountName(item.account),
        costCenter: item.costCenter,
        costCenterName: getCostCenterName(item.costCenter),
        taxTypeName: getTaxTypeName(item.taxType),
        total: prepareNumber(item.total)   // Final amount after discount
      }));
      
      // Create a base object with common fields for both create and edit modes
      const baseApvData = {
        // Core fields with display names
        supplier: formData.supplier,
        supplierName: getSupplierName(formData.supplier),
        account: formData.account,
        accountName: getAccountName(formData.account),
        selectedTerms: formData.selectedTerms,
        termsName: getTermsName(formData.selectedTerms),
        paymentMethod: formData.paymentMethod,
        paymentMethodName: getPaymentMethodName(formData.paymentMethod),
        
        // Dates - convert to proper format for Firestore
        apvDate: formData.apvDate ? new Date(formData.apvDate) : new Date(),
        dueDate: formData.dueDate ? new Date(formData.dueDate) : new Date(),
        
        // Other form fields
        referenceNo: formData.referenceNo,
        poNumber: formData.poNumber,
        memo: formData.memo,
        withholdingTax: formData.withholdingTax,
        
        // Prepared line items
        lineItems: preparedLineItems,
        
        // Totals with proper number conversion
        grossAmount: prepareNumber(grossAmount),
        discount: prepareNumber(discount),
        netAmount: prepareNumber(netAmount),
        vat: prepareNumber(vat),
        lessWithholding: prepareNumber(lessWithholding),
        totalAmountDue: prepareNumber(totalAmountDue),
        
        // Metadata
        updatedAt: new Date()
      };

      // Handle mode-specific operations
      if (isCreateMode) {
        // Only reserve a real sequential number once the APV is actually posted;
        // drafts use a placeholder so abandoned drafts don't burn sequence numbers.
        const apvNo = status === 'Draft' ? 'DRAFT' : await generateNextDocumentId(DocumentType.APV);

        const newApvData = {
          ...baseApvData,
          apvNo,
          createdAt: new Date(),
          status
        };

        // Add the APV to Firestore and get the document reference
        const docRef = await addDocToCollection('transactions/vendorCenter/apvs', newApvData);

        // Create journal entry for the new APV
        const apvWithId = { ...newApvData, id: docRef.id };
        const journalEntryId = await createApvJournalEntry(apvWithId);

        // Log the result for debugging
        console.log(`Created journal entry with ID: ${journalEntryId}`);
        alert(status === 'Draft' ? 'APV saved as draft' : 'APV created successfully');
      } else if (isEditMode) {
        // Promote a draft's placeholder number to a real sequential number the first time it's posted
        let apvNo = formData.originalApvNo;
        if (formData.status === 'Draft' && status !== 'Draft' && apvNo === 'DRAFT') {
          apvNo = await generateNextDocumentId(DocumentType.APV);
        } else if (status === 'Draft' && !apvNo) {
          apvNo = 'DRAFT';
        }

        const updateApvData = {
          ...baseApvData,
          apvNo: apvNo || await generateNextDocumentId(DocumentType.APV),
          status
        };

        // Update the APV in Firestore
        await updateDocInCollection('transactions/vendorCenter/apvs', docId, updateApvData);

        // Create or update journal entry for the updated APV
        const apvWithId = { ...updateApvData, id: docId };
        const journalEntryId = await createApvJournalEntry(apvWithId);

        // Log the result for debugging
        console.log(`Updated journal entry with ID: ${journalEntryId}`);
        alert(status === 'Draft' ? 'APV updated and saved as draft' : 'APV updated successfully');
      }
      
      // Navigate to the list view after successful save
      goto('/vendorCenter/apv/list');

    } catch (error) {
      console.error('Error saving APV:', error);
      // Handle errors, e.g., show an error message to the user
      alert('Failed to save APV: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  }

  $: fields = [
    { label: 'Supplier', name: 'supplier', type: 'select', options: supplierOptions, required: true },
    { label: 'AP Account', name: 'account', type: 'select', options: accountOptions, required: true },
    { label: 'APV Date', name: 'apvDate', type: 'date', required: true },
    { label: 'Due Date', name: 'dueDate', type: 'date', required: true },
    { label: 'Payment Terms', name: 'selectedTerms', type: 'select', options: termsOptions },
    { label: 'Payment Method', name: 'paymentMethod', type: 'select', options: paymentMethodOptions },
    { label: 'Reference #', name: 'referenceNo', type: 'text', placeholder: 'e.g. Invoice # from supplier' },
    { label: 'PO #', name: 'poNumber', type: 'text', placeholder: 'e.g PO-0001' }
  ];

  $: columns = [
    { label: 'Account', key: 'account', type: 'select', options: expenseAccountOptions, width: '25%' },
    { label: 'Cost Center', key: 'costCenter', type: 'select', options: costCenterOptions, width: '15%' },
    { label: 'Description', key: 'description', type: 'text', width: '25%' },
    { label: 'Amount', key: 'price', type: 'number', width: '10%' }, // Use price for the base amount input
    { label: 'DSC %', key: 'dsc', type: 'number', width: '8%' },
    { label: 'Tax Type', key: 'taxType', type: 'select', options: taxTypeOptions, width: '12%' },
    { label: 'Total', key: 'total', width: '10%' }
  ];
</script>

<FormLayout title={pageTitle} backPath="/vendorCenter/apv/list">
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
    <TxnFields {fields} bind:formData disabled={isViewMode} />
  </FormSection>

  <!-- accountOptions/expenseAccountOptions always have at least one entry now (the emptyLabel
       placeholder from filterAccountsByType when nothing real matches), so "empty" here means
       "only that placeholder" — real options always carry a non-empty Firestore doc id value. -->
  {#if !isViewMode && (!accountOptions.some(o => o.value) || !expenseAccountOptions.some(o => o.value))}
    <div class="mb-4 px-3 py-2 rounded-md text-xs" style="background: var(--color-warning-50); color: var(--color-warning-700); border: 1px solid var(--color-warning-200);">
      <strong>{!accountOptions.some(o => o.value) ? 'No liability' : 'No expense'} accounts found in Chart of Accounts.</strong>
      {#if Object.keys(accountTypeCounts).length > 0}
        Account types currently loaded: {Object.entries(accountTypeCounts).map(([t, n]) => `${t} (${n})`).join(', ')}.
      {:else}
        No accounts loaded at all — check Masterlist &gt; Chart of Accounts.
      {/if}
    </div>
  {/if}

  <!-- Line Items section -->
  <FormSection
    title="Expense Items"
    actionButton={!isViewMode}
    actionLabel="Add Item"
    onAction={addItem}
    isItemTable={true}
    grow={true}
    columns={columns}
    items={lineItems}
    onAdd={!isViewMode ? addItem : undefined}
    onRemove={!isViewMode ? removeItem : undefined}
    onUpdate={!isViewMode ? updateTotal : undefined}
    editable={!isViewMode}
  />
  
  <!-- Footer with integrated Summary and Buttons -->
  <FormFooter
    primaryLabel={isCreateMode ? "Create APV" : "Update APV"}
    secondaryLabel="Save as Draft"
    onPrimaryClick={() => handleSave('Posted')}
    onSecondaryClick={() => handleSave('Draft')}
    showSecondaryButton={!isViewMode}
    hideButtons={isViewMode}
    summaryMode="transaction"
    {lineItems}
    discountRate={0}
    vatRate={0.12}
    withholdingRate={formData.withholdingTax ? parseFloat(formData.withholdingTax) / 100 : 0}
    withholdingLabel={`Less: Withholding Tax${formData.withholdingTax ? ` (${formData.withholdingTax}%)` : ''}`}
    bind:withholdingTax={formData.withholdingTax}
    {withholdingTaxOptions}
    readOnly={isViewMode}
    grossAmount={grossAmount}
    discount={discount}
    netSales={netAmount}
    vat={vat}
    vatableSales={vatableSales}
    lessWithholding={lessWithholding}
    totalDue={totalAmountDue}
  />
</FormLayout>
