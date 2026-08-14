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

  // Shared inline style for filter inputs (theme-aware)
  const inputStyle = 'background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);';

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
    <h2 class="text-lg font-semibold mb-2" style="color: var(--color-neutral-800);">Comprehensive Journal Entry Analysis</h2>
    <p style="color: var(--color-neutral-600);">View, filter, and analyze all journal entries with detailed balance validation</p>
  </div>

  <!-- Summary line — plain text, no cards -->
  <div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 text-sm">
    <div class="flex items-baseline gap-1.5">
      <span style="color: var(--color-neutral-500);">Total Entries:</span>
      <span class="font-semibold" style="color: var(--color-neutral-800);">{totalEntries}</span>
    </div>
    <div class="flex items-baseline gap-1.5">
      <span style="color: var(--color-neutral-500);">Balanced:</span>
      <span class="font-semibold" style="color: var(--color-success-600);">{balancedEntries}</span>
    </div>
    <div class="flex items-baseline gap-1.5">
      <span style="color: var(--color-neutral-500);">Unbalanced:</span>
      <span class="font-semibold" style="color: var(--color-error-600);">{unbalancedEntries}</span>
    </div>
    <div class="flex items-baseline gap-1.5">
      <span style="color: var(--color-neutral-500);">Total Debits:</span>
      <span class="font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(totalDebits)}</span>
    </div>
  </div>

  <!-- Filters -->
  <FormSection title="Filters">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
      <div>
        <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-700);">Date From</label>
        <input
          type="date"
          bind:value={dateFrom}
          class="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 transition-colors"
          style={inputStyle}
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-700);">Date To</label>
        <input
          type="date"
          bind:value={dateTo}
          class="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 transition-colors"
          style={inputStyle}
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-700);">Account</label>
        <input
          type="text"
          bind:value={accountFilter}
          placeholder="Filter by account name"
          class="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 transition-colors"
          style={inputStyle}
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-700);">Source Type</label>
        <input
          type="text"
          bind:value={sourceTypeFilter}
          placeholder="Filter by source type"
          class="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 transition-colors"
          style={inputStyle}
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-700);">Status</label>
        <select
          bind:value={statusFilter}
          class="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 transition-colors cursor-pointer"
          style={inputStyle}
        >
          <option value="">All Statuses</option>
          <option value="posted">Posted</option>
          <option value="draft">Draft</option>
          <option value="void">Void</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-700);">Balance Status</label>
        <select
          bind:value={balanceFilter}
          class="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 transition-colors cursor-pointer"
          style={inputStyle}
        >
          <option value="all">All Entries</option>
          <option value="balanced">Balanced Only</option>
          <option value="unbalanced">Unbalanced Only</option>
        </select>
      </div>
    </div>

    <div class="mb-4">
      <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-700);">Search</label>
      <input
        type="text"
        bind:value={searchTerm}
        placeholder="Search by reference, description, or account"
        class="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 transition-colors"
        style={inputStyle}
      />
    </div>

    <div class="flex flex-wrap gap-3">
      <button
        on:click={applyFilters}
        class="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
        style="background: var(--color-primary-600);"
      >
        Apply Filters
      </button>
      <button
        on:click={clearFilters}
        class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
        style="background: var(--color-neutral-100); color: var(--color-neutral-700);"
      >
        Clear Filters
      </button>
      <button
        on:click={exportToCSV}
        class="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
        style="background: var(--color-success-600);"
      >
        Export CSV
      </button>
    </div>
  </FormSection>

  <!-- Journal Entries Table -->
  <FormSection title="Journal Entries">
    {#if isLoading}
      <div class="text-center py-8">
        <div style="color: var(--color-neutral-600);">Loading journal entries...</div>
      </div>
    {:else if error}
      <div class="text-center py-8">
        <div style="color: var(--color-error-600);">Error: {error}</div>
      </div>
    {:else if filteredEntries.length === 0}
      <div class="text-center py-8">
        <div style="color: var(--color-neutral-600);">No journal entries found matching the current filters.</div>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase cursor-pointer transition-colors hover:[background:var(--color-neutral-100)]"
                style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);"
                on:click={() => changeSort('journalDate')}
              >
                Date {sortField === 'journalDate' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                class="px-4 py-3 text-left text-xs font-medium uppercase cursor-pointer transition-colors hover:[background:var(--color-neutral-100)]"
                style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);"
                on:click={() => changeSort('referenceNo')}
              >
                Reference {sortField === 'referenceNo' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
              <th class="px-4 py-3 text-left text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Source</th>
              <th class="px-4 py-3 text-center text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Status</th>
              <th class="px-4 py-3 text-right text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Debits</th>
              <th class="px-4 py-3 text-right text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Credits</th>
              <th class="px-4 py-3 text-center text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Balance</th>
              <th class="px-4 py-3 text-center text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each getPaginatedEntries() as entry}
              {@const statusLower = (entry.status || '').toLowerCase()}
              {@const statusColor = statusLower === 'posted' ? '--color-success-600' : statusLower === 'draft' ? '--color-warning-600' : statusLower === 'void' ? '--color-error-600' : '--color-neutral-500'}
              <tr class="transition-colors hover:[background:var(--color-primary-50)]">
                <td class="px-4 py-3" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                  {formatDate(entry.journalDate)}
                </td>
                <td class="px-4 py-3 font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                  {entry.referenceNo}
                </td>
                <td class="px-4 py-3" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                  {entry.description}
                </td>
                <td class="px-4 py-3" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                  {entry.sourceType}
                </td>
                <td class="px-4 py-3 text-center" style="border-bottom: 1px solid var(--color-neutral-100);">
                  <span
                    class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                    style={`color: var(${statusColor}); background: color-mix(in srgb, var(${statusColor}) 14%, transparent);`}
                  >
                    {entry.status}
                  </span>
                </td>
                <td class="px-4 py-3 text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                  {formatCurrency(entry.totalDebit)}
                </td>
                <td class="px-4 py-3 text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                  {formatCurrency(entry.totalCredit)}
                </td>
                <td class="px-4 py-3 text-center" style="border-bottom: 1px solid var(--color-neutral-100);">
                  {#if entry.isBalanced}
                    <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full" style="color: var(--color-success-600); background: color-mix(in srgb, var(--color-success-600) 14%, transparent);">
                      Balanced
                    </span>
                  {:else}
                    <span class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full" style="color: var(--color-error-600); background: color-mix(in srgb, var(--color-error-600) 14%, transparent);">
                      Unbalanced
                    </span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-center" style="border-bottom: 1px solid var(--color-neutral-100);">
                  <button
                    class="text-xs font-medium transition-colors"
                    style="color: var(--color-primary-600);"
                    on:click={() => showEntryDetails(entry)}
                  >
                    View Details
                  </button>
                </td>
              </tr>
              {#if !entry.isBalanced}
                <tr>
                  <td colspan="9" class="px-4 py-2 text-xs" style="background: var(--color-error-50); color: var(--color-error-700); border-bottom: 1px solid var(--color-neutral-100);">
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
          <div class="text-sm" style="color: var(--color-neutral-700);">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredEntries.length)} of {filteredEntries.length} entries
          </div>
          <div class="flex gap-2">
            <button
              on:click={() => changePage(currentPage - 1)}
              disabled={currentPage === 1}
              class="px-3 py-1 text-sm rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style="border-color: var(--color-neutral-200); color: var(--color-neutral-700);"
            >
              Previous
            </button>
            {#each Array.from({length: Math.min(5, totalPages)}, (_, i) => {
              const page = i + 1;
              return page;
            }) as page}
              <button
                on:click={() => changePage(page)}
                class="px-3 py-1 text-sm rounded-md border transition-colors"
                style={currentPage === page
                  ? 'background: var(--color-primary-600); border-color: var(--color-primary-600); color: white;'
                  : 'border-color: var(--color-neutral-200); color: var(--color-neutral-700);'}
              >
                {page}
              </button>
            {/each}
            <button
              on:click={() => changePage(currentPage + 1)}
              disabled={currentPage === totalPages}
              class="px-3 py-1 text-sm rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style="border-color: var(--color-neutral-200); color: var(--color-neutral-700);"
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
  <div class="fixed top-0 left-0 right-0 bottom-0 flex items-center justify-center z-50 p-4" style="background: rgba(15, 23, 42, 0.4);">
    <div class="rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto border" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); box-shadow: var(--shadow-lg);">
      <div class="px-5 py-3.5" style="border-bottom: 1px solid var(--color-neutral-200);">
        <h3 class="text-lg font-semibold" style="color: var(--color-neutral-800);">Journal Entry Details</h3>
      </div>
      <div class="p-5">
        <div class="grid grid-cols-2 gap-4 text-sm mb-5">
          <div><span style="color: var(--color-neutral-500);">Reference:</span> <span style="color: var(--color-neutral-800);">{selectedEntry.referenceNo}</span></div>
          <div><span style="color: var(--color-neutral-500);">Date:</span> <span style="color: var(--color-neutral-800);">{formatDate(selectedEntry.journalDate)}</span></div>
          <div><span style="color: var(--color-neutral-500);">Description:</span> <span style="color: var(--color-neutral-800);">{selectedEntry.description}</span></div>
          <div><span style="color: var(--color-neutral-500);">Source Type:</span> <span style="color: var(--color-neutral-800);">{selectedEntry.sourceType}</span></div>
          <div><span style="color: var(--color-neutral-500);">Status:</span> <span style="color: var(--color-neutral-800);">{selectedEntry.status}</span></div>
          <div><span style="color: var(--color-neutral-500);">Posted:</span> <span style="color: var(--color-neutral-800);">{selectedEntry.isPosted ? 'Yes' : 'No'}</span></div>
        </div>

        <div>
          <h4 class="font-medium text-sm uppercase tracking-wide mb-2" style="color: var(--color-neutral-500);">Journal Lines</h4>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Line</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Account</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Debit</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Credit</th>
                </tr>
              </thead>
              <tbody>
                {#each selectedEntry.lines as line}
                  <tr>
                    <td class="px-3 py-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{line.lineNo}</td>
                    <td class="px-3 py-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{line.accountName}</td>
                    <td class="px-3 py-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{line.lineDescription}</td>
                    <td class="px-3 py-2 text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(line.debit)}</td>
                    <td class="px-3 py-2 text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(line.credit)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="px-5 py-3 flex justify-end" style="background: var(--color-neutral-50); border-top: 1px solid var(--color-neutral-200);">
        <button
          on:click={() => selectedEntry = null}
          class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style="background: var(--color-neutral-100); color: var(--color-neutral-700);"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
