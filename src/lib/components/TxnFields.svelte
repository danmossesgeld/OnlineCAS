<script lang="ts">
  /**
   * TxnFields: Multi-column, multi-row form field layout
   * - Add a 'row' property to any field to group fields in the same row.
   * - If no 'row' is specified, fields are grouped by index in sets of 4.
   * - Memo/notes-style textareas are expected to be pulled out of `fields` and rendered
   *   via FormLayout's `header-actions` slot instead (top-right, next to the title) —
   *   see TxnFields consumers for the pattern. This component just renders whatever
   *   fields it's given, in a plain grid.
   */
  type FieldType = {
    label: string;
    name: string;
    type?: string;
    placeholder?: string;
    value?: any;
    options?: Array<{ label: string; value: any }>;
    required?: boolean;
    class?: string;
    row?: string | number;
    disabled?: boolean;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (e: Event) => void;
  };

  export let fields: FieldType[] = [];
  export let formData: Record<string, any> = {};
  export let disabled = false; // Add disabled prop for view mode

  // Group fields by row property, or by index in sets of 4.
  $: groupedFields = (() => {
    const groups: Array<Array<typeof fields[0]>> = [];
    let buffer: Array<typeof fields[0]> = [];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (field.row !== undefined) {
        if (!groups.some(g => g[0]?.row === field.row)) {
          groups.push(fields.filter(f => f.row === field.row));
        }
      } else {
        buffer.push(field);
        if (buffer.length === 4) {
          groups.push(buffer);
          buffer = [];
        }
      }
    }
    if (buffer.length) groups.push(buffer);
    return groups.filter((g, idx, arr) =>
      g[0]?.row === undefined || arr.findIndex(gg => gg[0]?.row === g[0]?.row) === idx
    );
  })();
</script>

<div class="space-y-2.5 w-full">
  {#each groupedFields as rowFields}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 w-full">
      {#each rowFields as field}
        {@const fieldStyle = `background: ${disabled ? 'var(--color-neutral-50)' : 'var(--color-neutral-0)'}; border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);`}
        <div class={(field.class ?? '') + ' w-full'}>
          <label for={`field-${field.name}`} class="block mb-0.5 text-xs font-medium" style="color: var(--color-neutral-600);">{field.label}</label>
          {#if field.type === 'select'}
            <select
              id={`field-${field.name}`}
              class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={fieldStyle}
              bind:value={formData[field.name]}
              required={field.required}
              {disabled}
            >
              <option value="" disabled selected>{field.placeholder ?? 'Select'}</option>
              {#each field.options ?? [] as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          {:else if field.type === 'date'}
            <input
              id={`field-${field.name}`}
              class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={fieldStyle}
              type="date"
              placeholder={field.placeholder}
              bind:value={formData[field.name]}
              required={field.required}
              {disabled}
            />
          {:else if field.type === 'textarea'}
            <textarea
              id={`field-${field.name}`}
              rows="1"
              class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors resize-y"
              style="{fieldStyle} min-height: 0;"
              placeholder={field.placeholder}
              bind:value={formData[field.name]}
              required={field.required}
              {disabled}
            ></textarea>
          {:else if field.type === 'checkbox'}
            <div class="flex items-center gap-2 h-8">
              <input
                id={`field-${field.name}`}
                type="checkbox"
                class="w-4 h-4 rounded"
                style="accent-color: var(--color-primary-600);"
                bind:checked={formData[field.name]}
                on:change={field.onChange}
                {disabled}
              />
              <label for={`field-${field.name}`} class="text-sm cursor-pointer" style="color: var(--color-neutral-600);">{field.label}</label>
            </div>
          {:else}
            <input
              id={`field-${field.name}`}
              class="w-full rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={fieldStyle}
              type={field.type ?? 'text'}
              placeholder={field.placeholder}
              bind:value={formData[field.name]}
              min={field.min}
              max={field.max}
              step={field.step}
              required={field.required}
              {disabled}
            />
          {/if}
        </div>
      {/each}
    </div>
  {/each}
  <slot />
</div>
