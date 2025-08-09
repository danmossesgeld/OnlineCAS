<script lang="ts">
  import ListContainer from '$lib/components/ListContainer.svelte';
  import { goto } from '$app/navigation';
  import { orderBy } from 'firebase/firestore';

  const columns = [
    { label: 'Adjustment #', key: 'adjustmentNo' },
    { label: 'Date', key: 'adjustmentDate', type: 'date' },
    { label: 'Type', key: 'adjustmentType' },
    { label: 'Warehouse', key: 'warehouseName' },
    { label: 'Reference #', key: 'referenceNo' },
    { label: 'Items', key: 'itemCount' },
    { label: 'Total Value', key: 'totalValue', type: 'currency' },
    { label: 'Status', key: 'status' },
    { label: 'Remarks', key: 'remarks' }
  ];

  /**
   * Collection path configuration for inventory adjustments
   * Following the structure: inventory/transactions/adjustments
   */
  const rootCollection = 'inventory';
  const parentCollection = 'transactions';
  const subCollectionName = 'adjustments';
  
  // Set up query options to sort by date descending
  const queryOptions = [orderBy('adjustmentDate', 'desc')];

  const buttons = [
    {
      label: 'New Adjustment',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => goto('/inventory/adjustment/form')
    },
    {
      label: 'Export',
      color: 'outline',
      icon: 'material-symbols:download',
      onClick: () => {/* export logic here */}
    }
  ];
  
  // Define custom filters for adjustment types
  const customFilters = [
    {
      label: 'Adjustment Type',
      options: [
        { value: '', label: 'All Types' },
        { value: 'increase', label: 'Increase' },
        { value: 'decrease', label: 'Decrease' }
      ]
    }
  ];
</script>

<ListContainer
  title="Inventory Adjustments"
  subtitle="Manage inventory level adjustments and corrections"
  {rootCollection}
  {parentCollection}
  {subCollectionName}
  documentType="adjustment"
  totalLabel="Total Adjustments"
  primaryColorClass="blue"
  secondaryColorClass="green"
  tertiaryColorClass="amber"
  searchPlaceholder="Search adjustments..."
  {buttons}
  {customFilters}
  newButtonPath="/inventory/adjustment/form"
  viewButtonPath="/inventory/adjustment/form"
  editButtonPath="/inventory/adjustment/form"
  allowDelete={true}
  {columns}
  {queryOptions}
/>
