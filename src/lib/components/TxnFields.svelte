<script lang="ts">
  /**
   * TxnFields: Multi-column, multi-row form field layout
   * - Add a 'row' property to any field to group fields in the same row.
   * - If no 'row' is specified, fields are grouped by index in sets of 3.
   */
  export let fields: Array<{
    label: string;
    name: string;
    type?: string;
    placeholder?: string;
    value?: any;
    options?: Array<{ label: string; value: any }>;
    required?: boolean;
    class?: string;
    row?: string | number;
  }> = [];
  export let formData: Record<string, any> = {};

  function handleInput(e: Event, name: string) {
    formData = { ...formData, [name]: (e.target as HTMLInputElement).value };
  }

  // Group fields by row property or by index in sets of 3
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
        if (buffer.length === 3) {
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

<div class="space-y-4 w-full">
  {#each groupedFields as rowFields}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4 w-full">
      {#each rowFields as field}
        <div class={(field.class ?? '') + ' w-full'}>
          <label class="block mb-1 text-sm font-medium text-gray-700">{field.label}</label>
          {#if field.type === 'select'}
            <select class="select select-bordered select-xs w-full border border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary bg-white rounded-md px-3 py-2" bind:value={formData[field.name]} required={field.required}>
              <option value="" disabled selected>{field.placeholder ?? 'Select'}</option>
              {#each field.options ?? [] as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          {:else if field.type === 'date'}
            <input class="input input-bordered input-xs w-full border border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary bg-white rounded-md px-3 py-2" type="date" placeholder={field.placeholder} bind:value={formData[field.name]} required={field.required} />
          {:else if field.type === 'textarea'}
            <textarea class="textarea textarea-bordered textarea-xs w-full border border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary bg-white rounded-md px-3 py-2" placeholder={field.placeholder} bind:value={formData[field.name]} required={field.required}></textarea>
          {:else if field.type === 'checkbox'}
            <div class="form-control flex items-center gap-2 mb-2">
              <input type="checkbox" class="checkbox checkbox-sm" bind:checked={formData[field.name]} />
              <span class="label-text text-xs text-gray-700">{field.label}</span>
            </div>
          {:else}
            <input class="input input-bordered input-xs w-full border border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary bg-white rounded-md px-3 py-2" type={field.type ?? 'text'} placeholder={field.placeholder} bind:value={formData[field.name]} required={field.required} />
          {/if}
        </div>
      {/each}
    </div>
  {/each}
  <slot />
</div> 