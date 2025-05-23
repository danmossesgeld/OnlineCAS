<script lang="ts">
  /**
   * Generic Modal Form for Add/Edit
   * Props:
   * - title: string
   * - fields: Array<{ label, name, type, options?, placeholder?, required? }>
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
</script>

<div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
  <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg border border-gray-100 relative animate-fade-in">
    <button class="absolute top-4 right-4 text-gray-400 hover:text-primary transition" on:click={onCancel} aria-label="Close">
      <iconify-icon icon="material-symbols:close" width="24" height="24" />
    </button>
    <h2 class="text-2xl font-extrabold mb-6 text-gray-800 tracking-tight flex items-center gap-2">
      <iconify-icon icon="material-symbols:edit-square-outline" width="26" height="26" class="text-primary" />
      {title}
    </h2>
    <form class="flex flex-col gap-4 mb-4" on:submit|preventDefault={onSave}>
      {#each fields as field}
        <div class="flex flex-col gap-1 w-full">
          <label class="block text-sm font-semibold text-gray-700 mb-1">{field.label}</label>
          {#if field.type === 'select'}
            <select class="input input-bordered w-full px-4 py-2 border-2 border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary transition rounded-lg bg-white text-gray-800" bind:value={formData[field.name]} required={field.required}>
              <option value="" disabled>{field.placeholder ?? 'Select'}</option>
              {#each field.options ?? [] as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          {:else if field.type === 'textarea'}
            <textarea class="input input-bordered w-full min-h-[80px] px-4 py-2 border-2 border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary transition rounded-lg bg-white text-gray-800" placeholder={field.placeholder} bind:value={formData[field.name]} required={field.required}></textarea>
          {:else if field.type === 'number'}
            <input class="input input-bordered w-full px-4 py-2 border-2 border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary transition rounded-lg bg-white text-gray-800" type="number" placeholder={field.placeholder} bind:value={formData[field.name]} required={field.required} />
          {:else}
            <input class="input input-bordered w-full px-4 py-2 border-2 border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary transition rounded-lg bg-white text-gray-800" type={field.type ?? 'text'} placeholder={field.placeholder} bind:value={formData[field.name]} required={field.required} />
          {/if}
        </div>
      {/each}
    </form>
    {#if errorMsg}
      <div class="alert alert-error text-xs mb-4 animate-fade-in">{errorMsg}</div>
    {/if}
    <div class="flex justify-end gap-4 mt-4">
      <button
        class="btn btn-outline rounded-full px-6 py-2 font-semibold text-gray-600 border-2 border-gray-300 hover:bg-gray-100 hover:border-primary hover:text-primary transition flex items-center gap-2 shadow-sm"
        type="button"
        on:click={onCancel}
        aria-label="Cancel"
      >
        <iconify-icon icon="material-symbols:close-rounded" width="22" height="22" />
        Cancel
      </button>
      <button
        class="btn rounded-full px-7 py-2 font-bold bg-[#8B1F3B] hover:bg-[#7a1a34] text-white shadow-lg hover:scale-105 transition flex items-center gap-2"
        type="submit"
        on:click={onSave}
        aria-label="Save"
      >
        <iconify-icon icon="material-symbols:save-rounded" width="22" height="22" />
        Save
      </button>
    </div>
  </div>
</div> 