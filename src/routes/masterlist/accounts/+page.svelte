<script lang="ts">
  import { onMount } from 'svelte';
  import MasterListContainer from '$lib/components/MasterListContainer.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import { createFirestoreOptionsStore } from '$lib/utils/firestoreOptions';
  import { parseCSVToRecords } from '$lib/utils/csvParser';
  import { exportNestedFirestoreCollectionToCSV, type ExportColumn } from '$lib/utils/csvExporter';

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
    raw?: any;
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
  const primaryColorClass = 'indigo';

  // Account types based on the Laravel documentation
  const accountTypes = [
    { label: 'Asset', code: 'ASSET', value: 'asset', category: 'Asset', normalBalance: 'debit' },
    { label: 'Liability', code: 'LIAB', value: 'liability', category: 'Liability', normalBalance: 'credit' },
    { label: 'Equity', code: 'EQTY', value: 'equity', category: 'Equity', normalBalance: 'credit' },
    { label: 'Revenue', code: 'REV', value: 'revenue', category: 'Revenue', normalBalance: 'credit' },
    { label: 'Expense', code: 'EXP', value: 'expense', category: 'Expense', normalBalance: 'debit' },
    { label: 'Cost of Goods Sold', code: 'COGS', value: 'cogs', category: 'Expense', normalBalance: 'debit' }
  ];

  // Financial statement classifications.
  // These values must match reportingService.ts's FSClassification enum exactly (kebab-case) —
  // Balance Sheet / Income Statement report pages group accounts by this field, so a mismatch
  // here silently excludes accounts from every generated report.
  const fsClassifications = [
    { label: 'Current Asset', value: 'current-asset' },
    { label: 'Non-Current Asset', value: 'non-current-asset' },
    { label: 'Current Liability', value: 'current-liability' },
    { label: 'Non-Current Liability', value: 'non-current-liability' },
    { label: 'Equity', value: 'equity' },
    { label: 'Revenue', value: 'revenue' },
    { label: 'Cost of Sales', value: 'cost-of-sales' },
    { label: 'Operating Expense', value: 'operating-expense' },
    { label: 'Other Income', value: 'other-income' },
    { label: 'Other Expense', value: 'other-expense' },
    { label: 'Tax', value: 'tax' }
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
    },
    {
      label: 'Import CSV',
      color: 'outline',
      icon: 'material-symbols:upload',
      onClick: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const text = await file.text();
          const records = parseCSVToRecords(text);
          
          for (const rec of records) {
            // Handle parent ID: Users enter account codes, we need to convert to document IDs
            const parentCode = rec.parentid || rec.parent_id || rec.parent_code || '';
            let resolvedParentId = null;
            let resolvedParentName = '';
            
            if (parentCode) {
              // Find parent account by code (not by document ID)
              const parentAccount = parentAccountOptions.find(opt => 
                opt.raw && opt.raw.code === parentCode
              );
              
              if (parentAccount) {
                resolvedParentId = parentAccount.value; // This is the document ID
                resolvedParentName = parentAccount.label; // This is the account name
              } else {
                console.warn(`Parent account with code "${parentCode}" not found for account "${rec.code}"`);
              }
            }

            const payload: Record<string, any> = {
              code: rec.code || '',
              name: rec.name || '',
              description: rec.description || '',
              accountType: (rec.accounttype || rec.account_type || rec.type || '').toLowerCase(),
              fsClassification: (rec.fsclassification || rec.fs_classification || rec.classification || '').toLowerCase(),
              glCode: rec.glcode || rec.gl_code || '',
              glName: rec.glname || rec.gl_name || '',
              slCode: rec.slcode || rec.sl_code || '',
              slName: rec.slname || rec.sl_name || '',
              parentId: resolvedParentId,
              parentName: resolvedParentName,
              isActive: String(rec.isactive || rec.is_active).toLowerCase() !== 'false',
              isSystem: String(rec.issystem || rec.is_system).toLowerCase() === 'true',
              createdAt: new Date(),
              updatedAt: new Date()
            };
            if (payload.code && payload.name && payload.accountType) {
              try { await addDocToCollection(collectionPath, payload); } catch {}
            }
          }
          alert('Accounts import finished');
        };
        input.click();
      }
    },
    {
      label: 'Sample CSV',
      color: 'outline',
      icon: 'material-symbols:description',
      onClick: () => {
        const sample = 'code,name,description,accountType,fsClassification,glCode,glName,slCode,slName,parentId,isActive,isSystem\n1000,Current Assets,Current asset accounts,asset,current-asset,100,Current Assets,,,,,true,false\n1010,Cash and Cash Equivalents,Cash accounts,asset,current-asset,101,Cash,,,1000,true,false\n1011,Cash on Hand,Physical cash in office,asset,current-asset,1011,Petty Cash,,,1010,true,false\n1012,Cash in Bank - BPI,Main operating account,asset,current-asset,1012,BPI Checking,,,1010,true,false\n1020,Accounts Receivable,Customer receivables,asset,current-asset,102,A/R,,,1000,true,false\n2000,Current Liabilities,Current liability accounts,liability,current-liability,200,Current Liab,,,,,true,false\n2010,Accounts Payable,Vendor payables,liability,current-liability,201,A/P,,,2000,true,false\n3000,Owner Equity,Equity accounts,equity,equity,300,Equity,,,,,true,false\n4000,Revenue,Income accounts,revenue,revenue,400,Revenue,,,,,true,false\n4010,Sales Revenue,Product sales,revenue,revenue,401,Sales,,,4000,true,false\n5000,Operating Expenses,Business expenses,expense,operating-expense,500,Expenses,,,,,true,false\n5010,Office Supplies,Office supply expenses,expense,operating-expense,501,Supplies,,,5000,true,false';
        const blob = new Blob([sample], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'accounts_sample.csv'; a.click();
        URL.revokeObjectURL(url);
      }
    },
    {
      label: 'Export CSV',
      color: 'outline',
      icon: 'material-symbols:download',
      onClick: async () => {
        const exportColumns: ExportColumn[] = [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'description', label: 'Description' },
          { key: 'accountType', label: 'Account Type' },
          { key: 'fsClassification', label: 'FS Classification' },
          { key: 'glCode', label: 'GL Code' },
          { key: 'glName', label: 'GL Name' },
          { key: 'slCode', label: 'SL Code' },
          { key: 'slName', label: 'SL Name' },
          { 
            key: 'parentId', 
            label: 'Parent ID', 
            format: (documentId: string) => {
              if (!documentId) return '';
              // Find the parent account by document ID and return its code
              const parentAccount = parentAccountOptions.find(opt => opt.value === documentId);
              return parentAccount?.raw?.code || '';
            }
          },
          { key: 'parentName', label: 'Parent Name' },
          { key: 'isActive', label: 'Active', format: (value: boolean) => value ? 'true' : 'false' },
          { key: 'isSystem', label: 'System', format: (value: boolean) => value ? 'true' : 'false' }
        ];
        
        const filename = `accounts_export_${new Date().toISOString().split('T')[0]}.csv`;
        await exportNestedFirestoreCollectionToCSV(rootCollection, parentCollection, subCollectionName, exportColumns, filename, 'code');
      }
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
  createFirestoreOptionsStore('masterlist/accounts', 'name', 'id', true).subscribe(opts => {
    parentAccountOptions = [{ label: '-- No Parent --', value: '' }, ...opts];
  });

  // Table columns with render functions for indentation and proper display.
  // These return raw HTML (rendered via {@html} in FireTable), so theme-aware colors
  // must be inline styles referencing CSS vars — a hardcoded Tailwind class like
  // text-gray-700 would stay a fixed dark gray and become illegible in dark mode.
  const rowTextStyle = 'color: var(--color-neutral-700);';
  const columns = [
    { label: 'Code', key: 'code', width: '10%' },
    {
      label: 'Name',
      key: 'name',
      width: '24%',
      render: (row: any) => {
        const depth = typeof row._depth === 'number' ? row._depth : 0;
        const pad = '&nbsp;'.repeat(depth * 16);
        const bullet = depth > 0 ? '<span class="inline-block w-2 h-2 rounded-full mr-2" style="background: var(--color-primary-400);"></span>' : '';
        return `${pad}${bullet}<span style=\"${rowTextStyle}\">${row.name || ''}</span>`;
      }
    },
    { label: 'Type', key: 'accountType', width: '12%', render: (row: any) => `<span style=\"${rowTextStyle}\">${formatAccountType(row.accountType)}</span>` },
    { label: 'Normal Balance', key: 'accountType', width: '12%', render: (row: any) => `<span style=\"${rowTextStyle}\">${accountTypes.find(t => t.value === row.accountType)?.normalBalance || ''}</span>` },
    { label: 'Classification', key: 'fsClassification', width: '16%', render: (row: any) => `<span style=\"${rowTextStyle}\">${formatClassification(row.fsClassification)}</span>` },
    { label: 'GL Code', key: 'glCode', width: '8%' },
    { label: 'Parent', key: 'parentName', width: '10%', render: (row: any) => `<span style=\"${rowTextStyle}\">${row.parentName || '-'}</span>` },
    { label: 'Status', key: 'isActive', width: '8%', render: (row: any) => `<span style=\"${rowTextStyle}\">${row.isActive ? 'Active' : 'Inactive'}</span>` }
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

    // Resolve parent fields. When user selects '-- No Parent --', ensure parentId is null and parentName is ''
    const normalizedParentId = formData.parentId ? String(formData.parentId) : null;
    const resolvedParentName = normalizedParentId
      ? (parentAccountOptions.find(o => String(o.value) === normalizedParentId)?.label || '')
      : '';

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
      parentId: normalizedParentId,
      parentName: resolvedParentName,
      isActive: formData.isActive !== false,
      isSystem: formData.isSystem || false,
      updatedAt: new Date()
    };
    
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
