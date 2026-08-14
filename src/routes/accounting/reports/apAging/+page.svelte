<script lang="ts">
  import { onMount } from 'svelte';
  import { getAPAgingData, type AgingItem } from '$lib/utils/reportingService';
  import { formatCurrency } from '$lib/utils/formatters';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';
  
  let loading = true;
  let error: string | null = null;
  let reportData: {
    vendors: AgingItem[];
    buckets: string[];
    totals: number[];
    grandTotal: number;
  } = {
    vendors: [],
    buckets: ['Current', '1-30', '31-60', '61-90', '> 90'],
    totals: [0, 0, 0, 0, 0],
    grandTotal: 0
  };
  
  // Default date is current date
  let asOfDate = new Date();
  
  // Whether to show detailed documents in the report
  let showDetails = false;
  
  let customParameters: Array<{
    label: string;
    type: 'text' | 'select' | 'number' | 'date';
    id: string;
    value: any;
    options?: Array<{ label: string; value: any }>;
  }> = [
    {
      label: 'Show Invoice Details',
      type: 'select',
      id: 'showDetails',
      value: false,
      options: [
        { label: 'No', value: false },
        { label: 'Yes', value: true }
      ]
    }
  ];
  
  async function handleGenerateReport(event: CustomEvent) {
    const params = event.detail;
    asOfDate = params.asOfDate;
    showDetails = params.showDetails === 'true' || params.showDetails === true;
    
    await generateReport();
  }
  
  function handleParameterChange(event: CustomEvent) {
    if (event.detail.id === 'showDetails') {
      showDetails = event.detail.value === 'true' || event.detail.value === true;
    }
  }
  
  async function generateReport() {
    try {
      loading = true;
      error = null;
      reportData = await getAPAgingData(asOfDate);
      loading = false;
    } catch (err) {
      error = (err as Error).message;
      loading = false;
    }
  }
  
  function handleExport(event: CustomEvent) {
    // Create CSV content
    let csvContent = "Accounts Payable Aging Report\n";
    csvContent += `As of ${asOfDate ? new Date(asOfDate).toLocaleDateString() : ''}\n\n`;
    
    // Add header row with buckets
    csvContent += "Vendor,Total";
    reportData.buckets.forEach(bucket => {
      csvContent += `,${bucket}`;
    });
    csvContent += "\n";
    
    // Add vendor rows
    reportData.vendors.forEach(vendor => {
      csvContent += `"${vendor.name}",${vendor.totalAmount}`;
      vendor.buckets.forEach(bucket => {
        csvContent += `,${bucket.amount}`;
      });
      csvContent += "\n";
      
      // Add detail rows if showing details
      if (showDetails && vendor.documents.length > 0) {
        csvContent += `"  Document","Date","Due Date","Age (Days)","Amount","Bucket"\n`;
        vendor.documents.forEach(doc => {
          csvContent += `"  ${doc.documentNo}","${new Date(doc.date).toLocaleDateString()}","${new Date(doc.dueDate).toLocaleDateString()}","${doc.age}","${doc.amount}","${reportData.buckets[doc.bucketIndex]}"\n`;
        });
        csvContent += "\n";
      }
    });
    
    // Add totals row
    csvContent += `"TOTAL",${reportData.grandTotal}`;
    reportData.totals.forEach(total => {
      csvContent += `,${total}`;
    });
    csvContent += "\n";
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', event.detail.filename || `ap_aging_as_of.csv`);
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
  title="Accounts Payable Aging"
  description="Track outstanding vendor invoices by age"
  {loading}
  {error}
  parameterType="asOfDate"
  {asOfDate}
  {customParameters}
  reportId="apAging"
  filename="ap_aging_as_of"
  on:generateReport={handleGenerateReport}
  on:parameterChange={handleParameterChange}
  on:export={handleExport}
>
  <div slot="report-content">
    {#if reportData.vendors.length === 0}
      <div class="text-center py-10">
        <p class="text-sm" style="color: var(--color-neutral-600);">No outstanding invoices found for this period.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Vendor</th>
              <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Total</th>
              {#each reportData.buckets as bucket}
                <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">{bucket}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each reportData.vendors as vendor}
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                  {vendor.name}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">
                  {formatCurrency(vendor.totalAmount)}
                </td>
                {#each vendor.buckets as bucket}
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">
                    {formatCurrency(bucket.amount)}
                  </td>
                {/each}
              </tr>

              {#if showDetails && vendor.documents.length > 0}
                {#each vendor.documents as document}
                  <tr style="background: var(--color-neutral-50);">
                    <td class="pl-12 pr-6 py-2 whitespace-nowrap text-xs" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">
                      {document.documentNo}
                      <div class="text-xs" style="color: var(--color-neutral-400);">
                        Date: {new Date(document.date).toLocaleDateString()} |
                        Due: {new Date(document.dueDate).toLocaleDateString()} |
                        Age: {document.age} days
                      </div>
                    </td>
                    <td class="px-6 py-2 whitespace-nowrap text-xs text-right" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">
                      {formatCurrency(document.amount)}
                    </td>
                    {#each reportData.buckets as _, bucketIndex}
                      <td class="px-6 py-2 whitespace-nowrap text-xs text-right" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">
                        {document.bucketIndex === bucketIndex ? formatCurrency(document.amount) : ''}
                      </td>
                    {/each}
                  </tr>
                {/each}
              {/if}
            {/each}

            <!-- Total Row -->
            <tr class="font-bold" style="background: var(--color-neutral-100);">
              <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800);">
                TOTAL
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800);">
                {formatCurrency(reportData.grandTotal)}
              </td>
              {#each reportData.totals as total}
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-800);">
                  {formatCurrency(total)}
                </td>
              {/each}
            </tr>
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</ReportContainer>
