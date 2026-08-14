<script lang="ts">
  import { onMount } from 'svelte';
  import { getDocFromCollection } from '$lib/utils/firestoreCrud';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';

  let loading = true;
  let creditMemoData: any = null;
  let error: string | null = null;
  let accountingEntries: any[] = [];
  let taxTypeOptions: { label: string; value: string; raw?: any }[] = [];
  let itemOptions: { label: string; value: string; raw?: any }[] = [];
  let unitOptions: { label: string; value: string; raw?: any }[] = [];

  // Load tax types (with raw to access rate) so we can resolve tax IDs/rates in view mode
  createFirestoreOptionsStore('tax', 'name', 'id', true).subscribe((opts) => (taxTypeOptions = opts));
  // Load items and units for resolving names from IDs
  createFirestoreOptionsStore('items', 'name', 'id', true).subscribe((opts) => (itemOptions = opts));
  createFirestoreOptionsStore('units', 'name', 'id', true).subscribe((opts) => (unitOptions = opts));

  function getTaxTypeLabel(taxType: any): string {
    if (!taxType) return '-';
    if (typeof taxType === 'object') return taxType.name ?? taxType.label ?? taxType.id ?? '-';
    if (taxType === 'vatable') return 'VAT';
    if (taxType === 'zero') return 'Zero-Rated';
    if (taxType === 'exempt') return 'Exempt';
    const found = taxTypeOptions.find((o) => String(o.value) === String(taxType));
    return found?.label || String(taxType);
  }

  function getTaxRateFromOptionId(taxTypeId: any): number {
    if (!taxTypeId) return 0;
    // Handle legacy string categories
    if (taxTypeId === 'vatable') return 0.12; // default 12% when only category stored
    if (taxTypeId === 'zero' || taxTypeId === 'exempt') return 0;
    const found = taxTypeOptions.find((opt) => String(opt.value) === String(taxTypeId));
    if (!found) return 0;
    const raw: any = (found as any).raw;
    if (raw && typeof raw.rate === 'number') return raw.rate;
    const match = found.label?.match(/(\d+(?:\.\d+)?)%?/);
    return match ? parseFloat(match[1]) / 100 : 0;
  }

  // Computed amounts for display when saved document lacks aggregated fields
  $: computedNetSales = creditMemoData?.items?.reduce((sum: number, i: any) => {
    const base = (i?.amount ?? ((i?.quantity || 0) * (i?.unitPrice || 0))) || 0;
    return sum + base;
  }, 0) || 0;

  $: computedVat = creditMemoData?.items?.reduce((sum: number, i: any) => {
    const base = (i?.amount ?? ((i?.quantity || 0) * (i?.unitPrice || 0))) || 0;
    const rate = getTaxRateFromOptionId(i?.taxType);
    return sum + base * rate;
  }, 0) || 0;

  $: withholdingRate = parseFloat(creditMemoData?.withholdingTax || '0') / 100;
  $: computedLessWithholding = computedNetSales * (withholdingRate || 0);
  $: computedTotal = computedNetSales + computedVat - computedLessWithholding;

  function getItemLabel(item: any): string {
    if (!item) return '-';
    if (item.itemName) return item.itemName;
    const val = typeof item.itemId === 'object' ? (item.itemId?.name ?? item.itemId?.label ?? item.itemId?.id) : item.itemId;
    if (!val) return '-';
    const found = itemOptions.find((o) => String(o.value) === String(val));
    return found?.label || String(val);
  }

  function getUnitLabel(item: any): string {
    if (!item) return '-';
    if (item.unitName) return item.unitName;
    const val = typeof item.unit === 'object' ? (item.unit?.name ?? item.unit?.label ?? item.unit?.id) : item.unit;
    if (!val) return '-';
    const found = unitOptions.find((o) => String(o.value) === String(val));
    return found?.label || String(val);
  }

  onMount(async () => {
    const id = $page.url.searchParams.get('id');
    if (!id) {
      error = 'Credit Memo ID is required';
      loading = false;
      return;
    }

    try {
      // Load the credit memo data
      creditMemoData = await getDocFromCollection('transactions/customerCenter/creditMemos', id);
      if (!creditMemoData) {
        throw new Error('Credit Memo not found');
      }

      // Load associated journal entries if they exist
      if (creditMemoData.journalEntryId) {
        const journalEntry = await getDocFromCollection('accounting/journalEntries', creditMemoData.journalEntryId);
        if (journalEntry && (journalEntry as any).lines) {
          accountingEntries = (journalEntry as any).lines;
        }
      }

      loading = false;
    } catch (e) {
      error = (e as Error).message;
      loading = false;
    }
  });

  function handleEdit() {
    goto(`/customerCenter/creditMemo/form?id=${creditMemoData.id}&mode=edit`);
  }

  function handleBack() {
    goto('/customerCenter/creditMemo/list');
  }
</script>

<div class="flex flex-col h-full w-full">
  <div class="flex items-center mb-4 gap-3">
    <button
      on:click={handleBack}
      class="flex items-center justify-center w-9 h-9 rounded-lg border transition-colors focus:outline-none focus:ring-2"
      style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-600);"
      aria-label="Back"
    >
      <iconify-icon icon="material-symbols:arrow-back-rounded" width="20" height="20"></iconify-icon>
    </button>
    <h1 class="text-xl md:text-2xl font-semibold" style="color: var(--color-neutral-800);">Credit Memo View</h1>
    <div class="ml-auto flex items-center gap-3">
      {#if creditMemoData && creditMemoData.status !== 'Posted'}
        <button
          class="px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-white transition-colors"
          style="background: var(--color-primary-600);"
          on:click={handleEdit}
        >
          <iconify-icon icon="material-symbols:edit-outline-rounded" width="18" height="18"></iconify-icon>
          <span>Edit</span>
        </button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="text-center py-10 text-sm" style="color: var(--color-neutral-500);">
      Loading credit memo data...
    </div>
  {:else if error}
    <div class="rounded-lg border p-4" style="background: color-mix(in srgb, var(--color-error-600) 8%, transparent); border-color: var(--color-error-600);">
      <p class="text-sm" style="color: var(--color-error-600);">{error}</p>
      <button
        class="mt-3 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors"
        style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700);"
        on:click={handleBack}
      >
        Return to List
      </button>
    </div>
  {:else if creditMemoData}
    <div class="rounded-lg border p-4 sm:p-5" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200);">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h2 class="text-base font-semibold mb-3" style="color: var(--color-neutral-800);">Credit Memo Information</h2>
          <div class="space-y-2.5 text-sm">
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">CM No.:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{creditMemoData.cmNo || '-'}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Date:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{formatDate(creditMemoData.cmDate)}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Customer:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{creditMemoData.customerName || '-'}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Status:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{creditMemoData.status || 'Draft'}</span>
            </div>
          </div>
        </div>
        <div>
          <h2 class="text-base font-semibold mb-3" style="color: var(--color-neutral-800);">Additional Information</h2>
          <div class="space-y-2.5 text-sm">
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Reference:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{creditMemoData.reference || '-'}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Last Updated:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{formatDate(creditMemoData.updatedAt || creditMemoData.createdAt)}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Memo:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{creditMemoData.memo || '-'}</span>
            </div>
          </div>
        </div>
      </div>

      <hr class="my-4" style="border-color: var(--color-neutral-200);" />

      <!-- Items Section -->
      <div>
        <h2 class="text-base font-semibold mb-3" style="color: var(--color-neutral-800);">Credit Memo Items</h2>
        <div class="overflow-x-auto">
          {#if creditMemoData.items && creditMemoData.items.length > 0}
            <table class="min-w-full text-sm">
              <thead>
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Item</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Quantity</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Unit</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Unit Price</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Tax Type</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Amount</th>
                </tr>
              </thead>
              <tbody>
                {#each creditMemoData.items as item}
                  <tr>
                    <td class="px-3 py-2.5" style="color: var(--color-neutral-700); border-bottom: 1px solid var(--color-neutral-100);">
                      {getItemLabel(item)}
                    </td>
                    <td class="px-3 py-2.5" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">{item.description || '-'}</td>
                    <td class="px-3 py-2.5 text-right" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                      {item.quantity}
                    </td>
                    <td class="px-3 py-2.5" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                      {getUnitLabel(item)}
                    </td>
                    <td class="px-3 py-2.5 text-right" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(item.unitPrice)}</td>
                    <td class="px-3 py-2.5" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                      {item.taxTypeName || getTaxTypeLabel(item.taxType)}
                    </td>
                    <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(item.quantity * item.unitPrice)}</td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-neutral-700); border-bottom: 1px solid var(--color-neutral-100);" colspan="6">Subtotal:</td>
                  <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(creditMemoData.subtotal || 0)}</td>
                </tr>
                <tr>
                  <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-neutral-700); border-bottom: 1px solid var(--color-neutral-100);" colspan="6">
                    {creditMemoData.taxRate ? `VAT (${creditMemoData.taxRate}%):` : 'VAT:'}
                  </td>
                  <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                    {formatCurrency(creditMemoData.taxAmount && creditMemoData.taxAmount > 0 ? creditMemoData.taxAmount : computedVat)}
                  </td>
                </tr>
                {#if creditMemoData.withholdingTax}
                  <tr>
                    <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-neutral-700); border-bottom: 1px solid var(--color-neutral-100);" colspan="6">Less: Withholding Tax ({creditMemoData.withholdingTax}%):</td>
                    <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-error-600); border-bottom: 1px solid var(--color-neutral-100);">-{formatCurrency((creditMemoData.subtotal || 0) * (parseFloat(creditMemoData.withholdingTax) / 100))}</td>
                  </tr>
                {/if}
                <tr>
                  <td class="px-3 py-2.5 text-right font-semibold" style="color: var(--color-neutral-800);" colspan="6">Total Amount:</td>
                  <td class="px-3 py-2.5 text-right font-bold" style="color: var(--color-neutral-800);">{formatCurrency(creditMemoData.totalAmount && creditMemoData.totalAmount > 0 ? creditMemoData.totalAmount : computedTotal)}</td>
                </tr>
              </tfoot>
            </table>
          {:else}
            <div class="text-center py-8 text-sm" style="color: var(--color-neutral-500);">
              No items found.
            </div>
          {/if}
        </div>
      </div>

      <!-- Accounting Entries Section -->
      {#if accountingEntries && accountingEntries.length > 0}
        <hr class="my-4" style="border-color: var(--color-neutral-200);" />
        <div>
          <h2 class="text-base font-semibold mb-3" style="color: var(--color-neutral-800);">Accounting Entries</h2>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Account</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Debit</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Credit</th>
                </tr>
              </thead>
              <tbody>
                {#each accountingEntries as entry}
                  <tr>
                    <td class="px-3 py-2.5" style="color: var(--color-neutral-700); border-bottom: 1px solid var(--color-neutral-100);">{entry.accountName}</td>
                    <td class="px-3 py-2.5" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">{entry.lineDescription}</td>
                    <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-success-600); border-bottom: 1px solid var(--color-neutral-100);">
                      {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                    </td>
                    <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-error-600); border-bottom: 1px solid var(--color-neutral-100);">
                      {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td class="px-3 py-2.5 font-medium" style="color: var(--color-neutral-700);" colspan="2">Totals:</td>
                  <td class="px-3 py-2.5 text-right font-bold" style="color: var(--color-success-600);">
                    {formatCurrency(accountingEntries.reduce((sum: number, entry: any) => sum + (entry.debit || 0), 0))}
                  </td>
                  <td class="px-3 py-2.5 text-right font-bold" style="color: var(--color-error-600);">
                    {formatCurrency(accountingEntries.reduce((sum: number, entry: any) => sum + (entry.credit || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
