<script lang="ts">
  import ListContainer from '$lib/components/ListContainer.svelte';
  import { goto } from '$app/navigation';

  const columns = [
    { label: 'APV #', key: 'apvNo' },
    { label: 'Supplier', key: 'supplierName' },
    { label: 'Date', key: 'apvDate', type: 'date' },
    { label: 'Due Date', key: 'dueDate', type: 'date' },
    { label: 'Reference #', key: 'referenceNo' },
    { label: 'Amount', key: 'totalAmountDue', type: 'currency' },
    { label: 'Status', key: 'status' },
    { label: 'Memo', key: 'memo' }
  ];

  /**
   * Collection path configuration for APV
   * Following the structure: transactions/vendorCenter/apvs
   */
  const rootCollection = 'transactions';
  const parentCollection = 'vendorCenter';
  const subCollectionName = 'apvs';

  const buttons = [
    {
      label: 'New APV',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => goto('/vendorCenter/apv/form')
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
  title="Accounts Payable Vouchers"
  subtitle="Manage and track all your vendor payables"
  {rootCollection}
  {parentCollection}
  {subCollectionName}
  documentType="apv"
  totalLabel="Total Vouchers"
  primaryColorClass="blue"
  secondaryColorClass="green"
  tertiaryColorClass="amber"
  searchPlaceholder="Search vouchers..."
  {buttons}
  newButtonPath="/vendorCenter/apv/form"
  viewButtonPath="/vendorCenter/apv/form"
  editButtonPath="/vendorCenter/apv/form"
  allowDelete={true}
  {columns}
  queryOptions={[]}
/>
