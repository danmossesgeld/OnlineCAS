<script lang="ts">
  import { onMount } from 'svelte';
  import { getBalanceSheetData, type AccountBalance, type DateRange } from '$lib/utils/reportingService';
  import { formatCurrency } from '$lib/utils/formatters';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';
  
  let loading = true;
  let error: string | null = null;
  let reportData: {
    currentAssets: AccountBalance[];
    nonCurrentAssets: AccountBalance[];
    currentLiabilities: AccountBalance[];
    nonCurrentLiabilities: AccountBalance[];
    equity: AccountBalance[];
    totalCurrentAssets: number;
    totalNonCurrentAssets: number;
    totalAssets: number;
    totalCurrentLiabilities: number;
    totalNonCurrentLiabilities: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    isBalanced: boolean;
  } = {
    currentAssets: [],
    nonCurrentAssets: [],
    currentLiabilities: [],
    nonCurrentLiabilities: [],
    equity: [],
    totalCurrentAssets: 0,
    totalNonCurrentAssets: 0,
    totalAssets: 0,
    totalCurrentLiabilities: 0,
    totalNonCurrentLiabilities: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    totalLiabilitiesAndEquity: 0,
    isBalanced: true
  };
  
  // Default date is end of current month
  const today = new Date();
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  let dateRange: DateRange = {
    startDate: new Date(1970, 0, 1), // Start from beginning of time
    endDate: lastDayOfMonth // Up to the current date
  };
  
  // For balance sheet we only care about the "as of" date
  let asOfDate = lastDayOfMonth;
  
  async function handleGenerateReport(event: CustomEvent) {
    const params = event.detail;
    asOfDate = params.asOfDate;
    
    await generateReport();
  }
  
  async function generateReport() {
    try {
      loading = true;
      error = null;
      
      // Set the end date to the selected "as of" date
      dateRange.endDate = asOfDate;
      
      reportData = await getBalanceSheetData(dateRange);
      loading = false;
    } catch (err) {
      error = (err as Error).message;
      loading = false;
    }
  }
  
  function handleExport(event: CustomEvent) {
    // Create CSV content
    let csvContent = "Balance Sheet\n";
    csvContent += `As of ${asOfDate ? new Date(asOfDate).toLocaleDateString() : ''}\n\n`;
    
    // Assets section
    csvContent += "ASSETS\n";
    
    // Current Assets
    csvContent += "Current Assets\n";
    reportData.currentAssets.forEach(account => {
      csvContent += `${account.accountName},${account.balance}\n`;
    });
    csvContent += `Total Current Assets,${reportData.totalCurrentAssets}\n\n`;
    
    // Non-Current Assets
    csvContent += "Non-Current Assets\n";
    reportData.nonCurrentAssets.forEach(account => {
      csvContent += `${account.accountName},${account.balance}\n`;
    });
    csvContent += `Total Non-Current Assets,${reportData.totalNonCurrentAssets}\n\n`;
    
    csvContent += `TOTAL ASSETS,${reportData.totalAssets}\n\n`;
    
    // Liabilities section
    csvContent += "LIABILITIES\n";
    
    // Current Liabilities
    csvContent += "Current Liabilities\n";
    reportData.currentLiabilities.forEach(account => {
      csvContent += `${account.accountName},${account.balance}\n`;
    });
    csvContent += `Total Current Liabilities,${reportData.totalCurrentLiabilities}\n\n`;
    
    // Non-Current Liabilities
    csvContent += "Non-Current Liabilities\n";
    reportData.nonCurrentLiabilities.forEach(account => {
      csvContent += `${account.accountName},${account.balance}\n`;
    });
    csvContent += `Total Non-Current Liabilities,${reportData.totalNonCurrentLiabilities}\n\n`;
    
    csvContent += `TOTAL LIABILITIES,${reportData.totalLiabilities}\n\n`;
    
    // Equity section
    csvContent += "EQUITY\n";
    reportData.equity.forEach(account => {
      csvContent += `${account.accountName},${account.balance}\n`;
    });
    csvContent += `Total Equity,${reportData.totalEquity}\n\n`;
    
    csvContent += `TOTAL LIABILITIES AND EQUITY,${reportData.totalLiabilitiesAndEquity}\n`;
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', event.detail.filename || `balance_sheet_as_of.csv`);
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
  title="Balance Sheet"
  description="View assets, liabilities, and equity"
  {loading}
  {error}
  parameterType="asOfDate"
  {asOfDate}
  reportId="balanceSheet"
  filename="balance_sheet_as_of"
  on:generateReport={handleGenerateReport}
  on:export={handleExport}
>
  <div slot="report-content">
    {#if !reportData.isBalanced}
      <div class="mb-4 px-4 py-3 rounded-lg flex items-start gap-2.5" style="background: var(--color-error-50); border: 1px solid var(--color-error-300);">
        <iconify-icon icon="material-symbols:warning-rounded" width="20" height="20" style="color: var(--color-error-600); flex-shrink: 0; margin-top: 1px;"></iconify-icon>
        <div>
          <p class="text-sm font-semibold" style="color: var(--color-error-800);">This balance sheet does not balance.</p>
          <p class="text-xs mt-0.5" style="color: var(--color-error-700);">Total Assets ({formatCurrency(reportData.totalAssets)}) don't equal Total Liabilities and Equity ({formatCurrency(reportData.totalLiabilitiesAndEquity)}) — a difference of {formatCurrency(Math.abs(reportData.totalAssets - reportData.totalLiabilitiesAndEquity))}, even after including Retained Earnings. This means at least one posted journal entry is genuinely unbalanced; check the Audit Trail for out-of-balance entries before trusting this report.</p>
        </div>
      </div>
    {/if}
    {#if reportData.currentAssets.length === 0 && reportData.nonCurrentAssets.length === 0 && reportData.currentLiabilities.length === 0 && reportData.nonCurrentLiabilities.length === 0 && reportData.equity.length === 0}
      <div class="text-center py-10">
        <p class="text-sm" style="color: var(--color-neutral-600);">No account balances found for this period.</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Assets Column -->
        <div>
          <h3 class="text-lg font-bold mb-4 pb-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-200);">Assets</h3>

          <!-- Current Assets Section -->
          <div class="mb-6">
            <h4 class="text-base font-semibold mb-3" style="color: var(--color-neutral-700);">Current Assets</h4>
            {#if reportData.currentAssets.length === 0}
              <p class="text-sm italic" style="color: var(--color-neutral-500);">No current assets</p>
            {:else}
              <div class="space-y-2">
                {#each reportData.currentAssets as asset}
                  <div class="flex justify-between">
                    <span class="text-sm" style="color: var(--color-neutral-600);">{asset.accountName}</span>
                    <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(asset.balance)}</span>
                  </div>
                {/each}
                <div class="flex justify-between pt-2" style="border-top: 1px solid var(--color-neutral-200);">
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Current Assets</span>
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalCurrentAssets)}</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Non-Current Assets Section -->
          <div class="mb-6">
            <h4 class="text-base font-semibold mb-3" style="color: var(--color-neutral-700);">Non-Current Assets</h4>
            {#if reportData.nonCurrentAssets.length === 0}
              <p class="text-sm italic" style="color: var(--color-neutral-500);">No non-current assets</p>
            {:else}
              <div class="space-y-2">
                {#each reportData.nonCurrentAssets as asset}
                  <div class="flex justify-between">
                    <span class="text-sm" style="color: var(--color-neutral-600);">{asset.accountName}</span>
                    <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(asset.balance)}</span>
                  </div>
                {/each}
                <div class="flex justify-between pt-2" style="border-top: 1px solid var(--color-neutral-200);">
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Non-Current Assets</span>
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalNonCurrentAssets)}</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Total Assets -->
          <div class="py-2" style="border-top: 1px solid var(--color-neutral-300); border-bottom: 1px solid var(--color-neutral-300);">
            <div class="flex justify-between">
              <span class="font-bold" style="color: var(--color-neutral-800);">TOTAL ASSETS</span>
              <span class="font-bold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalAssets)}</span>
            </div>
          </div>
        </div>

        <!-- Liabilities and Equity Column -->
        <div>
          <h3 class="text-lg font-bold mb-4 pb-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-200);">Liabilities and Equity</h3>

          <!-- Current Liabilities Section -->
          <div class="mb-6">
            <h4 class="text-base font-semibold mb-3" style="color: var(--color-neutral-700);">Current Liabilities</h4>
            {#if reportData.currentLiabilities.length === 0}
              <p class="text-sm italic" style="color: var(--color-neutral-500);">No current liabilities</p>
            {:else}
              <div class="space-y-2">
                {#each reportData.currentLiabilities as liability}
                  <div class="flex justify-between">
                    <span class="text-sm" style="color: var(--color-neutral-600);">{liability.accountName}</span>
                    <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(liability.balance)}</span>
                  </div>
                {/each}
                <div class="flex justify-between pt-2" style="border-top: 1px solid var(--color-neutral-200);">
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Current Liabilities</span>
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalCurrentLiabilities)}</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Non-Current Liabilities Section -->
          <div class="mb-6">
            <h4 class="text-base font-semibold mb-3" style="color: var(--color-neutral-700);">Non-Current Liabilities</h4>
            {#if reportData.nonCurrentLiabilities.length === 0}
              <p class="text-sm italic" style="color: var(--color-neutral-500);">No non-current liabilities</p>
            {:else}
              <div class="space-y-2">
                {#each reportData.nonCurrentLiabilities as liability}
                  <div class="flex justify-between">
                    <span class="text-sm" style="color: var(--color-neutral-600);">{liability.accountName}</span>
                    <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(liability.balance)}</span>
                  </div>
                {/each}
                <div class="flex justify-between pt-2" style="border-top: 1px solid var(--color-neutral-200);">
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Non-Current Liabilities</span>
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalNonCurrentLiabilities)}</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Total Liabilities -->
          <div class="py-2 mb-6" style="border-top: 1px solid var(--color-neutral-300); border-bottom: 1px solid var(--color-neutral-300);">
            <div class="flex justify-between">
              <span class="font-bold" style="color: var(--color-neutral-800);">TOTAL LIABILITIES</span>
              <span class="font-bold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalLiabilities)}</span>
            </div>
          </div>

          <!-- Equity Section -->
          <div class="mb-6">
            <h4 class="text-base font-semibold mb-3" style="color: var(--color-neutral-700);">Equity</h4>
            {#if reportData.equity.length === 0}
              <p class="text-sm italic" style="color: var(--color-neutral-500);">No equity accounts</p>
            {:else}
              <div class="space-y-2">
                {#each reportData.equity as equityAccount}
                  <div class="flex justify-between">
                    <span class="text-sm" style="color: var(--color-neutral-600);">{equityAccount.accountName}</span>
                    <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(equityAccount.balance)}</span>
                  </div>
                {/each}
                <div class="flex justify-between pt-2" style="border-top: 1px solid var(--color-neutral-200);">
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Equity</span>
                  <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalEquity)}</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Total Liabilities and Equity -->
          <div class="py-2" style="border-top: 1px solid var(--color-neutral-300); border-bottom: 1px solid var(--color-neutral-300);">
            <div class="flex justify-between">
              <span class="font-bold" style="color: var(--color-neutral-800);">TOTAL LIABILITIES AND EQUITY</span>
              <span class="font-bold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalLiabilitiesAndEquity)}</span>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</ReportContainer>
