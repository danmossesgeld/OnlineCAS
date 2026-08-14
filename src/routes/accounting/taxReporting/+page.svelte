<script lang="ts">
  import { onMount } from 'svelte';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';
  import { queryCollectionDocs, type FilterCondition } from '$lib/utils/firestoreCrud';
  import { formatCurrency } from '$lib/utils/formatters';
  
  // Tax reporting parameters
  let startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3); // Default to last 3 months
  let endDate = new Date();
  let loading = false;
  let error: string | null = null;
  let reportData: any = null;
  
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
  
  async function getJournalEntriesInDateRange(start: Date, end: Date) {
    const filters: FilterCondition[] = [
      { field: 'journalDate', operator: '>=', value: start },
      { field: 'journalDate', operator: '<=', value: end },
      { field: 'isPosted', operator: '==', value: true }
    ];
    
    const entries = await queryCollectionDocs('transactions/accounting/journalEntries', filters);
    
    // Fetch detailed lines for each entry
    const entriesWithLines = await Promise.all(
      entries.map(async (entry: any) => {
        const lines = entry.lines || [];
        return {
          ...entry,
          lines: lines.sort((a: any, b: any) => a.lineNo - b.lineNo)
        };
      })
    );
    
    return entriesWithLines;
  }
  
  function extractTaxEntries(journalEntries: any[]) {
    const outputVat: any[] = [];
    const inputVat: any[] = [];
    const withholdingTax: any[] = [];
    
    // Process each journal entry
    journalEntries.forEach((entry: any) => {
      const entryDate = new Date(entry.journalDate.seconds * 1000);
      
      // Process each line in the entry
      entry.lines.forEach((line: any) => {
        const accountName = line.accountName.toLowerCase();
        
        // Check for output VAT accounts
        if (accountName.includes('output vat') || 
            accountName.includes('vat payable') ||
            accountName.includes('vat output') ||
            accountName.includes('sales tax payable') ||
            accountName.includes('gst payable') ||
            accountName.includes('hst payable')) {
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
        // Check for input VAT accounts
        else if (accountName.includes('input vat') || 
                 accountName.includes('vat receivable') ||
                 accountName.includes('vat input') ||
                 accountName.includes('purchase tax') ||
                 accountName.includes('gst receivable') ||
                 accountName.includes('hst receivable')) {
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
        // Check for withholding tax accounts
        else if (accountName.includes('withholding tax') ||
                 accountName.includes('wht') ||
                 accountName.includes('withholding') ||
                 accountName.includes('tax withheld') ||
                 accountName.includes('payroll tax')) {
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
  
  function calculateMonthlySummaries(outputVat: any[], inputVat: any[], withholdingTax: any[]) {
    const summaries: any = {};
    
    // Helper function to add an entry to the monthly summary
    function addToMonthSummary(entry: any, taxType: string) {
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
      
      // Add amounts based on tax type
      if (taxType === 'output-vat') {
        summaries[yearMonth].outputVat += entry.amount;
      } else if (taxType === 'input-vat') {
        summaries[yearMonth].inputVat += entry.amount;
      } else if (taxType === 'withholding-tax') {
        summaries[yearMonth].withholdingTax += entry.amount;
      }
      
      // Calculate net VAT payable for this month
      summaries[yearMonth].netVatPayable = summaries[yearMonth].outputVat - summaries[yearMonth].inputVat;
    }
    
    // Process output VAT entries
    outputVat.forEach((entry: any) => addToMonthSummary(entry, 'output-vat'));
    
    // Process input VAT entries
    inputVat.forEach((entry: any) => addToMonthSummary(entry, 'input-vat'));
    
    // Process withholding tax entries
    withholdingTax.forEach((entry: any) => addToMonthSummary(entry, 'withholding-tax'));
    
    // Convert to array and sort by date
    return Object.values(summaries).sort((a: any, b: any) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }
  
  function sumAmounts(entries: any[]) {
    return entries.reduce((sum: number, entry: any) => {
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
    
    reportData.monthlySummaries.forEach((month: any) => {
      csvContent += `${month.monthName} ${month.year},${month.outputVat},${month.inputVat},${month.netVatPayable},${month.withholdingTax}\n`;
    });
    csvContent += `TOTAL,${reportData.totalOutputVat},${reportData.totalInputVat},${reportData.netVatPayable},${reportData.totalWithholdingTax}\n\n`;
    
    // Output VAT Detail
    csvContent += "OUTPUT VAT DETAIL\n";
    csvContent += "Date,Reference,Description,Amount\n";
    reportData.outputVat.forEach((entry: any) => {
      csvContent += `${entry.date.toLocaleDateString()},${entry.reference},"${entry.description}",${entry.isDebit ? -entry.amount : entry.amount}\n`;
    });
    csvContent += `TOTAL,,,"${reportData.totalOutputVat}"\n\n`;
    
    // Input VAT Detail
    csvContent += "INPUT VAT DETAIL\n";
    csvContent += "Date,Reference,Description,Amount\n";
    reportData.inputVat.forEach((entry: any) => {
      csvContent += `${entry.date.toLocaleDateString()},${entry.reference},"${entry.description}",${entry.isDebit ? entry.amount : -entry.amount}\n`;
    });
    csvContent += `TOTAL,,,"${reportData.totalInputVat}"\n\n`;
    
    // Withholding Tax Detail
    csvContent += "WITHHOLDING TAX DETAIL\n";
    csvContent += "Date,Reference,Description,Amount\n";
    reportData.withholdingTax.forEach((entry: any) => {
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
        <p class="text-sm" style="color: var(--color-neutral-600);">No tax data available for the selected period.</p>
      </div>
    {:else}
      <!-- Monthly Summary Section -->
      <div class="mb-8">
        <h3 class="text-lg font-semibold mb-3 pb-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-200);">Monthly Tax Summary</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Month</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Output VAT</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Input VAT</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Net VAT Payable</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Withholding Tax</th>
              </tr>
            </thead>
            <tbody>
              {#each reportData.monthlySummaries as month}
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{month.monthName} {month.year}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(month.outputVat)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(month.inputVat)}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-right" style="color: {month.netVatPayable >= 0 ? 'var(--color-error-600)' : 'var(--color-success-600)'}; border-bottom: 1px solid var(--color-neutral-100);">
                    {formatCurrency(month.netVatPayable)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(month.withholdingTax)}</td>
                </tr>
              {/each}
              <tr class="font-semibold" style="background: var(--color-neutral-50);">
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800);">TOTAL</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalOutputVat)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalInputVat)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-right" style="color: {reportData.netVatPayable >= 0 ? 'var(--color-error-600)' : 'var(--color-success-600)'};">
                  {formatCurrency(reportData.netVatPayable)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalWithholdingTax)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Output VAT Detail Section -->
      <div class="mb-8">
        <h3 class="text-lg font-semibold mb-3 pb-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-200);">Output VAT Detail</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Date</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Reference</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Amount</th>
              </tr>
            </thead>
            <tbody>
              {#each reportData.outputVat as entry}
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.date.toLocaleDateString()}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.reference}</td>
                  <td class="px-6 py-4 text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.description}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                    {formatCurrency(entry.isDebit ? -entry.amount : entry.amount)}
                  </td>
                </tr>
              {/each}
              <tr class="font-semibold" style="background: var(--color-neutral-50);">
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800);" colspan="3">TOTAL</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalOutputVat)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Input VAT Detail Section -->
      <div class="mb-8">
        <h3 class="text-lg font-semibold mb-3 pb-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-200);">Input VAT Detail</h3>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Date</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Reference</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Amount</th>
              </tr>
            </thead>
            <tbody>
              {#each reportData.inputVat as entry}
                <tr>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.date.toLocaleDateString()}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.reference}</td>
                  <td class="px-6 py-4 text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.description}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                    {formatCurrency(entry.isDebit ? entry.amount : -entry.amount)}
                  </td>
                </tr>
              {/each}
              <tr class="font-semibold" style="background: var(--color-neutral-50);">
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800);" colspan="3">TOTAL</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalInputVat)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Withholding Tax Detail Section -->
      {#if reportData.withholdingTax.length > 0}
        <div class="mb-8">
          <h3 class="text-lg font-semibold mb-3 pb-2" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-200);">Withholding Tax Detail</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Date</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Reference</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Amount</th>
                </tr>
              </thead>
              <tbody>
                {#each reportData.withholdingTax as entry}
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.date.toLocaleDateString()}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.reference}</td>
                    <td class="px-6 py-4 text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.description}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                      {formatCurrency(entry.isDebit ? -entry.amount : entry.amount)}
                    </td>
                  </tr>
                {/each}
                <tr class="font-semibold" style="background: var(--color-neutral-50);">
                  <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800);" colspan="3">TOTAL</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800);">{formatCurrency(reportData.totalWithholdingTax)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</ReportContainer>
