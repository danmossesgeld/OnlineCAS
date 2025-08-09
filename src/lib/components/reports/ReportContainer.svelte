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

<div class="container mx-auto py-6 px-4">
  <!-- Header Section -->
  <div class="flex justify-between items-center mb-6">
    <div>
      <h1 class="text-2xl font-semibold text-gray-800">{title}</h1>
      <p class="text-gray-600 mt-1">{description}</p>
    </div>
    
    <div class="flex space-x-3">
      <button 
        class="px-4 py-2 bg-gray-100 text-gray-700 rounded shadow-sm hover:bg-gray-200 transition-colors flex items-center space-x-2 no-print"
        on:click={handlePrint}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        <span>Print</span>
      </button>
      
      <button 
        class="px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 transition-colors flex items-center space-x-2 no-print"
        on:click={handleExport}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Export</span>
      </button>
    </div>
  </div>

  <!-- Parameters Section -->
  <div class="bg-white rounded-2xl shadow-xl p-6 mb-6 no-print">
    <h2 class="text-lg font-semibold text-gray-700 mb-4">Report Parameters</h2>
    
    <div class="grid grid-cols-1 {parameterType === 'dateRange' ? 'md:grid-cols-2' : ''} gap-6">
      {#if parameterType === 'dateRange'}
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="startDate">
            Start Date
          </label>
          <input
            type="date"
            id="startDate"
            class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            bind:value={startDate}
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="endDate">
            End Date
          </label>
          <input
            type="date"
            id="endDate"
            class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            bind:value={endDate}
          />
        </div>
      {:else if parameterType === 'asOfDate'}
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="asOfDate">
            As of Date
          </label>
          <input
            type="date"
            id="asOfDate"
            class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            bind:value={asOfDate}
          />
        </div>
      {/if}
      
      {#each customParameters as param}
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for={param.id}>
            {param.label}
          </label>
          
          {#if param.type === 'select'}
            <select
              id={param.id}
              class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
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
              class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              value={param.value}
              on:change={(e) => handleParameterChange(param.id, e)}
            />
          {:else if param.type === 'date'}
            <input
              type="date"
              id={param.id}
              class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              value={param.value}
              on:change={(e) => handleParameterChange(param.id, e)}
            />
          {:else}
            <input
              type="text"
              id={param.id}
              class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              value={param.value}
              on:change={(e) => handleParameterChange(param.id, e)}
            />
          {/if}
        </div>
      {/each}
    </div>
    
    <div class="mt-4">
      <button 
        class="px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 transition-colors"
        on:click={handleGenerateReport}
      >
        Generate Report
      </button>
    </div>
  </div>

  <!-- Report Content Section -->
  {#if loading}
    <div class="bg-white rounded-2xl shadow-xl p-6 flex justify-center items-center h-64">
      <p class="text-gray-600">Loading report data...</p>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 p-4 rounded-md">
      <p class="text-red-600">{error}</p>
    </div>
  {:else}
    <div id="report-container" class="bg-white rounded-2xl shadow-xl p-6">
      <div class="text-center mb-6">
        <h2 class="text-xl font-bold text-gray-800">{title}</h2>
        {#if parameterType === 'dateRange'}
          <p class="text-gray-600">For the period {startDate ? formatDate(startDate) : ''} to {endDate ? formatDate(endDate) : ''}</p>
        {:else if parameterType === 'asOfDate'}
          <p class="text-gray-600">As of {asOfDate ? formatDate(asOfDate) : ''}</p>
        {/if}
      </div>
      
      <!-- Report content slot -->
      <slot name="report-content">
        <div class="text-center py-10">
          <p class="text-gray-600">No data available for this report.</p>
        </div>
      </slot>
    </div>
  {/if}
</div>
