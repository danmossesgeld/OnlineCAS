<script context="module" lang="ts">
  export type ListButton = {
    label: string;
    color?: string; // e.g. 'primary', 'secondary', 'accent', 'ghost', 'outline', or custom
    icon?: string; // iconify icon name
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    class?: string;
    disabled?: boolean;
    variant?: 'filled' | 'outline' | 'soft' | 'ghost';
  };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import FireTable from '$lib/components/FireTable.svelte';
  import { deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
  import { app } from '$lib/utils/firebase';

  // Props for collection path
  export let rootCollection: string;
  export let parentCollection: string;
  export let subCollectionName: string;
  
  // Props for document type and configuration
  export let documentType: 'invoice' | 'apv' | 'journal' | 'payment' | 'receipt' | 'creditMemo' | string = 'document';
  export let statusField: string = 'status';
  export let dueDateField: string = 'dueDate';
  export let isPaidField: string = 'isPaid';
  
  // Props for display customization
  export let title: string;
  export let subtitle: string = `Manage and track all your ${documentType}s`;
  export let primaryColorClass: string = 'blue';
  export let secondaryColorClass: string = 'green';
  export let tertiaryColorClass: string = 'amber';
  export let totalLabel: string = `Total ${documentType[0].toUpperCase() + documentType.slice(1)}s`;
  export let postedLabel: string = 'Posted';
  export let draftLabel: string = 'Draft';
  export let pendingLabel: string = 'Pending';
  export let overdueLabel: string = 'Overdue';
  
  // Props for search and filter
  export let searchPlaceholder: string = `Search ${documentType}s...`;
  export let showStatusFilter: boolean = true;
  export let showDateFilter: boolean = true;
  export let customFilters: Array<{label: string, options: Array<{value: string, label: string}>}> = [];
  
  // Props for buttons
  export let buttons: ListButton[] = [];
  export let defaultButtons: boolean = true;
  export let newButtonPath: string = '';
  export let viewButtonPath: string = '';
  export let editButtonPath: string = '';
  export let allowDelete: boolean = true;
  
  // Props for columns
  export let columns: Array<{label: string, key: string}> = [];
  export let queryOptions: any[] = [];

  // State variables for summary cards
  let totalCount = 0;
  let postedCount = 0;
  let draftCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let isLoading = true;
  
  // Search and filter state variables
  let searchTerm = '';
  let statusFilter = 'All Statuses';
  let dateFilter = 'All Time';
  let filteredQueryOptions = [...queryOptions];
  
  // Date range calculation for date filter
  const getDateRange = (filter: string) => {
    const now = new Date();
    const start = new Date();
    
    switch(filter) {
      case 'This Month':
        start.setDate(1); // First day of current month
        start.setHours(0, 0, 0, 0);
        return { start, end: now };
      case 'Last 30 Days':
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        return { start, end: now };
      case 'This Year':
        start.setMonth(0, 1); // January 1st of current year
        start.setHours(0, 0, 0, 0);
        return { start, end: now };
      default: // 'All Time'
        return null;
    }
  };
  
  // Define the summary card type
  type SummaryCard = {
    label: string;
    value: number | string;
    sub: string;
    icon: string;
    colorClass: string;
  };
  
  // Initialize summary cards
  let summaryCards: SummaryCard[] = [
    { 
      label: totalLabel, 
      value: 0, 
      sub: `All ${documentType}s`, 
      icon: 'material-symbols:description-outline-rounded',
      colorClass: primaryColorClass
    },
    { 
      label: postedLabel, 
      value: 0, 
      sub: '0% of total', 
      icon: 'material-symbols:task-alt-rounded',
      colorClass: secondaryColorClass
    },
    { 
      label: draftLabel, 
      value: 0, 
      sub: '0% of total', 
      icon: 'material-symbols:edit-document-rounded',
      colorClass: tertiaryColorClass
    }
  ];
  
  // Include pending and overdue cards if appropriate for the document type
  if (documentType === 'invoice' || documentType === 'apv' || documentType === 'receipt' || documentType === 'payment') {
    summaryCards.push(
      { 
        label: pendingLabel, 
        value: 0, 
        sub: 'Awaiting payment', 
        icon: 'material-symbols:hourglass-empty-rounded',
        colorClass: 'yellow'
      },
      { 
        label: overdueLabel, 
        value: 0, 
        sub: 'Past due date', 
        icon: 'material-symbols:warning-rounded',
        colorClass: 'red'
      }
    );
  }
  
  // Update summary cards whenever counts change
  $: {
    if (isLoading) {
      // Display loading state
      summaryCards = summaryCards.map(card => ({
        ...card,
        value: '--',
        sub: card.label === postedLabel || card.label === draftLabel ? 'Loading...' : card.sub
      }));
    } else {
      // Update with actual values
      // Total count
      if (summaryCards[0]) {
        summaryCards[0].value = totalCount;
      }
      
      // Posted count
      if (summaryCards[1]) {
        summaryCards[1].value = postedCount;
        summaryCards[1].sub = `${totalCount ? Math.round((postedCount / totalCount) * 100) : 0}% of total`;
      }
      
      // Draft count
      if (summaryCards[2]) {
        summaryCards[2].value = draftCount;
        summaryCards[2].sub = `${totalCount ? Math.round((draftCount / totalCount) * 100) : 0}% of total`;
      }
      
      // Pending count (if applicable)
      if (summaryCards[3]) {
        summaryCards[3].value = pendingCount;
      }
      
      // Overdue count (if applicable)
      if (summaryCards[4]) {
        summaryCards[4].value = overdueCount;
      }
    }
  }
  
  // Load summary data on mount
  onMount(async () => {
    await loadSummaryData();
  });
  
  // Function to load summary counts
  async function loadSummaryData() {
    isLoading = true;
    try {
      const db = getFirestore(app);
      const collRef = collection(db, rootCollection, parentCollection, subCollectionName);
      
      // Get total count
      const totalQuery = query(collRef);
      const totalSnapshot = await getDocs(totalQuery);
      totalCount = totalSnapshot.size;
      
      // Count posted documents
      const postedQuery = query(collRef, where(statusField, '==', 'posted'));
      const postedSnapshot = await getDocs(postedQuery);
      postedCount = postedSnapshot.size;
      
      // Count draft documents
      const draftQuery = query(collRef, where(statusField, '==', 'draft'));
      const draftSnapshot = await getDocs(draftQuery);
      draftCount = draftSnapshot.size;
      
      // If this is an invoice or APV type document that has pending/overdue states
      if ((documentType === 'invoice' || documentType === 'apv' || documentType === 'receipt' || documentType === 'payment') && summaryCards.length > 3) {
        // Count pending documents (posted but not paid)
        const pendingQuery = query(collRef, where(statusField, '==', 'posted'), where(isPaidField, '==', false));
        const pendingSnapshot = await getDocs(pendingQuery);
        pendingCount = pendingSnapshot.size;
        
        // Count overdue documents (current date > due date)
        const now = new Date();
        let overdue = 0;
        
        // We need to manually check for overdue status since Firestore can't do date comparisons
        totalSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data[dueDateField] && data[statusField] === 'posted' && !data[isPaidField]) {
            const dueDate = data[dueDateField].toDate ? data[dueDateField].toDate() : new Date(data[dueDateField]);
            if (dueDate < now) {
              overdue++;
            }
          }
        });
        
        overdueCount = overdue;
      }
    } catch (error) {
      console.error(`Error loading ${documentType} summary data:`, error);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Function to confirm and handle document deletion
   */
  async function confirmDelete(docId: string) {
    if (confirm(`Are you sure you want to delete this ${documentType}? This action cannot be undone.`)) {
      try {
        // Using the path string format with the collection path and document ID
        await deleteDocFromCollection(`${rootCollection}/${parentCollection}/${subCollectionName}`, docId);
        alert(`${documentType[0].toUpperCase() + documentType.slice(1)} deleted successfully.`);
        // Refresh summary data after deletion
        await loadSummaryData();
      } catch (error) {
        console.error(`Error deleting ${documentType}:`, error);
        alert(`Failed to delete ${documentType}. Please try again.`);
      }
    }
  }

  // Generate default buttons if needed
  $: {
    if (defaultButtons && buttons.length === 0 && newButtonPath) {
      buttons = [
        {
          label: `New ${documentType[0].toUpperCase() + documentType.slice(1)}`,
          color: 'primary',
          icon: 'material-symbols:add',
          variant: 'filled',
          onClick: () => goto(newButtonPath)
        },
        {
          label: 'Export',
          color: 'secondary',
          icon: 'material-symbols:download',
          variant: 'soft',
          onClick: () => {/* export logic here */}
        }
      ];
    }
  }
  
  // Update query options when search or filter changes
  $: {
    // Start with base query options
    let baseOptions = [...queryOptions];
    const updatedOptions = [];
    
    // Apply status filter if not 'All Statuses'
    if (statusFilter && statusFilter !== 'All Statuses') {
      // Convert UI friendly status to database format
      const dbStatus = statusFilter.toLowerCase();
      updatedOptions.push(where(statusField, '==', dbStatus));
    }
    
    // Apply date filter if not 'All Time'
    if (dateFilter && dateFilter !== 'All Time') {
      const dateRange = getDateRange(dateFilter);
      if (dateRange) {
        // Find date field (transaction date, posting date, etc.)
        const dateField = columns.find(col => 
          col.key.toLowerCase().includes('date') && 
          !col.key.toLowerCase().includes('due'))?.key || 'date';
          
        updatedOptions.push(where(dateField, '>=', dateRange.start));
        updatedOptions.push(where(dateField, '<=', dateRange.end));
      }
    }
    
    // Apply search term if not empty
    if (searchTerm && searchTerm.trim() !== '') {
      // Find searchable columns (typically document number, reference, or customer/vendor name)
      const searchableColumns = columns
        .filter(col => [
          'number', 'reference', 'name', 'customer', 'vendor', 'description'
        ].some(searchField => col.key.toLowerCase().includes(searchField)))
        .map(col => col.key);
        
      if (searchableColumns.length > 0) {
        updatedOptions.push(where(searchableColumns[0], '>=', searchTerm));
        updatedOptions.push(where(searchableColumns[0], '<=', searchTerm + '\uf8ff'));
        updatedOptions.push(orderBy(searchableColumns[0]));
      }
    }
    
    filteredQueryOptions = updatedOptions.length > 0 ? updatedOptions : baseOptions;
  }
</script>

<div class="flex flex-col h-full w-full p-0 sm:p-2 md:p-4 lg:p-6 bg-gray-50">
  <div class="bg-white rounded-xl shadow-sm p-4 sm:p-6 lg:p-8">
    <!-- Header section with title and buttons -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-gray-800 mb-1">{title}</h1>
        <p class="text-gray-500">{subtitle}</p>
      </div>
      <div>
        <!-- Modernized button styling -->
        <div class="flex flex-wrap gap-3 justify-end">
          {#each buttons as btn}
            {@const variant = btn.variant || 'filled'}
            {@const colorClass = btn.color || 'primary'}
            <button
              class={`
                ${variant === 'filled' && colorClass === 'primary' ? 'bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white' : ''}
                ${variant === 'filled' && colorClass === 'secondary' ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white' : ''}
                ${variant === 'filled' && colorClass === 'accent' ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-white' : ''}
                ${variant === 'filled' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'bg-gray-700 hover:bg-gray-800 text-white' : ''}
                
                ${variant === 'outline' && colorClass === 'primary' ? 'bg-transparent border-2 border-indigo-500 text-indigo-600 hover:bg-indigo-50' : ''}
                ${variant === 'outline' && colorClass === 'secondary' ? 'bg-transparent border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50' : ''}
                ${variant === 'outline' && colorClass === 'accent' ? 'bg-transparent border-2 border-amber-500 text-amber-600 hover:bg-amber-50' : ''}
                ${variant === 'outline' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'bg-transparent border-2 border-gray-400 text-gray-700 hover:bg-gray-50' : ''}
                
                ${variant === 'soft' && colorClass === 'primary' ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-200' : ''}
                ${variant === 'soft' && colorClass === 'secondary' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200' : ''}
                ${variant === 'soft' && colorClass === 'accent' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200' : ''}
                ${variant === 'soft' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200' : ''}
                
                ${variant === 'ghost' && colorClass === 'primary' ? 'bg-transparent text-indigo-600 hover:bg-indigo-50' : ''}
                ${variant === 'ghost' && colorClass === 'secondary' ? 'bg-transparent text-emerald-600 hover:bg-emerald-50' : ''}
                ${variant === 'ghost' && colorClass === 'accent' ? 'bg-transparent text-amber-600 hover:bg-amber-50' : ''}
                ${variant === 'ghost' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'bg-transparent text-gray-700 hover:bg-gray-50' : ''}
                
                px-4 py-2.5 rounded-lg font-medium flex items-center gap-2.5 
                transition-all duration-200 ease-in-out 
                shadow-sm hover:shadow-md 
                focus:outline-none focus:ring-2 focus:ring-opacity-50 
                ${colorClass === 'primary' ? 'focus:ring-indigo-300' : ''}
                ${colorClass === 'secondary' ? 'focus:ring-emerald-300' : ''}
                ${colorClass === 'accent' ? 'focus:ring-amber-300' : ''}
                ${!['primary', 'secondary', 'accent'].includes(colorClass) ? 'focus:ring-gray-300' : ''}
                ${btn.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} 
                ${btn.class ?? ''}
              `}
              type={btn.type ?? 'button'}
              disabled={btn.disabled}
              on:click={btn.onClick}
            >
              {#if btn.icon}
                <iconify-icon 
                  icon={btn.icon} 
                  width="20" 
                  height="20" 
                  class={`
                    ${variant === 'filled' ? 'text-white' : ''}
                    ${variant === 'outline' && colorClass === 'primary' ? 'text-indigo-600' : ''}
                    ${variant === 'outline' && colorClass === 'secondary' ? 'text-emerald-600' : ''}
                    ${variant === 'outline' && colorClass === 'accent' ? 'text-amber-600' : ''}
                    ${variant === 'outline' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'text-gray-600' : ''}
                    ${variant === 'soft' && colorClass === 'primary' ? 'text-indigo-600' : ''}
                    ${variant === 'soft' && colorClass === 'secondary' ? 'text-emerald-600' : ''}
                    ${variant === 'soft' && colorClass === 'accent' ? 'text-amber-600' : ''}
                    ${variant === 'soft' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'text-gray-600' : ''}
                    ${variant === 'ghost' && colorClass === 'primary' ? 'text-indigo-600' : ''}
                    ${variant === 'ghost' && colorClass === 'secondary' ? 'text-emerald-600' : ''}
                    ${variant === 'ghost' && colorClass === 'accent' ? 'text-amber-600' : ''}
                    ${variant === 'ghost' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'text-gray-600' : ''}
                  `}
                ></iconify-icon>
              {/if}
              {btn.label}
            </button>
          {/each}
        </div>
      </div>
    </div>
    
    <!-- Directly include DocumentSummary functionality -->
    <div class="w-full mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {#each summaryCards as card, i}
          <div class="flex flex-col p-4 border-l-4 rounded-lg border-{card.colorClass}-500 bg-{card.colorClass}-50">
            <div class="flex items-center mb-1">
              <iconify-icon icon={card.icon} width="20" height="20" class="text-{card.colorClass}-600 mr-2"></iconify-icon>
              <span class="text-sm font-medium text-{card.colorClass}-700">{card.label}</span>
            </div>
            <div class="mt-1">
              <span class="text-xl font-bold text-{card.colorClass}-800">{card.value}</span>
            </div>
            {#if card.sub}
              <p class="text-xs text-{card.colorClass}-600 mt-1">{card.sub}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
    
    <!-- Search and filter toolbar -->
    <div class="flex flex-col sm:flex-row gap-3 mb-6 items-start sm:items-center">
      <div class="relative w-full sm:w-1/2 md:w-1/3">
        <iconify-icon icon="material-symbols:search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-400" width="20" height="20"></iconify-icon>
        <input 
          class="w-full pl-10 py-2.5 rounded-lg border border-gray-300 bg-white shadow-sm
                 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none
                 transition-all duration-200" 
          placeholder={searchPlaceholder}
          bind:value={searchTerm}
        />
      </div>
      
      {#if showStatusFilter}
      <select 
        class="w-full sm:w-auto py-2.5 px-3 rounded-lg border border-gray-300 bg-white shadow-sm
                   focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none
                   text-gray-700 transition-all duration-200 appearance-none cursor-pointer
                   bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')]
                   bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-10"
        bind:value={statusFilter}
      >
        <option>All Statuses</option>
        <option>Posted</option>
        <option>Draft</option>
        <option>Pending</option>
        <option>Overdue</option>
      </select>
      {/if}
      
      {#if showDateFilter}
      <select 
        class="w-full sm:w-auto py-2.5 px-3 rounded-lg border border-gray-300 bg-white shadow-sm
                   focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none
                   text-gray-700 transition-all duration-200 appearance-none cursor-pointer
                   bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')]
                   bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-10"
        bind:value={dateFilter}
      >
        <option>All Time</option>
        <option>This Month</option>
        <option>Last 30 Days</option>
        <option>This Year</option>
      </select>
      {/if}
      
      {#each customFilters as filter}
      <select class="w-full sm:w-auto py-2.5 px-3 rounded-lg border border-gray-300 bg-white shadow-sm
                   focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none
                   text-gray-700 transition-all duration-200 appearance-none cursor-pointer
                   bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')]
                   bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-10">
        <option>{filter.label}</option>
        {#each filter.options as option}
        <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      {/each}
    </div>
    
    <!-- Data table with improved styling -->
    <div class="rounded-lg overflow-hidden border border-gray-200">
      <FireTable 
        {rootCollection} 
        {parentCollection} 
        {subCollectionName} 
        {columns} 
        queryOptions={filteredQueryOptions} 
      >
        <svelte:fragment slot="actions" let:row>
          {#if viewButtonPath}
          <button 
            class="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-full transition-all duration-200"
            on:click={() => goto(`${viewButtonPath}?id=${row.id}&viewMode=true`)}
            title={`View ${documentType}`}
            aria-label={`View ${documentType}`}
          >
            <iconify-icon icon="material-symbols:visibility-outline-rounded" width="20" height="20"></iconify-icon>
          </button>
          {/if}
          
          {#if editButtonPath}
          <button 
            class="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-full transition-all duration-200"
            on:click={() => goto(`${editButtonPath}?id=${row.id}`)}
            title={`Edit ${documentType}`}
            aria-label={`Edit ${documentType}`}
          >
            <iconify-icon icon="material-symbols:edit-outline-rounded" width="20" height="20"></iconify-icon>
          </button>
          {/if}
          
          {#if allowDelete}
          <button 
            class="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-all duration-200"
            on:click={() => confirmDelete(row.id)}
            title={`Delete ${documentType}`}
            aria-label={`Delete ${documentType}`}
          >
            <iconify-icon icon="material-symbols:delete-outline-rounded" width="20" height="20"></iconify-icon>
          </button>
          {/if}
          
          <!-- Custom action slot -->
          <slot name="additionalActions" {row}></slot>
        </svelte:fragment>
        
        <!-- Custom columns slot is handled differently in FireTable -->
      </FireTable>
    </div>
  </div>
</div>
