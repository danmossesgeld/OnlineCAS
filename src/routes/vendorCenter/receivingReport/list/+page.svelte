<script lang="ts">
  import ListContainer from '$lib/components/ListContainer.svelte';
  import { goto } from '$app/navigation';
  import { orderBy } from 'firebase/firestore';
  
  // Define the table columns for the receiving reports
  const columns = [
    { label: 'RR No.', key: 'rrNo' },
    { label: 'Date', key: 'rrDate', type: 'date' },
    { label: 'Vendor', key: 'vendorName' },
    { label: 'Reference', key: 'reference' },
    { label: 'PO No.', key: 'poNo' },
    { label: 'Amount', key: 'totalAmount', type: 'currency' },
    { label: 'Status', key: 'status' }
  ];

  /**
   * Collection path configuration for receiving reports
   * Following the structure: transactions/vendorCenter/receivingReports
   */
  const rootCollection = 'transactions';
  const parentCollection = 'vendorCenter';
  const subCollectionName = 'receivingReports';
  
  // Set up query options to sort by date descending
  const queryOptions = [orderBy('rrDate', 'desc')];

  const buttons = [
    {
      label: 'New Receiving Report',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => goto('/vendorCenter/receivingReport/form')
    },
    {
      label: 'Export',
      color: 'outline',
      icon: 'material-symbols:download',
      onClick: () => {/* export logic here */}
    }
  ];
  
  // Define custom filters for receiving reports
  const customFilters = [
    {
      label: 'Sort By',
      options: [
        { value: 'date', label: 'Sort by Date' },
        { value: 'amount', label: 'Sort by Amount' },
        { value: 'vendor', label: 'Sort by Vendor' }
      ]
    }
  ];
</script>

<ListContainer
  title="Receiving Reports"
  subtitle="Manage and track all your vendor deliveries"
  {rootCollection}
  {parentCollection}
  {subCollectionName}
  documentType="receiving report"
  totalLabel="Total Receiving Reports"
  primaryColorClass="blue"
  secondaryColorClass="green"
  tertiaryColorClass="amber"
  searchPlaceholder="Search receiving reports..."
  {buttons}
  {customFilters}
  newButtonPath="/vendorCenter/receivingReport/form"
  viewButtonPath="/vendorCenter/receivingReport/form"
  editButtonPath="/vendorCenter/receivingReport/form"
  allowDelete={true}
  {columns}
  {queryOptions}
/>
