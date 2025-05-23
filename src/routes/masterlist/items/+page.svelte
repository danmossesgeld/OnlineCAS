<script lang="ts">
  import FireTable from '$lib/components/FireTable.svelte';
  import ListButtons from '$lib/components/ListButtons.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import { categoryOptions, unitOptions } from '$lib/utils/optionStores';

  // Config for form fields
  $: itemFields = [
    { label: 'Code*', name: 'code', type: 'text', required: true },
    { label: 'Name*', name: 'name', type: 'text', required: true },
    { label: 'Type', name: 'type', type: 'text' },
    { label: 'Category', name: 'category', type: 'select', options: $categoryOptions },
    { label: 'Unit', name: 'unit', type: 'select', options: $unitOptions },
    { label: 'Price', name: 'price', type: 'number' },
    { label: 'Cost', name: 'cost', type: 'number' },
    { label: 'Status', name: 'status', type: 'text' }
  ];

  const columns = [
    { label: 'Code', key: 'code' },
    { label: 'Name', key: 'name' },
    { label: 'Type', key: 'type' },
    { label: 'Category', key: 'category' },
    { label: 'Unit', key: 'unit' },
    { label: 'Price', key: 'price' },
    { label: 'Cost', key: 'cost' },
    { label: 'Status', key: 'status' }
  ];

  let collectionPath = 'items';
  let showModal = false;
  let errorMsg = '';
  let formData = { code: '', name: '', type: '', category: '', unit: '', price: '', cost: '', status: '' };
  let editingItem: { id: string } | null = null;

  const buttons = [
    {
      label: 'New Item',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => { showModal = true; editingItem = null; formData = { code: '', name: '', type: '', category: '', unit: '', price: '', cost: '', status: '' }; errorMsg = ''; }
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
      category: formData.category,
      unit: formData.unit,
      price: formData.price ? parseFloat(formData.price as string) : 0,
      cost: formData.cost ? parseFloat(formData.cost as string) : 0,
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
      formData = { code: '', name: '', type: '', category: '', unit: '', price: '', cost: '', status: '' };
    } catch (e) {
      errorMsg = 'Failed to save: ' + (e as Error).message;
    }
  }

  function handleCancel() {
    showModal = false;
    errorMsg = '';
    editingItem = null;
    formData = { code: '', name: '', type: '', category: '', unit: '', price: '', cost: '', status: '' };
  }

  function handleEdit(item: any) {
    editingItem = item;
    formData = { ...item, price: item.price?.toString?.() ?? '', cost: item.cost?.toString?.() ?? '' };
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
  <h1 class="text-2xl font-bold mb-2">Item Management</h1>
  <p class="mb-6 text-gray-500">Manage your items here</p>
  <div class="flex flex-row gap-2 mb-4 items-center">
    <div class="ml-auto">
      <ListButtons {buttons} />
    </div>
  </div>
  <FireTable {collectionPath} {columns} queryOptions={[]}>
    <svelte:fragment slot="actions" let:row>
      <button class="btn btn-ghost btn-xs" on:click={() => handleEdit(row)}><iconify-icon icon="material-symbols:edit-outline" width="20" height="20"></iconify-icon></button>
      <button class="btn btn-ghost btn-xs" on:click={() => handleDelete(row)}><iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon></button>
    </svelte:fragment>
  </FireTable>

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
</div> 