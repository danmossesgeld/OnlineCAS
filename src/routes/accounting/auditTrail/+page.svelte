<script lang="ts">
  import { onMount } from 'svelte';
  import { queryCollectionDocs, type FilterCondition } from '$lib/utils/firestoreCrud';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';

  interface JournalEntry {
    id: string;
    journalDate: Date;
    referenceNo: string;
    description: string;
    sourceType: string;
    sourceId: string;
    isPosted: boolean;
    status: string;
    lines: JournalLine[];
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
    balanceDifference: number;
  }

  interface JournalLine {
    lineNo: number;
    accountId: string;
    accountName: string;
    nameType?: string;
    nameId?: string;
    nameName?: string;
    lineDescription: string;
    debit: number;
    credit: number;
  }

  let journalEntries: JournalEntry[] = [];
  let filteredEntries: JournalEntry[] = [];
  let isLoading = true;
  let error: string | null = null;

  // Filter states
  let dateFrom = '';
  let dateTo = '';
  let accountFilter = '';
  let sourceTypeFilter = '';
  let statusFilter = '';
  let balanceFilter = 'all'; // 'all', 'balanced', 'unbalanced'
  let searchTerm = '';

  // Sort states
  let sortField = 'journalDate';
  let sortDirection = 'desc';

  // Pagination
  let currentPage = 1;
  let itemsPerPage = 20;
  let totalPages = 1;

  // Summary stats
  let totalEntries = 0;
  let balancedEntries = 0;
  let unbalancedEntries = 0;
  let totalDebits = 0;
  let totalCredits = 0;

  // Modal state
  let selectedEntry: JournalEntry | null = null;

  onMount(async () => {
    await loadJournalEntries();
  });

  async function loadJournalEntries() {
    isLoading = true;
    error = null;
    
    try {
      const entries = await queryCollectionDocs('accounting/journalEntries');
      
      journalEntries = entries.map((entry: any) => {
        const totalDebit = entry.lines?.reduce((sum: number, line: any) => sum + (line.debit || 0), 0) || 0;
        const totalCredit = entry.lines?.reduce((sum: number, line: any) => sum + (line.credit || 0), 0) || 0;
        const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
        
        return {
          ...entry,
          journalDate: entry.journalDate?.seconds ? new Date(entry.journalDate.seconds * 1000) : new Date(),
          totalDebit,
          totalCredit,
          isBalanced,
          balanceDifference: totalDebit - totalCredit
        };
      });

      calculateStats();
      applyFilters();
    } catch (err) {
      console.error('Failed to load journal entries:', err);
      error = (err as Error).message;
    } finally {
      isLoading = false;
    }
  }

  function calculateStats() {
    totalEntries = journalEntries.length;
    balancedEntries = journalEntries.filter(entry => entry.isBalanced).length;
    unbalancedEntries = totalEntries - balancedEntries;
    totalDebits = journalEntries.reduce((sum, entry) => sum + entry.totalDebit, 0);
    totalCredits = journalEntries.reduce((sum, entry) => sum + entry.totalCredit, 0);
  }

  function applyFilters() {
    let filtered = [...journalEntries];

    // Date filter
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      filtered = filtered.filter(entry => entry.journalDate >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(entry => entry.journalDate <= toDate);
    }

    // Account filter
    if (accountFilter) {
      filtered = filtered.filter(entry => 
        entry.lines.some(line => 
          line.accountName.toLowerCase().includes(accountFilter.toLowerCase())
        )
      );
    }

    // Source type filter
    if (sourceTypeFilter) {
      filtered = filtered.filter(entry => 
        entry.sourceType.toLowerCase().includes(sourceTypeFilter.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(entry => entry.status === statusFilter);
    }

    // Balance filter
    if (balanceFilter === 'balanced') {
      filtered = filtered.filter(entry => entry.isBalanced);
    } else if (balanceFilter === 'unbalanced') {
      filtered = filtered.filter(entry => !entry.isBalanced);
    }

    // Search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.referenceNo.toLowerCase().includes(term) ||
        entry.description.toLowerCase().includes(term) ||
        entry.lines.some(line => 
          line.accountName.toLowerCase().includes(term) ||
          line.lineDescription.toLowerCase().includes(term)
        )
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any = a[sortField as keyof JournalEntry];
      let bValue: any = b[sortField as keyof JournalEntry];
      
      if (sortField === 'journalDate') {
        aValue = aValue.getTime();
        bValue = bValue.getTime();
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    filteredEntries = filtered;
    currentPage = 1;
    totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  }

  function getPaginatedEntries() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredEntries.slice(start, end);
  }

  function changePage(page: number) {
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
    }
  }

  function changeSort(field: string) {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'asc';
    }
    applyFilters();
  }

  function clearFilters() {
    dateFrom = '';
    dateTo = '';
    accountFilter = '';
    sourceTypeFilter = '';
    statusFilter = '';
    balanceFilter = 'all';
    searchTerm = '';
    applyFilters();
  }

  function exportToCSV() {
    const headers = [
      'Date',
      'Reference',
      'Description',
      'Source Type',
      'Status',
      'Total Debit',
      'Total Credit',
      'Balance Status',
      'Balance Difference'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredEntries.map(entry => [
        formatDate(entry.journalDate),
        entry.referenceNo,
        `"${entry.description}"`,
        entry.sourceType,
        entry.status,
        entry.totalDebit,
        entry.totalCredit,
        entry.isBalanced ? 'Balanced' : 'Unbalanced',
        entry.balanceDifference
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transaction_journal_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function showEntryDetails(entry: JournalEntry) {
    selectedEntry = entry;
  }

  // Reactive statements
  $: if (journalEntries.length > 0) {
    applyFilters();
  }
</script>

<svelte:head>
  <title>Transaction Journal - Digisoft CAS</title>
</svelte:head>

<FormLayout title="Transaction Journal">
  <div class="mb-4">
    <h2 class="text-lg font-semibold text-gray-800 mb-2">Comprehensive Journal Entry Analysis</h2>
    <p class="text-gray-600">View, filter, and analyze all journal entries with detailed balance validation</p>
  </div>

  <!-- Summary Statistics -->
  <FormSection title="Summary Statistics">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-blue-50 p-4 rounded-lg">
        <div class="text-2xl font-bold text-blue-600">{totalEntries}</div>
        <div class="text-sm text-blue-800">Total Entries</div>
      </div>
      <div class="bg-green-50 p-4 rounded-lg">
        <div class="text-2xl font-bold text-green-600">{balancedEntries}</div>
        <div class="text-sm text-green-800">Balanced</div>
      </div>
      <div class="bg-red-50 p-4 rounded-lg">
        <div class="text-2xl font-bold text-red-600">{unbalancedEntries}</div>
        <div class="text-sm text-red-800">Unbalanced</div>
      </div>
      <div class="bg-purple-50 p-4 rounded-lg">
        <div class="text-2xl font-bold text-purple-600">{formatCurrency(totalDebits)}</div>
        <div class="text-sm text-purple-800">Total Debits</div>
      </div>
    </div>
  </FormSection>

  <!-- Filters -->
  <FormSection title="Filters">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Date From</label>
        <input
          type="date"
          bind:value={dateFrom}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Date To</label>
        <input
          type="date"
          bind:value={dateTo}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Account</label>
        <input
          type="text"
          bind:value={accountFilter}
          placeholder="Filter by account name"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Source Type</label>
        <input
          type="text"
          bind:value={sourceTypeFilter}
          placeholder="Filter by source type"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <select
          bind:value={statusFilter}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="posted">Posted</option>
          <option value="draft">Draft</option>
          <option value="void">Void</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Balance Status</label>
        <select
          bind:value={balanceFilter}
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Entries</option>
          <option value="balanced">Balanced Only</option>
          <option value="unbalanced">Unbalanced Only</option>
        </select>
      </div>
    </div>
    
    <div class="mb-4">
      <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
      <input
        type="text"
        bind:value={searchTerm}
        placeholder="Search by reference, description, or account"
        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>

    <div class="flex space-x-4">
      <button
        on:click={applyFilters}
        class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
      >
        Apply Filters
      </button>
      <button
        on:click={clearFilters}
        class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
      >
        Clear Filters
      </button>
      <button
        on:click={exportToCSV}
        class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
      >
        Export CSV
      </button>
    </div>
  </FormSection>

  <!-- Journal Entries Table -->
  <FormSection title="Journal Entries">
    {#if isLoading}
      <div class="text-center py-8">
        <div class="text-gray-600">Loading journal entries...</div>
      </div>
    {:else if error}
      <div class="text-center py-8">
        <div class="text-red-600">Error: {error}</div>
      </div>
    {:else if filteredEntries.length === 0}
      <div class="text-center py-8">
        <div class="text-gray-600">No journal entries found matching the current filters.</div>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th 
                class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                on:click={() => changeSort('journalDate')}
              >
                Date {sortField === 'journalDate' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th 
                class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                on:click={() => changeSort('referenceNo')}
              >
                Reference {sortField === 'referenceNo' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debits</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credits</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Balance</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each getPaginatedEntries() as entry}
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900">
                  {formatDate(entry.journalDate)}
                </td>
                <td class="px-4 py-3 text-sm text-gray-900 font-medium">
                  {entry.referenceNo}
                </td>
                <td class="px-4 py-3 text-sm text-gray-900">
                  {entry.description}
                </td>
                <td class="px-4 py-3 text-sm text-gray-900">
                  {entry.sourceType}
                </td>
                <td class="px-4 py-3 text-sm text-center">
                  <span class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                    {entry.status}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-900 text-right">
                  {formatCurrency(entry.totalDebit)}
                </td>
                <td class="px-4 py-3 text-sm text-gray-900 text-right">
                  {formatCurrency(entry.totalCredit)}
                </td>
                <td class="px-4 py-3 text-sm text-center">
                  {#if entry.isBalanced}
                    <span class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      ✅ Balanced
                    </span>
                  {:else}
                    <span class="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                      ❌ Unbalanced
                    </span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-sm text-center">
                  <button
                    class="text-indigo-600 hover:text-indigo-900 text-xs"
                    on:click={() => showEntryDetails(entry)}
                  >
                    View Details
                  </button>
                </td>
              </tr>
              {#if !entry.isBalanced}
                <tr class="bg-red-50">
                  <td colspan="9" class="px-4 py-2 text-xs text-red-700">
                    <strong>Balance Difference:</strong> {formatCurrency(entry.balanceDifference)}
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      {#if totalPages > 1}
        <div class="flex items-center justify-between mt-4">
          <div class="text-sm text-gray-700">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredEntries.length)} of {filteredEntries.length} entries
          </div>
          <div class="flex space-x-2">
            <button
              on:click={() => changePage(currentPage - 1)}
              disabled={currentPage === 1}
              class="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {#each Array.from({length: Math.min(5, totalPages)}, (_, i) => {
              const page = i + 1;
              return page;
            }) as page}
              <button
                on:click={() => changePage(page)}
                class="px-3 py-1 text-sm border border-gray-300 rounded-md {currentPage === page ? 'bg-indigo-600 text-white' : ''}"
              >
                {page}
              </button>
            {/each}
            <button
              on:click={() => changePage(currentPage + 1)}
              disabled={currentPage === totalPages}
              class="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </FormSection>
</FormLayout>

<!-- Entry Details Modal -->
{#if selectedEntry}
  <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
    <div class="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
      <div class="mt-3">
        <h3 class="text-lg font-medium text-gray-900 mb-4">Journal Entry Details</h3>
        <div class="mb-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div><strong>Reference:</strong> {selectedEntry.referenceNo}</div>
            <div><strong>Date:</strong> {formatDate(selectedEntry.journalDate)}</div>
            <div><strong>Description:</strong> {selectedEntry.description}</div>
            <div><strong>Source Type:</strong> {selectedEntry.sourceType}</div>
            <div><strong>Status:</strong> {selectedEntry.status}</div>
            <div><strong>Posted:</strong> {selectedEntry.isPosted ? 'Yes' : 'No'}</div>
          </div>
        </div>
        
        <div class="mb-4">
          <h4 class="font-medium text-gray-900 mb-2">Journal Lines</h4>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Line</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                {#each selectedEntry.lines as line}
                  <tr>
                    <td class="px-3 py-2 text-sm text-gray-900">{line.lineNo}</td>
                    <td class="px-3 py-2 text-sm text-gray-900">{line.accountName}</td>
                    <td class="px-3 py-2 text-sm text-gray-900">{line.lineDescription}</td>
                    <td class="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(line.debit)}</td>
                    <td class="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(line.credit)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
        
        <div class="flex justify-end space-x-3">
          <button
            on:click={() => selectedEntry = null}
            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
