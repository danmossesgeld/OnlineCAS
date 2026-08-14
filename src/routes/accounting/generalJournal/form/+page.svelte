<script lang="ts">
  import TxnFields from '$lib/components/TxnFields.svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import FormSection from '$lib/components/FormSection.svelte';
  import FormFooter from '$lib/components/FormFooter.svelte';
  import { onMount } from 'svelte';
  import { createFirestoreOptionsStore, type FirestoreOption } from '$lib/utils/firestoreOptions';
  import { addDocToCollection, updateDocInCollection, getDocFromCollection } from '$lib/utils/firestoreCrud';
  import { isDateInClosedPeriod } from '$lib/utils/accountingService';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  // Use the reusable form mode store for handling URL parameters and mode detection
  import { createFormModeStore } from '$lib/stores/formModeStore';
  const formMode = createFormModeStore();
  
  // Extract form mode values from the store using destructuring
  $: ({ docId, isViewMode, isEditMode, isCreateMode, mode } = $formMode);
  
  // Load document when the ID changes in edit or view mode
  $: if (docId && (isEditMode || isViewMode)) {
    loadDocument();
  }
  
  // Show the actual reference number once known, instead of a generic "Edit/View Journal
  // Entry" label — falls back to a mode label for a brand-new, not-yet-saved entry.
  $: pageTitle = isCreateMode
    ? 'New Journal Entry'
    : (formData.referenceNo ? formData.referenceNo : (mode === 'view' ? 'View Journal Entry' : 'Edit Journal Entry'));

  // Type definition for account options with account type
  type AccountOption = FirestoreOption & {
    accountType?: string;
    disabled?: boolean;
  };
  
  // Subscribe to Firestore option stores for select fields
  let accountOptions: AccountOption[] = [];
  let customerOptions: AccountOption[] = [];
  let vendorOptions: AccountOption[] = [];
  let otherNameOptions: AccountOption[] = [];
  
  // Custom option store that includes account type
  createFirestoreOptionsStore('masterlist/accounts', 'name', 'id', true).subscribe(opts => {
    // Add account type information for grouping in the dropdown
    accountOptions = opts.map(opt => {
      // Extract account type from the raw data if available
      const accountType = opt.raw && typeof opt.raw === 'object' ? 
        (opt.raw.accountType as string || '') : '';
      
      return {
        ...opt,
        accountType
      };
    });
  });
  
  // Fetch other entity types for journal entries
  createFirestoreOptionsStore('masterlist/customers', 'name', 'id').subscribe(opts => customerOptions = opts);
  createFirestoreOptionsStore('masterlist/vendors', 'name', 'id').subscribe(opts => vendorOptions = opts);
  createFirestoreOptionsStore('masterlist/others', 'name', 'id').subscribe(opts => otherNameOptions = opts);

  // Define the type for our form data
  type FormDataType = {
    journalDate: string;
    referenceNo: string;
    description: string;
    memo: string;
    sourceType: string;
    sourceId?: string;
    status: string;
  };

  // Initialize form data with empty values
  let formData: FormDataType = {
    journalDate: new Date().toISOString().split('T')[0],
    referenceNo: '',
    description: '',
    memo: '',
    sourceType: 'general',
    status: 'draft'
  };

  // Define entity types for journal entries
  type EntityType = 'customer' | 'vendor' | 'other' | '';
  
  // Define journal entry line type
  type JournalEntryLine = {
    lineNo: number;
    accountId: string;
    accountName: string;
    nameType?: EntityType;
    nameId?: string;
    nameName?: string;
    lineDescription: string;
    debit: number;
    credit: number;
  };
  
  // Initialize journal entry lines
  let lines: JournalEntryLine[] = [];

  // Define type for Firestore timestamp
  type FirestoreTimestamp = {
    toDate: () => Date;
    seconds: number;
    nanoseconds: number;
  };
  
  // Define type for journal entry document from Firestore
  type JournalEntryDocument = {
    id: string;
    journalDate: FirestoreTimestamp | Date;
    referenceNo: string;
    description: string;
    memo: string;
    sourceType: string;
    sourceId?: string;
    totalDebit: number;
    totalCredit: number;
    isPosted: boolean;
    status: string;
    lines: Array<{
      lineNo: number;
      accountId: string;
      accountName: string;
      nameType?: string;
      nameId?: string;
      nameName?: string;
      lineDescription: string;
      debit: number;
      credit: number;
    }>;
    createdAt: FirestoreTimestamp | Date;
    updatedAt: FirestoreTimestamp | Date;
  };
  
  // Helper function to format Firestore date
  function formatFirestoreDate(dateField: FirestoreTimestamp | Date | undefined | null): string {
    if (!dateField) return '';
    
    // Handle Firestore timestamp
    if (dateField && 'toDate' in dateField && typeof dateField.toDate === 'function') {
      return dateField.toDate().toISOString().split('T')[0];
    }
    
    // Handle JavaScript Date
    if (dateField instanceof Date) {
      return dateField.toISOString().split('T')[0];
    }
    
    return '';
  }

  // Load document data when in edit or view mode
  async function loadDocument() {
    if (!docId) return;
    
    try {
      console.log(`Loading journal entry ${docId} in ${mode} mode...`);
      
      // Fetch document data
      const docData = await getDocFromCollection('transactions/accounting/journalEntries', docId) as JournalEntryDocument;
      
      if (!docData) {
        throw new Error('Journal entry not found');
      }
      
      // Populate form data
      formData = {
        journalDate: formatFirestoreDate(docData.journalDate),
        referenceNo: docData.referenceNo || '',
        description: docData.description || '',
        memo: docData.memo || '',
        sourceType: docData.sourceType || 'general',
        sourceId: docData.sourceId,
        status: docData.status || 'draft'
      };
      
      // Handle lines with deep copy to prevent reference issues
      if (docData.lines && Array.isArray(docData.lines)) {
        // Ensure all line items have proper types
        lines = structuredClone(docData.lines).map(line => ({
          ...line,
          // Convert nameType to EntityType
          nameType: (line.nameType || '') as EntityType
        }));
      } else if (isEditMode && (!lines.length || lines.length === 0)) {
        // Ensure at least one empty line item in edit mode
        addLine();
      }
      
      // Update computed values
      updateTotals();
      
    } catch (error) {
      console.error('Error loading journal entry:', error);
      alert(`Failed to load journal entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
      goto('/accounting/generalJournal/list');
    }
  }
  
  // Helper function to update totals
  function updateTotals() {
    // Create a new array to trigger reactivity
    lines = lines.map(line => ({
      ...line,
      // Ensure nameType is always a valid EntityType
      nameType: (line.nameType as string || '') as EntityType
    }));
  }
  
  onMount(() => {
    if (docId) {
      loadDocument();
    } else if (lines.length === 0) {
      addLine();
    }
  });

  // Function to remove a line
  function removeLine(idx: number) {
    lines = lines.filter((_, i) => i !== idx);
    
    // Update line numbers
    lines = lines.map((line, index) => ({
      ...line,
      lineNo: index + 1
    }));
    
    // Add a default line if the last line was removed
    if (lines.length === 0) {
      addLine();
    }
  }

  // Function to add a new empty line
  function addLine() {
    const newLineNo = lines.length + 1;
    lines = [...lines, {
      lineNo: newLineNo,
      accountId: '',
      accountName: '',
      nameType: '',
      nameId: '',
      nameName: '',
      lineDescription: '',
      debit: 0,
      credit: 0
    }];
  }

  // Function to update account name when account ID changes
  function updateAccount(idx: number, accountId: string) {
    if (lines[idx]) {
      const account = accountOptions.find(acc => acc.value === accountId);
      lines[idx].accountName = account ? account.label : '';
      
      // Clear entity fields when changing accounts
      lines[idx].nameType = '';
      lines[idx].nameId = '';
      lines[idx].nameName = '';
      
      updateTotals();
    }
  }
  
  // Function to update entity name when entity ID changes
  function updateEntityName(idx: number, entityType: EntityType, entityId: string) {
    if (lines[idx]) {
      let entityName = '';
      
      // Find the entity name based on the entity type
      if (entityType === 'customer') {
        const entity = customerOptions.find(c => c.value === entityId);
        entityName = entity ? entity.label : '';
      } else if (entityType === 'vendor') {
        const entity = vendorOptions.find(v => v.value === entityId);
        entityName = entity ? entity.label : '';
      } else if (entityType === 'other') {
        const entity = otherNameOptions.find(o => o.value === entityId);
        entityName = entity ? entity.label : '';
      }
      
      // Make both ID and name changes at once to ensure consistency
      lines = lines.map((line, i) => {
        if (i === idx) {
          return {
            ...line,
            nameId: entityId,
            nameName: entityName
          };
        }
        return line;
      });
      
      // Update computed values
      updateTotals();
    }
  }

  // Function to update line amount
  function updateAmount(idx: number, key: string, value: any) {
    if (lines[idx]) {
      const numValue = parseFloat(value) || 0;
      (lines[idx] as Record<string, any>)[key] = numValue;
      
      // If updating debit, clear credit (and vice versa)
      if (key === 'debit' && numValue > 0) {
        lines[idx].credit = 0;
      } else if (key === 'credit' && numValue > 0) {
        lines[idx].debit = 0;
      }
      
      updateTotals();
    }
  }
  
  // Function to update entity type and clear entity ID if type changes
  function updateEntityType(idx: number, entityType: EntityType) {
    if (lines[idx]) {
      // Only change if the type has actually changed
      if (lines[idx].nameType !== entityType) {
        lines[idx].nameType = entityType;
        lines[idx].nameId = '';
        lines[idx].nameName = '';
        updateTotals();
      }
    }
  }

  // Calculate totals using reactive declarations
  $: totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  $: totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  $: isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  // Handle saving the journal entry
  async function handleSave() {
    try {
      // Handle view mode - just navigate back to list
      if (isViewMode) {
        goto('/accounting/generalJournal/list');
        return;
      }
      
      // Validate data before saving
      if (!formData.journalDate) {
        alert('Journal date is required');
        return;
      }
      
      if (!isBalanced) {
        alert('Journal entry must be balanced (total debits must equal total credits)');
        return;
      }
      
      if (lines.some(line => !line.accountId || (line.debit === 0 && line.credit === 0))) {
        alert('All lines must have an account and either a debit or credit amount');
        return;
      }

      // Prevent posting into a closed fiscal period
      const periodCheck = await isDateInClosedPeriod(formData.journalDate);
      if (periodCheck.closed) {
        alert(`Cannot save: the fiscal period${periodCheck.periodLabel ? ` "${periodCheck.periodLabel}"` : ''} is closed. Reopen it from Period Closing or choose a different date.`);
        return;
      }

      // Generate a reference number if none exists
      if (!formData.referenceNo) {
        formData.referenceNo = `JE-${Date.now().toString().substring(7)}`;
      }
      
      // Prepare data for saving
      const journalEntryData = {
        journalDate: formData.journalDate ? new Date(formData.journalDate) : new Date(),
        referenceNo: formData.referenceNo,
        description: formData.description,
        memo: formData.memo,
        sourceType: formData.sourceType,
        sourceId: formData.sourceId,
        totalDebit,
        totalCredit,
        isPosted: formData.status === 'posted',
        status: formData.status,
        lines,
        updatedAt: new Date()
      };
      
      if (isCreateMode) {
        // Add new journal entry
        const newJournalData = {
          ...journalEntryData,
          createdAt: new Date()
        };
        
        await addDocToCollection('transactions', 'accounting', 'journalEntries', newJournalData);
        alert('Journal entry created successfully');
      } else if (isEditMode) {
        // Update existing journal entry
        await updateDocInCollection('transactions/accounting/journalEntries', docId, journalEntryData);
        alert('Journal entry updated successfully');
      }
      
      // Navigate to the list view after successful save
      goto('/accounting/generalJournal/list');
      
    } catch (error) {
      console.error('Error saving journal entry:', error);
      alert('Failed to save journal entry: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  }

  // Define fields for the header section
  $: fields = [
    { label: 'Journal Date', name: 'journalDate', type: 'date', required: true },
    { label: 'Reference No', name: 'referenceNo', type: 'text', placeholder: 'Auto-generated if empty' },
    { label: 'Description', name: 'description', type: 'text', placeholder: 'Brief description of this entry' },
    {
      label: 'Status', 
      name: 'status', 
      type: 'select', 
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Posted', value: 'posted' }
      ] 
    }
  ];

  // Group accounts by type for better organization in the dropdown
  $: groupedAccountOptions = accountOptions.reduce((groups, account) => {
    const type = account.accountType || 'Other';
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(account);
    return groups;
  }, {} as Record<string, AccountOption[]>);
  
  // Create a formatted list for the dropdown with groups
  $: formattedAccountOptions = Object.entries(groupedAccountOptions).flatMap(([type, accounts]) => [
    { label: `--- ${type.toUpperCase()} ---`, value: '', disabled: true },
    ...accounts
  ]);
  
  // Entity type options
  const entityTypeOptions = [
    { label: 'None', value: '' },
    { label: 'Customer', value: 'customer' },
    { label: 'Vendor', value: 'vendor' },
    { label: 'Other Name', value: 'other' }
  ];
  
  // Define columns for the line items table
  $: columns = [
    { label: 'Account', key: 'accountId', type: 'select', options: formattedAccountOptions, width: '25%' },
    { label: 'Entity Type', key: 'nameType', type: 'select', options: entityTypeOptions, width: '15%' },
    { 
      label: 'Entity', 
      key: 'nameId', 
      type: 'select', 
      options: getEntityOptions, 
      width: '15%',
      disabled: (item: JournalEntryLine) => !item.nameType,
      displayField: 'nameName' // Use this to display the name instead of the ID
    },
    { label: 'Description', key: 'lineDescription', type: 'text', width: '15%' },
    { label: 'Debit', key: 'debit', type: 'number', width: '15%' },
    { label: 'Credit', key: 'credit', type: 'number', width: '15%' }
  ];
  
  // Function to get entity options based on the entity type
  function getEntityOptions(item: JournalEntryLine) {
    if (!item.nameType) return [];
    
    switch (item.nameType) {
      case 'customer':
        return customerOptions;
      case 'vendor':
        return vendorOptions;
      case 'other':
        return otherNameOptions;
      default:
        return [];
    }
  }

  // Define summary items for the footer
  const summary = {
    'Total Debit': totalDebit,
    'Total Credit': totalCredit,
    'Difference': Math.abs(totalDebit - totalCredit)
  };

  // Handle line updates for different fields
  function handleLineUpdate(idx: number, field: string, value: any) {
    if (field === 'accountId') {
      updateAccount(idx, value);
    } else if (field === 'debit' || field === 'credit') {
      updateAmount(idx, field, value);
    } else if (field === 'nameType') {
      updateEntityType(idx, value as EntityType);
    } else if (field === 'nameId' && lines[idx]?.nameType) {
      updateEntityName(idx, lines[idx].nameType as EntityType, value);
    } else {
      if (lines[idx]) {
        (lines[idx] as Record<string, any>)[field] = value;
        updateTotals();
      }
    }
  }
</script>

<FormLayout title={pageTitle} backPath="/accounting/generalJournal/list">
  <svelte:fragment slot="header-actions">
    <div class="w-full sm:w-64">
      <label for="field-memo" class="block mb-0.5 text-xs font-medium text-right" style="color: var(--color-neutral-600);">Memo</label>
      <textarea
        id="field-memo"
        rows="2"
        class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors resize-none"
        style="background: {isViewMode ? 'var(--color-neutral-50)' : 'var(--color-neutral-0)'}; border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
        placeholder="Add a memo"
        bind:value={formData.memo}
        disabled={isViewMode}
      ></textarea>
    </div>
  </svelte:fragment>

  <!-- Fields section -->
  <FormSection withSeparator={false}>
    <TxnFields {fields} bind:formData disabled={isViewMode} />
  </FormSection>
  
  <!-- Line Items section -->
  <FormSection
    title="Journal Entry Lines"
    actionButton={!isViewMode}
    actionLabel="Add Line"
    onAction={addLine}
    isItemTable={true}
    grow={true}
    columns={columns}
    items={lines}
    onAdd={!isViewMode ? addLine : undefined}
    onRemove={!isViewMode ? removeLine : undefined}
    onUpdate={!isViewMode ? handleLineUpdate : undefined}
    editable={!isViewMode}
  />
  
  <!-- Footer with integrated Summary and Buttons -->
  <FormFooter
    primaryLabel={isCreateMode ? 'Create Journal Entry' : 'Update Journal Entry'}
    secondaryLabel="Cancel"
    onPrimaryClick={handleSave}
    onSecondaryClick={() => goto('/accounting/generalJournal/list')}
    showSecondaryButton={!isViewMode}
    hideButtons={isViewMode}
    summaryMode="custom"
    readOnly={isViewMode}
  >
    <!-- Custom summary in a slot -->
    <div slot="summary" class="p-4">
      <h2 class="text-lg font-semibold mb-4" style="color: var(--color-neutral-800);">Balance Summary</h2>

      <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div>
          <div class="flex justify-between items-center mb-2">
            <span style="color: var(--color-neutral-600);">Total Debit:</span>
            <span class="font-medium" style="color: var(--color-neutral-800);">₱{totalDebit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
          </div>
        </div>

        <div>
          <div class="flex justify-between items-center mb-2">
            <span style="color: var(--color-neutral-600);">Total Credit:</span>
            <span class="font-medium" style="color: var(--color-neutral-800);">₱{totalCredit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
          </div>
        </div>
      </div>

      <!-- Difference and Balance Status -->
      <div class="flex justify-between font-bold text-base mt-3 pt-2 items-center" style="border-top: 1px solid var(--color-neutral-200); color: var(--color-neutral-800);">
        <span class="flex items-center">
          <span>Difference:</span>
        </span>
        <span
          class="px-3 py-1 rounded-lg"
          style={`color: var(${isBalanced ? '--color-success-600' : '--color-error-600'}); background: color-mix(in srgb, var(${isBalanced ? '--color-success-600' : '--color-error-600'}) 14%, transparent); border: 1px solid color-mix(in srgb, var(${isBalanced ? '--color-success-600' : '--color-error-600'}) 30%, transparent);`}
        >
          ₱{Math.abs(totalDebit - totalCredit).toLocaleString(undefined, {minimumFractionDigits: 2})}
        </span>
      </div>

      <div class="mt-2 text-center">
        {#if isBalanced}
          <p class="text-sm font-medium" style="color: var(--color-success-600);">✓ Journal entry is balanced</p>
        {:else}
          <p class="text-sm font-medium" style="color: var(--color-error-600);">⚠ Journal entry is not balanced</p>
        {/if}
      </div>
    </div>

    <!-- Custom buttons slot to add disabled state -->
    <div slot="custom-buttons">
      <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        {#if !isViewMode}
          <button
            class="px-6 py-2 text-white rounded transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style="background: var(--color-primary-600);"
            on:click={handleSave}
            disabled={!isBalanced || lines.some(line => !line.accountId || (line.debit === 0 && line.credit === 0))}
          >
            {isCreateMode ? 'Create Journal Entry' : 'Update Journal Entry'}
          </button>

          <button
            class="px-6 py-2 rounded transition-all duration-150"
            style="border: 1px solid var(--color-neutral-300); color: var(--color-neutral-700);"
            on:click={() => goto('/accounting/generalJournal/list')}
          >
            Cancel
          </button>
        {:else}
          <button
            class="px-6 py-2 text-white rounded transition-all duration-150"
            style="background: var(--color-primary-600);"
            on:click={() => goto('/accounting/generalJournal/list')}
          >
            Back to List
          </button>
        {/if}
      </div>
    </div>
  </FormFooter>
</FormLayout>
