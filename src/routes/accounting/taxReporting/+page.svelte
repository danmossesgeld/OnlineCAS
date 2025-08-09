<script lang="ts">
  import { onMount } from 'svelte';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';
  import { queryCollectionDocs } from '$lib/utils/firestoreCrud';
  import { formatCurrency } from '$lib/utils/formatters';
  
  // Tax reporting parameters
  let startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3); // Default to last 3 months
  let endDate = new Date();
  let loading = false;
  let error: string | null = null;
  let reportData: any = null;
  
  // Tax categories and rates
  const TAX_CATEGORIES = {
    OUTPUT_VAT: 'output-vat',
    INPUT_VAT: 'input-vat',
    WITHHOLDING_TAX: 'withholding-tax'
  };
  
  onMount(() => {
    // Format dates to first and last day of the month
    startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    endDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
  });
  
  async function handleGenerateReport(event: CustomEvent) {
    const params = event.detail;
    startDate = params.startDate;
    endDate = params.endDate;
    
    await generateReport();
  }
  
  async function generateReport() {
    loading = true;
    error = null;
    
    try {
      // Get all journal entries within date range
      const journalEntries = await getJournalEntriesInDateRange(startDate, endDate);
      
      // Extract tax-related entries
      const { outputVat, inputVat, withholdingTax } = extractTaxEntries(journalEntries);
      
      // Calculate monthly summaries
      const monthlySummaries = calculateMonthlySummaries(outputVat, inputVat, withholdingTax);
      
      // Prepare report data
      reportData = {
        outputVat,
        inputVat,
        withholdingTax,
        monthlySummaries,
        totalOutputVat: sumAmounts(outputVat),
        totalInputVat: sumAmounts(inputVat),
        totalWithholdingTax: sumAmounts(withholdingTax),
        netVatPayable: sumAmounts(outputVat) - sumAmounts(inputVat)
      };
      
      loading = false;
    } catch (err) {
      console.error('Error generating tax report:', err);
      error = (err as Error).message;
      loading = false;
    }
  }
  
  async function getJournalEntriesInDateRange(start, end) {
    const filters = [
      { field: 'journalDate', operator: '>=', value: start },
      { field: 'journalDate', operator: '<=', value: end },
      { field: 'isPosted', operator: '==', value: true }
    ];
    
    const entries = await queryCollectionDocs('transactions/accounting/journalEntries', filters);
    
    // Fetch detailed lines for each entry
    const entriesWithLines = await Promise.all(
      entries.map(async entry => {
        const lines = await queryCollectionDocs(`transactions/accounting/journalEntries/${entry.id}/lines`);
        return {
          ...entry,
          lines: lines.sort((a, b) => a.lineNo - b.lineNo)
        };
      })
    );
    
    return entriesWithLines;
  }
  
  function extractTaxEntries(journalEntries) {
    const outputVat = [];
    const inputVat = [];
    const withholdingTax = [];
    
    // Process each journal entry
    journalEntries.forEach(entry => {
      const entryDate = new Date(entry.journalDate.seconds * 1000);
      
      // Process each line in the entry
      entry.lines.forEach(line => {
        // Check for tax accounts by name pattern or specific account IDs
        // This logic will need to be adjusted based on your chart of accounts
        if (line.accountName.toLowerCase().includes('output vat') || 
            line.accountName.toLowerCase().includes('vat payable')) {
          outputVat.push({
            date: entryDate,
            description: entry.description,
            reference: entry.referenceNo,
            amount: line.credit > 0 ? line.credit : line.debit,
            isDebit: line.debit > 0,
            sourceType: entry.sourceType,
            sourceId: entry.sourceId
          });
        }
        else if (line.accountName.toLowerCase().includes('input vat') || 
                 line.accountName.toLowerCase().includes('vat receivable')) {
          inputVat.push({
            date: entryDate,
            description: entry.description,
            reference: entry.referenceNo,
            amount: line.debit > 0 ? line.debit : line.credit,
            isDebit: line.debit > 0,
            sourceType: entry.sourceType,
            sourceId: entry.sourceId
          });
        }
        else if (line.accountName.toLowerCase().includes('withholding tax')) {
          withholdingTax.push({
            date: entryDate,
            description: entry.description,
            reference: entry.referenceNo,
            amount: line.credit > 0 ? line.credit : line.debit,
            isDebit: line.debit > 0,
            sourceType: entry.sourceType,
            sourceId: entry.sourceId
          });
        }
      });
    });
    
    return { outputVat, inputVat, withholdingTax };
  }
  
  function calculateMonthlySummaries(outputVat, inputVat, withholdingTax) {
    const summaries = {};
    
    // Helper function to add an entry to the monthly summary
    function addToMonthSummary(entry, taxType) {
      const yearMonth = `${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!summaries[yearMonth]) {
        summaries[yearMonth] = {
          year: entry.date.getFullYear(),
          month: entry.date.getMonth() + 1,
          monthName: new Date(entry.date.getFullYear(), entry.date.getMonth(), 1).toLocaleString('default', { month: 'long' }),
          outputVat: 0,
          inputVat: 0,
          withholdingTax: 0,
          netVatPayable: 0
        };
      }
      
      if (taxType === TAX_CATEGORIES.OUTPUT_VAT) {
        summaries[yearMonth].outputVat += entry.isDebit ? -entry.amount : entry.amount;
      } else if (taxType === TAX_CATEGORIES.INPUT_VAT) {
        summaries[yearMonth].inputVat += entry.isDebit ? entry.amount : -entry.amount;
      } else if (taxType === TAX_CATEGORIES.WITHHOLDING_TAX) {
        summaries[yearMonth].withholdingTax += entry.isDebit ? -entry.amount : entry.amount;
      }
      
      // Calculate net VAT payable
      summaries[yearMonth].netVatPayable = summaries[yearMonth].outputVat - summaries[yearMonth].inputVat;
    }
    
    // Process all tax entries
    outputVat.forEach(entry => addToMonthSummary(entry, TAX_CATEGORIES.OUTPUT_VAT));
    inputVat.forEach(entry => addToMonthSummary(entry, TAX_CATEGORIES.INPUT_VAT));
    withholdingTax.forEach(entry => addToMonthSummary(entry, TAX_CATEGORIES.WITHHOLDING_TAX));
    
    // Convert to array and sort by year and month
    return Object.values(summaries).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }
  
  function sumAmounts(entries) {
    return entries.reduce((sum, entry) => {
      return sum + (entry.isDebit ? -entry.amount : entry.amount);
    }, 0);
  }
  
  function handleExport(event: CustomEvent) {
    if (!reportData) return;
    
    // Create CSV content
    let csvContent = "Tax Reporting\n";
    csvContent += `For the period ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}\n\n`;
    
    // Monthly Summary
    csvContent += "MONTHLY SUMMARY\n";
    csvContent += "Month,Output VAT,Input VAT,Net VAT Payable,Withholding Tax\n";
    
    reportData.monthlySummaries.forEach(month => {
      csvContent += `${month.monthName} ${month.year},${month.outputVat},${month.inputVat},${month.netVatPayable},${month.withholdingTax}\n`;
    });
    csvContent += `TOTAL,${reportData.totalOutputVat},${reportData.totalInputVat},${reportData.netVatPayable},${reportData.totalWithholdingTax}\n\n`;
    
    // Output VAT Detail
    csvContent += "OUTPUT VAT DETAIL\n";
    csvContent += "Date,Reference,Description,Amount\n";
    reportData.outputVat.forEach(entry => {
      csvContent += `${entry.date.toLocaleDateString()},${entry.reference},"${entry.description}",${entry.isDebit ? -entry.amount : entry.amount}\n`;
    });
    csvContent += `TOTAL,,,"${reportData.totalOutputVat}"\n\n`;
    
    // Input VAT Detail
    csvContent += "INPUT VAT DETAIL\n";
    csvContent += "Date,Reference,Description,Amount\n";
    reportData.inputVat.forEach(entry => {
      csvContent += `${entry.date.toLocaleDateString()},${entry.reference},"${entry.description}",${entry.isDebit ? entry.amount : -entry.amount}\n`;
    });
    csvContent += `TOTAL,,,"${reportData.totalInputVat}"\n\n`;
    
    // Withholding Tax Detail
    csvContent += "WITHHOLDING TAX DETAIL\n";
    csvContent += "Date,Reference,Description,Amount\n";
    reportData.withholdingTax.forEach(entry => {
      csvContent += `${entry.date.toLocaleDateString()},${entry.reference},"${entry.description}",${entry.isDebit ? -entry.amount : entry.amount}\n`;
    });
    csvContent += `TOTAL,,,"${reportData.totalWithholdingTax}"\n`;
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', event.detail.filename || `tax_report.csv`);
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
  title="Tax Reporting"
  description="Track and analyze tax liabilities and credits"
  {loading}
  {error}
  parameterType="dateRange"
  {startDate}
  {endDate}
  reportId="taxReporting"
  filename="tax_report"
  on:generateReport={handleGenerateReport}
  on:export={handleExport}
>
  <div slot="report-content">
    {#if !reportData}
      <div class="text-center py-10">
        <p class="text-gray-600">No tax data available for the selected period.</p>
      </div>
    {:else}
      <!-- Monthly Summary Section -->
      <div class="bg-white rounded-lg shadow mb-8">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-800">Monthly Tax Summary</h3>
        </div>
        <div class="p-6">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Output VAT</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Input VAT</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Net VAT Payable</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Withholding Tax</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                {#each reportData.monthlySummaries as month}
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{month.monthName} {month.year}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(month.outputVat)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(month.inputVat)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-right {month.netVatPayable >= 0 ? 'text-red-600' : 'text-green-600'}">
                      {formatCurrency(month.netVatPayable)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(month.withholdingTax)}</td>
                  </tr>
                {/each}
                <tr class="bg-gray-50 font-semibold">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">TOTAL</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(reportData.totalOutputVat)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(reportData.totalInputVat)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-right {reportData.netVatPayable >= 0 ? 'text-red-600' : 'text-green-600'}">
                    {formatCurrency(reportData.netVatPayable)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(reportData.totalWithholdingTax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- Output VAT Detail Section -->
      <div class="bg-white rounded-lg shadow mb-8">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-800">Output VAT Detail</h3>
        </div>
        <div class="p-6">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                {#each reportData.outputVat as entry}
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.date.toLocaleDateString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.reference}</td>
                    <td class="px-6 py-4 text-sm text-gray-900">{entry.description}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(entry.isDebit ? -entry.amount : entry.amount)}
                    </td>
                  </tr>
                {/each}
                <tr class="bg-gray-50 font-semibold">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="3">TOTAL</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(reportData.totalOutputVat)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- Input VAT Detail Section -->
      <div class="bg-white rounded-lg shadow mb-8">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-800">Input VAT Detail</h3>
        </div>
        <div class="p-6">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                {#each reportData.inputVat as entry}
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.date.toLocaleDateString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.reference}</td>
                    <td class="px-6 py-4 text-sm text-gray-900">{entry.description}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(entry.isDebit ? entry.amount : -entry.amount)}
                    </td>
                  </tr>
                {/each}
                <tr class="bg-gray-50 font-semibold">
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="3">TOTAL</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(reportData.totalInputVat)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- Withholding Tax Detail Section -->
      {#if reportData.withholdingTax.length > 0}
        <div class="bg-white rounded-lg shadow mb-8">
          <div class="px-6 py-4 border-b border-gray-200">
            <h3 class="text-lg font-semibold text-gray-800">Withholding Tax Detail</h3>
          </div>
          <div class="p-6">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                    <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  {#each reportData.withholdingTax as entry}
                    <tr>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.date.toLocaleDateString()}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.reference}</td>
                      <td class="px-6 py-4 text-sm text-gray-900">{entry.description}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrency(entry.isDebit ? -entry.amount : entry.amount)}
                      </td>
                    </tr>
                  {/each}
                  <tr class="bg-gray-50 font-semibold">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="3">TOTAL</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(reportData.totalWithholdingTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</ReportContainer>
