<script lang="ts">
  export let lineItems: Array<{
    item: string;
    description: string;
    unit: string;
    qty: number;
    price: number;
    dsc: number;
    taxType: string;
    amount: number;
    vatRate?: number;
    zeroRated?: boolean;
    vatExempt?: boolean;
  }> = [];
  export let discountRate: number = 0;
  export let vatRate: number = 0.12;
  export let withholdingRate: number = 0.01;
  export let withholdingLabel: string = 'Less: Withholding Tax';
  export let withholdingTax: string = '';
  export let cashSale: boolean = false;
  export let withholdingTaxOptions: Array<{ label: string; value: any }> = [];
  export let grossAmount: number | undefined = undefined;
  export let discount: number | undefined = undefined;
  export let netSales: number | undefined = undefined;
  export let vat: number | undefined = undefined;
  export let vatableSales: number | undefined = undefined;
  export let zeroRated: number | undefined = undefined;
  export let vatExempt: number | undefined = undefined;
  export let lessWithholding: number | undefined = undefined;
  export let totalDue: number | undefined = undefined;

  $: computedGross = lineItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  $: computedDiscount = computedGross * (discountRate / 100);
  $: computedNetSales = computedGross - computedDiscount;
  $: computedVatableSales = lineItems.filter(i => i.taxType === 'vat').reduce((sum, i) => sum + (i.amount || 0), 0);
  $: computedZeroRated = lineItems.filter(i => i.taxType === 'zero').reduce((sum, i) => sum + (i.amount || 0), 0);
  $: computedVatExempt = lineItems.filter(i => i.taxType === 'exempt').reduce((sum, i) => sum + (i.amount || 0), 0);
  $: computedVat = computedVatableSales * vatRate;
  $: computedWithholding = computedNetSales * withholdingRate;
  $: computedTotalDue = computedNetSales + computedVat - computedWithholding;

  $: gross = grossAmount ?? computedGross;
  $: disc = discount ?? computedDiscount;
  $: net = netSales ?? computedNetSales;
  $: vatable = vatableSales ?? computedVatableSales;
  $: zero = zeroRated ?? computedZeroRated;
  $: exempt = vatExempt ?? computedVatExempt;
  $: vatVal = vat ?? computedVat;
  $: withhold = lessWithholding ?? computedWithholding;
  $: total = totalDue ?? computedTotalDue;
</script>

<div class="bg-base-100/80 p-4 mb-4 rounded-xl max-w-md text-sm border border-transparent">
  <div class="p-0">
    <h2 class="font-semibold mb-2 text-base">Summary</h2>
    <div class="mb-2 space-y-2">
      <div>
        <label class="label p-0 mb-1">
          <span class="label-text font-semibold text-gray-700 text-xs">Withholding Tax (%)</span>
        </label>
        <select class="select select-bordered select-xs w-full" bind:value={withholdingTax}>
          {#each withholdingTaxOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </div>
      <div class="form-control">
        <label class="label cursor-pointer p-0 mb-1">
          <span class="label-text font-semibold text-gray-700 text-xs">Cash Sale</span>
          <input type="checkbox" class="checkbox checkbox-xs" bind:checked={cashSale} />
        </label>
      </div>
    </div>
    <div class="space-y-0.5 text-xs">
      <div class="flex justify-between items-center"><span>Gross Amount:</span><span>₱{gross.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
      <div class="flex justify-between items-center"><span>Discount:</span><span class="text-red-500">-₱{disc.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
      <hr class="border-gray-200 my-1">
      <div class="flex justify-between items-center"><span>Net Sales:</span><span>₱{net.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
      <div class="flex justify-between items-center"><span>VAT:</span><span>₱{vatVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
      <div class="flex justify-between items-center"><span>Vatable Sales:</span><span>₱{vatable.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
      <div class="flex justify-between items-center"><span>Zero-rated:</span><span>₱{zero.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
      <div class="flex justify-between items-center"><span>VAT-Exempt:</span><span>₱{exempt.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
      <div class="flex justify-between items-center"><span>{withholdingLabel}:</span><span class="text-red-500">-₱{withhold.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
    </div>
    <div class="flex justify-between font-bold text-base mt-2 items-center">
      <span><iconify-icon icon="material-symbols:payments" width="18" height="18"></iconify-icon> Total Amount Due:</span><span class="text-green-600 badge badge-md badge-success">₱{total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
    </div>
    <slot />
  </div>
</div> 