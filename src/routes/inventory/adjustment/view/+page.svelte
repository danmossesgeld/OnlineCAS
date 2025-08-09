<script lang="ts">
  import { onMount } from 'svelte';
  import { getDocFromCollection } from '$lib/utils/firestoreCrud';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let loading = true;
  let adjustmentData: any = null;
  let error: string | null = null;
  let accountingEntries: any[] = [];

  onMount(async () => {
    const id = $page.url.searchParams.get('id');
    if (!id) {
      error = 'Adjustment ID is required';
      loading = false;
      return;
    }

    try {
      // Load the adjustment data
      adjustmentData = await getDocFromCollection('inventory/adjustments', id);
      if (!adjustmentData) {
        throw new Error('Inventory adjustment not found');
      }
      
      // Load associated journal entries if they exist
      if (adjustmentData.journalEntryId) {
        const journalEntry = await getDocFromCollection('accounting/journalEntries', adjustmentData.journalEntryId);
        if (journalEntry && journalEntry.lines) {
          accountingEntries = journalEntry.lines;
        }
      }
      
      loading = false;
    } catch (e) {
      error = (e as Error).message;
      loading = false;
    }
  });

  function handleEdit() {
    goto(`/inventory/adjustment/form?id=${adjustmentData.id}&mode=edit`);
  }

  function handleBack() {
    goto('/inventory/adjustment/list');
  }

  // Format Firestore timestamp to a readable date
  function formatDate(timestamp: any): string {
    if (!timestamp) return '-';
    
    if (timestamp instanceof Date) {
      return timestamp.toLocaleDateString();
    }
    
    if (timestamp && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleDateString();
    }
    
    return '-';
  }

  // Format currency value
  function formatCurrency(value: number): string {
    return value ? value.toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) : '₱0.00';
  }

  // Format quantity with appropriate decimal places
  function formatQuantity(value: number): string {
    return value ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  }
  
  // Get adjustment type label
  function getAdjustmentTypeLabel(type: string): string {
    const types = {
      'increase': 'Quantity Increase',
      'decrease': 'Quantity Decrease',
      'writeoff': 'Write Off',
      'revaluation': 'Revaluation'
    };
    return types[type as keyof typeof types] || type;
  }
</script>

<div class="container mx-auto py-6 px-4">
  <div class="mb-6 flex justify-between items-center">
    <h1 class="text-2xl font-semibold text-gray-800">Inventory Adjustment View</h1>
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
      <button 
        class="px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 transition-colors flex items-center space-x-2"
        on:click={handleEdit}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span>Edit</span>
      </button>
    </div>
  </div>

  {#if loading}
    <div class="text-center py-10">
      <p class="text-gray-600">Loading adjustment data...</p>
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
  {:else if adjustmentData}
    <div class="bg-white shadow-md rounded-lg overflow-hidden mb-6">
      <div class="p-6">
        <div class="grid grid-cols-2 gap-6">
          <div>
            <h2 class="text-lg font-semibold text-gray-700 mb-4">Adjustment Information</h2>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600">Adjustment No.:</span>
                <span class="font-medium text-gray-800">{adjustmentData.adjustmentNo || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Date:</span>
                <span class="font-medium text-gray-800">{formatDate(adjustmentData.adjustmentDate)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Type:</span>
                <span class="font-medium text-gray-800">{getAdjustmentTypeLabel(adjustmentData.adjustmentType)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Status:</span>
                <span class="font-medium text-gray-800">{adjustmentData.status || 'Draft'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Reference:</span>
                <span class="font-medium text-gray-800">{adjustmentData.reference || '-'}</span>
              </div>
            </div>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-700 mb-4">Additional Information</h2>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600">Location:</span>
                <span class="font-medium text-gray-800">{adjustmentData.locationName || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Reason:</span>
                <span class="font-medium text-gray-800">{adjustmentData.reason || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Created At:</span>
                <span class="font-medium text-gray-800">{formatDate(adjustmentData.createdAt)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Updated At:</span>
                <span class="font-medium text-gray-800">{formatDate(adjustmentData.updatedAt)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Memo:</span>
                <span class="font-medium text-gray-800">{adjustmentData.memo || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Adjustment Items Section -->
    <div class="bg-white shadow-md rounded-lg overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-700">Adjustment Items</h2>
      </div>
      <div class="overflow-x-auto">
        {#if adjustmentData.items && adjustmentData.items.length > 0}
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Previous Qty</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">New Qty</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Adjustment Qty</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Cost</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each adjustmentData.items as item}
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.itemName || '-'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.description || '-'}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatQuantity(item.previousQty)} {item.unitName || ''}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatQuantity(item.newQty)} {item.unitName || ''}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    <span class="{item.adjustmentQty > 0 ? 'text-green-600' : 'text-red-600'}">
                      {item.adjustmentQty > 0 ? '+' : ''}{formatQuantity(item.adjustmentQty)} {item.unitName || ''}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatCurrency(item.unitCost)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <span class="{item.adjustmentQty * item.unitCost >= 0 ? 'text-green-600' : 'text-red-600'}">
                      {formatCurrency(item.adjustmentQty * item.unitCost)}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot class="bg-gray-50">
              <tr>
                <td class="px-6 py-4 text-sm text-right font-medium text-gray-700" colspan="6">Total Adjustment Value:</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold">
                  {#if adjustmentData.items && adjustmentData.items.length > 0}
                    <span class="{adjustmentData.totalAmount >= 0 ? 'text-green-600' : 'text-red-600'}">
                      {formatCurrency(adjustmentData.items.reduce((sum: number, item: any) => sum + (item.adjustmentQty * item.unitCost || 0), 0))}
                    </span>
                  {:else}
                    {formatCurrency(0)}
                  {/if}
                </td>
              </tr>
            </tfoot>
          </table>
        {:else}
          <div class="text-center py-8 text-gray-500">
            No adjustment items found.
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
