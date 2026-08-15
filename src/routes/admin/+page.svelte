<script lang="ts">
// No logic needed for landing page
</script>

<div class="flex flex-col items-center justify-center min-h-[60vh] gap-8">
  <h1 class="text-3xl font-bold mb-4">Admin Tools</h1>
  <div class="grid grid-cols-1 gap-6 w-full max-w-xl">
    <a href="/admin/users" class="btn btn-outline flex items-center gap-3 text-lg justify-start">
      <iconify-icon icon="material-symbols:manage-accounts-rounded" width="28" height="28"></iconify-icon>
      User Management
    </a>
    <a href="/admin/resetTransactions" class="btn btn-outline flex items-center gap-3 text-lg justify-start" style="border-color: var(--color-error-300); color: var(--color-error-700);">
      <iconify-icon icon="material-symbols:warning-rounded" width="28" height="28"></iconify-icon>
      Reset Transactions
    </a>
  </div>
</div>
