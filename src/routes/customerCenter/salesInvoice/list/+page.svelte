<script lang="ts">
  import FireTable from '$lib/components/FireTable.svelte';
  import ListButtons from '$lib/components/ListButtons.svelte';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // Placeholder summary data
  let summaryCards = [
    { label: 'Total Invoices', value: 26, sub: 'All invoices', icon: 'material-symbols:description-outline-rounded' },
    { label: 'Posted', value: 26, sub: '100% of total', icon: 'material-symbols:task-alt-rounded' },
    { label: 'Draft', value: 0, sub: '0% of total', icon: 'material-symbols:edit-document-rounded' },
    { label: 'Pending', value: 0, sub: 'Awaiting payment', icon: 'material-symbols:hourglass-empty-rounded' },
    { label: 'Overdue', value: 0, sub: 'Past due date', icon: 'material-symbols:warning-rounded' }
  ];

  const columns = [
    { label: 'Invoice #', key: 'invoiceNo' },
    { label: 'Customer', key: 'customer' },
    { label: 'Date', key: 'date' },
    { label: 'Due Date', key: 'dueDate' },
    { label: 'Amount', key: 'amount' },
    { label: 'Status', key: 'status' },
    { label: 'Remarks', key: 'remarks' }
  ];

  let collectionPath = 'invoices';

  const buttons = [
    {
      label: 'New Invoice',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => goto('/customerCenter/salesInvoice/form')
    },
    {
      label: 'Export',
      color: 'outline',
      icon: 'material-symbols:download',
      onClick: () => {/* export logic here */}
    }
  ];
</script>

<div class="bg-white rounded-2xl shadow-xl p-8">
  <h1 class="text-2xl font-bold mb-2">Invoices</h1>
  <p class="mb-6 text-gray-500">Manage and track all your customer invoices</p>
  <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
    {#each summaryCards as card}
      <div class="flex flex-col items-center justify-center bg-gray-50 rounded-xl p-4">
        <iconify-icon icon={card.icon} width="28" height="28" class="mb-2 text-[#8B1F3B]" />
        <span class="text-2xl font-bold">{card.value}</span>
        <span class="text-xs text-gray-500">{card.label}</span>
        <span class="text-xs text-gray-400">{card.sub}</span>
      </div>
    {/each}
  </div>
  <div class="flex flex-col md:flex-row gap-2 mb-4 items-center">
    <input class="input input-bordered w-full md:w-1/3" placeholder="Search invoices..." />
    <select class="input input-bordered w-full md:w-1/6">
      <option>All Statuses</option>
      <option>Posted</option>
      <option>Draft</option>
      <option>Pending</option>
      <option>Overdue</option>
    </select>
    <select class="input input-bordered w-full md:w-1/6">
      <option>All Time</option>
      <option>This Month</option>
      <option>This Year</option>
    </select>
    <div class="ml-auto">
      <ListButtons {buttons} />
    </div>
  </div>
  <FireTable {collectionPath} {columns} queryOptions={[]} />
</div> 