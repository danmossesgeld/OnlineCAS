<script lang="ts">
  import FireTable from '$lib/components/FireTable.svelte';
  import ListButtons from '$lib/components/ListButtons.svelte';
  import { getFirestore, collection, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
  import { app } from '$lib/utils/firebase';
  let showModal = false;
  let errorMsg = '';
  let editingItem: { id: string, name: string } | null = null;
  let formData = { name: '' };
  const columns = [
    { label: 'Name', key: 'name' }
  ];
  let collectionPath = 'paymentmethods';
  const buttons = [
    {
      label: 'New Payment Method',
      color: 'primary',
      icon: 'material-symbols:add',
      onClick: () => { showModal = true; editingItem = null; formData = { name: '' }; errorMsg = ''; }
    }
  ];
  function handleSave() {
    errorMsg = '';
    if (!formData.name.trim()) {
      errorMsg = 'Name is required.';
      return;
    }
    const db = getFirestore(app);
    const colRef = collection(db, collectionPath);
    const dataToSave = { name: formData.name.trim() };
    if (editingItem) {
      const docRef = doc(db, collectionPath, editingItem.id);
      setDoc(docRef, dataToSave)
        .then(() => {
          showModal = false;
          editingItem = null;
          formData = { name: '' };
        })
        .catch((e) => {
          errorMsg = 'Failed to update: ' + e.message;
        });
    } else {
      addDoc(colRef, dataToSave)
        .then(() => {
          showModal = false;
          formData = { name: '' };
        })
        .catch((e) => {
          errorMsg = 'Failed to add: ' + e.message;
        });
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
  function handleDelete(item: any) {
    if (confirm(`Are you sure you want to delete ${item.name}?`)) {
      const db = getFirestore(app);
      const docRef = doc(db, collectionPath, item.id);
      deleteDoc(docRef).catch((e) => {
        alert('Failed to delete: ' + e.message);
      });
    }
  }
</script>
<div class="bg-white rounded-2xl shadow-xl p-8">
  <h1 class="text-2xl font-bold mb-2 flex items-center gap-2"><iconify-icon icon="material-symbols:credit-card-rounded" width="28" height="28" /> Payment Methods</h1>
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
</div>
{#if showModal}
  <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <div class="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
      <h2 class="text-xl font-bold mb-4">{editingItem ? 'Edit' : 'Add'} Payment Method</h2>
      <input class="input input-bordered w-full mb-2" placeholder="Payment Method Name" bind:value={formData.name} />
      {#if errorMsg}
        <div class="text-error text-sm mb-2">{errorMsg}</div>
      {/if}
      <div class="flex justify-end gap-2">
        <button class="btn btn-outline" on:click={handleCancel}>Cancel</button>
        <button class="btn btn-primary" on:click={handleSave}>Save</button>
      </div>
    </div>
  </div>
{/if} 