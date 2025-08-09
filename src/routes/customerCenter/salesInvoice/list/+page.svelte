<script lang="ts">
  import ListContainer from '$lib/components/ListContainer.svelte';
  import { goto } from '$app/navigation';

  const columns = [
    { label: 'Invoice #', key: 'invoiceNo' },
    { label: 'Customer', key: 'customerName' },
    { label: 'Date', key: 'invoiceDate' },
    { label: 'Due Date', key: 'dueDate' },
    { label: 'Amount', key: 'totalDue' },
    { label: 'Status', key: 'status' },
    { label: 'Remarks', key: 'memo' }
  ];

  /**
   * Collection path configuration for sales invoices
   * Following the structure: transactions/customerCenter/salesInvoices
   */
  const rootCollection = 'transactions';
  const parentCollection = 'customerCenter';
  const subCollectionName = 'salesInvoices';

  const buttons = [
    {
      label: 'New Invoice',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => goto('/customerCenter/salesInvoice/form')
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
  title="Invoices"
  subtitle="Manage and track all your customer invoices"
  {rootCollection}
  {parentCollection}
  {subCollectionName}
  documentType="invoice"
  totalLabel="Total Invoices"
  primaryColorClass="blue"
  secondaryColorClass="green"
  tertiaryColorClass="amber"
  searchPlaceholder="Search invoices..."
  {buttons}
  newButtonPath="/customerCenter/salesInvoice/form"
  viewButtonPath="/customerCenter/salesInvoice/form"
  editButtonPath="/customerCenter/salesInvoice/form"
  allowDelete={true}
  {columns}
  queryOptions={[]}
/>