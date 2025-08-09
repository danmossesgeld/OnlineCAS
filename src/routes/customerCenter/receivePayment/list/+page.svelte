<script lang="ts">
  import ListContainer from '$lib/components/ListContainer.svelte';
  import { goto } from '$app/navigation';

  const columns = [
    { label: 'Receipt No.', key: 'receiptNo', width: '130px' },
    { label: 'Date', key: 'receiptDate', type: 'date', width: '110px' },
    { label: 'Customer', key: 'customerName', width: '200px' },
    { label: 'Payment Method', key: 'paymentMethodName', width: '150px' },
    { label: 'Amount', key: 'amount', width: '120px' },
    { label: 'Reference', key: 'reference', width: '120px' },
    { label: 'Status', key: 'status', width: '100px' }
  ];
  
  // Set collection paths
  const rootCollection = 'transactions';
  const parentCollection = 'customerCenter';
  const subCollectionName = 'receipts';
  
  // Set button actions
  const buttons = [
    {
      label: 'New Payment',
      color: 'primary',
      icon: 'material-symbols:currency-exchange',
      onClick: () => goto('/customerCenter/receivePayment/form')
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
  title="Customer Payments"
  subtitle="Manage customer payment receipts"
  {rootCollection}
  {parentCollection}
  {subCollectionName}
  documentType="receipt"
  totalLabel="Total Receipts"
  primaryColorClass="blue"
  secondaryColorClass="green"
  tertiaryColorClass="amber"
  searchPlaceholder="Search payments..."
  {buttons}
  newButtonPath="/customerCenter/receivePayment/form"
  viewButtonPath="/customerCenter/receivePayment/view"
  editButtonPath="/customerCenter/receivePayment/form"
  allowDelete={true}
  {columns}
  queryOptions={[]}
/>
