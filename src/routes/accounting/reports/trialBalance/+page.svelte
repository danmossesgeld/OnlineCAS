<script lang="ts">
  import { onMount } from 'svelte';
  import { getTrialBalanceData, type AccountBalance, type DateRange } from '$lib/utils/reportingService';
  import { formatCurrency } from '$lib/utils/formatters';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';
  
  let loading = true;
  let error: string | null = null;
  let reportData: {
    accounts: AccountBalance[];
    totalDebit: number;
    totalCredit: number;
  } = {
    accounts: [],
    totalDebit: 0,
    totalCredit: 0
  };
  
  // Default date range is current month
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  let dateRange: DateRange = {
    startDate: firstDayOfMonth,
    endDate: lastDayOfMonth
  };
  
  async function handleGenerateReport(event: CustomEvent) {
    const params = event.detail;
    dateRange = {
      startDate: params.startDate,
      endDate: params.endDate
    };
    
    await generateReport();
  }
  
  async function generateReport() {
    try {
      loading = true;
      error = null;
      reportData = await getTrialBalanceData(dateRange);
      loading = false;
    } catch (err) {
      error = (err as Error).message;
      loading = false;
    }
  }
  
  function handleExport(event: CustomEvent) {
    // Create CSV content
    let csvContent = "Account Code,Account Name,Debit,Credit\n";
    
    // Add accounts
    reportData.accounts.forEach(account => {
      csvContent += `"${account.accountCode}","${account.accountName}","${account.debit}","${account.credit}"\n`;
    });
    
    // Add totals
    csvContent += `"","Total","${reportData.totalDebit}","${reportData.totalCredit}"\n`;
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', event.detail.filename || `trial_balance.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  onMount(() => {
    generateReport();
  });
</script>

<ReportContainer
  title="Trial Balance"
  description="Review account balances and verify accounting accuracy"
  {loading}
  {error}
  parameterType="dateRange"
  startDate={dateRange.startDate}
  endDate={dateRange.endDate}
  reportId="trialBalance"
  filename="trial_balance"
  on:generateReport={handleGenerateReport}
  on:export={handleExport}
>
  <div slot="report-content">
    {#if reportData.accounts.length === 0}
      <div class="text-center py-10">
        <p class="text-gray-600">No account balances found for this period.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Account Code
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Account Name
              </th>
              <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Debit
              </th>
              <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Credit
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each reportData.accounts as account}
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {account.accountCode}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {account.accountName}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  {#if account.debit > 0}
                    {formatCurrency(account.debit)}
                  {:else}
                    -
                  {/if}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                  {#if account.credit > 0}
                    {formatCurrency(account.credit)}
                  {:else}
                    -
                  {/if}
                </td>
              </tr>
            {/each}
            
            <!-- Total Row -->
            <tr class="bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900"></td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                Total
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                {formatCurrency(reportData.totalDebit)}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-right">
                {formatCurrency(reportData.totalCredit)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</ReportContainer>
