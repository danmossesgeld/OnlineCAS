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

<div class="flex flex-col h-full w-full">
  <div class="rounded-lg border p-4 sm:p-5" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200);">
    <!-- Header section with title and buttons -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4">
      <div>
        <h1 class="text-xl md:text-2xl font-semibold mb-0.5" style="color: var(--color-neutral-800);">{title}</h1>
        <p class="text-sm" style="color: var(--color-neutral-500);">{subtitle}</p>
      </div>
      <div>
        <!-- Modernized button styling -->
        <div class="flex flex-wrap gap-3 justify-end">
          {#each buttons as btn}
            {@const variant = btn.variant || 'filled'}
            {@const colorClass = btn.color || 'primary'}
            {@const accent = colorClass === 'secondary' ? '--color-success-600' : colorClass === 'accent' ? '--color-warning-600' : colorClass === 'primary' ? '--color-primary-600' : '--color-neutral-600'}
            <button
              class="px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors focus:outline-none focus:ring-2
                {variant === 'filled' ? 'text-white' : ''}
                {btn.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                {btn.class ?? ''}"
              style={variant === 'filled'
                ? `background: var(${accent}); --tw-ring-color: var(${accent});`
                : variant === 'outline'
                  ? `background: transparent; border: 1px solid var(${accent}); color: var(${accent}); --tw-ring-color: var(${accent});`
                  : variant === 'soft'
                    ? `background: color-mix(in srgb, var(${accent}) 14%, transparent); color: var(${accent}); --tw-ring-color: var(${accent});`
                    : `background: transparent; color: var(${accent}); --tw-ring-color: var(${accent});`}
              type={btn.type ?? 'button'}
              disabled={btn.disabled}
              on:click={btn.onClick}
            >
              {#if btn.icon}
                <iconify-icon icon={btn.icon} width="18" height="18"></iconify-icon>
              {/if}
              {btn.label}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Summary line — plain text, no cards. Basic info only. -->
    <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 text-sm">
      {#each summaryCards as card}
        <div class="flex items-baseline gap-1.5">
          <span style="color: var(--color-neutral-500);">{card.label}:</span>
          <span class="font-semibold" style="color: var(--color-neutral-800);">{card.value}</span>
        </div>
      {/each}
    </div>
    
    <!-- Search and filter toolbar -->
    <div class="flex flex-col sm:flex-row gap-2.5 mb-5 items-start sm:items-center">
      <div class="relative w-full sm:w-1/2 md:w-1/3">
        <iconify-icon icon="material-symbols:search" class="absolute left-3 top-1/2 transform -translate-y-1/2" style="color: var(--color-neutral-400);" width="18" height="18"></iconify-icon>
        <input
          class="w-full pl-9 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors"
          style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
          placeholder={searchPlaceholder}
          bind:value={searchTerm}
        />
      </div>

      {#if showStatusFilter}
      <select
        class="w-full sm:w-auto py-2 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors cursor-pointer"
        style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
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
        class="w-full sm:w-auto py-2 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors cursor-pointer"
        style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
        bind:value={dateFilter}
      >
        <option>All Time</option>
        <option>This Month</option>
        <option>Last 30 Days</option>
        <option>This Year</option>
      </select>
      {/if}

      {#each customFilters as filter}
      <select
        class="w-full sm:w-auto py-2 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors cursor-pointer"
        style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
      >
        <option>{filter.label}</option>
        {#each filter.options as option}
        <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      {/each}
    </div>

    <!-- Data table -->
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
          class="p-1.5 rounded-md transition-colors"
          style="color: var(--color-primary-600);"
          on:click={() => goto(`${viewButtonPath}?id=${row.id}&viewMode=true`)}
          title={`View ${documentType}`}
          aria-label={`View ${documentType}`}
        >
          <iconify-icon icon="material-symbols:visibility-outline-rounded" width="20" height="20"></iconify-icon>
        </button>
        {/if}

        {#if editButtonPath}
        <button
          class="p-1.5 rounded-md transition-colors"
          style="color: var(--color-success-600);"
          on:click={() => goto(`${editButtonPath}?id=${row.id}`)}
          title={`Edit ${documentType}`}
          aria-label={`Edit ${documentType}`}
        >
          <iconify-icon icon="material-symbols:edit-outline-rounded" width="20" height="20"></iconify-icon>
        </button>
        {/if}

        {#if allowDelete}
        <button
          class="p-1.5 rounded-md transition-colors"
          style="color: var(--color-error-600);"
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
