<script>
  import { goto } from '$app/navigation';
  
  function goBack() {
    window.history.back();
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
  <div class="w-full max-w-md bg-white rounded-xl shadow-md overflow-hidden">
    <div class="p-8 flex flex-col items-center">
      <!-- Under Construction View -->
      <div class="mb-6 bg-amber-100 p-4 rounded-full">
        <iconify-icon icon="material-symbols:construction" width="64" height="64" class="text-amber-600"></iconify-icon>
      </div>
      <h1 class="text-2xl font-bold text-gray-800 mb-2">Under Construction</h1>
      <p class="text-gray-600 text-center mb-6">
        This feature is currently being developed and will be available soon.
      </p>
      
      <button
        on:click={goBack}
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
      >
        <iconify-icon icon="material-symbols:arrow-back" class="mr-2"></iconify-icon>
        Go Back
      </button>
    </div>
  </div>
</div>
