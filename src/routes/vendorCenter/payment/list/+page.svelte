<script lang="ts">
  import ListContainer from '$lib/components/ListContainer.svelte';
  import { goto } from '$app/navigation';
  import { orderBy } from 'firebase/firestore';

  const columns = [
    { label: 'Payment No.', key: 'paymentNo' },
    { label: 'Date', key: 'paymentDate', type: 'date' },
    { label: 'Vendor', key: 'vendorName' },
    { label: 'Payment Method', key: 'paymentMethodName' },
    { label: 'Amount', key: 'amount', type: 'currency' },
    { label: 'Reference', key: 'reference' },
    { label: 'Status', key: 'status' }
  ];
  
  // Set collection paths
  const rootCollection = 'transactions';
  const parentCollection = 'vendorCenter';
  const subCollectionName = 'payments';
  
  // Set up query options to sort by date descending
  const queryOptions = [orderBy('paymentDate', 'desc')];
  
  // Define buttons for vendor payments
  const buttons = [
    {
      label: 'New Payment',
      color: 'primary',
      icon: 'material-symbols:currency-exchange',
      onClick: () => goto('/vendorCenter/payment/form')
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
  title="Vendor Payments"
  subtitle="Manage payments to vendors"
  {rootCollection}
  {parentCollection}
  {subCollectionName}
  documentType="payment"
  totalLabel="Total Payments"
  primaryColorClass="blue"
  secondaryColorClass="green"
  tertiaryColorClass="amber"
  searchPlaceholder="Search payments..."
  {buttons}
  newButtonPath="/vendorCenter/payment/form"
  viewButtonPath="/vendorCenter/payment/view"
  editButtonPath="/vendorCenter/payment/form"
  allowDelete={true}
  {columns}
  {queryOptions}
/>
