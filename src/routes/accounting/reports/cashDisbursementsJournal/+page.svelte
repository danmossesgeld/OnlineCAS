<script lang="ts">
  import { onMount } from 'svelte';
  import { getCashDisbursementsJournalData, type CashJournalRow, type DateRange } from '$lib/utils/reportingService';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';

  let loading = true;
  let error: string | null = null;
  let rows: CashJournalRow[] = [];
  let total = 0;

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
      const result = await getCashDisbursementsJournalData(dateRange);
      rows = result.rows;
      total = result.total;
      loading = false;
    } catch (err) {
      error = (err as Error).message;
      loading = false;
    }
  }

  function handleExport(event: CustomEvent) {
    let csvContent = 'Date,Voucher #,Vendor,Account,Amount\n';
    rows.forEach((r) => {
      csvContent += `"${formatDate(r.date)}","${r.documentNo}","${r.name}","${r.account}","${r.amount}"\n`;
    });
    csvContent += `"","","","Total","${total}"\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', event.detail.filename || 'cash_disbursements_journal.csv');
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
  title="Cash Disbursements Journal"
  description="Posted Vendor Payments for the period, with the offsetting account debited"
  {loading}
  {error}
  parameterType="dateRange"
  startDate={dateRange.startDate}
  endDate={dateRange.endDate}
  reportId="cashDisbursementsJournal"
  filename="cash_disbursements_journal"
  on:generateReport={handleGenerateReport}
  on:export={handleExport}
>
  <div slot="report-content">
    {#if rows.length === 0}
      <div class="text-center py-10">
        <p class="text-sm" style="color: var(--color-neutral-600);">No Vendor Payments found for this period.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Voucher #</th>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Vendor</th>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Account</th>
              <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Amount</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as r}
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatDate(r.date)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{r.documentNo}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{r.name}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{r.account}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(r.amount)}</td>
              </tr>
            {/each}
            <tr style="background: var(--color-neutral-50);">
              <td class="px-6 py-4" colspan="4" style="color: var(--color-neutral-800);"><span class="font-bold">Total</span></td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-bold" style="color: var(--color-neutral-800);">{formatCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</ReportContainer>
