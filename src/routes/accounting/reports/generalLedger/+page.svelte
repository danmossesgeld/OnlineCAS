<script lang="ts">
  import { onMount } from 'svelte';
  import { getGeneralLedgerData, getAllAccounts, type GeneralLedgerLine, type Account, type DateRange } from '$lib/utils/reportingService';
  import { formatCurrency, formatDate } from '$lib/utils/formatters';
  import ReportContainer from '$lib/components/reports/ReportContainer.svelte';

  let loading = true;
  let error: string | null = null;
  let lines: GeneralLedgerLine[] = [];
  let accounts: Account[] = [];
  let selectedAccountId = '';

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  let dateRange: DateRange = { startDate: firstDayOfMonth, endDate: lastDayOfMonth };

  async function handleGenerateReport(event: CustomEvent) {
    const params = event.detail;
    dateRange = { startDate: params.startDate, endDate: params.endDate };
    selectedAccountId = params.accountId ?? selectedAccountId;
    await generateReport();
  }

  async function generateReport() {
    try {
      loading = true;
      error = null;
      const result = await getGeneralLedgerData(dateRange, selectedAccountId || undefined);
      lines = result.lines;
      accounts = result.accounts;
      loading = false;
    } catch (err) {
      error = (err as Error).message;
      loading = false;
    }
  }

  function handleExport(event: CustomEvent) {
    let csvContent = 'Date,Reference,Description,Account,Debit,Credit,Balance\n';
    lines.forEach((l) => {
      csvContent += `"${formatDate(l.date)}","${l.referenceNo}","${l.description}","${l.accountName}","${l.debit}","${l.credit}","${l.balance}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', event.detail.filename || 'general_ledger.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  onMount(async () => {
    accounts = await getAllAccounts();
    await generateReport();
  });
</script>

<ReportContainer
  title="General Ledger"
  description="All posted journal-entry lines for the period, with a running balance per account"
  {loading}
  {error}
  parameterType="dateRange"
  startDate={dateRange.startDate}
  endDate={dateRange.endDate}
  reportId="generalLedger"
  filename="general_ledger"
  customParameters={[
    {
      label: 'Account (optional)',
      type: 'select',
      id: 'accountId',
      value: selectedAccountId,
      options: [{ label: 'All Accounts', value: '' }, ...accounts.map((a) => ({ label: `${a.code} - ${a.name}`, value: a.id }))]
    }
  ]}
  on:generateReport={handleGenerateReport}
  on:export={handleExport}
>
  <div slot="report-content">
    {#if lines.length === 0}
      <div class="text-center py-10">
        <p class="text-sm" style="color: var(--color-neutral-600);">No journal-entry lines found for this period.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Reference</th>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Account</th>
              <th class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Description</th>
              <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Debit</th>
              <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Credit</th>
              <th class="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Balance</th>
            </tr>
          </thead>
          <tbody>
            {#each lines as line}
              <tr style={line.isBeginningBalance ? 'background: var(--color-neutral-50);' : ''}>
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{line.isBeginningBalance ? '' : formatDate(line.date)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{line.referenceNo}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm {line.isBeginningBalance ? 'font-semibold' : ''}" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{line.accountName}</td>
                <td class="px-6 py-4 text-sm {line.isBeginningBalance ? 'italic' : ''}" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{line.description}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{line.debit > 0 ? formatCurrency(line.debit) : '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-100);">{line.credit > 0 ? formatCurrency(line.credit) : '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{formatCurrency(line.balance)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</ReportContainer>
