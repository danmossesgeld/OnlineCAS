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
    { label: 'Billing Address', key: 'billing_address' },
    { label: 'Shipping Address', key: 'shipping_address' },
    { label: 'Tax ID', key: 'tax_id' },
    { label: 'Status', key: 'is_active', format: (value: boolean) => value ? 'Active' : 'Inactive' }
  ];

  // Collection paths
  const rootCollection = 'listdatabase';
  const parentCollection = 'masterlist';
  const subCollectionName = 'customers';
  const collectionPath = 'masterlist/customers';
  
  // Default sort by code
  const queryOptions: QueryConstraint[] = [orderBy('code')];
  
  // ListContainer configuration
  const documentType = 'customer';
  const title = 'Customer Masterlist';
  const subtitle = 'Manage your customers and their information';
  const primaryColorClass = 'indigo';
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
          if (confirm('Importing will delete all existing customers in this list. Continue?')) {
            try {
              const existing = await queryCollectionDocs(collectionPath);
              if (existing && existing.length > 0) {
                for (const doc of existing) {
                  try { await deleteDocFromCollection(collectionPath, doc.id); } catch (e) { console.warn('Delete failed for', doc.id, e); }
                }
              }
            } catch (e) {
              console.error('Error deleting existing customers:', e);
            }
          } else {
            return;
          }
          
          for (const rec of records) {
            const payload = {
              code: rec.code || rec.customer_code || '',
              name: rec.name || rec.customer_name || '',
              contact_person: rec.contact_person || '',
              phone: rec.phone || '',
              email: rec.email || '',
              billing_address: rec.billing_address || '',
              shipping_address: rec.shipping_address || '',
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
          alert('Customer import finished. Check console for debug info.');
        };
        input.click();
      }
    },
    {
      label: 'Sample CSV',
      color: 'outline',
      icon: 'material-symbols:description',
      onClick: () => {
        const sample = 'code,name,contact_person,phone,email,billing_address,shipping_address,tax_id,is_active\nCUST-001,Acme Corporation,Jane Smith,09171234567,jane.smith@acmecorp.com,"Unit 123, Business Center, Makati City, Metro Manila","Unit 123, Business Center, Makati City, Metro Manila",123-456-789-000,true\nCUST-002,Global Tech Solutions,Michael Johnson,09181234567,michael@globaltech.ph,"5th Floor, IT Building, BGC, Taguig City","Warehouse A, Industrial Park, Laguna",987-654-321-000,true\nCUST-003,Manila Trading Inc,Maria Santos,09191234567,maria.santos@manilatrading.com,"Room 456, Trade Center, Binondo, Manila","Storage Facility, Pasig City, Metro Manila",456-789-123-000,true\nCUST-004,Cebu Retail Group,Carlos Rodriguez,09321234567,carlos@ceburetail.com,"Ground Floor, Mall Complex, Cebu City","Distribution Center, Mandaue City, Cebu",789-123-456-000,true\nCUST-005,Davao Enterprises,Ana Dela Cruz,09821234567,ana@davaoent.ph,"Building 7, Commercial District, Davao City","Same as billing address",321-654-987-000,true\nCUST-006,Baguio Mountain Goods,Roberto Fernandez,09741234567,roberto@baguiogoods.com,"Session Road, Baguio City, Benguet","Warehouse B, La Trinidad, Benguet",654-987-321-000,false';
        const blob = new Blob([sample], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'customers_sample.csv'; a.click();
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
          { key: 'billing_address', label: 'Billing Address' },
          { key: 'shipping_address', label: 'Shipping Address' },
          { key: 'tax_id', label: 'Tax ID' },
          { key: 'is_active', label: 'Active', format: (value: boolean) => value ? 'true' : 'false' }
        ];
        
        const filename = `customers_export_${new Date().toISOString().split('T')[0]}.csv`;
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