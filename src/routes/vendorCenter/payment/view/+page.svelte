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
    <h1 class="text-xl md:text-2xl font-semibold" style="color: var(--color-neutral-800);">Vendor Payment View</h1>
    <div class="ml-auto flex items-center gap-3">
      <button
        class="px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-white transition-colors"
        style="background: var(--color-primary-600);"
        on:click={handleEdit}
      >
        <iconify-icon icon="material-symbols:edit-outline-rounded" width="18" height="18"></iconify-icon>
        <span>Edit</span>
      </button>
    </div>
  </div>

  {#if loading}
    <div class="text-center py-10 text-sm" style="color: var(--color-neutral-500);">
      Loading payment data...
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
  {:else if paymentData}
    <div class="rounded-lg border p-4 sm:p-5" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200);">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h2 class="text-base font-semibold mb-3" style="color: var(--color-neutral-800);">Payment Information</h2>
          <div class="space-y-2.5 text-sm">
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Payment No.:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{paymentData.paymentNo || '-'}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Payment Date:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{formatDate(paymentData.paymentDate)}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Status:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{paymentData.status || 'Draft'}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Created At:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{formatDate(paymentData.createdAt)}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Updated At:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{formatDate(paymentData.updatedAt)}</span>
            </div>
          </div>
        </div>
        <div>
          <h2 class="text-base font-semibold mb-3" style="color: var(--color-neutral-800);">Vendor & Payment</h2>
          <div class="space-y-2.5 text-sm">
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Vendor:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{paymentData.vendorName || '-'}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Payment Method:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{paymentData.paymentMethodName || '-'}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Reference:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{paymentData.reference || '-'}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Amount:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{formatCurrency(paymentData.amount)}</span>
            </div>
            <div class="flex justify-between">
              <span style="color: var(--color-neutral-500);">Memo:</span>
              <span class="font-medium" style="color: var(--color-neutral-800);">{paymentData.memo || '-'}</span>
            </div>
          </div>
        </div>
      </div>

      <hr class="my-4" style="border-color: var(--color-neutral-200);" />

      <!-- Bill Payments Section -->
      <div>
        <h2 class="text-base font-semibold mb-3" style="color: var(--color-neutral-800);">Bill Payments</h2>
        <div class="overflow-x-auto">
          {#if paymentData.billPayments && paymentData.billPayments.length > 0}
            <table class="min-w-full text-sm">
              <thead>
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Bill No.</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Original Amount</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                {#each paymentData.billPayments as payment}
                  <tr>
                    <td class="px-3 py-2.5" style="color: var(--color-neutral-700); border-bottom: 1px solid var(--color-neutral-100);">{payment.billNo}</td>
                    <td class="px-3 py-2.5 text-right" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(payment.originalAmount)}</td>
                    <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-success-600); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(payment.amountPaid)}</td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td class="px-3 py-2.5 text-right font-medium" style="color: var(--color-neutral-700);" colspan="2">Total Amount Paid:</td>
                  <td class="px-3 py-2.5 text-right font-bold" style="color: var(--color-success-600);">
                    {formatCurrency(paymentData.billPayments.reduce((sum: number, payment: any) => sum + (payment.amountPaid || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          {:else}
            <div class="text-center py-8 text-sm" style="color: var(--color-neutral-500);">
              No bill payments found.
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
