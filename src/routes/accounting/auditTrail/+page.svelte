<script lang="ts">
  import { onMount } from 'svelte';
  import { queryCollectionDocs, type FilterCondition } from '$lib/utils/firestoreCrud';
  import { goto } from '$app/navigation';
  import { createFirestoreOptionsStore, type FirestoreOption } from '$lib/utils/firestoreOptions';
  
  // Data stores for filtering options
  let accountOptions: FirestoreOption[] = [];
  let sourceTypeOptions = [
    { label: 'All Source Types', value: '' },
    { label: 'Sales Invoice', value: 'salesInvoice' },
    { label: 'Credit Memo', value: 'creditMemo' },
    { label: 'Payment Receipt', value: 'receipt' },
    { label: 'APV', value: 'apv' },
    { label: 'Vendor Payment', value: 'payment' },
    { label: 'Receiving Report', value: 'receivingReport' },
    { label: 'Inventory Adjustment', value: 'inventoryAdjustment' },
    { label: 'General Journal', value: 'general' }
  ];
  
  // Filter state
  let filters = {
    startDate: '',
    endDate: '',
    accountId: '',
    sourceType: '',
    searchText: ''
  };

  // Load account options from Firestore
  createFirestoreOptionsStore('masterlist/accounts', 'name', 'id').subscribe(opts => {
    accountOptions = [{ label: 'All Accounts', value: '' }, ...opts];
  });

  // Define type for Firestore timestamp
  type FirestoreTimestamp = {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };

  // Define types for journal entries
  type JournalEntry = {
    id: string;
    journalDate: Date | FirestoreTimestamp;
    referenceNo: string;
    description: string;
    sourceType: string;
    sourceId: string;
    totalDebit: number;
    totalCredit: number;
    isPosted: boolean;
    status: string;
    lines: Array<{
      lineNo: number;
      accountId: string;
      accountName: string;
      nameType?: string;
      nameId?: string;
      nameName?: string;
      lineDescription: string;
      debit: number;
      credit: number;
    }>;
    createdAt: Date | FirestoreTimestamp;
  };

  // Store for journal entries
  let journalEntries: JournalEntry[] = [];
  let isLoading = true;
  let expandedEntryId: string | null = null;
  
  // Type definitions for document mapping
  type SourceTypeMap = Record<string, string>;

  // Initialize with dates for the current month
  onMount(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    filters.startDate = firstDay.toISOString().split('T')[0];
    filters.endDate = lastDay.toISOString().split('T')[0];
    
    loadAuditTrail();
  });

  // Load journal entries based on filters
  async function loadAuditTrail() {
    isLoading = true;
    
    try {
      // Build filter conditions
      const filterConditions: FilterCondition[] = [];
      
      // Date range filter
      if (filters.startDate) {
        filterConditions.push({
          field: 'journalDate',
          operator: '>=',
          value: new Date(filters.startDate)
        });
      }
      
      if (filters.endDate) {
        filterConditions.push({
          field: 'journalDate',
          operator: '<=',
          value: new Date(filters.endDate + 'T23:59:59')
        });
      }
      
      // Source type filter
      if (filters.sourceType) {
        filterConditions.push({
          field: 'sourceType',
          operator: '==',
          value: filters.sourceType
        });
      }
      
      // Query journal entries and properly cast the return type
      const rawEntries = await queryCollectionDocs('transactions/accounting/journalEntries', filterConditions);
      
      // Convert raw entries to proper JournalEntry type
      let entries = rawEntries.map(entry => {
        return entry as unknown as JournalEntry;
      });
      
      // Post-filtering for account ID (since we need to check line items)
      if (filters.accountId) {
        entries = entries.filter(entry => 
          entry.lines && entry.lines.some(line => line.accountId === filters.accountId)
        );
      }
      
      // Text search (case-insensitive)
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        entries = entries.filter(entry => 
          entry.description?.toLowerCase().includes(searchLower) ||
          entry.referenceNo?.toLowerCase().includes(searchLower) ||
          entry.lines?.some(line => 
            line.accountName?.toLowerCase().includes(searchLower) ||
            line.lineDescription?.toLowerCase().includes(searchLower) ||
            line.nameName?.toLowerCase().includes(searchLower)
          )
        );
      }
      
      // Sort by date (newest first)
      entries.sort((a, b) => {
        const dateA = a.journalDate instanceof Date ? a.journalDate : 
                    ('toDate' in a.journalDate && typeof a.journalDate.toDate === 'function' ? 
                    a.journalDate.toDate() : new Date(a.journalDate as any));
        const dateB = b.journalDate instanceof Date ? b.journalDate : 
                    ('toDate' in b.journalDate && typeof b.journalDate.toDate === 'function' ? 
                    b.journalDate.toDate() : new Date(b.journalDate as any));
        return dateB.getTime() - dateA.getTime();
      });
      
      journalEntries = entries;
    } catch (error) {
      console.error('Error loading audit trail:', error);
      alert('Failed to load audit trail. Please try again.');
    } finally {
      isLoading = false;
    }
  }

  // Format date for display
  function formatDate(date: any): string {
    if (!date) return '';
    
    const d = date instanceof Date ? date : 
              'toDate' in date && typeof date.toDate === 'function' ? date.toDate() : 
              new Date(date);
    
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  // Format currency values
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount || 0);
  }

  // Toggle expanded entry view
  function toggleExpand(entryId: string) {
    expandedEntryId = expandedEntryId === entryId ? null : entryId;
  }

  // View source document
  function viewSourceDocument(entry: JournalEntry) {
    if (!entry.sourceType || !entry.sourceId) return;
    
    const routeMap: Record<string, string> = {
      'salesInvoice': `/customerCenter/salesInvoice/form?id=${entry.sourceId}&mode=view`,
      'creditMemo': `/customerCenter/creditMemo/form?id=${entry.sourceId}&mode=view`,
      'receipt': `/customerCenter/receivePayment/form?id=${entry.sourceId}&mode=view`,
      'apv': `/vendorCenter/apv/form?id=${entry.sourceId}&mode=view`,
      'payment': `/vendorCenter/payment/form?id=${entry.sourceId}&mode=view`,
      'receivingReport': `/vendorCenter/receiving/form?id=${entry.sourceId}&mode=view`,
      'inventoryAdjustment': `/inventory/adjustment/form?id=${entry.sourceId}&mode=view`,
      'general': `/accounting/generalJournal/form?id=${entry.sourceId}&mode=view`
    };
    
    const route = routeMap[entry.sourceType];
    if (route) {
      goto(route);
    }
  }

  // Apply filters
  function applyFilters() {
    loadAuditTrail();
  }

  // Reset filters
  function resetFilters() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    filters = {
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      accountId: '',
      sourceType: '',
      searchText: ''
    };
    
    loadAuditTrail();
  }

  // Get source type display name
  function getSourceTypeDisplay(sourceType: string): string {
    const sourceTypeMap: SourceTypeMap = {
      'salesInvoice': 'Sales Invoice',
      'creditMemo': 'Credit Memo',
      'receipt': 'Payment Receipt',
      'apv': 'APV',
      'payment': 'Vendor Payment',
      'receivingReport': 'Receiving Report',
      'inventoryAdjustment': 'Inventory Adjustment',
      'general': 'General Journal'
    };
    
    return sourceTypeMap[sourceType] || sourceType;
  }

  // Get status badge class
  function getStatusBadgeClass(status: string): string {
    const statusMap: Record<string, string> = {
      'draft': 'bg-gray-200 text-gray-800',
      'posted': 'bg-green-100 text-green-800',
      'void': 'bg-red-100 text-red-800',
      'deleted': 'bg-red-100 text-red-800'
    };
    
    return statusMap[status] || 'bg-gray-200 text-gray-800';
  }
</script>

<div class="container mx-auto px-4 py-6">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold">Audit Trail</h1>
  </div>
  
  <!-- Filters -->
  <div class="bg-white shadow rounded-lg p-4 mb-6">
    <h2 class="text-lg font-semibold mb-4">Filters</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div>
        <label for="start-date" class="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
        <div class="flex space-x-2">
          <input 
            id="start-date"
            type="date" 
            bind:value={filters.startDate} 
            class="form-input rounded-md shadow-sm w-full"
          />
          <span class="self-center">to</span>
          <input 
            id="end-date"
            type="date" 
            bind:value={filters.endDate} 
            class="form-input rounded-md shadow-sm w-full"
          />
        </div>
      </div>
      
      <div>
        <label for="account-filter" class="block text-sm font-medium text-gray-700 mb-1">Account</label>
        <select 
          id="account-filter"
          bind:value={filters.accountId} 
          class="form-select rounded-md shadow-sm w-full"
        >
          {#each accountOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
      
      <div>
        <label for="source-type-filter" class="block text-sm font-medium text-gray-700 mb-1">Source Type</label>
        <select 
          id="source-type-filter"
          bind:value={filters.sourceType} 
          class="form-select rounded-md shadow-sm w-full"
        >
          {#each sourceTypeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </div>
      
      <div>
        <label for="search-filter" class="block text-sm font-medium text-gray-700 mb-1">Search</label>
        <input 
          id="search-filter"
          type="text" 
          bind:value={filters.searchText} 
          placeholder="Search by description, account, or reference..." 
          class="form-input rounded-md shadow-sm w-full"
        />
      </div>
      
      <div class="flex items-end space-x-2">
        <button 
          on:click={applyFilters} 
          class="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md"
        >
          Apply Filters
        </button>
        <button 
          on:click={resetFilters} 
          class="bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-md"
        >
          Reset
        </button>
      </div>
    </div>
  </div>
  
  <!-- Audit Trail Entries -->
  <div class="bg-white shadow rounded-lg overflow-hidden">
    {#if isLoading}
      <div class="p-8 text-center">
        <p class="text-gray-600">Loading audit trail entries...</p>
      </div>
    {:else if journalEntries.length === 0}
      <div class="p-8 text-center">
        <p class="text-gray-600">No audit trail entries found for the selected filters.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each journalEntries as entry (entry.id)}
              <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(entry.journalDate)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {entry.referenceNo}
                </td>
                <td class="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                  {entry.description}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {getSourceTypeDisplay(entry.sourceType)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(entry.totalDebit)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {getStatusBadgeClass(entry.status)}">
                    {entry.status}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div class="flex space-x-2">
                    <button 
                      on:click={() => toggleExpand(entry.id)} 
                      class="text-blue-600 hover:text-blue-800"
                    >
                      {expandedEntryId === entry.id ? 'Hide Details' : 'View Details'}
                    </button>
                    {#if entry.sourceType && entry.sourceId}
                      <button 
                        on:click={() => viewSourceDocument(entry)} 
                        class="text-green-600 hover:text-green-800"
                      >
                        View Source
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
              
              <!-- Expanded Details -->
              {#if expandedEntryId === entry.id}
                <tr>
                  <td colspan="7" class="px-6 py-4 bg-gray-50">
                    <div class="text-sm">
                      <h3 class="font-medium text-gray-900 mb-2">Journal Entry Details</h3>
                      
                      <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-md">
                          <thead class="bg-gray-100">
                            <tr>
                              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-gray-200">
                            {#each entry.lines || [] as line}
                              <tr>
                                <td class="px-4 py-2 text-sm text-gray-900">{line.accountName}</td>
                                <td class="px-4 py-2 text-sm text-gray-900">
                                  {#if line.nameType && line.nameName}
                                    <span class="text-xs text-gray-500">{line.nameType}:</span> {line.nameName}
                                  {:else}
                                    -
                                  {/if}
                                </td>
                                <td class="px-4 py-2 text-sm text-gray-900">{line.lineDescription}</td>
                                <td class="px-4 py-2 text-sm text-gray-900 text-right">
                                  {line.debit ? formatCurrency(line.debit) : '-'}
                                </td>
                                <td class="px-4 py-2 text-sm text-gray-900 text-right">
                                  {line.credit ? formatCurrency(line.credit) : '-'}
                                </td>
                              </tr>
                            {/each}
                            
                            <!-- Totals -->
                            <tr class="bg-gray-50 font-medium">
                              <td colspan="3" class="px-4 py-2 text-sm text-right">Totals</td>
                              <td class="px-4 py-2 text-sm text-right">
                                {formatCurrency(entry.totalDebit || 0)}
                              </td>
                              <td class="px-4 py-2 text-sm text-right">
                                {formatCurrency(entry.totalCredit || 0)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      
                      <!-- Additional metadata -->
                      <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p class="text-xs text-gray-500">
                            Created: {formatDate(entry.createdAt)}
                          </p>
                        </div>
                        
                        <div>
                          <p class="text-xs text-gray-500">
                            Entry ID: {entry.id}
                          </p>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
