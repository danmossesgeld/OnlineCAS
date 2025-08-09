<script lang="ts">
  import MasterListContainer from '$lib/components/MasterListContainer.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';

  // Config for form fields
  $: unitFields = [
    { label: 'Name*', name: 'name', type: 'text', required: true }
  ];

  const columns = [
    { label: 'Name', key: 'name' }
  ];

  // Collection paths
  const rootCollection = 'listdatabase';
  const parentCollection = 'otherlist';
  const subCollectionName = 'units';
  const collectionPath = 'otherlist/units';  // This will be mapped to listdatabase/otherlist/units
  
  // ListContainer configuration
  const documentType = 'unit';
  const title = 'Units';
  const subtitle = 'Manage measurement units for your inventory items';
  const primaryColorClass = 'blue';
  const totalLabel = 'Total Units';
  const postedLabel = '';
  const draftLabel = '';
  const pendingLabel = '';
  const overdueLabel = '';

  let showModal = false;
  let errorMsg = '';
  let formData = { name: '' };
  let editingItem: { id: string, name: string } | null = null;
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
      label: 'New Unit',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => { showModal = true; editingItem = null; formData = { name: '' }; errorMsg = ''; }
    }
  ];
  async function handleSave() {
    errorMsg = '';
    if (!formData.name.trim()) {
      errorMsg = 'Name is required.';
      return;
    }
    const dataToSave = { name: formData.name.trim() };
    try {
      if (editingItem) {
        await updateDocInCollection(collectionPath, editingItem.id, dataToSave);
        editingItem = null;
      } else {
        await addDocToCollection(collectionPath, dataToSave);
      }
      showModal = false;
      formData = { name: '' };
    } catch (e) {
      errorMsg = 'Failed to save: ' + (e as Error).message;
    }
  }
  function handleCancel() {
    showModal = false;
    errorMsg = '';
    editingItem = null;
    formData = { name: '' };
  }
  function handleEdit(item: any) {
    editingItem = item;
    formData = { name: item.name };
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
      <button class="btn btn-ghost btn-xs" aria-label="Edit unit" on:click={() => handleEdit(row)}><iconify-icon icon="material-symbols:edit-outline" width="20" height="20"></iconify-icon></button>
      <button class="btn btn-ghost btn-xs" aria-label="Delete unit" on:click={() => handleDelete(row)}><iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon></button>
    </svelte:fragment>
  </MasterListContainer>

  {#if showModal}
    <ModalForm
      title={editingItem ? 'Edit Unit' : 'Add Unit'}
      fields={unitFields}
      bind:formData
      {errorMsg}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  {/if}
</div>