<script lang="ts">
  import FormButtons from './FormButtons.svelte';
  
  // Button properties
  export let primaryLabel = 'Save';
  export let secondaryLabel = '';
  export let onPrimaryClick = () => {};
  export let onSecondaryClick = () => {};
  export let showSecondaryButton = !!secondaryLabel; // Whether to show the secondary button
  
  // View mode properties
  export let readOnly = false; // For view-only mode
  export let hideButtons = false; // To completely hide buttons section
  
  // Layout properties
  export let leftSideContent = true; // Whether to show the left side content (summary) at all
  export let summaryMode: 'custom' | 'transaction' | 'none' = 'custom';
  
  // Transaction summary properties (only used when summaryMode is 'transaction')
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

  // Computed values for transaction summary
  $: computedGross = lineItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  $: computedDiscount = computedGross * (discountRate / 100);
  $: computedNetSales = computedGross - computedDiscount;
  $: computedVatableSales = lineItems.filter(i => i.taxType === 'vat').reduce((sum, i) => sum + (i.amount || 0), 0);
  $: computedZeroRated = lineItems.filter(i => i.taxType === 'zero').reduce((sum, i) => sum + (i.amount || 0), 0);
  $: computedVatExempt = lineItems.filter(i => i.taxType === 'exempt').reduce((sum, i) => sum + (i.amount || 0), 0);
  $: computedVat = computedVatableSales * vatRate;
  $: computedWithholding = computedNetSales * withholdingRate;
  $: computedTotalDue = computedNetSales + computedVat - computedWithholding;

  // Use provided values or computed values
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

<div class="mt-auto flex flex-col xl:flex-row gap-4">
  <!-- Left side for summary content -->
  {#if leftSideContent}
    <div class="w-full xl:w-2/5">
      {#if summaryMode === 'transaction'}
        <!-- Transaction Summary -->
        <div class="bg-white p-0 text-sm w-full">
          <div class="p-0">
            <h2 class="text-lg font-semibold text-gray-800 mb-4">Summary</h2>
            
            <!-- Withholding Tax and Cash Sale Settings -->
            <div class="flex flex-wrap mb-4">
              <div class="w-full lg:w-3/5 lg:pr-4 mb-3 lg:mb-0">
                <label for="withholding-tax" class="block mb-1 text-sm font-medium text-gray-700">Withholding Tax (%)</label>
                <select id="withholding-tax" class="w-full px-3 py-2 text-sm {readOnly ? 'bg-gray-100' : 'bg-gray-50'} border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" bind:value={withholdingTax} disabled={readOnly}>
                  {#each withholdingTaxOptions as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              </div>
              <div class="w-full lg:w-2/5 flex items-center lg:mt-7">
                <label for="cash-sale" class="text-sm font-medium text-gray-700 cursor-pointer flex-1">Cash Sale</label>
                <input id="cash-sale" type="checkbox" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" bind:checked={cashSale} disabled={readOnly}>
              </div>
            </div>
            
            <!-- Summary Values - Two Column Layout -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <!-- Column 1 -->
              <div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-gray-600">Gross Amount:</span>
                  <span class="font-medium">₱{gross.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-gray-600">Discount:</span>
                  <span class="text-red-500 font-medium">-₱{disc.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div class="flex justify-between items-center mb-1 pt-1 border-t border-gray-200">
                  <span class="text-gray-600">Net Sales:</span>
                  <span class="font-medium">₱{net.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-gray-600">VAT:</span>
                  <span class="font-medium">₱{vatVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </div>
              
              <!-- Column 2 -->
              <div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-gray-600">Vatable Sales:</span>
                  <span class="font-medium">₱{vatable.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-gray-600">Zero-rated:</span>
                  <span class="font-medium">₱{zero.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-gray-600">VAT-Exempt:</span>
                  <span class="font-medium">₱{exempt.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-gray-600">{withholdingLabel}:</span>
                  <span class="text-red-500 font-medium">-₱{withhold.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </div>
            </div>
            
            <!-- Total Amount Due -->
            <div class="flex justify-between font-bold text-base mt-3 pt-2 border-t border-gray-300 items-center">
              <span class="flex items-center">
                <iconify-icon icon="material-symbols:payments" width="20" height="20" class="mr-1"></iconify-icon> 
                <span>Total Amount Due:</span>
              </span>
              <span class="text-green-600 bg-green-50 px-3 py-1 rounded-lg border border-green-200">₱{total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
          </div>
        </div>
      {:else if summaryMode === 'custom'}
        <!-- Custom summary from slot -->
        <slot name="summary"></slot>
      {/if}
    </div>
  {/if}
  
  <!-- Right side with form buttons (only shown if not hideButtons) -->
  {#if !hideButtons}
    <div class="w-full {leftSideContent ? 'xl:w-3/5' : ''} flex flex-col justify-end">
      <div class="w-full flex justify-end">
        <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <slot name="custom-buttons">
            <FormButtons
              primaryButtonLabel={primaryLabel}
              secondaryButtonLabel={showSecondaryButton ? secondaryLabel : ""}
              onPrimaryClick={onPrimaryClick}
              onSecondaryClick={showSecondaryButton ? onSecondaryClick : undefined}
            />
          </slot>
        </div>
      </div>
    </div>
  {/if}
</div>
