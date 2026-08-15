<script lang="ts">
  import FormLayout from '$lib/components/FormLayout.svelte';
  import { resetAllTransactions, type ResetSummary } from '$lib/utils/adminService';

  const CONFIRM_PHRASE = 'RESET TRANSACTIONS';

  const WIPED = [
    'Sales Invoices', 'Credit Memos', 'Receipts',
    'APVs', 'Vendor Payments', 'Receiving Reports',
    'Journal Entries', 'Fiscal Periods', 'Inventory Adjustments'
  ];
  const PRESERVED = ['Chart of Accounts', 'Customers / Vendors / Items / Others', 'Every Other List (Terms, Tax, Units, Cost Centers, ...)', 'Users'];

  let confirmText = '';
  let isResetting = false;
  let progress: ResetSummary[] = [];
  let done = false;
  let error = '';

  $: canReset = confirmText.trim() === CONFIRM_PHRASE && !isResetting;

  async function handleReset() {
    if (!canReset) return;
    if (!confirm('This permanently deletes every sales, purchase, and journal transaction. This cannot be undone. Continue?')) return;

    isResetting = true;
    done = false;
    error = '';
    progress = [];
    try {
      await resetAllTransactions((result) => {
        progress = [...progress, result];
      });
      done = true;
      confirmText = '';
    } catch (e) {
      error = 'Reset failed partway through: ' + (e as Error).message + '. Some collections listed below were already cleared before the failure.';
    } finally {
      isResetting = false;
    }
  }
</script>

<FormLayout title="Reset Transactions" backPath="/admin">
  <div class="max-w-2xl space-y-5">
    <div class="p-4 rounded-lg border" style="background: var(--color-error-50); border-color: var(--color-error-300);">
      <div class="flex items-start gap-2.5">
        <iconify-icon icon="material-symbols:warning-rounded" width="24" height="24" style="color: var(--color-error-600); flex-shrink: 0; margin-top: 2px;"></iconify-icon>
        <div>
          <p class="font-semibold" style="color: var(--color-error-800);">This permanently deletes real business data. There is no undo.</p>
          <p class="text-sm mt-1" style="color: var(--color-error-700);">Every document in the collections below is deleted directly from Firestore. There's no backup, trash, or recovery step anywhere in this app.</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <h3 class="text-sm font-semibold mb-2" style="color: var(--color-error-700);">Will be deleted</h3>
        <ul class="text-sm space-y-1" style="color: var(--color-neutral-700);">
          {#each WIPED as label}
            <li class="flex items-center gap-1.5">
              <iconify-icon icon="material-symbols:close-rounded" width="14" height="14" style="color: var(--color-error-500);"></iconify-icon>
              {label}
            </li>
          {/each}
        </ul>
      </div>
      <div>
        <h3 class="text-sm font-semibold mb-2" style="color: var(--color-success-700);">Preserved</h3>
        <ul class="text-sm space-y-1" style="color: var(--color-neutral-700);">
          {#each PRESERVED as label}
            <li class="flex items-center gap-1.5">
              <iconify-icon icon="material-symbols:check-rounded" width="14" height="14" style="color: var(--color-success-600);"></iconify-icon>
              {label}
            </li>
          {/each}
        </ul>
      </div>
    </div>

    {#if !isResetting && !done}
      <div class="p-4 rounded-lg border" style="border-color: var(--color-neutral-200);">
        <label for="confirm-phrase" class="block text-sm font-medium mb-1.5" style="color: var(--color-neutral-700);">
          Type <span class="font-mono font-semibold" style="color: var(--color-error-700);">{CONFIRM_PHRASE}</span> to enable the button below
        </label>
        <input
          id="confirm-phrase"
          type="text"
          class="w-full rounded border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
          style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-error-300);"
          bind:value={confirmText}
          autocomplete="off"
          spellcheck="false"
        />
        <button
          type="button"
          class="w-full mt-3 px-4 py-2.5 text-sm font-semibold text-white rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style="background: var(--color-error-600);"
          disabled={!canReset}
          on:click={handleReset}
        >
          Reset Transactions
        </button>
      </div>
    {/if}

    {#if isResetting || progress.length > 0}
      <div class="p-4 rounded-lg border" style="border-color: var(--color-neutral-200);">
        <h3 class="text-sm font-semibold mb-2" style="color: var(--color-neutral-700);">
          {isResetting ? 'Deleting...' : done ? 'Done' : 'Stopped'}
        </h3>
        <ul class="text-sm space-y-1" style="color: var(--color-neutral-600);">
          {#each progress as result}
            <li class="flex items-center justify-between">
              <span>{result.label}</span>
              <span class="font-mono">{result.deleted} deleted</span>
            </li>
          {/each}
        </ul>
        {#if isResetting}
          <p class="text-xs mt-2" style="color: var(--color-neutral-500);">Don't close this tab until this finishes.</p>
        {/if}
      </div>
    {/if}

    {#if error}
      <div class="text-sm px-4 py-3 rounded-lg" style="background: var(--color-error-50); color: var(--color-error-700);">{error}</div>
    {/if}

    {#if done}
      <div class="text-sm px-4 py-3 rounded-lg" style="background: var(--color-success-50); color: var(--color-success-700);">
        All transaction collections have been reset. Chart of Accounts, master/other lists, and users were left untouched.
      </div>
    {/if}
  </div>
</FormLayout>
