<script lang="ts">
  import { onMount } from 'svelte';
  import { getIncomeStatementData, type AccountBalance, type DateRange } from '$lib/utils/reportingService';
  import { formatCurrency } from '$lib/utils/formatters';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';
  
  let loading = true;
  let error: string | null = null;
  let reportData: {
    revenues: AccountBalance[];
    costOfSales: AccountBalance[];
    operatingExpenses: AccountBalance[];
    otherIncome: AccountBalance[];
    otherExpenses: AccountBalance[];
    taxes: AccountBalance[];
    totalRevenue: number;
    totalCostOfSales: number;
    grossProfit: number;
    totalOperatingExpenses: number;
    operatingIncome: number;
    totalOtherIncome: number;
    totalOtherExpenses: number;
    incomeBeforeTax: number;
    totalTaxes: number;
    netIncome: number;
  } = {
    revenues: [],
    costOfSales: [],
    operatingExpenses: [],
    otherIncome: [],
    otherExpenses: [],
    taxes: [],
    totalRevenue: 0,
    totalCostOfSales: 0,
    grossProfit: 0,
    totalOperatingExpenses: 0,
    operatingIncome: 0,
    totalOtherIncome: 0,
    totalOtherExpenses: 0,
    incomeBeforeTax: 0,
    totalTaxes: 0,
    netIncome: 0
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
      reportData = await getIncomeStatementData(dateRange);
      loading = false;
    } catch (err) {
      error = (err as Error).message;
      loading = false;
    }
  }
  
  function handleExport(event: CustomEvent) {
    // Create CSV content
    let csvContent = "Income Statement\n";
    csvContent += `For the period ${dateRange.startDate ? new Date(dateRange.startDate).toLocaleDateString() : ''} to ${dateRange.endDate ? new Date(dateRange.endDate).toLocaleDateString() : ''}\n\n`;
    
    // Revenue section
    csvContent += "REVENUE\n";
    reportData.revenues.forEach(account => {
      csvContent += `${account.accountName},${account.balance}\n`;
    });
    csvContent += `Total Revenue,${reportData.totalRevenue}\n\n`;
    
    // Cost of Sales section
    csvContent += "COST OF SALES\n";
    reportData.costOfSales.forEach(account => {
      csvContent += `${account.accountName},${account.balance}\n`;
    });
    csvContent += `Total Cost of Sales,${reportData.totalCostOfSales}\n\n`;
    
    csvContent += `GROSS PROFIT,${reportData.grossProfit}\n\n`;
    
    // Operating Expenses section
    csvContent += "OPERATING EXPENSES\n";
    reportData.operatingExpenses.forEach(account => {
      csvContent += `${account.accountName},${account.balance}\n`;
    });
    csvContent += `Total Operating Expenses,${reportData.totalOperatingExpenses}\n\n`;
    
    csvContent += `OPERATING INCOME,${reportData.operatingIncome}\n\n`;
    
    // Other Income section
    if (reportData.otherIncome.length > 0) {
      csvContent += "OTHER INCOME\n";
      reportData.otherIncome.forEach(account => {
        csvContent += `${account.accountName},${account.balance}\n`;
      });
      csvContent += `Total Other Income,${reportData.totalOtherIncome}\n\n`;
    }
    
    // Other Expenses section
    if (reportData.otherExpenses.length > 0) {
      csvContent += "OTHER EXPENSES\n";
      reportData.otherExpenses.forEach(account => {
        csvContent += `${account.accountName},${account.balance}\n`;
      });
      csvContent += `Total Other Expenses,${reportData.totalOtherExpenses}\n\n`;
    }
    
    csvContent += `INCOME BEFORE TAX,${reportData.incomeBeforeTax}\n\n`;
    
    // Taxes section
    if (reportData.taxes.length > 0) {
      csvContent += "TAXES\n";
      reportData.taxes.forEach(account => {
        csvContent += `${account.accountName},${account.balance}\n`;
      });
      csvContent += `Total Taxes,${reportData.totalTaxes}\n\n`;
    }
    
    csvContent += `NET INCOME,${reportData.netIncome}\n`;
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', event.detail.filename || `income_statement.csv`);
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
  title="Income Statement"
  description="Review revenue, expenses, and profitability"
  {loading}
  {error}
  parameterType="dateRange"
  startDate={dateRange.startDate}
  endDate={dateRange.endDate}
  reportId="incomeStatement"
  filename="income_statement"
  on:generateReport={handleGenerateReport}
  on:export={handleExport}
>
  <div slot="report-content">
    {#if reportData.revenues.length === 0 && reportData.costOfSales.length === 0 && reportData.operatingExpenses.length === 0}
      <div class="text-center py-10">
        <p class="text-sm" style="color: var(--color-neutral-600);">No financial data found for this period.</p>
      </div>
    {:else}
      <div class="max-w-3xl mx-auto">
        <!-- Revenue Section -->
        <div class="mb-6">
          <h3 class="text-lg font-bold mb-2" style="color: var(--color-neutral-800);">Revenue</h3>
          {#if reportData.revenues.length === 0}
            <p class="text-sm italic" style="color: var(--color-neutral-500);">No revenue data</p>
          {:else}
            <div class="space-y-1">
              {#each reportData.revenues as account}
                <div class="flex justify-between">
                  <span class="text-sm" style="color: var(--color-neutral-600);">{account.accountName}</span>
                  <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(account.balance)}</span>
                </div>
              {/each}
              <div class="flex justify-between pt-1" style="border-top: 1px solid var(--color-neutral-200);">
                <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Revenue</span>
                <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalRevenue)}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Cost of Sales Section -->
        <div class="mb-6">
          <h3 class="text-lg font-bold mb-2" style="color: var(--color-neutral-800);">Cost of Sales</h3>
          {#if reportData.costOfSales.length === 0}
            <p class="text-sm italic" style="color: var(--color-neutral-500);">No cost of sales data</p>
          {:else}
            <div class="space-y-1">
              {#each reportData.costOfSales as account}
                <div class="flex justify-between">
                  <span class="text-sm" style="color: var(--color-neutral-600);">{account.accountName}</span>
                  <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(account.balance)}</span>
                </div>
              {/each}
              <div class="flex justify-between pt-1" style="border-top: 1px solid var(--color-neutral-200);">
                <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Cost of Sales</span>
                <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalCostOfSales)}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Gross Profit -->
        <div class="mb-6 pt-1 pb-1" style="border-top: 1px solid var(--color-neutral-200); border-bottom: 1px solid var(--color-neutral-200);">
          <div class="flex justify-between">
            <span class="font-bold" style="color: var(--color-neutral-800);">Gross Profit</span>
            <span class="font-bold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.grossProfit)}</span>
          </div>
        </div>

        <!-- Operating Expenses Section -->
        <div class="mb-6">
          <h3 class="text-lg font-bold mb-2" style="color: var(--color-neutral-800);">Operating Expenses</h3>
          {#if reportData.operatingExpenses.length === 0}
            <p class="text-sm italic" style="color: var(--color-neutral-500);">No operating expenses data</p>
          {:else}
            <div class="space-y-1">
              {#each reportData.operatingExpenses as account}
                <div class="flex justify-between">
                  <span class="text-sm" style="color: var(--color-neutral-600);">{account.accountName}</span>
                  <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(account.balance)}</span>
                </div>
              {/each}
              <div class="flex justify-between pt-1" style="border-top: 1px solid var(--color-neutral-200);">
                <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Operating Expenses</span>
                <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalOperatingExpenses)}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Operating Income -->
        <div class="mb-6 pt-1 pb-1" style="border-top: 1px solid var(--color-neutral-200); border-bottom: 1px solid var(--color-neutral-200);">
          <div class="flex justify-between">
            <span class="font-bold" style="color: var(--color-neutral-800);">Operating Income</span>
            <span class="font-bold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.operatingIncome)}</span>
          </div>
        </div>

        <!-- Other Income Section -->
        {#if reportData.otherIncome.length > 0}
          <div class="mb-6">
            <h3 class="text-lg font-bold mb-2" style="color: var(--color-neutral-800);">Other Income</h3>
            <div class="space-y-1">
              {#each reportData.otherIncome as account}
                <div class="flex justify-between">
                  <span class="text-sm" style="color: var(--color-neutral-600);">{account.accountName}</span>
                  <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(account.balance)}</span>
                </div>
              {/each}
              <div class="flex justify-between pt-1" style="border-top: 1px solid var(--color-neutral-200);">
                <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Other Income</span>
                <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalOtherIncome)}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Other Expenses Section -->
        {#if reportData.otherExpenses.length > 0}
          <div class="mb-6">
            <h3 class="text-lg font-bold mb-2" style="color: var(--color-neutral-800);">Other Expenses</h3>
            <div class="space-y-1">
              {#each reportData.otherExpenses as account}
                <div class="flex justify-between">
                  <span class="text-sm" style="color: var(--color-neutral-600);">{account.accountName}</span>
                  <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(account.balance)}</span>
                </div>
              {/each}
              <div class="flex justify-between pt-1" style="border-top: 1px solid var(--color-neutral-200);">
                <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Other Expenses</span>
                <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalOtherExpenses)}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Income Before Tax -->
        <div class="mb-6 pt-1 pb-1" style="border-top: 1px solid var(--color-neutral-200); border-bottom: 1px solid var(--color-neutral-200);">
          <div class="flex justify-between">
            <span class="font-bold" style="color: var(--color-neutral-800);">Income Before Tax</span>
            <span class="font-bold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.incomeBeforeTax)}</span>
          </div>
        </div>

        <!-- Taxes Section -->
        {#if reportData.taxes.length > 0}
          <div class="mb-6">
            <h3 class="text-lg font-bold mb-2" style="color: var(--color-neutral-800);">Taxes</h3>
            <div class="space-y-1">
              {#each reportData.taxes as account}
                <div class="flex justify-between">
                  <span class="text-sm" style="color: var(--color-neutral-600);">{account.accountName}</span>
                  <span class="text-sm font-medium" style="color: var(--color-neutral-800);">{formatCurrency(account.balance)}</span>
                </div>
              {/each}
              <div class="flex justify-between pt-1" style="border-top: 1px solid var(--color-neutral-200);">
                <span class="text-sm font-semibold" style="color: var(--color-neutral-700);">Total Taxes</span>
                <span class="text-sm font-semibold" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalTaxes)}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Net Income -->
        <div class="pt-2 pb-2" style="border-top: 1px solid var(--color-neutral-300); border-bottom: 1px solid var(--color-neutral-300);">
          <div class="flex justify-between">
            <span class="font-bold text-lg" style="color: var(--color-neutral-800);">Net Income</span>
            <span class="font-bold text-lg" style="color: var(--color-neutral-800);">{formatCurrency(reportData.netIncome)}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</ReportContainer>
