<script lang="ts">
  import { onMount } from 'svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { queryCollectionDocs, addDocToCollection, updateDocInCollection } from '$lib/utils/firestoreCrud';
  
  let periods = [];
  let isLoading = true;
  let selectedYear: number = new Date().getFullYear();
  let isClosingPeriod = false;
  let closingMonth: number = null;
  let closingError: string = null;
  let closingSuccess: string = null;
  
  const months = [
    { value: 0, label: 'January' },
    { value: 1, label: 'February' },
    { value: 2, label: 'March' },
    { value: 3, label: 'April' },
    { value: 4, label: 'May' },
    { value: 5, label: 'June' },
    { value: 6, label: 'July' },
    { value: 7, label: 'August' },
    { value: 8, label: 'September' },
    { value: 9, label: 'October' },
    { value: 10, label: 'November' },
    { value: 11, label: 'December' },
  ];
  
  // Years for dropdown
  let years = [];
  const currentYear = new Date().getFullYear();
  for (let i = currentYear - 5; i <= currentYear + 1; i++) {
    years.push({ value: i, label: i.toString() });
  }
  
  onMount(async () => {
    await loadFiscalPeriods();
  });
  
  async function loadFiscalPeriods() {
    isLoading = true;
    try {
      // Get fiscal periods from Firestore
      const fiscalPeriods = await queryCollectionDocs('accounting/fiscalPeriods');
      
      // Filter periods for the selected year
      periods = fiscalPeriods
        .filter(period => new Date(period.endDate.seconds * 1000).getFullYear() === selectedYear)
        .sort((a, b) => a.month - b.month)
        .map(period => ({
          ...period,
          startDate: new Date(period.startDate.seconds * 1000),
          endDate: new Date(period.endDate.seconds * 1000),
          monthName: months.find(m => m.value === period.month)?.label
        }));
        
      // Create any missing periods for the selected year
      const existingMonths = periods.map(p => p.month);
      for (let i = 0; i < 12; i++) {
        if (!existingMonths.includes(i)) {
          const newPeriod = createDefaultPeriod(selectedYear, i);
          periods.push(newPeriod);
        }
      }
      
      // Sort periods by month
      periods.sort((a, b) => a.month - b.month);
      
    } catch (error) {
      console.error('Error loading fiscal periods:', error);
    } finally {
      isLoading = false;
    }
  }
  
  function createDefaultPeriod(year, month) {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0); // Last day of month
    
    return {
      id: null, // Will be assigned when saved to Firestore
      year,
      month,
      monthName: months.find(m => m.value === month)?.label,
      startDate,
      endDate,
      isClosed: false,
      closedDate: null,
      closedBy: null
    };
  }
  
  async function closePeriod(periodIndex) {
    try {
      isClosingPeriod = true;
      closingMonth = periodIndex;
      closingError = null;
      closingSuccess = null;
      
      const period = periods[periodIndex];
      
      // Validate that previous periods are closed
      for (let i = 0; i < periodIndex; i++) {
        if (!periods[i].isClosed) {
          throw new Error(`Cannot close ${period.monthName} until ${periods[i].monthName} is closed first.`);
        }
      }
      
      // Check for unposted transactions in the period
      const unpostedEntries = await checkUnpostedTransactions(period.startDate, period.endDate);
      if (unpostedEntries > 0) {
        throw new Error(`Cannot close period: ${unpostedEntries} unposted transactions found.`);
      }
      
      // Update or create the period document
      const updatedPeriod = {
        ...period,
        isClosed: true,
        closedDate: new Date(),
        closedBy: 'current-user-id' // Replace with actual user ID from auth
      };
      
      // Delete Firestore timestamps to avoid serialization issues
      delete updatedPeriod.startDate.seconds;
      delete updatedPeriod.startDate.nanoseconds;
      delete updatedPeriod.endDate.seconds;
      delete updatedPeriod.endDate.nanoseconds;
      
      if (period.id) {
        await updateDocInCollection('accounting/fiscalPeriods', period.id, updatedPeriod);
      } else {
        const docRef = await addDocToCollection('transactions', 'accounting', 'fiscalPeriods', updatedPeriod);
        updatedPeriod.id = docRef.id;
      }
      
      // Update local data
      periods[periodIndex] = updatedPeriod;
      periods = [...periods]; // Trigger reactivity
      
      closingSuccess = `${period.monthName} ${selectedYear} has been successfully closed.`;
    } catch (error) {
      console.error('Error closing period:', error);
      closingError = error.message || 'Failed to close period. Please try again.';
    } finally {
      isClosingPeriod = false;
      closingMonth = null;
    }
  }
  
  async function reopenPeriod(periodIndex) {
    try {
      isClosingPeriod = true;
      closingMonth = periodIndex;
      closingError = null;
      closingSuccess = null;
      
      const period = periods[periodIndex];
      
      // Validate that later periods are not closed
      for (let i = periodIndex + 1; i < periods.length; i++) {
        if (periods[i].isClosed) {
          throw new Error(`Cannot reopen ${period.monthName} while ${periods[i].monthName} is closed.`);
        }
      }
      
      // Update the period document
      const updatedPeriod = {
        ...period,
        isClosed: false,
        closedDate: null,
        closedBy: null
      };
      
      // Delete Firestore timestamps to avoid serialization issues
      if (updatedPeriod.startDate.seconds) {
        delete updatedPeriod.startDate.seconds;
        delete updatedPeriod.startDate.nanoseconds;
      }
      if (updatedPeriod.endDate.seconds) {
        delete updatedPeriod.endDate.seconds;
        delete updatedPeriod.endDate.nanoseconds;
      }
      
      if (period.id) {
        await updateDocInCollection('accounting/fiscalPeriods', period.id, updatedPeriod);
      }
      
      // Update local data
      periods[periodIndex] = updatedPeriod;
      periods = [...periods]; // Trigger reactivity
      
      closingSuccess = `${period.monthName} ${selectedYear} has been successfully reopened.`;
    } catch (error) {
      console.error('Error reopening period:', error);
      closingError = error.message || 'Failed to reopen period. Please try again.';
    } finally {
      isClosingPeriod = false;
      closingMonth = null;
    }
  }
  
  async function checkUnpostedTransactions(startDate, endDate) {
    // Query journal entries that are within the period date range and not posted
    try {
      const filters = [
        { field: 'journalDate', operator: '>=', value: startDate },
        { field: 'journalDate', operator: '<=', value: endDate },
        { field: 'isPosted', operator: '==', value: false }
      ];
      
      const unpostedEntries = await queryCollectionDocs('transactions/accounting/journalEntries', filters);
      return unpostedEntries.length;
    } catch (error) {
      console.error('Error checking unposted transactions:', error);
      throw new Error('Failed to check for unposted transactions.');
    }
  }
  
  // Watch for year changes to reload periods
  $: if (selectedYear) {
    loadFiscalPeriods();
  }
</script>

<FormLayout title="Period Closing" backPath="/accounting/reports/balanceSheet">
  <FormSection title="Fiscal Period Management">
    <div class="mb-4">
      <label for="year" class="block text-sm font-medium text-gray-700">Year</label>
      <select
        id="year"
        bind:value={selectedYear}
        class="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
      >
        {#each years as year}
          <option value={year.value}>{year.label}</option>
        {/each}
      </select>
    </div>
    
    {#if closingError}
      <div class="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
        {closingError}
      </div>
    {/if}
    
    {#if closingSuccess}
      <div class="mb-4 p-3 bg-green-100 text-green-700 rounded-md">
        {closingSuccess}
      </div>
    {/if}
    
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Closed Date</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          {#if isLoading}
            <tr>
              <td colspan="6" class="px-6 py-4 text-center">Loading fiscal periods...</td>
            </tr>
          {:else if periods.length === 0}
            <tr>
              <td colspan="6" class="px-6 py-4 text-center">No fiscal periods found for {selectedYear}</td>
            </tr>
          {:else}
            {#each periods as period, i}
              <tr>
                <td class="px-6 py-4 whitespace-nowrap">{period.monthName}</td>
                <td class="px-6 py-4 whitespace-nowrap">{period.startDate.toLocaleDateString()}</td>
                <td class="px-6 py-4 whitespace-nowrap">{period.endDate.toLocaleDateString()}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${period.isClosed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {period.isClosed ? 'Closed' : 'Open'}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  {period.closedDate ? new Date(period.closedDate.seconds * 1000).toLocaleDateString() : '-'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  {#if isClosingPeriod && closingMonth === i}
                    <span class="text-gray-500">Processing...</span>
                  {:else if period.isClosed}
                    <button
                      on:click={() => reopenPeriod(i)}
                      class="text-indigo-600 hover:text-indigo-900 mr-2"
                    >
                      Reopen
                    </button>
                  {:else}
                    <button
                      on:click={() => closePeriod(i)}
                      class="text-indigo-600 hover:text-indigo-900"
                    >
                      Close Period
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </FormSection>
  
  <FormSection title="Period Closing Information" withSeparator={true}>
    <div class="prose max-w-none">
      <p>
        Period closing is an important accounting procedure that finalizes a specific accounting period.
        When a period is closed:
      </p>
      <ul>
        <li>No new transactions can be posted with dates in closed periods</li>
        <li>Financial reports will use the locked data for closed periods</li>
        <li>Beginning balances for the next period are calculated from the closed period</li>
      </ul>
      <p class="font-bold">Important:</p>
      <ul>
        <li>All transactions must be posted before closing a period</li>
        <li>Periods must be closed sequentially</li>
        <li>Reopening a period requires all subsequent periods to be open</li>
      </ul>
    </div>
  </FormSection>
</FormLayout>
