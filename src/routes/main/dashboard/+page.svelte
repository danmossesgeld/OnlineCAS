<script lang="ts">
  import { onMount } from 'svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import { formatCurrency } from '$lib/utils/formatters';
  import { queryCollectionDocs } from '$lib/utils/firestoreCrud';
  
  // Dashboard data
  let isLoading: boolean = true;
  let revenueData: number[] = [];
  let expenseData: number[] = [];
  let profitData: number[] = [];
  let arTotal = 0;
  let apTotal = 0;
  let cashBalance = 0;
  let currentRatio = 0;
  let quickRatio = 0;
  let topCustomers: Array<{ name: string; totalAmount: number }> = [];
  let topVendors: Array<{ name: string; totalAmount: number }> = [];
  let unpostedTransactions = 0;
  let recentTransactions: Array<{ id: string; date: Date; reference: string; description: string; amount: number; sourceType: string; isPosted: boolean }> = [];
  
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
      console.log('Dashboard mounting with date range:', { startOfYear, endOfYear, today });
      await loadDashboardData();
      renderCharts();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      isLoading = false;
    }
  });
  
  async function loadDashboardData() {
    try {
      console.log('Loading dashboard data...');
      
      // Load monthly performance data first (this gets journal entries)
      await loadMonthlyPerformanceData();
      
      // Calculate financial metrics from journal entries directly
      await calculateMetricsFromJournalEntries();
      
      // Load unposted transactions count
      await countUnpostedTransactions();
      
      // Load recent transactions
      await loadRecentTransactions();
      
      // Load top customers and vendors from journal entries
      await loadTopCustomersAndVendorsFromJournalEntries();
      
      console.log('Dashboard data loading completed');
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Set default values if data loading fails
      cashBalance = 0;
      arTotal = 0;
      apTotal = 0;
      currentRatio = 0;
      quickRatio = 0;
      unpostedTransactions = 0;
      revenueData = Array(12).fill(0);
      expenseData = Array(12).fill(0);
      profitData = Array(12).fill(0);
      topCustomers = [];
      topVendors = [];
      recentTransactions = [];
    }
  }
  
  function renderCharts() {
    // Lazy-load Chart.js from CDN to avoid bundling issues
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    script.async = true;
    script.onload = () => {
      // Revenue vs Expense line chart
      const ctx1 = document.getElementById('revExpChart') as HTMLCanvasElement | null;
      if (ctx1 && (window as any).Chart) {
        // Only use data up to the current month
        const lastIdx = new Date().getMonth();
        const labels = monthLabels.slice(0, lastIdx + 1);
        const rev = revenueData.slice(0, lastIdx + 1);
        const exp = expenseData.slice(0, lastIdx + 1);
        new (window as any).Chart(ctx1, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Revenue',
                data: rev,
                borderColor: '#16a34a',
                backgroundColor: 'rgba(22,163,74,0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'Expense',
                data: exp,
                borderColor: '#dc2626',
                backgroundColor: 'rgba(220,38,38,0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
      // AR vs AP bar chart
      const ctx2 = document.getElementById('arApChart') as HTMLCanvasElement | null;
      if (ctx2 && (window as any).Chart) {
        new (window as any).Chart(ctx2, {
          type: 'bar',
          data: {
            labels: ['A/R', 'A/P'],
            datasets: [
              {
                label: 'Outstanding',
                data: [arTotal, apTotal],
                backgroundColor: ['#2563eb', '#f59e0b']
              }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
    };
    document.head.appendChild(script);
  }
  
  async function loadMonthlyPerformanceData() {
    try {
      // Generate monthly performance data for the current year
      revenueData = Array(12).fill(0);
      expenseData = Array(12).fill(0);
      profitData = Array(12).fill(0);
      
      // Query all journal entries for the year
      const filters: any = [
        { field: 'journalDate', operator: '>=', value: startOfYear },
        { field: 'journalDate', operator: '<=', value: endOfYear },
        { field: 'isPosted', operator: '==', value: true }
      ];
      
      const journalEntries: any[] = await queryCollectionDocs('accounting/journalEntries', filters);
      console.log('Found journal entries:', journalEntries?.length || 0, journalEntries);
      
      if (journalEntries && journalEntries.length > 0) {
        // Log the first entry to see what fields are available
        console.log('Sample journal entry:', journalEntries[0]);
        
        // Process each entry to build monthly data
        journalEntries.forEach((entry: any) => {
          if (entry.lines && Array.isArray(entry.lines)) {
            const entryDate = entry.journalDate?.seconds ? new Date(entry.journalDate.seconds * 1000) : new Date();
            const month = entryDate.getMonth();
            
            entry.lines.forEach((line: any) => {
              if (line.accountName) {
                const accountName = line.accountName.toLowerCase();
                
                // Revenue accounts
                if (accountName.includes('revenue') || 
                    accountName.includes('sales') || 
                    accountName.includes('income')) {
                  revenueData[month] += line.credit > 0 ? line.credit : -line.debit;
                }
                // Expense accounts
                else if (accountName.includes('expense') || 
                         accountName.includes('cost')) {
                  expenseData[month] += line.debit > 0 ? line.debit : -line.credit;
                }
              }
            });
          }
        });
        
        console.log('Processed monthly data:', { revenueData, expenseData });
      } else {
        console.log('No journal entries found for the period');
      }
      
      // Calculate monthly profit
      profitData = revenueData.map((rev, idx) => rev - expenseData[idx]);
    } catch (error) {
      console.error('Error loading monthly performance data:', error);
      // Keep default zero values
    }
  }
  
  async function countUnpostedTransactions() {
    try {
      const filters: any = [
        { field: 'isPosted', operator: '==', value: false }
      ];
      
      const unposted = await queryCollectionDocs('accounting/journalEntries', filters);
      unpostedTransactions = unposted ? unposted.length : 0;
    } catch (error) {
      console.error('Error counting unposted transactions:', error);
      unpostedTransactions = 0;
    }
  }
  
  async function loadRecentTransactions() {
    try {
      // Get the 10 most recent transactions
      const filters: any = [
        { field: 'journalDate', operator: '<=', value: today }
      ];
      
      const entries: any[] = await queryCollectionDocs('accounting/journalEntries', filters);
      
      if (entries && entries.length > 0) {
        // Sort by date (most recent first) and take the first 10
        recentTransactions = entries
          .sort((a, b) => {
            const aSeconds = a.journalDate?.seconds || 0;
            const bSeconds = b.journalDate?.seconds || 0;
            return bSeconds - aSeconds;
          })
          .slice(0, 10)
          .map(entry => ({
            id: entry.id || entry.documentId || '',
            date: entry.journalDate?.seconds ? new Date(entry.journalDate.seconds * 1000) : new Date(),
            reference: entry.referenceNo || entry.documentNo || '',
            description: entry.description || '',
            amount: entry.totalDebit || entry.totalAmount || 0,
            sourceType: entry.sourceType || '',
            isPosted: entry.isPosted || false
          }));
      } else {
        recentTransactions = [];
      }
    } catch (error) {
      console.error('Error loading recent transactions:', error);
      recentTransactions = [];
    }
  }
  
  async function calculateMetricsFromJournalEntries() {
    try {
      // Get all journal entries for the current year
      const filters: any = [
        { field: 'journalDate', operator: '>=', value: startOfYear },
        { field: 'journalDate', operator: '<=', value: endOfYear },
        { field: 'isPosted', operator: '==', value: true }
      ];
      
      const journalEntries: any[] = await queryCollectionDocs('accounting/journalEntries', filters);
      console.log('Calculating metrics from journal entries:', journalEntries?.length || 0);
      
      if (journalEntries && journalEntries.length > 0) {
        let totalRevenue = 0;
        let totalExpenses = 0;
        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalEquity = 0;
        
        journalEntries.forEach((entry: any) => {
          if (entry.lines && Array.isArray(entry.lines)) {
            entry.lines.forEach((line: any) => {
              if (line.accountName) {
                const accountName = line.accountName.toLowerCase();
                const amount = line.credit > 0 ? line.credit : line.debit;
                
                // Revenue accounts
                if (accountName.includes('revenue') || 
                    accountName.includes('sales') || 
                    accountName.includes('income')) {
                  totalRevenue += amount;
                }
                // Expense accounts
                else if (accountName.includes('expense') || 
                         accountName.includes('cost')) {
                  totalExpenses += amount;
                }
                // Asset accounts
                else if (accountName.includes('cash') || 
                         accountName.includes('bank') ||
                         accountName.includes('receivable') ||
                         accountName.includes('inventory')) {
                  totalAssets += amount;
                }
                // Liability accounts
                else if (accountName.includes('payable') || 
                         accountName.includes('tax') ||
                         accountName.includes('loan')) {
                  totalLiabilities += amount;
                }
                // Equity accounts
                else if (accountName.includes('equity') || 
                         accountName.includes('capital') ||
                         accountName.includes('retained')) {
                  totalEquity += amount;
                }
              }
            });
          }
        });
        
        // Calculate metrics
        cashBalance = totalAssets; // Simplified - just use total assets for now
        arTotal = totalRevenue; // Simplified - use revenue as AR
        apTotal = totalLiabilities; // Use liabilities as AP
        
        // Calculate ratios
        currentRatio = totalLiabilities > 0 ? totalAssets / totalLiabilities : 0;
        quickRatio = totalLiabilities > 0 ? (totalAssets - 0) / totalLiabilities : 0; // Simplified
        
        console.log('Calculated metrics from journal entries:', { 
          totalRevenue, totalExpenses, totalAssets, totalLiabilities, totalEquity,
          cashBalance, arTotal, apTotal, currentRatio, quickRatio 
        });
      }
    } catch (error) {
      console.error('Error calculating metrics from journal entries:', error);
    }
  }
  
  async function loadTopCustomersAndVendorsFromJournalEntries() {
    try {
      // Get all journal entries for the current year
      const filters: any = [
        { field: 'journalDate', operator: '>=', value: startOfYear },
        { field: 'journalDate', operator: '<=', value: endOfYear },
        { field: 'isPosted', operator: '==', value: true }
      ];
      
      const journalEntries: any[] = await queryCollectionDocs('accounting/journalEntries', filters);
      
      if (journalEntries && journalEntries.length > 0) {
        // Track customer and vendor totals from journal entries
        const customerTotals: { [customerId: string]: number } = {};
        const vendorTotals: { [vendorId: string]: number } = {};
        
        journalEntries.forEach((entry: any) => {
          if (entry.lines && Array.isArray(entry.lines)) {
            entry.lines.forEach((line: any) => {
              if (line.accountName) {
                const accountName = line.accountName.toLowerCase();
                const amount = line.credit > 0 ? line.credit : line.debit;
                
                // Customer-related accounts (receivables, sales)
                if (accountName.includes('receivable') || 
                    accountName.includes('sales') || 
                    accountName.includes('revenue')) {
                  const customerId = entry.customer || entry.customerId || 'unknown';
                  customerTotals[customerId] = (customerTotals[customerId] || 0) + amount;
                }
                
                // Vendor-related accounts (payables, purchases)
                if (accountName.includes('payable') || 
                    accountName.includes('purchase') || 
                    accountName.includes('expense')) {
                  const vendorId = entry.vendor || entry.vendorId || 'unknown';
                  vendorTotals[vendorId] = (vendorTotals[vendorId] || 0) + amount;
                }
              }
            });
          }
        });
        
        // Convert to arrays and sort
        topCustomers = Object.entries(customerTotals)
          .map(([id, totalAmount]) => ({ id, name: id, totalAmount }))
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 5);
          
        topVendors = Object.entries(vendorTotals)
          .map(([id, totalAmount]) => ({ id, name: id, totalAmount }))
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 5);
        
        console.log('Top customers and vendors from journal entries:', { topCustomers, topVendors });
      } else {
        topCustomers = [];
        topVendors = [];
      }
    } catch (error) {
      console.error('Error loading top customers and vendors from journal entries:', error);
      topCustomers = [];
      topVendors = [];
    }
  }
  
  // Format number as percentage
  function formatPercentage(value: number) {
    return (value * 100).toFixed(2) + '%';
  }
</script>

<FormLayout title="Financial Dashboard">
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
    
    <!-- Monthly performance chart section (Chart.js) -->
    <FormSection title="Monthly Performance" withSeparator={true}>
      <div class="bg-white rounded-lg shadow p-4">
        <canvas id="revExpChart" height="120"></canvas>
      </div>
    </FormSection>

    <FormSection title="AR vs AP" withSeparator={true}>
      <div class="bg-white rounded-lg shadow p-4">
        <canvas id="arApChart" height="80"></canvas>
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
