<script lang="ts">
  import ListContainer from '$lib/components/ListContainer.svelte';
  import { goto } from '$app/navigation';
  import { orderBy } from 'firebase/firestore';
  
  // Define the table columns for credit memos
  const columns = [
    { label: 'CM No.', key: 'cmNo' },
    { label: 'Date', key: 'cmDate', type: 'date' },
    { label: 'Customer', key: 'customerName' },
    { label: 'Reference', key: 'reference' },
    { label: 'Invoice No.', key: 'invoiceNo' },
    { label: 'Amount', key: 'totalAmount', type: 'currency' },
    { label: 'Status', key: 'status' }
  ];
  
  // Set collection paths
  const rootCollection = 'transactions';
  const parentCollection = 'customerCenter';
  const subCollectionName = 'creditMemos';
  
  // Set up query options to sort by date descending
  const queryOptions = [orderBy('cmDate', 'desc')];
  
  // Define buttons for credit memos
  const buttons = [
    {
      label: 'New Credit Memo',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => goto('/customerCenter/creditMemo/form')
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
  title="Credit Memos"
  subtitle="Manage customer credit memos for returns and allowances"
  {rootCollection}
  {parentCollection}
  {subCollectionName}
  documentType="creditMemo"
  totalLabel="Total Credit Memos"
  primaryColorClass="blue"
  secondaryColorClass="green"
  tertiaryColorClass="amber"
  searchPlaceholder="Search credit memos..."
  {buttons}
  newButtonPath="/customerCenter/creditMemo/form"
  viewButtonPath="/customerCenter/creditMemo/view"
  editButtonPath="/customerCenter/creditMemo/form"
  allowDelete={true}
  {columns}
  {queryOptions}
/>
