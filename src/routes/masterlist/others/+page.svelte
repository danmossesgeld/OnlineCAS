<script lang="ts">
  import MasterListContainer from '$lib/components/MasterListContainer.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import { parseCSVToRecords } from '$lib/utils/csvParser';
  import { exportNestedFirestoreCollectionToCSV, type ExportColumn } from '$lib/utils/csvExporter';

  // Config for form fields
  $: otherFields = [
    { label: 'Code*', name: 'code', type: 'text', required: true },
    { label: 'Name*', name: 'name', type: 'text', required: true },
    { label: 'Type', name: 'type', type: 'text' },
    { label: 'Contact Person', name: 'contact_person', type: 'text' },
    { label: 'Phone', name: 'phone', type: 'text' },
    { label: 'Email', name: 'email', type: 'email' },
    { label: 'Address', name: 'address', type: 'textarea' },
    { label: 'Status', name: 'status', type: 'text' }
  ];

  const columns = [
    { label: 'Code', key: 'code' },
    { label: 'Name', key: 'name' },
    { label: 'Type', key: 'type' },
    { label: 'Contact Person', key: 'contact_person' },
    { label: 'Phone', key: 'phone' },
    { label: 'Email', key: 'email' },
    { label: 'Address', key: 'address' },
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
  const primaryColorClass = 'indigo';
  let showModal = false;
  let errorMsg = '';
  let formData = { code: '', name: '', type: '', contact_person: '', phone: '', email: '', address: '', status: '' };
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
      onClick: () => { showModal = true; editingItem = null; formData = { code: '', name: '', type: '', contact_person: '', phone: '', email: '', address: '', status: '' }; errorMsg = ''; }
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
            const payload = {
              code: rec.code || '',
              name: rec.name || '',
              type: rec.type || '',
              contact_person: rec.contact_person || '',
              phone: rec.phone || '',
              email: rec.email || '',
              address: rec.address || '',
              status: rec.status || '',
              created_at: new Date(),
              updated_at: new Date()
            };
            if (payload.code && payload.name) {
              try { await addDocToCollection(collectionPath, payload); } catch {}
            }
          }
          alert('Other items import finished');
        };
        input.click();
      }
    },
    {
      label: 'Sample CSV',
      color: 'outline',
      icon: 'material-symbols:description',
      onClick: () => {
        const sample = 'code,name,type,contact_person,phone,email,address,status\nOTH-001,Bureau of Internal Revenue,Government Agency,Maria Cruz,09171234567,maria.cruz@bir.gov.ph,"BIR Building, Quezon City, Metro Manila",Active\nOTH-002,Department of Trade and Industry,Government Agency,Carlos Santos,09181234567,carlos.santos@dti.gov.ph,"DTI Building, Makati City, Metro Manila",Active\nOTH-003,Social Security System,Government Corporation,Ana Rodriguez,09191234567,ana.rodriguez@sss.gov.ph,"SSS Building, Quezon City, Metro Manila",Active\nOTH-004,Philippine Health Insurance,Government Corporation,Roberto Fernandez,09321234567,roberto.fernandez@philhealth.gov.ph,"PhilHealth Building, Pasig City, Metro Manila",Active\nOTH-005,Freelance Consultant,Individual,Jennifer Lee,09451234567,jennifer.lee@email.com,"Home Office, BGC, Taguig City",Active\nOTH-006,Legal Firm Partnership,Professional Services,Attorney Miguel Torres,09561234567,miguel.torres@lawfirm.ph,"Law Building, Ortigas, Pasig City",Active\nOTH-007,Accounting Firm,Professional Services,CPA Elena Gomez,09671234567,elena.gomez@cpa.ph,"Professional Center, Makati City, Metro Manila",Active\nOTH-008,Insurance Broker,Financial Services,Mark Wilson,09781234567,mark.wilson@insurance.ph,"Insurance Plaza, Manila City",Inactive';
        const blob = new Blob([sample], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'others_sample.csv'; a.click();
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
          { key: 'type', label: 'Type' },
          { key: 'contact_person', label: 'Contact Person' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'address', label: 'Address' },
          { key: 'status', label: 'Status' }
        ];
        
        const filename = `others_export_${new Date().toISOString().split('T')[0]}.csv`;
        await exportNestedFirestoreCollectionToCSV(rootCollection, parentCollection, subCollectionName, exportColumns, filename, 'code');
      }
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
      contact_person: formData.contact_person?.trim() || '',
      phone: formData.phone?.trim() || '',
      email: formData.email?.trim() || '',
      address: formData.address?.trim() || '',
      status: formData.status.trim(),
      created_at: editingItem ? undefined : new Date(),
      updated_at: new Date()
    };
    try {
      if (editingItem) {
        await updateDocInCollection(collectionPath, editingItem.id, dataToSave);
        editingItem = null;
      } else {
        await addDocToCollection(collectionPath, dataToSave);
      }
      showModal = false;
      formData = { code: '', name: '', type: '', contact_person: '', phone: '', email: '', address: '', status: '' };
    } catch (e) {
      errorMsg = 'Failed to save: ' + (e as Error).message;
    }
  }

  function handleCancel() {
    showModal = false;
    errorMsg = '';
    editingItem = null;
    formData = { code: '', name: '', type: '', contact_person: '', phone: '', email: '', address: '', status: '' };
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