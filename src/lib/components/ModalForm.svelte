<script lang="ts">
  /**
   * Generic Modal Form for Add/Edit
   * Props:
   * - title: string
   * - fields: Array<{ label, name, type, options?, placeholder?, required?, section? }>
   * - formData: object (bind)
   * - errorMsg: string
   * - onSave: function
   * - onCancel: function
   */
  export let title: string;
  export let fields: any[];
  export let formData: any;
  export let errorMsg: string;
  export let onSave: () => void;
  export let onCancel: () => void;
  
  // Organize fields into sections (basic and advanced)
  $: basicFields = fields.filter(f => !f.section || f.section === 'basic');
  $: advancedFields = fields.filter(f => f.section === 'advanced');
</script>

<div class="fixed top-0 left-0 right-0 bottom-0 flex items-center justify-center z-50">
  <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 overflow-hidden border border-gray-200">
    <!-- Modal Header -->
    <div class="bg-blue-50 px-5 py-3 border-b border-gray-200">
      <h3 class="text-xl font-semibold text-gray-800">
        {title}
      </h3>
    </div>
    
    <!-- Modal Body -->
    <div class="p-4 max-h-[70vh] overflow-y-auto">
      {#if errorMsg}
        <div class="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {errorMsg}
        </div>
      {/if}
      
      <form class="grid grid-cols-1 {advancedFields.length > 0 ? 'md:grid-cols-2' : 'md:grid-cols-1 md:max-w-xl md:mx-auto'} gap-5" on:submit|preventDefault={onSave}>
        <!-- Basic Information -->
        <div class="space-y-3">
          <h4 class="font-semibold text-gray-700 mb-2">Basic Information</h4>
          
          {#each basicFields as field}
            <div>
              <label class="block text-gray-700 text-sm font-medium mb-1" for={field.name}>
                {field.label.replace('*', '')} {#if field.required}<span class="text-red-500">*</span>{/if}
              </label>
              
              {#if field.type === 'select'}
                <select
                  id={field.name}
                  class="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  bind:value={formData[field.name]}
                  required={field.required}
                >
                  <option value="">{field.placeholder || `Select ${field.label.replace('*', '')}`}</option>
                  {#each field.options ?? [] as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              {:else if field.type === 'textarea'}
                <textarea
                  id={field.name}
                  rows="2"
                  class="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={field.placeholder}
                  bind:value={formData[field.name]}
                  required={field.required}
                ></textarea>
              {:else if field.type === 'checkbox'}
                <div class="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id={field.name}
                    class="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    bind:checked={formData[field.name]}
                  />
                  <label class="ml-2 block text-gray-700" for={field.name}>
                    {field.label}
                  </label>
                </div>
              {:else}
                <input
                  type={field.type || 'text'}
                  id={field.name}
                  class="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={field.placeholder}
                  bind:value={formData[field.name]}
                  required={field.required}
                />
              {/if}
            </div>
          {/each}
        </div>
        
        <!-- Advanced Information -->
        {#if advancedFields.length > 0}
        <div class="space-y-3">
          <h4 class="font-semibold text-gray-700 mb-2">Advanced Information</h4>
          
          {#each advancedFields as field}
            <div>
              <label class="block text-gray-700 text-sm font-medium mb-1" for={field.name}>
                {field.label.replace('*', '')} {#if field.required}<span class="text-red-500">*</span>{/if}
              </label>
              
              {#if field.type === 'select'}
                <select
                  id={field.name}
                  class="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  bind:value={formData[field.name]}
                  required={field.required}
                >
                  <option value="">{field.placeholder || `Select ${field.label.replace('*', '')}`}</option>
                  {#each field.options ?? [] as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                </select>
              {:else if field.type === 'textarea'}
                <textarea
                  id={field.name}
                  rows="2"
                  class="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={field.placeholder}
                  bind:value={formData[field.name]}
                  required={field.required}
                ></textarea>
              {:else if field.type === 'checkbox'}
                <div class="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id={field.name}
                    class="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    bind:checked={formData[field.name]}
                  />
                  <label class="ml-2 block text-gray-700" for={field.name}>
                    {field.label}
                  </label>
                </div>
              {:else}
                <input
                  type={field.type || 'text'}
                  id={field.name}
                  class="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={field.placeholder}
                  bind:value={formData[field.name]}
                  required={field.required}
                />
              {/if}
            </div>
          {/each}
          
        </div>
        {/if}
      </form>
    </div>
    
    <!-- Modal Footer -->
    <div class="bg-gray-50 px-5 py-3 border-t border-gray-200 flex justify-end space-x-3">
      <button
        type="button"
        class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors duration-200"
        on:click={onCancel}
        aria-label="Cancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200"
        on:click={onSave}
        aria-label="Save"
      >
        Save
      </button>
    </div>
  </div>
</div>