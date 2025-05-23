<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import TxnItemTable from '$lib/components/TxnItemTable.svelte';
  import TxnSummary from '$lib/components/TxnSummary.svelte';
  import FormButtons from '$lib/components/FormButtons.svelte';
  import { onMount } from 'svelte';
  import { firestoreOptionsStore } from '$lib/utils/firestoreOptions';

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

  let formData = {
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

  function removeItem(idx: number) {
    lineItems = lineItems.filter((_, i) => i !== idx);
  }

  // Function to add a new empty line item
  function addItem() {
    lineItems = [...lineItems, { item: '', description: '', unit: '', qty: 0, price: 0, dsc: 0, taxType: '', amount: 0 }];
  }

  function updateAmount(idx: number, key: string, value: any) {
    (lineItems[idx] as Record<string, any>)[key] = value;
    const item = lineItems[idx];
    const discounted = item.price * (1 - (item.dsc || 0) / 100);
    item.amount = +(discounted * (item.qty || 1)).toFixed(2);
    lineItems = [...lineItems];
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
    { label: 'Description', key: 'description', width: '25%' },
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

<div class="flex flex-col h-full w-full px-2 md:px-8">
  <div class="flex items-center mb-4 md:mb-6">
    <button class="btn btn-ghost btn-circle mr-2" aria-label="Back"><iconify-icon icon="material-symbols:arrow-back" width="24" height="24"></iconify-icon></button>
    <h1 class="text-2xl font-bold">Create Invoice</h1>
  </div>
  <form on:submit|preventDefault={() => {}} class="flex flex-col flex-1 h-full w-full">
    <div class="flex-1 flex flex-col gap-4 md:gap-8">
      <!-- Fields on top (including Memo) -->
      <TxnFields {fields} bind:formData />

      <!-- Item table section -->
      <div class="overflow-x-auto w-full">
        <h2 class="font-semibold mb-2">Line Items</h2>
        <div class="min-w-[900px] md:min-w-0">
          <TxnItemTable
            {columns}
            rows={lineItems}
            onRemove={removeItem}
            onUpdate={updateAmount}
            onAdd={addItem}
          />
        </div>
      </div>
    </div>
    <!-- Footer: Summary and FormButtons on the same row -->
    <div class="w-full flex flex-col md:flex-row gap-4 md:gap-8 items-stretch pt-4 bg-white">
      <!-- Summary -->
      <div class="w-full md:max-w-xs lg:max-w-sm flex flex-col justify-end">
        <TxnSummary
          lineItems={lineItems}
          discountRate={0}
          vatRate={0.12}
          withholdingRate={formData.withholdingTax ? parseFloat(formData.withholdingTax) / 100 : 0}
          withholdingLabel={`Less: Withholding Tax${formData.withholdingTax ? ` (${formData.withholdingTax}%)` : ''}`}
          bind:withholdingTax={formData.withholdingTax}
          bind:cashSale={formData.cashSale}
          {withholdingTaxOptions}
        />
      </div>
      <!-- FormButtons: responsive placement -->
      <div class="w-full md:flex-1 flex flex-col md:justify-end md:items-end">
        <div class="flex flex-col md:flex-row gap-2 w-full md:w-auto">
          <FormButtons
            primaryButtonLabel="Create Invoice"
            secondaryButtonLabel="Save as Draft"
            onPrimaryClick={() => { /* handle create invoice */ }}
            onSecondaryClick={() => { /* handle save as draft */ }}
          />
        </div>
      </div>
    </div>
  </form>
</div> 