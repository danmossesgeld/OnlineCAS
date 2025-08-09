<script lang="ts">
  import { onMount } from 'svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import { getIncomeStatementData, getBalanceSheetData, getARAgingData, getAPAgingData } from '$lib/utils/reportingService';
  import { formatCurrency } from '$lib/utils/formatters';
  import { queryCollectionDocs } from '$lib/utils/firestoreCrud';
  
  // Dashboard data
  let isLoading = true;
  let revenueData = [];
  let expenseData = [];
  let profitData = [];
  let arTotal = 0;
  let apTotal = 0;
  let cashBalance = 0;
  let currentRatio = 0;
  let quickRatio = 0;
  let topCustomers = [];
  let topVendors = [];
  let unpostedTransactions = 0;
  let recentTransactions = [];
  
  // Date ranges
  let today = new Date();
  let startOfYear = new Date(today.getFullYear(), 0, 1);
  let endOfYear = new Date(today.getFullYear(), 11, 31);
  
  // Monthly labels for charts
  const monthLabels = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  
  onMount(async () => {
    try {
      await loadDashboardData();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      isLoading = false;
    }
  });
  
  async function loadDashboardData() {
    // Get financial statement data
    const incomeData = await getIncomeStatementData({
      startDate: startOfYear,
      endDate: today
    });
    
    const balanceData = await getBalanceSheetData({
      startDate: startOfYear,
      endDate: today
    });
    
    // Get AR/AP aging data
    const arAgingData = await getARAgingData(today);
    const apAgingData = await getAPAgingData(today);
    
    // Calculate key financial metrics
    calculateFinancialMetrics(incomeData, balanceData, arAgingData, apAgingData);
    
    // Load monthly performance data
    await loadMonthlyPerformanceData();
    
    // Load unposted transactions count
    await countUnpostedTransactions();
    
    // Load recent transactions
    await loadRecentTransactions();
    
    // Load top customers and vendors
    await loadTopCustomersAndVendors();
  }
  
  function calculateFinancialMetrics(incomeData, balanceData, arAgingData, apAgingData) {
    // AR/AP totals
    arTotal = arAgingData.grandTotal;
    apTotal = apAgingData.grandTotal;
    
    // Find cash account balance
    const cashAccounts = balanceData.currentAssets.filter(account => 
      account.accountName.toLowerCase().includes('cash') || 
      account.accountName.toLowerCase().includes('bank')
    );
    cashBalance = cashAccounts.reduce((sum, account) => sum + account.balance, 0);
    
    // Calculate liquidity ratios
    const currentAssets = balanceData.totalCurrentAssets;
    const currentLiabilities = balanceData.totalCurrentLiabilities;
    currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
    
    // Quick ratio: (Current Assets - Inventory) / Current Liabilities
    const inventory = balanceData.currentAssets.filter(account => 
      account.accountName.toLowerCase().includes('inventory')
    ).reduce((sum, account) => sum + account.balance, 0);
    
    quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0;
  }
  
  async function loadMonthlyPerformanceData() {
    // Generate monthly performance data for the current year
    revenueData = Array(12).fill(0);
    expenseData = Array(12).fill(0);
    profitData = Array(12).fill(0);
    
    // Query all journal entries for the year
    const filters = [
      { field: 'journalDate', operator: '>=', value: startOfYear },
      { field: 'journalDate', operator: '<=', value: endOfYear },
      { field: 'isPosted', operator: '==', value: true }
    ];
    
    const journalEntries = await queryCollectionDocs('transactions/accounting/journalEntries', filters);
    
    // Fetch lines for each entry
    const entriesWithLines = await Promise.all(
      journalEntries.map(async entry => {
        const lines = await queryCollectionDocs(`transactions/accounting/journalEntries/${entry.id}/lines`);
        return {
          ...entry,
          date: new Date(entry.journalDate.seconds * 1000),
          month: new Date(entry.journalDate.seconds * 1000).getMonth(),
          lines: lines
        };
      })
    );
    
    // Process each entry to build monthly data
    entriesWithLines.forEach(entry => {
      entry.lines.forEach(line => {
        const month = entry.month;
        
        // Check account type based on account name patterns
        // Revenue accounts
        if (line.accountName.toLowerCase().includes('revenue') || 
            line.accountName.toLowerCase().includes('sales') || 
            line.accountName.toLowerCase().includes('income')) {
          
          revenueData[month] += line.credit > 0 ? line.credit : -line.debit;
        }
        // Expense accounts
        else if (line.accountName.toLowerCase().includes('expense') || 
                 line.accountName.toLowerCase().includes('cost')) {
          
          expenseData[month] += line.debit > 0 ? line.debit : -line.credit;
        }
      });
    });
    
    // Calculate monthly profit
    profitData = revenueData.map((rev, idx) => rev - expenseData[idx]);
  }
  
  async function countUnpostedTransactions() {
    const filters = [
      { field: 'isPosted', operator: '==', value: false }
    ];
    
    const unposted = await queryCollectionDocs('transactions/accounting/journalEntries', filters);
    unpostedTransactions = unposted.length;
  }
  
  async function loadRecentTransactions() {
    // Get the 10 most recent transactions
    const filters = [
      { field: 'journalDate', operator: '<=', value: today }
    ];
    
    const entries = await queryCollectionDocs('transactions/accounting/journalEntries', filters);
    
    // Sort by date (most recent first) and take the first 10
    recentTransactions = entries
      .sort((a, b) => b.journalDate.seconds - a.journalDate.seconds)
      .slice(0, 10)
      .map(entry => ({
        id: entry.id,
        date: new Date(entry.journalDate.seconds * 1000),
        reference: entry.referenceNo,
        description: entry.description,
        amount: entry.totalDebit, // Both debit and credit should be equal
        sourceType: entry.sourceType,
        isPosted: entry.isPosted
      }));
  }
  
  async function loadTopCustomersAndVendors() {
    // Get AR data to find top customers
    const arData = await getARAgingData(today);
    topCustomers = arData.customers
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);
      
    // Get AP data to find top vendors
    const apData = await getAPAgingData(today);
    topVendors = apData.vendors
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);
  }
  
  // Format number as percentage
  function formatPercentage(value) {
    return (value * 100).toFixed(2) + '%';
  }
</script>

<FormLayout title="Financial Dashboard" backPath="/">
  {#if isLoading}
    <div class="p-10 text-center">
      <div class="animate-pulse text-lg">Loading dashboard data...</div>
    </div>
  {:else}
    <!-- Key metrics section -->
    <FormSection title="Key Financial Metrics">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Cash Balance</dt>
            <dd class="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(cashBalance)}
            </dd>
          </div>
        </div>
        
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Accounts Receivable</dt>
            <dd class="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(arTotal)}
            </dd>
          </div>
        </div>
        
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Accounts Payable</dt>
            <dd class="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(apTotal)}
            </dd>
          </div>
        </div>
        
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Current Ratio</dt>
            <dd class="mt-1 text-3xl font-semibold text-gray-900">
              {currentRatio.toFixed(2)}
            </dd>
          </div>
        </div>
        
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Quick Ratio</dt>
            <dd class="mt-1 text-3xl font-semibold text-gray-900">
              {quickRatio.toFixed(2)}
            </dd>
          </div>
        </div>
        
        <div class="bg-white overflow-hidden shadow rounded-lg">
          <div class="px-4 py-5 sm:p-6">
            <dt class="text-sm font-medium text-gray-500 truncate">Unposted Transactions</dt>
            <dd class="mt-1 text-3xl font-semibold {unpostedTransactions > 0 ? 'text-red-600' : 'text-green-600'}">
              {unpostedTransactions}
            </dd>
          </div>
        </div>
      </div>
    </FormSection>
    
    <!-- Monthly performance chart section -->
    <FormSection title="Monthly Performance" withSeparator={true}>
      <div class="h-80">
        <!-- This is a placeholder for where a chart would be rendered -->
        <!-- In a real implementation, you would use a chart library like Chart.js -->
        <div class="bg-gray-100 p-4 rounded-lg h-full flex items-center justify-center">
          <div class="text-center">
            <p class="mb-4 text-gray-700">Monthly Revenue and Expenses Chart</p>
            <p class="text-sm text-gray-500">
              (This is a placeholder. Integrate a chart library like Chart.js to visualize the monthly data)
            </p>
            <div class="mt-4 text-left">
              <div class="grid grid-cols-3 gap-4 text-sm">
                {#each monthLabels as month, i}
                  {#if i <= today.getMonth()}
                    <div class="mb-2">
                      <div class="font-medium">{month}</div>
                      <div class="text-green-600">Revenue: {formatCurrency(revenueData[i])}</div>
                      <div class="text-red-600">Expense: {formatCurrency(expenseData[i])}</div>
                      <div class="font-semibold {profitData[i] >= 0 ? 'text-green-600' : 'text-red-600'}">
                        Profit: {formatCurrency(profitData[i])}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        </div>
      </div>
    </FormSection>
    
    <!-- Top customers and vendors -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <FormSection title="Top Customers" withSeparator={true}>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#if topCustomers.length === 0}
                <tr>
                  <td colspan="2" class="px-6 py-4 text-center text-sm text-gray-500">No customers found</td>
                </tr>
              {:else}
                {#each topCustomers as customer}
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                      {formatCurrency(customer.totalAmount)}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </FormSection>
      
      <FormSection title="Top Vendors" withSeparator={true}>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              {#if topVendors.length === 0}
                <tr>
                  <td colspan="2" class="px-6 py-4 text-center text-sm text-gray-500">No vendors found</td>
                </tr>
              {:else}
                {#each topVendors as vendor}
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{vendor.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                      {formatCurrency(vendor.totalAmount)}
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </FormSection>
    </div>
    
    <!-- Recent transactions -->
    <FormSection title="Recent Transactions" withSeparator={true}>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#if recentTransactions.length === 0}
              <tr>
                <td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">No recent transactions found</td>
              </tr>
            {:else}
              {#each recentTransactions as transaction}
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{transaction.date.toLocaleDateString()}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{transaction.reference}</td>
                  <td class="px-6 py-4 text-sm text-gray-500">{transaction.description}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center text-sm">
                    <span class={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${transaction.isPosted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {transaction.isPosted ? 'Posted' : 'Unposted'}
                    </span>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </FormSection>
  {/if}
</FormLayout>
