<script lang="ts">
  import MasterListContainer from '$lib/components/MasterListContainer.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';

  // Config for form fields
  $: otherFields = [
    { label: 'Code*', name: 'code', type: 'text', required: true },
    { label: 'Name*', name: 'name', type: 'text', required: true },
    { label: 'Type', name: 'type', type: 'text' },
    { label: 'Status', name: 'status', type: 'text' }
  ];

  const columns = [
    { label: 'Code', key: 'code' },
    { label: 'Name', key: 'name' },
    { label: 'Type', key: 'type' },
    { label: 'Status', key: 'status' }
  ];

  // Collection paths
  const rootCollection = 'listdatabase';
  const parentCollection = 'masterlist';
  const subCollectionName = 'others';
  const collectionPath = 'masterlist/others';
  
  // ListContainer configuration
  const documentType = 'other';
  const title = 'Other Items';
  const subtitle = 'Manage additional business resources';
  const primaryColorClass = 'neutral';
  let showModal = false;
  let errorMsg = '';
  let formData = { code: '', name: '', type: '', status: '' };
  let editingItem: { id: string } | null = null;

  // Define button type to match the structure we need
  type Button = {
    label: string;
    color: string;
    icon?: string;
    onClick: () => void;
    class?: string;
  };

  const buttons: Button[] = [
    {
      label: 'New Other Item',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => { showModal = true; editingItem = null; formData = { code: '', name: '', type: '', status: '' }; errorMsg = ''; }
    }
  ];

  async function handleSave() {
    errorMsg = '';
    if (!formData.code.trim() || !formData.name.trim()) {
      errorMsg = 'Code and Name are required.';
      return;
    }
    const dataToSave = {
      code: formData.code.trim(),
      name: formData.name.trim(),
      type: formData.type.trim(),
      status: formData.status.trim()
    };
    try {
      if (editingItem) {
        await updateDocInCollection(collectionPath, editingItem.id, dataToSave);
        editingItem = null;
      } else {
        await addDocToCollection(collectionPath, dataToSave);
      }
      showModal = false;
      formData = { code: '', name: '', type: '', status: '' };
    } catch (e) {
      errorMsg = 'Failed to save: ' + (e as Error).message;
    }
  }

  function handleCancel() {
    showModal = false;
    errorMsg = '';
    editingItem = null;
    formData = { code: '', name: '', type: '', status: '' };
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
      <button class="btn btn-ghost btn-xs" aria-label="Edit other name" on:click={() => handleEdit(row)}><iconify-icon icon="material-symbols:edit-outline" width="20" height="20"></iconify-icon></button>
      <button class="btn btn-ghost btn-xs" aria-label="Delete other name" on:click={() => handleDelete(row)}><iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon></button>
    </svelte:fragment>
  </MasterListContainer>

  {#if showModal}
    <ModalForm
      title={editingItem ? 'Edit Other Name' : 'Add Other Name'}
      fields={otherFields}
      bind:formData
      {errorMsg}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  {/if}
</div> 