<script lang="ts">
  import { user } from '../../lib/user';
</script>

<div class="p-8 space-y-6">
  <h1 class="text-3xl font-bold mb-4">Welcome{#if $user}, {$user.email}{/if}!</h1>
  <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
    <div class="flex items-center card bg-white shadow-lg rounded-xl p-4 border border-gray-100">
      <iconify-icon icon="material-symbols:account-balance-wallet" width="32" height="32" class="text-[#ff7300] mr-3"></iconify-icon>
      <div>
        <span class="block font-bold text-gray-700">Cash</span>
        <span class="text-xl font-mono text-gray-900">₱0</span>
      </div>
    </div>
    <div class="flex items-center card bg-white shadow-lg rounded-xl p-4 border border-gray-100">
      <iconify-icon icon="material-symbols:trending-up" width="32" height="32" class="text-[#ff7300] mr-3"></iconify-icon>
      <div>
        <span class="block font-bold text-gray-700">Earnings</span>
        <span class="text-xl font-mono text-gray-900">₱0</span>
      </div>
    </div>
    <div class="flex items-center card bg-white shadow-lg rounded-xl p-4 border border-gray-100">
      <iconify-icon icon="material-symbols:shopping-cart" width="32" height="32" class="text-[#ff7300] mr-3"></iconify-icon>
      <div>
        <span class="block font-bold text-gray-700">Sales</span>
        <span class="text-xl font-mono text-gray-900">₱0</span>
      </div>
    </div>
    <div class="flex items-center card bg-white shadow-lg rounded-xl p-4 border border-gray-100">
      <iconify-icon icon="material-symbols:shopping-bag" width="32" height="32" class="text-[#ff7300] mr-3"></iconify-icon>
      <div>
        <span class="block font-bold text-gray-700">Purchases</span>
        <span class="text-xl font-mono text-gray-900">₱0</span>
      </div>
    </div>
    <div class="flex items-center card bg-white shadow-lg rounded-xl p-4 border border-gray-100">
      <iconify-icon icon="material-symbols:credit-card" width="32" height="32" class="text-[#ff7300] mr-3"></iconify-icon>
      <div>
        <span class="block font-bold text-gray-700">Payables</span>
        <span class="text-xl font-mono text-gray-900">₱0</span>
      </div>
    </div>
    <div class="flex items-center card bg-white shadow-lg rounded-xl p-4 border border-gray-100">
      <iconify-icon icon="material-symbols:account-balance" width="32" height="32" class="text-[#ff7300] mr-3"></iconify-icon>
      <div>
        <span class="block font-bold text-gray-700">Receivables</span>
        <span class="text-xl font-mono text-gray-900">₱0</span>
      </div>
    </div>
  </div>
  <div class="card bg-white shadow-xl p-8 rounded-2xl mt-6 border border-gray-100">
    <h2 class="text-xl font-semibold mb-2">Financial Statement Overview</h2>
    <div class="h-64 flex items-center justify-center text-base-content/50">
      [Chart Placeholder]
    </div>
  </div>
</div> 