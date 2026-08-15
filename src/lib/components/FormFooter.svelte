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
  // Not every transaction type has withholding tax in the accounting system — Receiving Report
  // never did (see accountingService.ts's createReceivingReportJournalEntry, which has no
  // withholding logic at all), unlike Sales Invoice/APV/Credit Memo which do. Defaults to true
  // so existing callers that DO have withholding keep working unchanged; forms without it should
  // pass showWithholding={false} rather than just omitting the other withholding props, which
  // used to leave a "Withholding Tax:" dropdown with zero options rendered on screen.
  export let showWithholding: boolean = true;
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
  export let withholdingTaxOptions: Array<{ label: string; value: any }> = [];
  export let totalLabel: string = 'Total Amount Due';
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
  // Use the effective net value (provided or computed) for downstream calcs
  // Use the actual withholding tax percentage from the form, not the default rate
  $: effectiveWithholdingRate = withholdingTax ? parseFloat(withholdingTax) / 100 : withholdingRate;
  $: computedWithholding = (netSales ?? computedNetSales) * effectiveWithholdingRate;
  $: computedTotalDue = (netSales ?? computedNetSales) + (vat ?? computedVat) - computedWithholding;

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

<div class="mt-4 shrink-0 flex flex-col xl:flex-row xl:items-end gap-4">
  <!-- Left side: action buttons — the primary thing a user does at the bottom of a form,
       so they get real visual weight and the prime lower-left position. -->
  {#if !hideButtons}
    <div class="w-full xl:w-auto flex flex-col justify-end shrink-0 order-1">
      <slot name="custom-buttons">
        <div class="flex gap-3 flex-wrap">
          {#if showSecondaryButton}
            <button
              class="px-6 py-3 rounded-lg font-semibold text-base transition-colors focus:outline-none focus:ring-2"
              style="background: var(--color-neutral-0); border: 2px solid var(--color-primary-500); color: var(--color-primary-600); --tw-ring-color: var(--color-primary-300);"
              type="button"
              on:click={onSecondaryClick}
            >
              {secondaryLabel}
            </button>
          {/if}
          <button
            class="px-7 py-3 rounded-lg font-semibold text-base text-white transition-colors focus:outline-none focus:ring-2"
            style="background: var(--color-primary-600); box-shadow: var(--shadow-md); --tw-ring-color: var(--color-primary-300);"
            type="submit"
            on:click={onPrimaryClick}
          >
            {primaryLabel}
          </button>
        </div>
      </slot>
    </div>
  {/if}

  <!-- Right side: summary figures, blended into the form — no card, no border,
       just right-aligned text sitting on the same surface as everything else. -->
  {#if leftSideContent}
    <div class="w-full xl:w-auto xl:ml-auto order-2">
      {#if summaryMode === 'transaction'}
        <div class="text-sm w-full xl:max-w-md xl:ml-auto">
          {#if showWithholding}
            <div class="flex items-center justify-end gap-1.5 mb-2 text-xs">
              <label for="withholding-tax" style="color: var(--color-neutral-500);">Withholding Tax:</label>
              <select
                id="withholding-tax"
                class="rounded border px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 transition-colors"
                style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
                bind:value={withholdingTax}
                disabled={readOnly}
              >
                {#each withholdingTaxOptions as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
          {/if}

          <!-- Two-column figures, right-aligned, no container box -->
          <div class="flex justify-end gap-6">
            <div class="space-y-1.5">
              <div class="flex justify-between gap-3">
                <span style="color: var(--color-neutral-500);">Gross Amount</span>
                <span class="font-medium" style="color: var(--color-neutral-800);">₱{gross.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span style="color: var(--color-neutral-500);">Discount</span>
                <span class="font-medium" style="color: var(--color-error-600);">-₱{disc.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span style="color: var(--color-neutral-500);">Net Sales</span>
                <span class="font-medium" style="color: var(--color-neutral-800);">₱{net.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span style="color: var(--color-neutral-500);">VAT</span>
                <span class="font-medium" style="color: var(--color-neutral-800);">₱{vatVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            </div>
            <div class="space-y-1.5">
              <div class="flex justify-between gap-3">
                <span style="color: var(--color-neutral-500);">Vatable Sales</span>
                <span class="font-medium" style="color: var(--color-neutral-800);">₱{vatable.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span style="color: var(--color-neutral-500);">Zero-rated</span>
                <span class="font-medium" style="color: var(--color-neutral-800);">₱{zero.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div class="flex justify-between gap-3">
                <span style="color: var(--color-neutral-500);">VAT-Exempt</span>
                <span class="font-medium" style="color: var(--color-neutral-800);">₱{exempt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              {#if showWithholding}
                <div class="flex justify-between gap-3">
                  <span style="color: var(--color-neutral-500);">{withholdingLabel}</span>
                  <span class="font-medium" style="color: var(--color-error-600);">-₱{withhold.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Total Amount Due -->
          <div class="flex justify-end items-center gap-3 mt-3 pt-2.5" style="border-top: 1px solid var(--color-neutral-200);">
            <span class="flex items-center gap-1 font-medium" style="color: var(--color-neutral-700);">
              <iconify-icon icon="material-symbols:payments" width="16" height="16" style="color: var(--color-success-600);"></iconify-icon>
              {totalLabel}
            </span>
            <span class="font-semibold text-base" style="color: var(--color-success-600);">₱{total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
          </div>
        </div>
      {:else if summaryMode === 'custom'}
        <!-- Custom summary from slot -->
        <slot name="summary"></slot>
      {/if}
    </div>
  {/if}
</div>
