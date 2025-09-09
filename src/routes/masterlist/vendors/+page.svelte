<script lang="ts">
  import MasterListContainer from '$lib/components/MasterListContainer.svelte';
  import ModalForm from '$lib/components/ModalForm.svelte';
  import { addDocToCollection, updateDocInCollection, deleteDocFromCollection, queryCollectionDocs } from '$lib/utils/firestoreCrud';
  import { parseCSVToRecords } from '$lib/utils/csvParser';
  import { readFileAsTextSmart } from '$lib/utils/fileEncoding';
  import { exportNestedFirestoreCollectionToCSV, type ExportColumn } from '$lib/utils/csvExporter';
  import { orderBy } from 'firebase/firestore';
  import type { QueryConstraint } from 'firebase/firestore';

  // Config for form fields
  $: vendorFields = [
    { label: 'Code*', name: 'code', type: 'text', required: true },
    { label: 'Name*', name: 'name', type: 'text', required: true },
    { label: 'Contact Person', name: 'contact_person', type: 'text' },
    { label: 'Phone', name: 'phone', type: 'text' },
    { label: 'Email', name: 'email', type: 'email' },
    { label: 'Address', name: 'address', type: 'textarea' },
    { label: 'Tax ID', name: 'tax_id', type: 'text' },
    { label: 'Active', name: 'is_active', type: 'checkbox', default: true }
  ];

  const columns = [
    { label: 'Code', key: 'code' },
    { label: 'Name', key: 'name' },
    { label: 'Contact Person', key: 'contact_person' },
    { label: 'Phone', key: 'phone' },
    { label: 'Email', key: 'email' },
    { label: 'Address', key: 'address' },
    { label: 'Tax ID', key: 'tax_id' },
    { label: 'Status', key: 'is_active', format: (value: boolean) => value ? 'Active' : 'Inactive' }
  ];

  // Collection paths
  const rootCollection = 'listdatabase';
  const parentCollection = 'masterlist';
  const subCollectionName = 'vendors';
  const collectionPath = 'masterlist/vendors';
  
  // Default sort by code
  const queryOptions: QueryConstraint[] = [orderBy('code')];
  
  // ListContainer configuration
  const documentType = 'vendor';
  const title = 'Vendor Masterlist';
  const subtitle = 'Manage your suppliers and service providers';
  const primaryColorClass = 'indigo';
  
  // Define buttons for the list container
  const buttons = [
    {
      label: 'New Vendor',
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
          const text = await readFileAsTextSmart(file);
          const records = parseCSVToRecords(text);
          
          // Wipe existing collection before importing new records
          if (confirm('Importing will delete all existing vendors in this list. Continue?')) {
            try {
              const existing = await queryCollectionDocs(collectionPath);
              if (existing && existing.length > 0) {
                for (const doc of existing) {
                  try { await deleteDocFromCollection(collectionPath, doc.id); } catch (e) { console.warn('Delete failed for', doc.id, e); }
                }
              }
            } catch (e) {
              console.error('Error deleting existing vendors:', e);
            }
          } else {
            return;
          }
          
          for (const rec of records) {
            const payload = {
              code: rec.code || rec.vendor_code || '',
              name: rec.name || rec.vendor_name || '',
              contact_person: rec.contact_person || '',
              phone: rec.phone || '',
              email: rec.email || '',
              address: rec.address || '',
              tax_id: rec.tax_id || rec.tin || '',
              is_active: String(rec.is_active).toLowerCase() !== 'false',
              created_at: new Date(),
              updated_at: new Date()
            };
            
            if (payload.code && payload.name) {
              try { 
                await addDocToCollection(collectionPath, payload);
              } catch (error) {
                console.error('Error saving:', error);
              }
            }
          }
          alert('Vendor import finished.');
        };
        input.click();
      }
    },
    {
      label: 'Sample CSV',
      color: 'outline',
      icon: 'material-symbols:description',
      onClick: () => {
        const sample = 'code,name,contact_person,phone,email,address,tax_id,is_active\nVEND-001,Manila Paper Supply Co,John Doe,09181234567,john.doe@manilapaper.com,"456 Industrial Avenue, Quezon City, Metro Manila",321-654-987-000,true\nVEND-002,Philippine Office Solutions,Sarah Lee,09271234567,sarah.lee@philoffice.ph,"Unit 789, Business Park, Ortigas, Pasig City",654-321-987-000,true\nVEND-003,Metro Cleaning Services,Ricardo Gomez,09351234567,ricardo@metroclean.com,"Building 12, Service Center, Marikina City",789-456-123-000,true\nVEND-004,Cebu Food Distributors,Elena Martinez,09421234567,elena@cebufood.com,"Wholesale Market, Lahug, Cebu City",456-123-789-000,true\nVEND-005,IT Hardware Plus,Mark Wilson,09531234567,mark@ithardware.ph,"Tech Hub, Eastwood, Quezon City",123-789-456-000,true\nVEND-006,Construction Materials Inc,Pedro Reyes,09641234567,pedro@constructmat.com,"Industrial Zone, Caloocan City",987-321-654-000,true\nVEND-007,Davao Agricultural Supply,Lisa Tan,09751234567,lisa@davaoagri.ph,"Agri Center, Davao City",321-987-654-000,false';
        const blob = new Blob([sample], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'vendors_sample.csv'; a.click();
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
          { key: 'contact_person', label: 'Contact Person' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'address', label: 'Address' },
          { key: 'tax_id', label: 'Tax ID' },
          { key: 'is_active', label: 'Active', format: (value: boolean) => value ? 'true' : 'false' }
        ];
        
        const filename = `vendors_export_${new Date().toISOString().split('T')[0]}.csv`;
        await exportNestedFirestoreCollectionToCSV(rootCollection, parentCollection, subCollectionName, exportColumns, filename, 'code');
      }
    }
  ];
  let showModal = false;
  let errorMsg = '';
  let formData = {
    code: '',
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    tax_id: '',
    is_active: true
  };
  let editingItem: { id: string } | null = null;

  function handleAdd() {
    showModal = true; 
    editingItem = null; 
    formData = {
      code: '',
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      address: '',
      tax_id: '',
      is_active: true
    }; 
    errorMsg = '';
  }

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
      address: string;
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
      address: formData.address?.trim() || '',
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
      formData = {
        code: '',
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        tax_id: '',
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
      contact_person: '',
      phone: '',
      email: '',
      address: '',
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
    {queryOptions}
    defaultButtons={false}
    allowDelete={false}
  >
    <svelte:fragment slot="additionalActions" let:row>
      <button class="btn btn-ghost btn-xs" aria-label="Edit vendor" on:click={() => handleEdit(row)}><iconify-icon icon="material-symbols:edit-outline" width="20" height="20"></iconify-icon></button>
      <button class="btn btn-ghost btn-xs" aria-label="Delete vendor" on:click={() => handleDelete(row)}><iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon></button>
    </svelte:fragment>
  </MasterListContainer>
</div>

{#if showModal}
  <ModalForm
    title={editingItem ? 'Edit Vendor' : 'Add Vendor'}
    fields={vendorFields}
    bind:formData
    {errorMsg}
    onSave={handleSave}
    onCancel={handleCancel}
  />
{/if}