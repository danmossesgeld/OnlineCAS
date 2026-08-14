<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { formatDate } from '$lib/utils/formatters';
  
  const dispatch = createEventDispatcher();
  
  // Title and description
  export let title: string;
  export let description: string;
  
  // Report loading and error states
  export let loading = false;
  export let error: string | null = null;
  
  // Report parameters
  export let parameterType: 'dateRange' | 'asOfDate' = 'dateRange';
  export let startDate: Date | null = null;
  export let endDate: Date | null = null;
  export let asOfDate: Date | null = null;
  export let customParameters: Array<{
    label: string;
    type: 'text' | 'select' | 'number' | 'date';
    id: string;
    value: any;
    options?: Array<{ label: string; value: any }>;
  }> = [];
  
  // Report metadata for exports
  export let reportId: string;
  export let filename: string;
  
  // Initialize dates if not provided
  onMount(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    if (parameterType === 'dateRange') {
      startDate = startDate || firstDayOfMonth;
      endDate = endDate || lastDayOfMonth;
    } else if (parameterType === 'asOfDate') {
      asOfDate = asOfDate || lastDayOfMonth;
    }
  });
  
  function handleGenerateReport() {
    const parameters = parameterType === 'dateRange' 
      ? { startDate, endDate, ...getCustomParameterValues() } 
      : { asOfDate, ...getCustomParameterValues() };
    
    dispatch('generateReport', parameters);
  }
  
  function getCustomParameterValues() {
    const values: Record<string, any> = {};
    customParameters.forEach(param => {
      values[param.id] = param.value;
    });
    return values;
  }
  
  function handlePrint() {
    window.print();
  }
  
  function handleExport() {
    dispatch('export', {
      reportId,
      filename,
      parameters: parameterType === 'dateRange' 
        ? { startDate, endDate, ...getCustomParameterValues() } 
        : { asOfDate, ...getCustomParameterValues() }
    });
  }
  
  function handleParameterChange(id: string, event: Event) {
    const param = customParameters.find(p => p.id === id);
    if (param) {
      param.value = (event.target as HTMLInputElement).value;
      dispatch('parameterChange', { id, value: param.value });
    }
  }

  const inputStyle = 'background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);';
</script>

<svelte:head>
  <title>{title}</title>
  <style>
    @media print {
      body * {
        visibility: hidden;
      }
      #report-container, #report-container * {
        visibility: visible;
      }
      #report-container {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</svelte:head>

<div class="container mx-auto py-2 px-0">
  <!-- Header Section -->
  <div class="flex justify-between items-center mb-4">
    <div>
      <h1 class="text-xl md:text-2xl font-semibold" style="color: var(--color-neutral-800);">{title}</h1>
      <p class="text-sm mt-0.5" style="color: var(--color-neutral-500);">{description}</p>
    </div>

    <div class="flex space-x-2 no-print">
      <button
        class="px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 border"
        style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700);"
        on:click={handlePrint}
      >
        <iconify-icon icon="material-symbols:print-outline" width="18" height="18"></iconify-icon>
        <span>Print</span>
      </button>

      <button
        class="px-3.5 py-2 rounded-lg text-sm font-medium text-white transition-colors flex items-center space-x-2"
        style="background: var(--color-primary-600);"
        on:click={handleExport}
      >
        <iconify-icon icon="material-symbols:download" width="18" height="18"></iconify-icon>
        <span>Export</span>
      </button>
    </div>
  </div>

  <!-- Parameters Section -->
  <div class="rounded-lg border p-4 mb-4 no-print" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200);">
    <h2 class="text-sm font-medium uppercase tracking-wide mb-3" style="color: var(--color-neutral-500);">Report Parameters</h2>

    <div class="grid grid-cols-1 {parameterType === 'dateRange' ? 'md:grid-cols-2' : ''} gap-4">
      {#if parameterType === 'dateRange'}
        <div>
          <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);" for="startDate">
            Start Date
          </label>
          <input
            type="date"
            id="startDate"
            class="block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2"
            style={inputStyle}
            bind:value={startDate}
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);" for="endDate">
            End Date
          </label>
          <input
            type="date"
            id="endDate"
            class="block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2"
            style={inputStyle}
            bind:value={endDate}
          />
        </div>
      {:else if parameterType === 'asOfDate'}
        <div>
          <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);" for="asOfDate">
            As of Date
          </label>
          <input
            type="date"
            id="asOfDate"
            class="block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2"
            style={inputStyle}
            bind:value={asOfDate}
          />
        </div>
      {/if}

      {#each customParameters as param}
        <div>
          <label class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);" for={param.id}>
            {param.label}
          </label>

          {#if param.type === 'select'}
            <select
              id={param.id}
              class="block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2"
              style={inputStyle}
              value={param.value}
              on:change={(e) => handleParameterChange(param.id, e)}
            >
              {#each param.options || [] as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          {:else if param.type === 'number'}
            <input
              type="number"
              id={param.id}
              class="block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2"
              style={inputStyle}
              value={param.value}
              on:change={(e) => handleParameterChange(param.id, e)}
            />
          {:else if param.type === 'date'}
            <input
              type="date"
              id={param.id}
              class="block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2"
              style={inputStyle}
              value={param.value}
              on:change={(e) => handleParameterChange(param.id, e)}
            />
          {:else}
            <input
              type="text"
              id={param.id}
              class="block w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2"
              style={inputStyle}
              value={param.value}
              on:change={(e) => handleParameterChange(param.id, e)}
            />
          {/if}
        </div>
      {/each}
    </div>

    <div class="mt-4">
      <button
        class="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style="background: var(--color-primary-600);"
        on:click={handleGenerateReport}
      >
        Generate Report
      </button>
    </div>
  </div>

  <!-- Report Content Section -->
  {#if loading}
    <div class="rounded-lg border p-6 flex justify-center items-center h-64" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200);">
      <p style="color: var(--color-neutral-500);">Loading report data...</p>
    </div>
  {:else if error}
    <div class="p-4 rounded-md border" style="background: var(--color-error-50); border-color: var(--color-error-500); color: var(--color-error-700);">
      <p>{error}</p>
    </div>
  {:else}
    <div id="report-container" class="rounded-lg border p-4 sm:p-6" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200);">
      <div class="text-center mb-5">
        <h2 class="text-lg font-semibold" style="color: var(--color-neutral-800);">{title}</h2>
        {#if parameterType === 'dateRange'}
          <p class="text-sm" style="color: var(--color-neutral-500);">For the period {startDate ? formatDate(startDate) : ''} to {endDate ? formatDate(endDate) : ''}</p>
        {:else if parameterType === 'asOfDate'}
          <p class="text-sm" style="color: var(--color-neutral-500);">As of {asOfDate ? formatDate(asOfDate) : ''}</p>
        {/if}
      </div>

      <!-- Report content slot -->
      <slot name="report-content">
        <div class="text-center py-10">
          <p style="color: var(--color-neutral-500);">No data available for this report.</p>
        </div>
      </slot>
    </div>
  {/if}
</div>
