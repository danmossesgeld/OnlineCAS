<script lang="ts">
  import FireTable from '$lib/components/FireTable.svelte';
  import ListButtons from '$lib/components/ListButtons.svelte';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { deleteDocFromCollection } from '$lib/utils/firestoreCrud';

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
    { label: 'Customer', key: 'customerName' },
    { label: 'Date', key: 'invoiceDate' },
    { label: 'Due Date', key: 'dueDate' },
    { label: 'Amount', key: 'totalDue' },
    { label: 'Status', key: 'status' },
    { label: 'Remarks', key: 'memo' }
  ];

  /**
   * Collection path configuration for sales invoices
   * Following the structure: transactions/customerCenter/salesInvoices
   */
  const rootCollection = 'transactions';
  const parentCollection = 'customerCenter';
  const subCollectionName = 'salesInvoices';

  /**
   * Function to confirm and handle invoice deletion
   */
  async function confirmDelete(docId: string) {
    if (confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      try {
        // Using the path string format with the collection path and document ID
        await deleteDocFromCollection(`${rootCollection}/${parentCollection}/${subCollectionName}`, docId);
        alert('Invoice deleted successfully.');
      } catch (error) {
        console.error('Error deleting invoice:', error);
        alert('Failed to delete invoice. Please try again.');
      }
    }
  }

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

<div class="flex flex-col h-full w-full p-0 sm:p-2 md:p-4 lg:p-6 bg-gray-50">
  <div class="bg-white rounded-xl shadow-sm p-4 sm:p-6 lg:p-8">
    <!-- Header section with title and buttons -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-gray-800 mb-1">Invoices</h1>
        <p class="text-gray-500">Manage and track all your customer invoices</p>
      </div>
      <div>
        <ListButtons {buttons} />
      </div>
    </div>
    
    <!-- Summary cards (reduced to 3 most important ones) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="flex items-center bg-blue-50 rounded-xl p-4 border-l-4 border-blue-500">
        <div class="bg-blue-100 rounded-full p-2 mr-4">
          <iconify-icon icon="material-symbols:description-outline-rounded" width="24" height="24" class="text-blue-600"></iconify-icon>
        </div>
        <div>
          <span class="text-2xl font-bold text-blue-800">{summaryCards[0].value}</span>
          <p class="text-sm text-blue-700">{summaryCards[0].label}</p>
        </div>
      </div>
      
      <div class="flex items-center bg-green-50 rounded-xl p-4 border-l-4 border-green-500">
        <div class="bg-green-100 rounded-full p-2 mr-4">
          <iconify-icon icon="material-symbols:task-alt-rounded" width="24" height="24" class="text-green-600"></iconify-icon>
        </div>
        <div>
          <span class="text-2xl font-bold text-green-800">{summaryCards[1].value}</span>
          <p class="text-sm text-green-700">{summaryCards[1].label}</p>
        </div>
      </div>
      
      <div class="flex items-center bg-amber-50 rounded-xl p-4 border-l-4 border-amber-500">
        <div class="bg-amber-100 rounded-full p-2 mr-4">
          <iconify-icon icon="material-symbols:warning-rounded" width="24" height="24" class="text-amber-600"></iconify-icon>
        </div>
        <div>
          <span class="text-2xl font-bold text-amber-800">{summaryCards[4].value}</span>
          <p class="text-sm text-amber-700">{summaryCards[4].label}</p>
        </div>
      </div>
    </div>
    
    <!-- Search and filter toolbar -->
    <div class="flex flex-col sm:flex-row gap-3 mb-6 items-start sm:items-center">
      <div class="relative w-full sm:w-1/2 md:w-1/3">
        <iconify-icon icon="material-symbols:search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" width="20" height="20"></iconify-icon>
        <input class="input input-bordered w-full pl-10 bg-gray-50 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Search invoices..." />
      </div>
      <select class="input input-bordered w-full sm:w-auto bg-gray-50 border-gray-300 text-gray-700">
        <option>All Statuses</option>
        <option>Posted</option>
        <option>Draft</option>
        <option>Pending</option>
        <option>Overdue</option>
      </select>
      <select class="input input-bordered w-full sm:w-auto bg-gray-50 border-gray-300 text-gray-700">
        <option>All Time</option>
        <option>This Month</option>
        <option>Last 30 Days</option>
        <option>This Year</option>
      </select>
    </div>
    
    <!-- Data table with improved styling -->
    <div class="rounded-lg overflow-hidden border border-gray-200">
      <FireTable 
        rootCollection={rootCollection} 
        parentCollection={parentCollection} 
        subCollectionName={subCollectionName} 
        {columns} 
        queryOptions={[]} 
      >
        <svelte:fragment slot="actions" let:row>
          <button 
            class="p-1 text-blue-600 hover:text-blue-800 transition-colors duration-150"
            on:click={() => goto(`/customerCenter/salesInvoice/form?id=${row.id}&viewMode=true`)}
            title="View Invoice"
            aria-label="View Invoice"
          >
            <iconify-icon icon="material-symbols:visibility-outline-rounded" width="18" height="18"></iconify-icon>
          </button>
          <button 
            class="p-1 text-green-600 hover:text-green-800 transition-colors duration-150"
            on:click={() => goto(`/customerCenter/salesInvoice/form?id=${row.id}`)}
            title="Edit Invoice"
            aria-label="Edit Invoice"
          >
            <iconify-icon icon="material-symbols:edit-outline-rounded" width="18" height="18"></iconify-icon>
          </button>
          <button 
            class="p-1 text-red-600 hover:text-red-800 transition-colors duration-150"
            on:click={() => confirmDelete(row.id)}
            title="Delete Invoice"
            aria-label="Delete Invoice"
          >
            <iconify-icon icon="material-symbols:delete-outline-rounded" width="18" height="18"></iconify-icon>
          </button>
        </svelte:fragment>
      </FireTable>
    </div>
  </div>
</div>