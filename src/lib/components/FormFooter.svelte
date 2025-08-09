<script lang="ts">
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
            <div class="space-y-5">
              <!-- Two-column summary layout with improved spacing -->
              <div class="flex gap-8">
                <!-- Left column with better typography -->
                <div class="w-1/2 space-y-3">
                  <div class="flex justify-between items-center">
                    <span class="text-gray-700 text-sm">Gross Amount:</span>
                    <span class="font-medium text-base">₱{gross.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-700 text-sm">Discount:</span>
                    <span class="text-red-500 font-medium text-base">-₱{disc.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-700 text-sm">Net Sales:</span>
                    <span class="font-medium text-base">₱{net.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-700 text-sm">VAT:</span>
                    <span class="font-medium text-base">₱{vatVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                </div>
                
                <!-- Right column with better typography -->
                <div class="w-1/2 space-y-3">
                  <div class="flex justify-between items-center">
                    <span class="text-gray-700 text-sm">Vatable Sales:</span>
                    <span class="font-medium text-base">₱{vatable.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-700 text-sm">Zero-rated:</span>
                    <span class="font-medium text-base">₱{zero.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-700 text-sm">VAT-Exempt:</span>
                    <span class="font-medium text-base">₱{exempt.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-gray-700 text-sm">{withholdingLabel}:</span>
                    <span class="text-red-500 font-medium text-base">-₱{withhold.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>
              
              <!-- Total Amount Due with improved styling -->
              <div class="flex justify-between font-bold mt-4 pt-3 border-t border-gray-300 items-center">
                <span class="flex items-center">
                  <iconify-icon icon="material-symbols:payments" width="24" height="24" class="mr-2 text-green-600"></iconify-icon> 
                  <span class="text-lg">Total Amount Due:</span>
                </span>
                <span class="text-green-600 bg-green-50 px-4 py-2 rounded-lg border border-green-200 text-lg">₱{total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
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
            <div class="flex gap-3 justify-end w-full flex-wrap mt-2">
              {#if showSecondaryButton}
                <button
                  class="bg-transparent border-2 border-indigo-500 text-indigo-600 hover:bg-indigo-50
                         px-5 py-2.5 rounded-lg font-medium flex items-center gap-2.5 
                         transition-all duration-200 ease-in-out 
                         shadow-sm hover:shadow-md 
                         focus:outline-none focus:ring-2 focus:ring-opacity-50 focus:ring-indigo-300"
                  type="button"
                  on:click={onSecondaryClick}
                >
                  {secondaryLabel}
                </button>
              {/if}
              <button
                class="bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white
                       px-5 py-2.5 rounded-lg font-medium flex items-center gap-2.5 
                       transition-all duration-200 ease-in-out 
                       shadow-sm hover:shadow-md 
                       focus:outline-none focus:ring-2 focus:ring-opacity-50 focus:ring-indigo-300"
                type="submit"
                on:click={onPrimaryClick}
              >
                {primaryLabel}
              </button>
            </div>
          </slot>
        </div>
      </div>
    </div>
  {/if}
</div>
