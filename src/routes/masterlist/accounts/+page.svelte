<script lang="ts">
  import { onMount } from 'svelte';
  import MasterListContainer from '$lib/components/MasterListContainer.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';

  // Define account type
  type AccountType = {
    label: string;
    value: string;
    normalBalance: string;
  };

  // Define classification type
  type Classification = {
    label: string;
    value: string;
  };

  // Define account item type
  type AccountItem = {
    id: string;
    code: string;
    name: string;
    description?: string;
    accountType: string;
    fsClassification?: string;
    glCode?: string;
    glName?: string;
    slCode?: string;
    slName?: string;
    parentId?: string;
    parentName?: string;
    isActive: boolean;
    isSystem: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  };

  // Define account option type
  type AccountOption = {
    label: string;
    value: string;
  };

  function getEmptyFormData() {
    return {
      code: '',
      name: '',
      description: '',
      accountType: '',
      fsClassification: '',
      glCode: '',
      glName: '',
      slCode: '',
      slName: '',
      parentId: '',
      isActive: true,
      isSystem: false,
      createdAt: undefined,
      updatedAt: undefined
    };
  }

  // Collection paths
  const rootCollection = 'listdatabase';
  const parentCollection = 'masterlist';
  const subCollectionName = 'accounts';
  const collectionPath = `${parentCollection}/${subCollectionName}`;

  // ListContainer configuration
  const documentType = 'account';
  const title = 'Chart of Accounts';
  const subtitle = 'Manage your Chart of Accounts';
  const primaryColorClass = 'gray';

  // Account types based on the Laravel documentation
  const accountTypes = [
    { label: 'Asset', code: 'ASSET', value: 'asset', category: 'Asset', normalBalance: 'debit' },
    { label: 'Liability', code: 'LIAB', value: 'liability', category: 'Liability', normalBalance: 'credit' },
    { label: 'Equity', code: 'EQTY', value: 'equity', category: 'Equity', normalBalance: 'credit' },
    { label: 'Revenue', code: 'REV', value: 'revenue', category: 'Revenue', normalBalance: 'credit' },
    { label: 'Expense', code: 'EXP', value: 'expense', category: 'Expense', normalBalance: 'debit' },
    { label: 'Cost of Goods Sold', code: 'COGS', value: 'cogs', category: 'Expense', normalBalance: 'debit' }
  ];

  // Financial statement classifications
  const fsClassifications = [
    { label: 'Balance Sheet', value: 'balance_sheet' },
    { label: 'Income Statement', value: 'income_statement' },
    { label: 'Cash Flow', value: 'cash_flow' }
  ];

  // Define form data type with an index signature to allow dynamic property access
  type FormData = {
    [key: string]: any; // Allow dynamic property access
    code: string;
    name: string;
    description: string;
    accountType: string;
    fsClassification: string;
    glCode: string;
    glName: string;
    slCode: string;
    slName: string;
    parentId: string;
    isActive: boolean;
    isSystem: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    parentName?: string; // Added for compatibility with the row data
  }
  
  // Modal state
  let showModal = false;
  let editingItem: AccountItem | null = null;
  let errorMsg = '';

  // Define buttons for the list container
  const buttons = [
    {
      label: 'New Account',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: handleAdd
    }
  ];

  // Form data initialization
  let formData: FormData = {
    code: '',
    name: '',
    description: '',
    accountType: '',
    fsClassification: '',
    glCode: '',
    glName: '',
    slCode: '',
    slName: '',
    parentId: '',
    isActive: true,
    isSystem: false
  };

  // Initialize parent account options
  let parentAccountOptions: AccountOption[] = [];

  // Subscribe to parent account options
  createFirestoreOptionsStore('masterlist/accounts', 'name', 'id').subscribe(opts => {
    parentAccountOptions = [{ label: '-- No Parent --', value: '' }, ...opts];
  });

  // Table columns
  const columns = [
    { label: 'Code', key: 'code', width: '10%' },
    { label: 'Name', key: 'name', width: '20%' },
    { label: 'Type', key: 'accountType', formatter: formatAccountType, width: '15%' },
    { label: 'Normal Balance', key: 'accountType', formatter: (value: string) => {
      const accountType = accountTypes.find(type => type.value === value);
      return accountType ? accountType.normalBalance : '';
    }, width: '10%' },
    { label: 'Classification', key: 'fsClassification', formatter: formatClassification, width: '15%' },
    { label: 'GL Code', key: 'glCode', width: '10%' },
    { label: 'Parent', key: 'parentName', width: '10%' },
    { label: 'Status', key: 'isActive', format: (value: boolean) => value ? 'Active' : 'Inactive', width: '10%' }
  ];

  // Format account type for display
  function formatAccountType(value: string): string {
    const accountType = accountTypes.find(type => type.value === value);
    return accountType ? accountType.label : value;
  }

  // Format classification for display
  function formatClassification(value: string): string {
    const classification = fsClassifications.find(cls => cls.value === value);
    return classification ? classification.label : value;
  }

  // Handle adding a new item
  function handleAdd() {
    editingItem = null;
    formData = getEmptyFormData();
    showModal = true;
    errorMsg = '';
  }

  // Handle editing an item
  function handleEdit(item: AccountItem) {
    editingItem = { ...item };
    // Convert AccountItem to FormData with proper type handling
    formData = {
      code: item.code || '',
      name: item.name || '',
      description: item.description || '',
      accountType: item.accountType || '',
      fsClassification: item.fsClassification || '',
      glCode: item.glCode || '',
      glName: item.glName || '',
      slCode: item.slCode || '',
      slName: item.slName || '',
      parentId: item.parentId || '',
      parentName: item.parentName,
      isActive: item.isActive !== false,
      isSystem: item.isSystem || false,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
    showModal = true;
    errorMsg = '';
  }

  // Handle deleting an item
  async function handleDelete(item: AccountItem): Promise<void> {
    if (item.isSystem) {
      alert('System accounts cannot be deleted.');
      return;
    }

    if (confirm(`Are you sure you want to delete ${item.name}?`)) {
      try {
        await deleteDocFromCollection(collectionPath, item.id);
      } catch (e) {
        alert('Failed to delete: ' + (e as Error).message);
      }
    }
  }

  // Handle saving form data
  async function handleSave() {
    errorMsg = '';

    // Validate required fields
    if (!formData.code || !formData.name || !formData.accountType) {
      errorMsg = 'Code, Name, and Account Type are required';
      return;
    }

    // Prepare data for saving - make a clean copy to remove any undefined values
    const dataToSave: Record<string, any> = {
      code: formData.code || '',
      name: formData.name || '',
      description: formData.description || '',
      accountType: formData.accountType || '',
      fsClassification: formData.fsClassification || '',
      glCode: formData.glCode || '',
      glName: formData.glName || '',
      slCode: formData.slCode || '',
      slName: formData.slName || '',
      parentId: formData.parentId || null,
      isActive: formData.isActive !== false,
      isSystem: formData.isSystem || false,
      updatedAt: new Date()
    };
    
    // Only include parentName if it exists, otherwise don't include it at all
    if (formData.parentName) {
      dataToSave.parentName = formData.parentName;
    }
    
    if (!editingItem) {
      dataToSave.createdAt = new Date();
    }

    try {
      if (editingItem) {
        await updateDocInCollection(collectionPath, editingItem.id, dataToSave);
      } else {
        await addDocToCollection(collectionPath, dataToSave);
      }

      // Reset form and close modal
      showModal = false;
      formData = getEmptyFormData();
      editingItem = null;
    } catch (error) {
      errorMsg = `Error saving account: ${(error as Error).message}`;
    }
  }

  // Close the modal
  function closeModal() {
    showModal = false;
    errorMsg = '';
  }

  // Create account form fields
  $: accountFields = [
    // Basic Information fields
    { label: 'Code*', name: 'code', type: 'text', required: true },
    { label: 'Name*', name: 'name', type: 'text', required: true },
    { label: 'Description', name: 'description', type: 'textarea' },
    { 
      label: 'Account Type*', 
      name: 'accountType', 
      type: 'select', 
      options: accountTypes.map(t => ({ 
        value: t.value, 
        label: `${t.label} (${t.category}, ${t.normalBalance})` 
      })),
      required: true
    },
    { 
      label: 'Financial Statement Classification', 
      name: 'fsClassification', 
      type: 'select',
      options: fsClassifications.map(c => ({ value: c.value, label: c.label }))
    },
    { 
      label: 'Parent Account', 
      name: 'parentId', 
      type: 'select',
      options: parentAccountOptions.filter(opt => !editingItem || opt.value !== editingItem.id)
    },
    // GL/SL Information fields
    { label: 'GL Code', name: 'glCode', type: 'text' },
    { label: 'GL Name', name: 'glName', type: 'text' },
    { label: 'SL Code', name: 'slCode', type: 'text' },
    { label: 'SL Name', name: 'slName', type: 'text' },
    { label: 'Active Account', name: 'isActive', type: 'checkbox', default: true },
    { 
      label: 'System Account', 
      name: 'isSystem', 
      type: 'checkbox', 
      disabled: !(editingItem && editingItem.isSystem)
    }
  ];
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
      <button 
        class="btn btn-ghost btn-xs" 
        on:click={() => handleEdit(row)} 
        disabled={row.isSystem}
        aria-label="Edit account"
      >
        <iconify-icon icon="material-symbols:edit-outline" width="20" height="20"></iconify-icon>
      </button>
      <button 
        class="btn btn-ghost btn-xs" 
        on:click={() => handleDelete(row)} 
        disabled={row.isSystem}
        aria-label="Delete account"
      >
        <iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon>
      </button>
    </svelte:fragment>
  </MasterListContainer>
</div>

{#if showModal}
  <ModalForm
    title={editingItem ? 'Edit Account' : 'New Account'}
    fields={accountFields}
    bind:formData
    {errorMsg}
    onSave={handleSave}
    onCancel={closeModal}
  />
{/if}
