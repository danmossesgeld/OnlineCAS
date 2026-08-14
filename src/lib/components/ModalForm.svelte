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

  const fieldStyle = 'background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);';
</script>

<div class="fixed top-0 left-0 right-0 bottom-0 flex items-center justify-center z-50 p-4" style="background: rgba(15, 23, 42, 0.4);">
  <div class="rounded-lg w-full max-w-3xl overflow-hidden border" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); box-shadow: var(--shadow-lg);">
    <!-- Modal Header -->
    <div class="px-5 py-3.5" style="border-bottom: 1px solid var(--color-neutral-200);">
      <h3 class="text-lg font-semibold" style="color: var(--color-neutral-800);">
        {title}
      </h3>
    </div>

    <!-- Modal Body -->
    <div class="p-4 max-h-[70vh] overflow-y-auto">
      {#if errorMsg}
        <div class="mb-4 p-3 rounded-md text-sm" style="background: var(--color-error-50); color: var(--color-error-700);">
          {errorMsg}
        </div>
      {/if}

      <form class="grid grid-cols-1 {advancedFields.length > 0 ? 'md:grid-cols-2' : 'md:grid-cols-1 md:max-w-xl md:mx-auto'} gap-5" on:submit|preventDefault={onSave}>
        <!-- Basic Information -->
        <div class="space-y-3">
          <h4 class="font-medium text-sm uppercase tracking-wide mb-1" style="color: var(--color-neutral-500);">Basic Information</h4>

          {#each basicFields as field}
            <div>
              <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);" for={field.name}>
                {field.label.replace('*', '')} {#if field.required}<span style="color: var(--color-error-500);">*</span>{/if}
              </label>

              {#if field.type === 'select'}
                <select
                  id={field.name}
                  class="w-full px-2.5 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={fieldStyle}
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
                  class="w-full px-2.5 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={fieldStyle}
                  placeholder={field.placeholder}
                  bind:value={formData[field.name]}
                  required={field.required}
                ></textarea>
              {:else if field.type === 'checkbox'}
                <div class="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id={field.name}
                    class="w-4 h-4 rounded"
                    style="accent-color: var(--color-primary-600);"
                    bind:checked={formData[field.name]}
                  />
                  <label class="ml-2 block text-sm" style="color: var(--color-neutral-600);" for={field.name}>
                    {field.label}
                  </label>
                </div>
              {:else}
                <input
                  type={field.type || 'text'}
                  id={field.name}
                  class="w-full px-2.5 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={fieldStyle}
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
          <h4 class="font-medium text-sm uppercase tracking-wide mb-1" style="color: var(--color-neutral-500);">Advanced Information</h4>

          {#each advancedFields as field}
            <div>
              <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);" for={field.name}>
                {field.label.replace('*', '')} {#if field.required}<span style="color: var(--color-error-500);">*</span>{/if}
              </label>

              {#if field.type === 'select'}
                <select
                  id={field.name}
                  class="w-full px-2.5 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={fieldStyle}
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
                  class="w-full px-2.5 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={fieldStyle}
                  placeholder={field.placeholder}
                  bind:value={formData[field.name]}
                  required={field.required}
                ></textarea>
              {:else if field.type === 'checkbox'}
                <div class="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id={field.name}
                    class="w-4 h-4 rounded"
                    style="accent-color: var(--color-primary-600);"
                    bind:checked={formData[field.name]}
                  />
                  <label class="ml-2 block text-sm" style="color: var(--color-neutral-600);" for={field.name}>
                    {field.label}
                  </label>
                </div>
              {:else}
                <input
                  type={field.type || 'text'}
                  id={field.name}
                  class="w-full px-2.5 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={fieldStyle}
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
    <div class="px-5 py-3 flex justify-end space-x-3" style="background: var(--color-neutral-50); border-top: 1px solid var(--color-neutral-200);">
      <button
        type="button"
        class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
        style="background: var(--color-neutral-100); color: var(--color-neutral-700);"
        on:click={onCancel}
        aria-label="Cancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
        style="background: var(--color-primary-600);"
        on:click={onSave}
        aria-label="Save"
      >
        Save
      </button>
    </div>
  </div>
</div>