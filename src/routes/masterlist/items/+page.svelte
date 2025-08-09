<script lang="ts">
  import ModalForm from '$lib/components/ModalForm.svelte';
  import MasterListContainer from '$lib/components/MasterListContainer.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import { categoryOptions, unitOptions } from '$lib/utils/optionStores';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  let loaded = false;

  // Get accounts for select fields filtered by type
  const accountsStore = createFirestoreOptionsStore('masterlist/accounts', 'name', 'id', true);
  
  // Derived stores for filtered account types
  $: incomeAccounts = $accountsStore.filter(acc => acc.raw?.accountType === 'revenue')
    .map(acc => ({ label: `${acc.raw?.code || ''} - ${acc.label}`, value: acc.value }));
  
  $: expenseAccounts = $accountsStore.filter(acc => acc.raw?.accountType === 'expense')
    .map(acc => ({ label: `${acc.raw?.code || ''} - ${acc.label}`, value: acc.value }));

  $: inventoryAccounts = $accountsStore.filter(acc => acc.raw?.accountType === 'asset')
    .map(acc => ({ label: `${acc.raw?.code || ''} - ${acc.label}`, value: acc.value }));

  $: cogsAccounts = $accountsStore.filter(acc => acc.raw?.accountType === 'cogs' || acc.raw?.accountType === 'expense')
    .map(acc => ({ label: `${acc.raw?.code || ''} - ${acc.label}`, value: acc.value }));

  onMount(() => {
    // Mark as loaded when component is mounted
    loaded = true;
    // Additional logging for troubleshooting
    console.log('Component mounted, current route:', $page.url.pathname);
  });

  // Config for form fields
  $: itemFields = [
    { label: 'Code*', name: 'code', type: 'text', required: true },
    { label: 'Name*', name: 'name', type: 'text', required: true },
    { label: 'Description', name: 'description', type: 'textarea' },
    { label: 'Category', name: 'category', type: 'select', options: $categoryOptions },
    { label: 'Unit', name: 'unit_id', type: 'select', options: $unitOptions },
    
    // Inventory settings
    { label: 'Is Inventory Item', name: 'is_inventory', type: 'checkbox', default: false },
    { label: 'Is Sellable', name: 'is_sellable', type: 'checkbox', default: true },
    { label: 'Is Purchasable', name: 'is_purchasable', type: 'checkbox', default: true },
    
    // Price fields
    { label: 'Sales Price', name: 'sales_price', type: 'number' },
    { label: 'Purchase Price', name: 'purchase_price', type: 'number' },
    
    // Account linkage fields
    { label: 'Income Account', name: 'income_account_id', type: 'select', options: incomeAccounts },
    { label: 'Expense Account', name: 'expense_account_id', type: 'select', options: expenseAccounts },
    { label: 'Inventory Account', name: 'inventory_account_id', type: 'select', options: inventoryAccounts },
    { label: 'COGS Account', name: 'cogs_account_id', type: 'select', options: cogsAccounts },
    
    // Other fields
    { label: 'Average Cost', name: 'average_cost', type: 'number', readonly: true, default: 0 },
    { label: 'Active', name: 'is_active', type: 'checkbox', default: true }
  ];

  const columns = [
    { label: 'Code', key: 'code' },
    { label: 'Name', key: 'name' },
    { label: 'Category', key: 'category' },
    { label: 'Unit', key: 'unit_id' },
    { label: 'Sales Price', key: 'sales_price', format: (value: number) => value ? `₱${value.toFixed(2)}` : '' },
    { label: 'Type', key: 'is_inventory', format: (value: boolean) => value ? 'Inventory' : 'Non-inventory' },
    { label: 'Status', key: 'is_active', format: (value: boolean) => value ? 'Active' : 'Inactive' }
  ];

  // Collection paths
  const rootCollection = 'listdatabase';
  const parentCollection = 'masterlist';
  const subCollectionName = 'items';
  const collectionPath = 'masterlist/items';  // This will be mapped to listdatabase/masterlist/items

  // UI state
  let showModal = false;
  let errorMsg = '';
  let formData = {
    code: '',
    name: '',
    description: '',
    category: '',
    unit_id: '',
    is_inventory: false,
    is_sellable: true,
    is_purchasable: true,
    sales_price: '',
    purchase_price: '',
    income_account_id: '',
    expense_account_id: '',
    inventory_account_id: '',
    cogs_account_id: '',
    average_cost: 0,
    is_active: true
  };
  let editingItem: { id: string } | null = null;

  // ListContainer configuration
  const documentType = 'item';
  const title = 'Item Masterlist';
  const subtitle = 'Manage your inventory and non-inventory items';
  const primaryColorClass = 'blue';
  const totalLabel = 'Total Items';
  // Setting these to empty strings will hide the respective cards
  const postedLabel = '';
  const draftLabel = '';
  const pendingLabel = '';
  const overdueLabel = '';

  // Action buttons
  const buttons = [
    {
      label: 'New Item',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: handleAdd
    }
  ];

  function handleAdd() {
    formData = {
      code: '',
      name: '',
      description: '',
      category: '',
      unit_id: '',
      is_inventory: false,
      is_sellable: true,
      is_purchasable: true,
      sales_price: '',
      purchase_price: '',
      income_account_id: '',
      expense_account_id: '',
      inventory_account_id: '',
      cogs_account_id: '',
      average_cost: 0,
      is_active: true
    };
    editingItem = null;
    showModal = true;
    errorMsg = '';
  }

  async function handleSave() {
    errorMsg = '';
    if (!formData.code.trim() || !formData.name.trim()) {
      errorMsg = 'Code and Name are required.';
      return;
    }
    const dataToSave = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      description: formData.description?.trim() || '',
      category: formData.category || '',
      unit_id: formData.unit_id || '',
      is_inventory: !!formData.is_inventory,
      is_sellable: formData.is_sellable === undefined ? true : !!formData.is_sellable,
      is_purchasable: formData.is_purchasable === undefined ? true : !!formData.is_purchasable,
      sales_price: formData.sales_price ? parseFloat(formData.sales_price as string) : 0,
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price as string) : 0,
      income_account_id: formData.income_account_id || '',
      expense_account_id: formData.expense_account_id || '',
      inventory_account_id: formData.inventory_account_id || '',
      cogs_account_id: formData.cogs_account_id || '',
      average_cost: formData.average_cost || 0,
      is_active: formData.is_active === undefined ? true : !!formData.is_active
    };
    try {
      if (editingItem) {
        // Use the collectionPath approach with the updated utils
        await updateDocInCollection(collectionPath, editingItem.id, dataToSave);
        editingItem = null;
      } else {
        // Use the collectionPath approach with the updated utils
        await addDocToCollection(collectionPath, dataToSave);
      }
      showModal = false;
      formData = {
        code: '',
        name: '',
        description: '',
        category: '',
        unit_id: '',
        is_inventory: false,
        is_sellable: true,
        is_purchasable: true,
        sales_price: '',
        purchase_price: '',
        income_account_id: '',
        expense_account_id: '',
        inventory_account_id: '',
        cogs_account_id: '',
        average_cost: 0,
        is_active: true
      };
    } catch (e) {
      errorMsg = 'Failed to save: ' + (e as Error).message;
    }
  }

  function handleCancel() {
    showModal = false;
    errorMsg = '';
    editingItem = null;
    formData = {
      code: '',
      name: '',
      description: '',
      category: '',
      unit_id: '',
      is_inventory: false,
      is_sellable: true,
      is_purchasable: true,
      sales_price: '',
      purchase_price: '',
      income_account_id: '',
      expense_account_id: '',
      inventory_account_id: '',
      cogs_account_id: '',
      average_cost: 0,
      is_active: true
    };
  }

  function handleEdit(item: any) {
    editingItem = item;
    // Create a new form data object without including any type property from old data
    formData = {
      code: item.code || '',
      name: item.name || '',
      description: item.description || '',
      category: item.category || '',
      unit_id: item.unit_id || '',
      is_inventory: !!item.is_inventory,
      is_sellable: item.is_sellable === undefined ? true : !!item.is_sellable,
      is_purchasable: item.is_purchasable === undefined ? true : !!item.is_purchasable,
      sales_price: item.sales_price?.toString() ?? '',
      purchase_price: item.purchase_price?.toString() ?? '',
      income_account_id: item.income_account_id || '',
      expense_account_id: item.expense_account_id || '',
      inventory_account_id: item.inventory_account_id || '',
      cogs_account_id: item.cogs_account_id || '',
      average_cost: item.average_cost || 0,
      is_active: item.is_active === undefined ? true : !!item.is_active
    };
    showModal = true;
    errorMsg = '';
  }

  async function handleDelete(item: any) {
    if (confirm(`Are you sure you want to delete ${item.name}?`)) {
      try {
        // Use the collectionPath approach with the updated utils
        await deleteDocFromCollection(collectionPath, item.id);
      } catch (e) {
        alert('Failed to delete: ' + (e as Error).message);
      }
    }
  }
</script>

<div class="bg-white rounded-2xl shadow-xl p-8">
  <MasterListContainer
    {rootCollection}
    {parentCollection}
    {subCollectionName}
    {documentType}
    {title}
    {subtitle}
    {primaryColorClass}
    {columns}
    {buttons}
    queryOptions={[]}
    defaultButtons={false}
    allowDelete={false}
  >
    <svelte:fragment slot="additionalActions" let:row>
      <button class="btn btn-ghost btn-xs" aria-label="Edit item" on:click={() => handleEdit(row)}><iconify-icon icon="material-symbols:edit-outline" width="20" height="20"></iconify-icon></button>
      <button class="btn btn-ghost btn-xs" aria-label="Delete item" on:click={() => handleDelete(row)}><iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon></button>
    </svelte:fragment>
  </MasterListContainer>
</div>

{#if showModal}
  <ModalForm
    title={editingItem ? 'Edit Item' : 'Add Item'}
    fields={itemFields}
    bind:formData
    {errorMsg}
    onSave={handleSave}
    onCancel={handleCancel}
  />
{/if}