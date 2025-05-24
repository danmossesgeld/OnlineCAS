<script lang="ts">
  import FireTable from '$lib/components/FireTable.svelte';
  import ListButtons from '$lib/components/ListButtons.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import { collectionStore } from '$lib/utils/firestoreStores';

  // Config for form fields
  $: taxFields = [
    { label: 'Name*', name: 'name', type: 'text', required: true }
  ];

  const columns = [
    { label: 'Name', key: 'name' }
  ];

  // Get data from stores
  const taxStore = collectionStore('otherlist', 'tax');
  $: taxes = $taxStore || [];

  let parentCollection = 'otherlist';
  let subCollectionName = 'tax';
  let collectionPath = 'otherlist/tax';  // This will be mapped to listdatabase/otherlist/tax

  let showModal = false;
  let errorMsg = '';
  let formData = { name: '' };
  let editingItem: { id: string, name: string } | null = null;
  const buttons = [
    {
      label: 'New Tax',
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
  <h1 class="text-2xl font-bold mb-2 flex items-center gap-2"><iconify-icon icon="material-symbols:percent-rounded" width="28" height="28"></iconify-icon> Tax</h1>
  <div class="flex flex-row gap-2 mb-4 items-center">
    <div class="ml-auto">
      <ListButtons {buttons} />
    </div>
  </div>
  <FireTable parentCollection={parentCollection} subCollectionName={subCollectionName} {columns} queryOptions={[]}>
    <svelte:fragment slot="actions" let:row>
      <button class="btn btn-ghost btn-xs" aria-label="Edit tax" on:click={() => handleEdit(row)}><iconify-icon icon="material-symbols:edit-outline" width="20" height="20"></iconify-icon></button>
      <button class="btn btn-ghost btn-xs" aria-label="Delete tax" on:click={() => handleDelete(row)}><iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon></button>
    </svelte:fragment>
  </FireTable>

  {#if showModal}
    <ModalForm
      title={editingItem ? 'Edit Tax' : 'Add Tax'}
      fields={taxFields}
      bind:formData
      {errorMsg}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  {/if}
</div>