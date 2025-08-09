<script lang="ts">
  import { onMount } from 'svelte';
  import { getDocFromCollection } from '$lib/utils/firestoreCrud';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let loading = true;
  let paymentData: any = null;
  let error: string | null = null;

  onMount(async () => {
    const id = $page.url.searchParams.get('id');
    if (!id) {
      error = 'Payment ID is required';
      loading = false;
      return;
    }

    try {
      paymentData = await getDocFromCollection('transactions/vendorCenter/payments', id);
      if (!paymentData) {
        throw new Error('Payment not found');
      }
      loading = false;
    } catch (e) {
      error = (e as Error).message;
      loading = false;
    }
  });

  function handleEdit() {
    goto(`/vendorCenter/payment/form?id=${paymentData.id}&mode=edit`);
  }

  function handleBack() {
    goto('/vendorCenter/payment/list');
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
</script>

<div class="container mx-auto py-6 px-4">
  <div class="mb-6 flex justify-between items-center">
    <h1 class="text-2xl font-semibold text-gray-800">Vendor Payment View</h1>
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
      <p class="text-gray-600">Loading payment data...</p>
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
  {:else if paymentData}
    <div class="bg-white shadow-md rounded-lg overflow-hidden mb-6">
      <div class="p-6">
        <div class="grid grid-cols-2 gap-6">
          <div>
            <h2 class="text-lg font-semibold text-gray-700 mb-4">Payment Information</h2>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600">Payment No.:</span>
                <span class="font-medium text-gray-800">{paymentData.paymentNo || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Payment Date:</span>
                <span class="font-medium text-gray-800">{formatDate(paymentData.paymentDate)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Status:</span>
                <span class="font-medium text-gray-800">{paymentData.status || 'Draft'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Created At:</span>
                <span class="font-medium text-gray-800">{formatDate(paymentData.createdAt)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Updated At:</span>
                <span class="font-medium text-gray-800">{formatDate(paymentData.updatedAt)}</span>
              </div>
            </div>
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-700 mb-4">Vendor & Payment</h2>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600">Vendor:</span>
                <span class="font-medium text-gray-800">{paymentData.vendorName || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Payment Method:</span>
                <span class="font-medium text-gray-800">{paymentData.paymentMethodName || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Reference:</span>
                <span class="font-medium text-gray-800">{paymentData.reference || '-'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Amount:</span>
                <span class="font-medium text-gray-800">{formatCurrency(paymentData.amount)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600">Memo:</span>
                <span class="font-medium text-gray-800">{paymentData.memo || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bill Payments Section -->
    <div class="bg-white shadow-md rounded-lg overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-700">Bill Payments</h2>
      </div>
      <div class="overflow-x-auto">
        {#if paymentData.billPayments && paymentData.billPayments.length > 0}
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bill No.</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Amount</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Paid</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#each paymentData.billPayments as payment}
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{payment.billNo}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{formatCurrency(payment.originalAmount)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">{formatCurrency(payment.amountPaid)}</td>
                </tr>
              {/each}
            </tbody>
            <tfoot class="bg-gray-50">
              <tr>
                <td class="px-6 py-4 text-sm text-right font-medium text-gray-700" colspan="2">Total Amount Paid:</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-bold">
                  {formatCurrency(paymentData.billPayments.reduce((sum: number, payment: any) => sum + (payment.amountPaid || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        {:else}
          <div class="text-center py-8 text-gray-500">
            No bill payments found.
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
