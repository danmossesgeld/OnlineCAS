<script lang="ts">
  import { onMount } from 'svelte';
  import { getPurchaseJournalData, type PurchaseJournalRow, type DateRange } from '$lib/utils/reportingService';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';

  let loading = true;
  let error: string | null = null;
  let rows: PurchaseJournalRow[] = [];
  let totals = { netAmount: 0, vat: 0, total: 0 };

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  let dateRange: DateRange = { startDate: firstDayOfMonth, endDate: lastDayOfMonth };

  async function handleGenerateReport(event: CustomEvent) {
    dateRange = { startDate: event.detail.startDate, endDate: event.detail.endDate };
    await generateReport();
  }

  async function generateReport() {
    try {
      loading = true;
      error = null;
      const result = await getPurchaseJournalData(dateRange);
      rows = result.rows;
      totals = result.totals;
      loading = false;
    } catch (err) {
      error = (err as Error).message;
      loading = false;
    }
  }

  function handleExport(event: CustomEvent) {
    let csvContent = 'Date,APV #,Vendor,Net Amount,Input VAT,Total\n';
    rows.forEach((r) => {
      csvContent += `"${formatDate(r.date)}","${r.apvNo}","${r.vendorName}","${r.netAmount}","${r.vat}","${r.total}"\n`;
    });
    csvContent += `"","","Total","${totals.netAmount}","${totals.vat}","${totals.total}"\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', event.detail.filename || 'purchase_journal.csv');
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
  title="Purchase Journal"
  description="Posted Accounts Payable Vouchers (APVs) for the period"
  {loading}
  {error}
  parameterType="dateRange"
  startDate={dateRange.startDate}
  endDate={dateRange.endDate}
  reportId="purchaseJournal"
  filename="purchase_journal"
  on:generateReport={handleGenerateReport}
  on:export={handleExport}
>
  <div slot="report-content">
    {#if rows.length === 0}
      <div class="text-center py-10">
        <p class="text-sm" style="color: var(--color-neutral-600);">No APVs found for this period.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">APV #</th>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Vendor</th>
              <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Net Amount</th>
              <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Input VAT</th>
              <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Total</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as r}
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatDate(r.date)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{r.apvNo}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{r.vendorName}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(r.netAmount)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(r.vat)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(r.total)}</td>
              </tr>
            {/each}
            <tr style="background: var(--color-neutral-50);">
              <td class="px-6 py-4" colspan="3" style="color: var(--color-neutral-800);"><span class="font-bold">Total</span></td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold" style="color: var(--color-neutral-800);">{formatCurrency(totals.netAmount)}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold" style="color: var(--color-neutral-800);">{formatCurrency(totals.vat)}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold" style="color: var(--color-neutral-800);">{formatCurrency(totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</ReportContainer>
