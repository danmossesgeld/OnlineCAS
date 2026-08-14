<script lang="ts">
  import { onMount } from 'svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { queryCollectionDocs, addDocToCollection, updateDocInCollection, type FilterCondition } from '$lib/utils/firestoreCrud';

  // A fiscal period as used in this component — dates already normalized to JS Date.
  interface FiscalPeriod {
    id: string | null;
    year: number;
    month: number;
    monthName: string | undefined;
    startDate: Date;
    endDate: Date;
    isClosed: boolean;
    closedDate: Date | null;
    closedBy: string | null;
  }

  // Raw shape of a fiscalPeriods document as read from Firestore (dates as Timestamps).
  // queryCollectionDocs' generic return type doesn't know this collection's schema, so
  // we assert it locally rather than widening the shared utility's signature.
  interface FiscalPeriodDoc {
    id: string;
    year: number;
    month: number;
    startDate: { seconds: number; nanoseconds: number };
    endDate: { seconds: number; nanoseconds: number };
    isClosed: boolean;
    closedDate?: { seconds: number; nanoseconds: number } | null;
    closedBy?: string | null;
  }

  let periods: FiscalPeriod[] = [];
  let isLoading = true;
  let selectedYear: number = new Date().getFullYear();
  let isClosingPeriod = false;
  let closingMonth: number | null = null;
  let closingError: string | null = null;
  let closingSuccess: string | null = null;

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
  let years: { value: number; label: string }[] = [];
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
      const fiscalPeriods = (await queryCollectionDocs('accounting/fiscalPeriods')) as unknown as FiscalPeriodDoc[];

      // Filter periods for the selected year
      periods = fiscalPeriods
        .filter(period => new Date(period.endDate.seconds * 1000).getFullYear() === selectedYear)
        .sort((a, b) => a.month - b.month)
        .map((period): FiscalPeriod => ({
          id: period.id,
          year: period.year,
          month: period.month,
          monthName: months.find(m => m.value === period.month)?.label,
          startDate: new Date(period.startDate.seconds * 1000),
          endDate: new Date(period.endDate.seconds * 1000),
          isClosed: period.isClosed,
          closedDate: period.closedDate ? new Date(period.closedDate.seconds * 1000) : null,
          closedBy: period.closedBy ?? null
        }));

      // Create any missing periods for the selected year
      const existingMonths = periods.map(p => p.month);
      for (let i = 0; i < 12; i++) {
        if (!existingMonths.includes(i)) {
          periods.push(createDefaultPeriod(selectedYear, i));
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

  function createDefaultPeriod(year: number, month: number): FiscalPeriod {
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

  async function closePeriod(periodIndex: number) {
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
      const updatedPeriod: FiscalPeriod = {
        ...period,
        isClosed: true,
        closedDate: new Date(),
        closedBy: 'current-user-id' // Replace with actual user ID from auth
      };

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
      closingError = error instanceof Error ? error.message : 'Failed to close period. Please try again.';
    } finally {
      isClosingPeriod = false;
      closingMonth = null;
    }
  }

  async function reopenPeriod(periodIndex: number) {
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
      const updatedPeriod: FiscalPeriod = {
        ...period,
        isClosed: false,
        closedDate: null,
        closedBy: null
      };

      if (period.id) {
        await updateDocInCollection('accounting/fiscalPeriods', period.id, updatedPeriod);
      }

      // Update local data
      periods[periodIndex] = updatedPeriod;
      periods = [...periods]; // Trigger reactivity

      closingSuccess = `${period.monthName} ${selectedYear} has been successfully reopened.`;
    } catch (error) {
      console.error('Error reopening period:', error);
      closingError = error instanceof Error ? error.message : 'Failed to reopen period. Please try again.';
    } finally {
      isClosingPeriod = false;
      closingMonth = null;
    }
  }

  async function checkUnpostedTransactions(startDate: Date, endDate: Date): Promise<number> {
    // Query journal entries that are within the period date range and not posted
    try {
      const filters: FilterCondition[] = [
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
      <label for="year" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-700);">Year</label>
      <select
        id="year"
        bind:value={selectedYear}
        class="w-full sm:w-auto py-2 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors cursor-pointer"
        style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
      >
        {#each years as year}
          <option value={year.value}>{year.label}</option>
        {/each}
      </select>
    </div>

    {#if closingError}
      <div class="mb-4 p-3 rounded-md text-sm" style="background: var(--color-error-50); color: var(--color-error-700);">
        {closingError}
      </div>
    {/if}

    {#if closingSuccess}
      <div class="mb-4 p-3 rounded-md text-sm" style="background: var(--color-success-50); color: var(--color-success-700);">
        {closingSuccess}
      </div>
    {/if}

    <div class="overflow-x-auto">
      <table class="min-w-full text-sm border-collapse">
        <thead>
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Period</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Start Date</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">End Date</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Status</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Closed Date</th>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if isLoading}
            <tr>
              <td colspan="6" class="px-6 py-4 text-center" style="color: var(--color-neutral-600);">Loading fiscal periods...</td>
            </tr>
          {:else if periods.length === 0}
            <tr>
              <td colspan="6" class="px-6 py-4 text-center" style="color: var(--color-neutral-600);">No fiscal periods found for {selectedYear}</td>
            </tr>
          {:else}
            {#each periods as period, i}
              {@const statusColor = period.isClosed ? '--color-success-600' : '--color-warning-600'}
              <tr class="transition-colors hover:[background:var(--color-primary-50)]">
                <td class="px-6 py-4 whitespace-nowrap" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{period.monthName}</td>
                <td class="px-6 py-4 whitespace-nowrap" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{period.startDate.toLocaleDateString()}</td>
                <td class="px-6 py-4 whitespace-nowrap" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{period.endDate.toLocaleDateString()}</td>
                <td class="px-6 py-4 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                  <span
                    class="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full"
                    style={`color: var(${statusColor}); background: color-mix(in srgb, var(${statusColor}) 14%, transparent);`}
                  >
                    {period.isClosed ? 'Closed' : 'Open'}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                  {period.closedDate ? period.closedDate.toLocaleDateString() : '-'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                  {#if isClosingPeriod && closingMonth === i}
                    <span style="color: var(--color-neutral-500);">Processing...</span>
                  {:else if period.isClosed}
                    <button
                      on:click={() => reopenPeriod(i)}
                      class="text-sm font-medium mr-2 transition-colors"
                      style="color: var(--color-primary-600);"
                    >
                      Reopen
                    </button>
                  {:else}
                    <button
                      on:click={() => closePeriod(i)}
                      class="text-sm font-medium transition-colors"
                      style="color: var(--color-primary-600);"
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
    <div class="prose max-w-none" style="color: var(--color-neutral-700);">
      <p>
        Period closing is an important accounting procedure that finalizes a specific accounting period.
        When a period is closed:
      </p>
      <ul>
        <li>No new transactions can be posted with dates in closed periods</li>
        <li>Financial reports will use the locked data for closed periods</li>
        <li>Beginning balances for the next period are calculated from the closed period</li>
      </ul>
      <p class="font-bold" style="color: var(--color-neutral-800);">Important:</p>
      <ul>
        <li>All transactions must be posted before closing a period</li>
        <li>Periods must be closed sequentially</li>
        <li>Reopening a period requires all subsequent periods to be open</li>
      </ul>
    </div>
  </FormSection>
</FormLayout>
