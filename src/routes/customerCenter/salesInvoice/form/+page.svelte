<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { addDocToCollection, updateDocInCollection, getDocFromCollection } from '$lib/utils/firestoreCrud';
  import { generateNextDocumentId, DocumentType } from '$lib/utils/documentIdService';
  import { createSalesInvoiceJournalEntry, voidJournalEntriesForSource } from '$lib/utils/accountingService';
  import { resolveItemAutofill } from '$lib/utils/itemAutofill';
  import { WITHHOLDING_TAX_OPTIONS } from '$lib/utils/withholdingTax';
  import { getCompanyProfile } from '$lib/utils/companyProfileService';
  import { generateSalesInvoicePdf } from '$lib/utils/documentPdfService';
  import { goto } from '$app/navigation';
  
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
  
  // Show the actual invoice number once known, instead of a generic "Edit/View Invoice"
  // label — falls back to a mode label for a brand-new, not-yet-saved invoice.
  $: pageTitle = isCreateMode
    ? 'New Invoice'
    : (formData.originalInvoiceNo && formData.originalInvoiceNo !== 'DRAFT' ? formData.originalInvoiceNo : (mode === 'view' ? 'View Invoice' : 'Edit Invoice'));

  // Subscribe to Firestore option stores and use arrays for select fields
  let customerOptions: {label: string, value: any}[] = [];
  let termsOptions: {label: string, value: any}[] = [];
  let paymentMethodOptions: {label: string, value: any}[] = [];
  let itemOptions: {label: string, value: any}[] = [];
  let unitOptions: {label: string, value: any}[] = [];
  let taxTypeOptions: {label: string, value: any}[] = [];
  let discountOptions: {label: string, value: any}[] = [];

  createFirestoreOptionsStore('customers', 'name', 'id').subscribe(opts => customerOptions = opts);
  createFirestoreOptionsStore('terms').subscribe(opts => termsOptions = opts);
  createFirestoreOptionsStore('paymentmethods').subscribe(opts => paymentMethodOptions = opts);
  // Include raw item data to support autofill of description/unit/price/taxType
  createFirestoreOptionsStore('items', 'name', 'id', true).subscribe(opts => itemOptions = opts);
  createFirestoreOptionsStore('units').subscribe(opts => unitOptions = opts);
  createFirestoreOptionsStore('tax', 'name', 'id', true).subscribe(opts => {
    // Add N/A option to tax type options
    taxTypeOptions = [{ label: 'N/A', value: '' }, ...opts];
  });
  
  // Get discount options from Firestore - same pattern as tax type
  createFirestoreOptionsStore('otherlist/discounts', 'name', 'id').subscribe(opts => {
    // Add N/A option to discount options
    discountOptions = [{ label: 'N/A', value: '' }, ...opts];
  });

  const withholdingTaxOptions = WITHHOLDING_TAX_OPTIONS;

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
    status?: 'Draft' | 'Unpaid' | 'Paid' | 'Posted'; // Add status field with possible values
  };

  // Get the current term name based on the selected term ID
  $: currentTermName = formData.selectedTerms 
    ? termsOptions.find(term => term.value === formData.selectedTerms)?.label || ''
    : '';

  // Function to calculate due date based on invoice date and terms
  function calculateDueDate(invoiceDate: string, termsId: string): string {
    if (!invoiceDate || !termsId) return '';
    
    // Find the selected term by ID
    const selectedTerm = termsOptions.find(term => term.value === termsId);
    if (!selectedTerm) return '';
    
    // Parse the term name to get the number of days
    const daysMatch = selectedTerm.label.match(/\d+/);
    if (!daysMatch) return '';
    
    const days = parseInt(daysMatch[0], 10);
    
    // Create a new date object from the invoice date
    const date = new Date(invoiceDate);
    
    // Add the number of days to the invoice date
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    
    // Format as YYYY-MM-DD for the date input
    const year = result.getFullYear();
    const month = String(result.getMonth() + 1).padStart(2, '0');
    const day = String(result.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  // Initialize form data with default values
  const today = new Date().toISOString().split('T')[0];
  let formData: FormDataType = {
    customer: '',
    invoiceDate: today,
    dueDate: '', // Will be calculated when terms are selected
    selectedTerms: '',
    paymentMethod: '',
    poNumber: '',
    memo: '',
    cashSale: false,
    withholdingTax: '',
  };

  // Update due date when invoice date or terms change
  $: if (formData.invoiceDate && formData.selectedTerms) {
    formData.dueDate = calculateDueDate(formData.invoiceDate, formData.selectedTerms);
  }

  let lineItems: Array<{
    item: string;
    description: string;
    unit: string;
    qty: number;
    price: number;
    dsc: number;
    taxType: string;
    amount: number;
    dscDisplay?: string;
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
      // Load the selected invoice document
      
      // Fetch document data with proper error handling
      const docData = await getDocFromCollection('transactions/customerCenter/salesInvoices', docId) as InvoiceDocument;
      
      if (!docData) {
        throw new Error('Invoice not found');
      }
      
      // Populate form data all at once for better performance
      const { 
        invoiceNo, 
        customer, 
        invoiceDate, 
        dueDate, 
        selectedTerms, 
        paymentMethod, 
        poNumber, 
        memo, 
        cashSale, 
        withholdingTax, 
        status: docStatus,
        lineItems: docLineItems 
      } = docData;
      
      // Ensure the status is one of the allowed values or default to 'Draft'
      const validStatuses = ['Draft', 'Unpaid', 'Paid', 'Posted'] as const;
      const status = validStatuses.includes(docStatus as any) ? docStatus as 'Draft' | 'Unpaid' | 'Paid' | 'Posted' : 'Draft';
      
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
        status: status || 'Draft', // Set status from document or default to 'Draft'
        // Keep track of original invoice number for edit mode
        originalInvoiceNo: invoiceNo
      };
      
      // Map Firestore line items to local format (initially keep values; mapping to option IDs occurs reactively when options are ready)
      if (docLineItems && Array.isArray(docLineItems)) {
        lineItems = docLineItems.map(item => ({ ...item }));
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

  // When discount options load, map any numeric discounts in line items to the corresponding option IDs
  $: if (lineItems && lineItems.length > 0 && discountOptions && discountOptions.length > 0) {
    let didChange = false;
    const mapped = lineItems.map(item => {
      if (typeof item.dsc === 'number') {
        const match = discountOptions.find(opt => {
          if (!opt.label || opt.label === 'N/A') return false;
          const m = opt.label.match(/(\d+(?:\.\d+)?)%?/);
          return m ? parseFloat(m[1]) === item.dsc : false;
        });
        if (match) {
          didChange = true;
          const dscPercent = parseFloat((match.label.match(/(\d+(?:\.\d+)?)%?/ )?.[1] || '0'));
          const discounted = (item.price || 0) * (1 - dscPercent / 100);
          return { ...item, dsc: match.value, dscDisplay: match.label, amount: +((item.qty || 0) * discounted).toFixed(2) };
        }
      }
      // Always ensure display value for view mode
      return { ...item, dscDisplay: getDiscountLabel(item.dsc) };
    });
    if (didChange) {
      lineItems = [...mapped];
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
    // Default to the first discount option (usually N/A)
    const defaultDiscountId = discountOptions.length > 0 ? discountOptions[0].value : '';
    lineItems = [...lineItems, { 
      item: '', 
      description: '', 
      unit: '', 
      qty: 0, 
      price: 0, 
      dsc: defaultDiscountId, // Default to N/A discount option ID
      taxType: '', // Default to empty (N/A)
      amount: 0 
    }];
  }

  function getDiscountPercent(dscId: string | number) {
    // Find the selected discount option by value (id)
    const found = discountOptions.find(opt => String(opt.value) === String(dscId));
    // If not found or N/A, treat as 0
    if (!found || found.value === '' || found.label === 'N/A') return 0;
    // Extract the percent number from the label (e.g., '2%' or '5%')
    let percent = 0;
    if (found.label) {
      const match = found.label.match(/(\d+(?:\.\d+)?)%?/); // matches '2%' or '2.5%'
      if (match) {
        percent = parseFloat(match[1]);
      }
    }
    return isNaN(percent) ? 0 : percent;
  }

  function getDiscountLabel(dscId: string | number): string {
    if (typeof dscId === 'number') return `${dscId}%`;
    const found = discountOptions.find(opt => String(opt.value) === String(dscId));
    return found?.label ?? 'N/A';
  }

  function getTaxRate(taxTypeId: string | number): number {
    const found = taxTypeOptions.find(opt => String(opt.value) === String(taxTypeId));
    if (!found) return 0;
    const raw: any = (found as any).raw;
    if (raw && typeof raw.rate === 'number') return raw.rate;
    const match = found.label?.match(/(\d+(?:\.\d+)?)%?/);
    return match ? parseFloat(match[1]) / 100 : 0;
  }

  function getTaxCategory(taxTypeId: string | number): 'vatable' | 'zero' | 'exempt' {
    const rate = getTaxRate(taxTypeId);
    if (rate > 0) return 'vatable';
    const label = taxTypeOptions.find(opt => String(opt.value) === String(taxTypeId))?.label?.toLowerCase() || '';
    if (label.includes('zero') || label.includes('0%')) return 'zero';
    return 'exempt';
  }

  function formatNumber(value: any): number {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : parseFloat(num.toFixed(2));
  }

  function updateAmount(idx: number, key: string, value: any) {
    // Ensure the item at the given index exists before updating
    if (lineItems[idx]) {
        const item = lineItems[idx];
        
        // Format the value based on its type
        if (key === 'qty' || key === 'price' || key === 'amount') {
          value = formatNumber(value);
        }
        
        // Update the item property
        (item as Record<string, any>)[key] = value;
        
        // Autofill linked fields when an item is selected — see itemAutofill.ts for why this
        // is centralized rather than re-deriving the raw.xxx fallback chain here. unit/taxType
        // stay guarded (only overwritten if the item actually specifies one) so switching to an
        // item with no unit/tax data doesn't wipe out a value the user already set; price is
        // unconditional since leaving a stale price from the *previous* item selected would be
        // actively wrong.
        if (key === 'item') {
          const selected = itemOptions.find(o => String(o.value) === String(value));
          const fields = resolveItemAutofill(selected);
          item.description = fields.description;
          if (fields.unitId) item.unit = fields.unitId;
          if (fields.taxType) item.taxType = fields.taxType;
          item.price = formatNumber(fields.salesPrice);
        }
        
        // Recalculate amount if price, qty, or discount changes
        if (['price', 'qty', 'dsc'].includes(key)) {
          const dscPercent = getDiscountPercent(item.dsc);
          const discounted = (item.price || 0) * (1 - dscPercent / 100);
          item.amount = formatNumber(discounted * (item.qty || 0));
        }
        
        item.dscDisplay = getDiscountLabel(item.dsc);
        
        // Reassign the array to trigger reactivity
        lineItems = [...lineItems];
    }
  }

  $: grossAmount = lineItems.reduce((sum, i) => sum + ((i.price || 0) * (i.qty || 0)), 0);
  $: discount = lineItems.reduce((sum, i) => {
    const dscPercent = getDiscountPercent(i.dsc);
    return sum + ((i.price || 0) * (i.qty || 0)) * (dscPercent / 100);
  }, 0);
  $: netSales = lineItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  
  // Correct VAT computation according to Philippine VAT rules
  $: vatableAmount = lineItems.reduce((sum, i) => sum + (getTaxCategory(i.taxType) === 'vatable' ? (i.amount || 0) : 0), 0);
  $: zeroRated = lineItems.reduce((sum, i) => sum + (getTaxCategory(i.taxType) === 'zero' ? (i.amount || 0) : 0), 0);
  $: vatExempt = lineItems.reduce((sum, i) => sum + (getTaxCategory(i.taxType) === 'exempt' ? (i.amount || 0) : 0), 0);
  // Pre-discount gross of vatable lines only — needed (alongside vatableAmount above) so the
  // journal entry can split "Sales Revenue" and "Sales Discount" by tax category instead of
  // assuming the whole invoice is vatable. See accountingService.ts's createSalesInvoiceJournalEntry.
  $: vatableGross = lineItems.reduce((sum, i) => sum + (getTaxCategory(i.taxType) === 'vatable' ? ((i.price || 0) * (i.qty || 0)) : 0), 0);
  
  // VAT-exclusive sales (amount before VAT)
  $: vatableSales = vatableAmount / 1.12;
  // VAT amount (12% of VAT-exclusive amount)
  $: vat = vatableSales * 0.12;
  
  $: lessWithholding = formData.withholdingTax ? (vatableSales * (parseFloat(formData.withholdingTax) / 100)) : 0;
  // Total due is net sales minus withholding tax (VAT already included in net sales)
  $: totalDue = netSales - lessWithholding;

  /**
   * Save the invoice data to Firestore
   */
  // Handle saving, updating, or navigating based on current mode
  async function handleSaveDraft() {
    await saveInvoice('Draft');
  }

  async function handleSave() {
    await saveInvoice('Unpaid');
  }

  async function saveInvoice(status: 'Draft' | 'Posted' | 'Unpaid') {
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
        // Save the numeric discount percent, not the option id
        dsc: getDiscountPercent(item.dsc),
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
        vatableGross: prepareNumber(vatableGross),
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

      // Handle mode-specific operations. Cash Sale forces 'Paid' regardless of which button was
      // clicked (see below) — the posting decision has to key off this actual saved status, not
      // the raw button choice, or a cash-sale invoice saved via "Save as Draft" would wrongly
      // skip posting even though it's actually being saved Paid.
      let savedId = docId;
      const actualStatus = formData.cashSale ? 'Paid' : status;
      if (isCreateMode) {
        // For drafts, use 'DRAFT' as the invoice number, otherwise generate a sequential number
        const invoiceNo = actualStatus === 'Draft'
          ? 'DRAFT'
          : await generateNextDocumentId(DocumentType.SALES_INVOICE);

        const newInvoiceData = {
          ...baseInvoiceData,
          invoiceNo,
          createdAt: new Date(),
          status: actualStatus
        };

        // Add the invoice to Firestore and get the document reference
        const docRef = await addDocToCollection('transactions/customerCenter/salesInvoices', newInvoiceData);
        savedId = docRef.id;

        // Only post a journal entry once the invoice actually leaves Draft — a brand-new Draft
        // has nothing to void, so there's no existing-entry case to worry about here (§5.6).
        if (actualStatus !== 'Draft') {
          const invoiceWithId = { ...newInvoiceData, id: docRef.id };
          await createSalesInvoiceJournalEntry(invoiceWithId);
        }

        alert(actualStatus === 'Draft' ? 'Invoice saved as draft' : 'Invoice created successfully');
      } else if (isEditMode) {
        // For edit mode, handle invoice number based on status
        let invoiceNo = formData.originalInvoiceNo;

        // If it was a draft and we're saving as non-draft, generate a new invoice number
        if (formData.status === 'Draft' && actualStatus !== 'Draft' && invoiceNo === 'DRAFT') {
          invoiceNo = await generateNextDocumentId(DocumentType.SALES_INVOICE);
        }
        // If it's a new draft (no invoice number yet), use 'DRAFT'
        else if (actualStatus === 'Draft' && !invoiceNo) {
          invoiceNo = 'DRAFT';
        }

        const updateInvoiceData = {
          ...baseInvoiceData,
          invoiceNo: invoiceNo || await generateNextDocumentId(DocumentType.SALES_INVOICE),
          status: actualStatus
        };

        // Update the invoice in Firestore
        await updateDocInCollection('transactions/customerCenter/salesInvoices', docId, updateInvoiceData);

        // Only post/regenerate a journal entry once the invoice is actually posted. If it's
        // being saved back down to Draft, void any journal entry a prior save already posted —
        // otherwise reverting to Draft would silently leave a stale "posted" entry in the ledger.
        const invoiceWithId = { ...updateInvoiceData, id: docId };
        if (actualStatus !== 'Draft') {
          await createSalesInvoiceJournalEntry(invoiceWithId);
        } else {
          await voidJournalEntriesForSource('salesInvoice', docId);
        }

        alert(actualStatus === 'Draft' ? 'Invoice updated and saved as draft' : 'Invoice updated successfully');
      }

      // Land on the saved invoice's view mode, not the list — the Print/Download PDF buttons
      // only render once there's a saved docId, so bouncing straight to the list would mean the
      // user can never reach them right after saving.
      goto(`/customerCenter/salesInvoice/form?id=${savedId}&viewMode=true`);

    } catch (error) {
      console.error('Error saving sales invoice:', error);
      // Handle errors, e.g., show an error message to the user
      alert('Failed to save sales invoice: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  }

  let isGeneratingPdf = false;

  /**
   * Builds a printable PDF of the currently-viewed/edited (saved) invoice — the "Output" gap in
   * BLUEPRINT.md §8.1. Only reachable once the invoice has a docId (view or edit mode — never
   * create mode, there's nothing saved yet), so formData/lineItems here always reflect an
   * already-saved document. Prefers each line item's own saved itemName/unitName (present on
   * docLineItems as loaded — see loadDocument) over a live option-store lookup, since those are
   * the names as they were at save time, not whatever the item/unit is called now. `action`
   * either downloads a real .pdf file or opens the browser print dialog against the same
   * generated document.
   */
  async function handleGeneratePdf(action: 'download' | 'print') {
    isGeneratingPdf = true;
    try {
      const company = await getCompanyProfile();
      if (!company) {
        alert('Company Profile has not been set up yet. Go to Admin Tools > Company Profile first.');
        return;
      }

      let customerAddress = '';
      let customerTin = '';
      if (formData.customer) {
        const customerDoc: any = await getDocFromCollection('masterlist/customers', formData.customer);
        if (customerDoc) {
          customerAddress = customerDoc.billing_address || '';
          customerTin = customerDoc.tax_id || '';
        }
      }

      const getItemName = (id: string) => itemOptions.find(o => o.value === id)?.label || '';
      const getUnitName = (id: string) => unitOptions.find(o => o.value === id)?.label || '';
      const customerName = customerOptions.find(c => c.value === formData.customer)?.label || '';
      const paymentMethodName = paymentMethodOptions.find(p => p.value === formData.paymentMethod)?.label || '';

      generateSalesInvoicePdf(
        {
          invoiceNo: formData.originalInvoiceNo || 'DRAFT',
          invoiceDate: formData.invoiceDate ? new Date(formData.invoiceDate) : new Date(),
          dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined,
          customerName,
          customerAddress,
          customerTin,
          poNumber: formData.poNumber,
          termsName: currentTermName,
          paymentMethodName,
          lineItems: lineItems.map((li) => ({
            itemName: (li as any).itemName || getItemName(li.item),
            description: li.description,
            unitName: (li as any).unitName || getUnitName(li.unit),
            qty: li.qty || 0,
            price: li.price || 0,
            amount: li.amount || 0
          })),
          grossAmount,
          discount,
          netSales,
          vatableSales,
          zeroRated,
          vatExempt,
          vat,
          lessWithholding,
          totalDue
        },
        company,
        action
      );
    } catch (error) {
      console.error('Error generating invoice PDF:', error);
      alert('Failed to generate PDF: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      isGeneratingPdf = false;
    }
  }

  // Reset payment method whenever a sale stops being a cash sale, mirroring the old
  // checkbox's on:change handler (now that Cash Sale is a plain select field).
  $: if (!formData.cashSale && formData.paymentMethod) {
    formData.paymentMethod = '';
  }

  // Define the form fields
  $: fields = [
    { label: 'Cash Sale', name: 'cashSale', type: 'select', options: [{ label: 'No', value: false }, { label: 'Yes', value: true }] },
    { label: 'Customer', name: 'customer', type: 'select', options: customerOptions, required: true },
    { label: 'Invoice Date', name: 'invoiceDate', type: 'date', required: true },
    { label: 'Due Date', name: 'dueDate', type: 'date', required: true },
    { label: 'Payment Terms', name: 'selectedTerms', type: 'select', options: termsOptions },
    {
      label: 'Payment Method',
      name: 'paymentMethod',
      type: 'select',
      options: paymentMethodOptions,
      class: !formData.cashSale ? 'hidden' : ''
    },
    { label: 'PO #', name: 'poNumber', type: 'text', placeholder: 'e.g PO-0001' }
  ];

  $: columns = [
    { label: 'Item', key: 'item', type: 'select', options: itemOptions, width: '20%' },
    { label: 'Description', key: 'description', type: 'text', width: '20%' },
    { label: 'Unit', key: 'unit', type: 'select', options: unitOptions, width: '8%' },
    { label: 'Qty', key: 'qty', type: 'number', width: '8%' },
    { label: 'Price', key: 'price', type: 'number', width: '10%' },
    { label: 'DSC %', key: 'dsc', type: 'select', options: discountOptions, width: '8%', displayField: 'dscDisplay' },
    { label: 'Tax Type', key: 'taxType', type: 'select', options: taxTypeOptions, width: '16%' },
    { label: 'Amount', key: 'amount', width: '10%' }
  ];

  // Summary values are computed reactively and passed to the footer.
</script>

<FormLayout title={pageTitle} backPath="/customerCenter/salesInvoice/list">
  <svelte:fragment slot="header-actions">
    {#if !isCreateMode}
      <button
        type="button"
        class="px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border shrink-0 disabled:opacity-60"
        style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700);"
        disabled={isGeneratingPdf}
        on:click={() => handleGeneratePdf('print')}
      >
        <iconify-icon icon="material-symbols:print-outline" width="18" height="18"></iconify-icon>
        <span>Print</span>
      </button>
      <button
        type="button"
        class="px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border shrink-0 disabled:opacity-60"
        style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700);"
        disabled={isGeneratingPdf}
        on:click={() => handleGeneratePdf('download')}
      >
        <iconify-icon icon="material-symbols:download" width="18" height="18"></iconify-icon>
        <span>{isGeneratingPdf ? 'Generating...' : 'Download PDF'}</span>
      </button>
    {/if}
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

  <!-- Main Form Fields -->
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
    grow={true}
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
    onSecondaryClick={handleSaveDraft}
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
    netSales={netSales}
    vat={vat}
    vatableSales={vatableSales}
    zeroRated={zeroRated}
    vatExempt={vatExempt}
    lessWithholding={lessWithholding}
    totalDue={totalDue}
  />
</FormLayout>