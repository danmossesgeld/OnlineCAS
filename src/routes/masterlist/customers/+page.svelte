<script lang="ts">
  import MasterListContainer from '$lib/components/MasterListContainer.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';

  // Config for form fields
  $: customerFields = [
    { label: 'Code*', name: 'code', type: 'text', required: true },
    { label: 'Name*', name: 'name', type: 'text', required: true },
    { label: 'Contact Person', name: 'contact_person', type: 'text' },
    { label: 'Phone', name: 'phone', type: 'text' },
    { label: 'Email', name: 'email', type: 'email' },
    { label: 'Billing Address', name: 'billing_address', type: 'textarea' },
    { label: 'Shipping Address', name: 'shipping_address', type: 'textarea' },
    { label: 'Tax ID', name: 'tax_id', type: 'text' },
    { label: 'Active', name: 'is_active', type: 'checkbox', default: true }
  ];

  const columns = [
    { label: 'Code', key: 'code' },
    { label: 'Name', key: 'name' },
    { label: 'Contact Person', key: 'contact_person' },
    { label: 'Phone', key: 'phone' },
    { label: 'Email', key: 'email' },
    { label: 'Tax ID', key: 'tax_id' },
    { label: 'Status', key: 'is_active', format: (value: boolean) => value ? 'Active' : 'Inactive' }
  ];

  // Collection paths
  const rootCollection = 'listdatabase';
  const parentCollection = 'masterlist';
  const subCollectionName = 'customers';
  const collectionPath = 'masterlist/customers';
  
  // ListContainer configuration
  const documentType = 'customer';
  const title = 'Customer Masterlist';
  const subtitle = 'Manage your customers and their information';
  const primaryColorClass = 'blue';
  let showModal = false;
  let errorMsg = '';
  let formData = { 
    code: '', 
    name: '', 
    contact_person: '', 
    phone: '', 
    email: '', 
    billing_address: '', 
    shipping_address: '', 
    tax_id: '', 
    is_active: true 
  };
  let editingItem: { id: string } | null = null;

  const buttons = [
    {
      label: 'New Customer',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => { showModal = true; editingItem = null; formData = { code: '', name: '', contact_person: '', phone: '', email: '', billing_address: '', shipping_address: '', tax_id: '', is_active: true }; errorMsg = ''; }
    }
  ];

  async function handleSave() {
    errorMsg = '';
    if (!formData.code.trim() || !formData.name.trim()) {
      errorMsg = 'Code and Name are required.';
      return;
    }
    
    // Email validation if provided
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errorMsg = 'Please enter a valid email address.';
      return;
    }
    
    // Define data type with all fields including timestamps
    const dataToSave: {
      code: string;
      name: string;
      contact_person: string;
      phone: string;
      email: string;
      billing_address: string;
      shipping_address: string;
      tax_id: string;
      is_active: boolean;
      updated_at: Date;
      created_at?: Date;
    } = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      contact_person: formData.contact_person?.trim() || '',
      phone: formData.phone?.trim() || '',
      email: formData.email?.trim() || '',
      billing_address: formData.billing_address?.trim() || '',
      shipping_address: formData.shipping_address?.trim() || '',
      tax_id: formData.tax_id?.trim() || '',
      is_active: formData.is_active === undefined ? true : formData.is_active,
      updated_at: new Date()
    };
    
    // Add created_at only for new records
    if (!editingItem) {
      dataToSave.created_at = new Date();
    }
    try {
      if (editingItem) {
        await updateDocInCollection(collectionPath, editingItem.id, dataToSave);
        editingItem = null;
      } else {
        await addDocToCollection(collectionPath, dataToSave);
      }
      showModal = false;
      formData = { code: '', name: '', contact_person: '', phone: '', email: '', billing_address: '', shipping_address: '', tax_id: '', is_active: true };
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
      contact_person: '', 
      phone: '', 
      email: '', 
      billing_address: '', 
      shipping_address: '', 
      tax_id: '', 
      is_active: true 
    };
  }

  function handleEdit(item: any) {
    editingItem = item;
    formData = { ...item };
    showModal = true;
    errorMsg = '';
  }

  async function handleDelete(item: any) {
    if (confirm(`Are you sure you want to delete ${item.name}?`)) {
      try {
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
      <button class="btn btn-ghost btn-xs" aria-label="Edit customer" on:click={() => handleEdit(row)}><iconify-icon icon="material-symbols:edit-outline" width="20" height="20"></iconify-icon></button>
      <button class="btn btn-ghost btn-xs" aria-label="Delete customer" on:click={() => handleDelete(row)}><iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon></button>
    </svelte:fragment>
  </MasterListContainer>

  {#if showModal}
    <ModalForm
      title={editingItem ? 'Edit Customer' : 'Add Customer'}
      fields={customerFields}
      bind:formData
      {errorMsg}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  {/if}
</div>