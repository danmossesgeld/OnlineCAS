<script lang="ts">
  import ListContainer from '$lib/components/ListContainer.svelte';
  import { goto } from '$app/navigation';
  import { orderBy } from 'firebase/firestore';

  // Setup FireTable columns
  const columns = [
    { label: 'Date', key: 'journalDate', type: 'date' },
    { label: 'Reference No', key: 'referenceNo' },
    { label: 'Description', key: 'description' },
    { label: 'Source', key: 'sourceType' },
    { label: 'Debit', key: 'totalDebit', type: 'currency' },
    { label: 'Credit', key: 'totalCredit', type: 'currency' },
    { label: 'Status', key: 'status' }
  ];

  // Source type map for display
  const sourceTypeMap: Record<string, string> = {
    'salesInvoice': 'Sales Invoice',
    'apv': 'AP Voucher',
    'payment': 'Payment',
    'receipt': 'Receipt',
    'general': 'General Journal'
  };
  
  // Set up query options to sort by date descending
  const queryOptions = [orderBy('createdAt', 'desc')];

  /**
   * Collection path configuration for Journal Entries
   * Following the structure: transactions/accounting/journalEntries
   */
  const rootCollection = 'transactions';
  const parentCollection = 'accounting';
  const subCollectionName = 'journalEntries';
  
  // Define buttons for journal entries
  const buttons = [
    {
      label: 'New Journal Entry',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => goto('/accounting/generalJournal/form')
    },
    {
      label: 'Export',
      color: 'outline',
      icon: 'material-symbols:download',
      onClick: () => {/* export logic here */}
    }
  ];
</script>

<ListContainer
  title="General Journal Entries"
  subtitle="Manage and view all accounting journal entries"
  {rootCollection}
  {parentCollection}
  {subCollectionName}
  documentType="journal"
  totalLabel="Total Entries"
  primaryColorClass="blue"
  secondaryColorClass="green"
  tertiaryColorClass="amber"
  searchPlaceholder="Search journal entries..."
  {buttons}
  newButtonPath="/accounting/generalJournal/form"
  viewButtonPath="/accounting/generalJournal/form"
  editButtonPath="/accounting/generalJournal/form"
  allowDelete={true}
  {columns}
  {queryOptions}
/>
