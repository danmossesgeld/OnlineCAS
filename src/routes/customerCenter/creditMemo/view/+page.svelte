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

<div class="container mx-auto py-6 px-4">
  <div class="mb-6 flex justify-between items-center">
    <h1 class="text-2xl font-semibold text-gray-800">Credit Memo View</h1>
    <div class="flex space-x-3">
      <button 
        class="px-4 py-2 bg-gray-100 text-gray-700 rounded shadow-sm hover:bg-gray-200 transition-colors flex items-center space-x-2"
        on:click={handleBack}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Back to List</span>
      </button>
      {#if creditMemoData && creditMemoData.status !== 'Posted'}
        <button 
          class="px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 transition-colors flex items-center space-x-2"
          on:click={handleEdit}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span>Edit</span>
        </button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="text-center py-10">
      <p class="text-gray-600">Loading credit memo data...</p>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 p-4 rounded-md">
      <p class="text-red-600">{error}</p>
      <button 
        class="mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded shadow-sm hover:bg-gray-200 transition-colors"
        on:click={handleBack}
      >
        Return to List
      </button>
    </div>
  {:else if creditMemoData}
    <div class="bg-white shadow-md rounded-lg overflow-hidden mb-6">
      <div class="p-6">
        <div class="grid grid-cols-2 gap-6">
          <div>
            <h2 class="text-lg font-semibold text-gray-700 mb-4">Credit Memo Information</h2>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600">CM No.:</span>
                <span class="font-medium text-gray-800">{creditMemoData.cmNo || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Date:</span>
                <span class="font-medium text-gray-800">{formatDate(creditMemoData.cmDate)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Customer:</span>
                <span class="font-medium text-gray-800">{creditMemoData.customerName || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Status:</span>
                <span class="font-medium text-gray-800">{creditMemoData.status || 'Draft'}</span>
              </div>
            </div>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-700 mb-4">Additional Information</h2>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600">Reference:</span>
                <span class="font-medium text-gray-800">{creditMemoData.reference || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Last Updated:</span>
                <span class="font-medium text-gray-800">{formatDate(creditMemoData.updatedAt || creditMemoData.createdAt)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Memo:</span>
                <span class="font-medium text-gray-800">{creditMemoData.memo || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Items Section -->
    <div class="bg-white shadow-md rounded-lg overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-700">Credit Memo Items</h2>
      </div>
      <div class="overflow-x-auto">
        {#if creditMemoData.items && creditMemoData.items.length > 0}
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Type</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each creditMemoData.items as item}
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {getItemLabel(item)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.description || '-'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                    {item.quantity}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {getUnitLabel(item)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {item.taxTypeName || getTaxTypeLabel(item.taxType)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">{formatCurrency(item.quantity * item.unitPrice)}</td>
                </tr>
              {/each}
            </tbody>
            <tfoot class="bg-gray-50">
              <tr>
                <td class="px-6 py-4 text-sm text-right font-medium text-gray-700" colspan="6">Subtotal:</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">{formatCurrency(creditMemoData.subtotal || 0)}</td>
              </tr>
              <tr>
                <td class="px-6 py-4 text-sm text-right font-medium text-gray-700" colspan="6">
                  {creditMemoData.taxRate ? `VAT (${creditMemoData.taxRate}%):` : 'VAT:'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                  {formatCurrency(creditMemoData.taxAmount && creditMemoData.taxAmount > 0 ? creditMemoData.taxAmount : computedVat)}
                </td>
              </tr>
              {#if creditMemoData.withholdingTax}
                <tr>
                  <td class="px-6 py-4 text-sm text-right font-medium text-gray-700" colspan="6">Less: Withholding Tax ({creditMemoData.withholdingTax}%):</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600 text-right">-{formatCurrency((creditMemoData.subtotal || 0) * (parseFloat(creditMemoData.withholdingTax) / 100))}</td>
                </tr>
              {/if}
              <tr>
                <td class="px-6 py-4 text-sm text-right font-medium text-gray-700" colspan="6">Total Amount:</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-right">{formatCurrency(creditMemoData.totalAmount && creditMemoData.totalAmount > 0 ? creditMemoData.totalAmount : computedTotal)}</td>
              </tr>
            </tfoot>
          </table>
        {:else}
          <div class="text-center py-8 text-gray-500">
            No items found.
          </div>
        {/if}
      </div>
    </div>

    <!-- Accounting Entries Section -->
    {#if accountingEntries && accountingEntries.length > 0}
      <div class="bg-white shadow-md rounded-lg overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-700">Accounting Entries</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each accountingEntries as entry}
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{entry.accountName}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{entry.lineDescription}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                    {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                    {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot class="bg-gray-50">
              <tr>
                <td class="px-6 py-4 text-sm font-medium text-gray-700" colspan="2">Totals:</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold">
                  {formatCurrency(accountingEntries.reduce((sum: number, entry: any) => sum + (entry.debit || 0), 0))}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-bold">
                  {formatCurrency(accountingEntries.reduce((sum: number, entry: any) => sum + (entry.credit || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>
