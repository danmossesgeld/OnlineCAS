<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import {
    addDocToCollection,
    getDocFromCollection,
    updateDocInCollection
  } from '$lib/utils/firestoreCrud';
  import { generateNextDocumentId, DocumentType } from '$lib/utils/documentIdService';
  import { createCreditMemoJournalEntry } from '$lib/utils/accountingService';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { resolveItemAutofill } from '$lib/utils/itemAutofill';
  import { WITHHOLDING_TAX_OPTIONS } from '$lib/utils/withholdingTax';
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
  // Show the actual credit memo number once known, instead of a generic "Edit/View Credit Memo"
  // label — falls back to a mode label for a brand-new, not-yet-saved credit memo.
  $: pageTitle = isCreateMode
    ? 'New Credit Memo'
    : (formData.cmNo ? formData.cmNo : (mode === 'view' ? 'View Credit Memo' : 'Edit Credit Memo'));
  
  // Load document when the ID changes in edit or view mode
  $: if (docId && (isEditMode || isViewMode)) {
    loadCreditMemo(docId);
  }
  
  // Adjust page title based on mode
  
  // Get options from the Firestore options store
  let customerOptions: {label: string, value: string}[] = [];
  let itemOptions: {label: string, value: string, raw?: any}[] = [];
  let unitOptions: {label: string, value: string}[] = [];
  let taxTypeOptions: {label: string, value: string, raw?: any}[] = [];
  let discountOptions: {label: string, value: any}[] = [];

  // Initialize subscription to Firestore options
  createFirestoreOptionsStore('customers', 'name', 'id').subscribe(opts => customerOptions = opts);
  // include raw item data for autofill
  createFirestoreOptionsStore('items', 'name', 'id', true).subscribe(opts => itemOptions = opts);
  createFirestoreOptionsStore('units').subscribe(opts => unitOptions = opts);
  createFirestoreOptionsStore('tax', 'name', 'id', true).subscribe(opts => {
    taxTypeOptions = [{ label: 'N/A', value: '' }, ...opts];
  });
  createFirestoreOptionsStore('otherlist/discounts', 'name', 'id').subscribe(opts => {
    discountOptions = [{ label: 'N/A', value: '' }, ...opts];
  });

  // Form state
  let formData: any = {
    cmNo: '',
    cmDate: '',
    customer: '',
    customerName: '',
    reference: '',
    status: 'Draft',
    memo: '',
    items: [],
    subtotal: 0,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 0,
    withholdingTax: '',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  let isLoading = true;
  let isSaving = false;
  let error = '';
  let originalData = null;

  // Initialize form with unique credit memo number
  async function initializeForm() {
    try {
      // Generate a sequential CM number
      formData.cmNo = await generateNextDocumentId(DocumentType.CREDIT_MEMO);
      // Set date to YYYY-MM-DD for date input binding
      formData.cmDate = new Date().toISOString().split('T')[0];
      // Ensure at least one line item row exists for editing
      if (!formData.items || formData.items.length === 0) {
        addItem();
      }
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
    // Per requirements, remove invoice linking
    { label: 'Reference', name: 'reference', type: 'text' }
  ];
  
  // Define columns for the line items table
  $: columns = [
    { label: 'Item', key: 'itemId', type: 'select', options: itemOptions, width: '20%' },
    { label: 'Description', key: 'description', type: 'text', width: '20%' },
    { label: 'Quantity', key: 'quantity', type: 'number', width: '8%' },
    { label: 'Unit', key: 'unit', type: 'select', options: unitOptions, width: '10%' },
    { label: 'Unit Price', key: 'unitPrice', type: 'number', width: '10%' },
    { label: 'DSC %', key: 'discount', type: 'select', options: discountOptions, width: '8%' },
    { label: 'Tax Type', key: 'taxType', type: 'select', options: taxTypeOptions, width: '12%' },
    { label: 'Amount', key: 'amount', width: '12%' }
  ];

  // Load existing credit memo data for editing
  async function loadCreditMemo(id: string) {
    try {
      const data = await getDocFromCollection('transactions/customerCenter/creditMemos', id);
      if (!data) {
        throw new Error('Credit Memo not found');
      }
      
      // Store original data for comparison
      originalData = JSON.parse(JSON.stringify(data));
      
      // Type assertion to access the data properties
      const creditMemoData = data as any;
      
      // Populate form data with proper date formatting
      let formattedDate = '';
      if (creditMemoData.cmDate) {
        if (creditMemoData.cmDate && typeof creditMemoData.cmDate === 'object' && 'seconds' in creditMemoData.cmDate) {
          formattedDate = new Date(creditMemoData.cmDate.seconds * 1000).toISOString().split('T')[0];
        } else if (creditMemoData.cmDate instanceof Date) {
          formattedDate = creditMemoData.cmDate.toISOString().split('T')[0];
        } else {
          formattedDate = String(creditMemoData.cmDate);
        }
      }
      
      // Ensure all required fields are present
      formData = {
        cmNo: creditMemoData.cmNo || '',
        cmDate: formattedDate || '',
        customer: creditMemoData.customer || '',
        customerName: creditMemoData.customerName || '',
        reference: creditMemoData.reference || '',
        status: creditMemoData.status || 'Draft',
        memo: creditMemoData.memo || '',
        items: creditMemoData.items || [],
        subtotal: creditMemoData.subtotal || 0,
        taxRate: creditMemoData.taxRate || 0,
        taxAmount: creditMemoData.taxAmount || 0,
        totalAmount: creditMemoData.totalAmount || 0,
        withholdingTax: creditMemoData.withholdingTax || '',
        createdAt: creditMemoData.createdAt || new Date(),
        updatedAt: creditMemoData.updatedAt || new Date(),
        id: creditMemoData.id || ''
      };
      


      // Ensure at least one editable row when no items
      if (!formData.items || formData.items.length === 0) {
        addItem();
      }

      // A memo saved after the discount-shape fix below stores `discount` as a resolved numeric
      // percent (matching Sales Invoice's `dsc` convention) rather than the raw discount-option id
      // this table's <select> is bound to — remap it back so the dropdown shows the right
      // selection instead of appearing blank. The reactive block further down re-runs this once
      // discountOptions finishes loading, in case it hasn't arrived yet at this point.
      if (formData.items && discountOptions.length > 1) {
        formData.items = formData.items.map((item: any) => {
          if (typeof item.discount !== 'number') return item;
          const match = discountOptions.find((opt: any) => {
            const m = opt.label?.match(/(\d+(?:\.\d+)?)%?/);
            return m ? parseFloat(m[1]) === item.discount : false;
          });
          return match ? { ...item, discount: match.value } : item;
        });
      }
      
      // If we have a customer ID but no customer name, try to resolve it from options
      if (formData.customer && !formData.customerName && customerOptions.length > 0) {
        const customerOption = customerOptions.find(c => c.value === formData.customer);
        if (customerOption) {
          formData.customerName = customerOption.label;
    
        }
      }
      
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
    } else {
      formData.customer = '';
      formData.customerName = '';
    }
  }

  // Add a new item row to the form
  function addItem() {
    formData.items = [
      ...formData.items,
      {
        itemId: '',
        description: '',
        quantity: 0,
        unit: '',
        unitPrice: 0,
        discount: '',
        taxType: '',
        amount: 0,
        maxQuantity: Infinity
      }
    ];
    // Trigger reactivity
    formData.items = [...formData.items];
  }

  // Remove an item row from the form
  function removeItem(index: number) {
    formData.items = formData.items.filter((_: any, i: number) => i !== index);
    calculateTotals();
  }

  // Handle item selection — see itemAutofill.ts for why the field lookup is centralized
  // rather than re-derived here.
  function handleItemChange(index: number, itemId: string) {
    const selected = itemOptions.find(item => item.value === itemId);
    if (!selected) return;
    const fields = resolveItemAutofill(selected);
    const line = formData.items[index];
    line.itemId = selected.value;
    line.description = fields.description;
    if (fields.unitId) line.unit = fields.unitId;
    line.unitPrice = fields.salesPrice;
    calculateLineTotal(index);
    // Trigger table re-render
    formData.items = [...formData.items];
  }

  // Update line amounts when quantity or unit price changes
  function getDiscountPercentFromOptionId(id: any): number {
    const list = discountOptions || [];
    const opt = list.find((o: any) => String(o.value) === String(id));
    if (!opt || opt.label === 'N/A') return 0;
    const m = opt.label?.match(/(\d+(?:\.\d+)?)%?/);
    return m ? parseFloat(m[1]) : 0;
  }

  // Tax helpers (mirror sales invoice)
  function getTaxRateFromOptionId(taxTypeId: string | number): number {
    const found = taxTypeOptions.find(opt => String(opt.value) === String(taxTypeId));
    if (!found) return 0;
    const raw: any = (found as any).raw;
    if (raw && typeof raw.rate === 'number') return raw.rate;
    const match = found.label?.match(/(\d+(?:\.\d+)?)%?/);
    return match ? parseFloat(match[1]) / 100 : 0;
  }

  function getTaxCategoryFromOptionId(taxTypeId: string | number): 'vatable' | 'zero' | 'exempt' {
    const rate = getTaxRateFromOptionId(taxTypeId);
    if (rate > 0) return 'vatable';
    const label = taxTypeOptions.find(opt => String(opt.value) === String(taxTypeId))?.label?.toLowerCase() || '';
    if (label.includes('zero') || label.includes('0%')) return 'zero';
    return 'exempt';
  }

  function calculateLineTotal(index: number) {
    const item = formData.items[index];
    if (!item) return;
    const dscPercent = getDiscountPercentFromOptionId(item.discount);
    const discountedPrice = (item.unitPrice || 0) * (1 - dscPercent / 100);
    item.amount = (item.quantity || 0) * discountedPrice;
    calculateTotals();
    // Ensure UI updates for amount cell and footer
    formData.items = [...formData.items];
  }

  // Update item for TxnItemTable component
  function updateItem(index: number, key: string, value: any) {
    if (formData.items[index]) {
      formData.items[index][key] = value;
      
      // If item ID is updated, handle related field updates
      if (key === 'itemId') {
        handleItemChange(index, value);
      } else if (key === 'quantity' || key === 'unitPrice' || key === 'discount' || key === 'taxType') {
        calculateLineTotal(index);
      }
      // Trigger reactivity for table inputs
      formData.items = [...formData.items];
    }
  }

  // Calculate subtotal, tax, and total
  function calculateTotals() {
    // Keep compatibility; actual values are also computed reactively below
    formData.subtotal = formData.items.reduce((total: number, item: any) => total + (item.amount || 0), 0);
    formData.taxAmount = 0;
    formData.totalAmount = formData.subtotal;
  }

  // Reactive totals (mirror sales invoice computations)
  $: grossAmount = formData.items.reduce((sum: number, i: any) => sum + ((i.quantity || 0) * (i.unitPrice || 0)), 0);
  $: discount = formData.items.reduce((sum: number, i: any) => {
    const base = (i.quantity || 0) * (i.unitPrice || 0);
    const dscPercent = getDiscountPercentFromOptionId(i.discount);
    return sum + base * (dscPercent / 100);
  }, 0);
  $: netSales = formData.items.reduce((sum: number, i: any) => sum + (i.amount || 0), 0);
  
  // Correct VAT computation according to Philippine VAT rules
  $: vatableAmount = formData.items.reduce((sum: number, i: any) => sum + (getTaxCategoryFromOptionId(i.taxType) === 'vatable' ? (i.amount || 0) : 0), 0);
  $: zeroRated = formData.items.reduce((sum: number, i: any) => sum + (getTaxCategoryFromOptionId(i.taxType) === 'zero' ? (i.amount || 0) : 0), 0);
  $: vatExempt = formData.items.reduce((sum: number, i: any) => sum + (getTaxCategoryFromOptionId(i.taxType) === 'exempt' ? (i.amount || 0) : 0), 0);
  
  // VAT-exclusive sales (amount before VAT)
  $: vatableSales = vatableAmount / 1.12;
  // VAT amount (12% of VAT-exclusive amount)
  $: vat = vatableSales * 0.12;
  
  $: lessWithholding = formData.withholdingTax ? (vatableSales * (parseFloat(formData.withholdingTax) / 100)) : 0;
  // Total due is net sales minus withholding tax (VAT already included in net sales)
  $: totalDue = netSales - lessWithholding;
  


  // Keep legacy fields in sync for save
  $: formData.subtotal = netSales;
  $: formData.taxAmount = vat;
  $: formData.totalAmount = totalDue;
  
  // Same remap as in loadCreditMemo, re-run reactively in case discountOptions was still empty
  // (Firestore subscription hadn't resolved yet) at the moment the document actually loaded.
  $: if (formData.items && formData.items.length > 0 && discountOptions && discountOptions.length > 1) {
    const needsRemap = formData.items.some((item: any) => typeof item.discount === 'number');
    if (needsRemap) {
      formData.items = formData.items.map((item: any) => {
        if (typeof item.discount !== 'number') return item;
        const match = discountOptions.find((opt: any) => {
          const m = opt.label?.match(/(\d+(?:\.\d+)?)%?/);
          return m ? parseFloat(m[1]) === item.discount : false;
        });
        return match ? { ...item, discount: match.value } : item;
      });
    }
  }

  // Reactive statement to resolve customer name when options load
  $: if (formData.customer && !formData.customerName && customerOptions.length > 0) {
    const customerOption = customerOptions.find(c => c.value === formData.customer);
    if (customerOption) {
      formData.customerName = customerOption.label;

    }
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
      
      // Force Posted status when saving via primary button
      const desiredStatus = 'Posted';
      formData.status = desiredStatus;

      // Save the resolved numeric discount percent, not the option id — matching Sales Invoice's
      // `dsc` convention (getDiscountPercent there / getDiscountPercentFromOptionId here), so both
      // transaction types store the same shape for what's conceptually the same field.
      const preparedItems = formData.items.map((item: any) => ({
        ...item,
        discount: getDiscountPercentFromOptionId(item.discount)
      }));

      // Prepare data for save
      const creditMemoData = {
        ...formData,
        items: preparedItems,
        status: desiredStatus,
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
      
      // Create journal entry when posted
      if (creditMemoData.status === 'Posted') {
        await createCreditMemoJournalEntry({
          id: savedDocId,
          ...creditMemoData
        });
        
        // Update the document status to reflect it's been posted
        await updateDocInCollection(
          'transactions/customerCenter/creditMemos',
          savedDocId,
          { status: desiredStatus }
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
      primaryLabel={isViewMode ? 'Back to List' : (isSaving ? 'Saving...' : (isEditMode ? 'Update Credit Memo' : 'Create Credit Memo'))}
      secondaryLabel="Cancel"
      onPrimaryClick={isViewMode ? () => goto('/customerCenter/creditMemo/list') : saveCreditMemo}
      onSecondaryClick={() => goto('/customerCenter/creditMemo/list')}
      showSecondaryButton={!isViewMode}
      readOnly={isViewMode}
      leftSideContent={true}
      summaryMode="transaction"
      lineItems={formData.items}
        grossAmount={grossAmount}
        discount={discount}
        netSales={netSales}
        vat={vat}
        vatableSales={vatableSales}
        zeroRated={zeroRated}
        vatExempt={vatExempt}
        lessWithholding={lessWithholding}
        totalDue={totalDue}
        bind:withholdingTax={formData.withholdingTax}
        withholdingTaxOptions={WITHHOLDING_TAX_OPTIONS}
        withholdingLabel={`Less: Withholding Tax${formData.withholdingTax ? ` (${formData.withholdingTax}%)` : ''}`}
        totalLabel="Total Amount"
    />
    

  {/if}
</FormLayout>
