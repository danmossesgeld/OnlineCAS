<script lang="ts">
import { user } from '../user';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '../firebase';
import { goto } from '$app/navigation';
import { fly, slide } from 'svelte/transition';
import { quintOut } from 'svelte/easing';
import { page } from '$app/stores';
import { onMount } from 'svelte';

// Sidebar states
let collapsed = false;

// Sidebar navigation items (update routes to new structure)
const navItems = [
  // Dashboard is handled separately above the loop
  // All other sections are handled with dropdowns
];

// Track open/closed state of expandable sections
let customerCenterOpen = false;
let vendorCenterOpen = false;
let inventoryOpen = false;
let accountingOpen = false;
let masterlistOpen = false;
let otherlistOpen = false;
let reportsOpen = false;

// Check if a path is active (for highlighting current page)
function isActive(path: string): boolean {
  return $page.url.pathname.startsWith(path);
}

function handleSignOut() {
  const auth = getAuth(app);
  signOut(auth).then(() => goto('/'));
}

// Enhanced navigation handler that pre-validates Firebase paths
function handleNav(href: string) {
  goto(href);
}

// Toggle sidebar collapse on mobile
function toggleSidebar() {
  collapsed = !collapsed;
}

// Handle viewport height for mobile devices
let viewportHeight = 0;
onMount(() => {
  // Set initial viewport height
  updateViewportHeight();
  
  // Update on resize
  window.addEventListener('resize', updateViewportHeight);
  
  return () => {
    window.removeEventListener('resize', updateViewportHeight);
  };
});

function updateViewportHeight() {
  viewportHeight = window.innerHeight;
}
</script>

<style>
  /* Custom scrollbar styling */
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(203, 213, 225, 0.5) transparent;
  }
  
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(203, 213, 225, 0.5);
    border-radius: 20px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(148, 163, 184, 0.7);
  }
</style>

<!-- Mobile toggle button - visible only on small screens -->
<button
  class="fixed top-4 left-4 z-50 md:hidden bg-white p-2 rounded-lg shadow-md hover:bg-blue-50 transition-colors duration-200"
  on:click={toggleSidebar}
  aria-label="Toggle Sidebar"
>
  <iconify-icon icon="material-symbols:menu" width="24" height="24"></iconify-icon>
</button>

<aside
  class="w-64 bg-white shadow-lg flex flex-col p-0 border-r border-gray-100 fixed top-0 left-0 z-40 transform transition-transform duration-300 ease-in-out {collapsed ? '-translate-x-full' : 'translate-x-0'} md:translate-x-0 overflow-hidden"
  style="height: {viewportHeight}px;"
>
  <!-- Modern header with larger logo and premium feel -->
  <div class="flex flex-col py-6 px-4 border-b border-gray-100 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100">
    <div class="flex justify-center mb-3">
      <img src="/companylogo.png" alt="Company Logo" class="w-28 h-auto object-contain" />
    </div>
    <div class="mt-2 text-center">
      <span class="font-bold text-gray-800 text-sm block mb-1">{#if $user}{$user.displayName || 'User'}{/if}</span>
      <div class="flex items-center justify-center gap-1.5">
        <div class="w-2 h-2 bg-green-500 rounded-full"></div>
        <span class="text-xs text-gray-600 truncate max-w-full block">{#if $user}{$user.email}{/if}</span>
      </div>
    </div>
  </div>
  <!-- Navigation divider -->
  <div class="px-4 pt-2 pb-1">
    <div class="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-blue-100 to-transparent rounded-full"></div>
  </div>
  
  <!-- Navigation section with animated lists -->
  <nav class="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
    <ul class="space-y-2">
      <!-- Dashboard - simple link -->
      <li class="mb-1">
        <a
          href="/main"
          class="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/main') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
          on:click|preventDefault={() => handleNav('/main')}
        >
          <iconify-icon icon="material-symbols:dashboard" width="22" height="22" class="mr-2 {isActive('/main') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
          <span>Dashboard</span>
          {#if isActive('/main')}
            <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
          {/if}
        </a>
      </li>
      
      <!-- Customer Center as separate item below Dashboard -->
      <li class="mb-1">
        <button
          type="button"
          class="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-gray-700 group hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 {customerCenterOpen ? 'bg-blue-50 text-blue-700' : ''}"
          on:click={() => customerCenterOpen = !customerCenterOpen}
          aria-expanded={customerCenterOpen}
        >
          <iconify-icon icon="material-symbols:group" width="22" height="22" class="mr-2"></iconify-icon>
          <span>Customer Center</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="20"
            height="20"
            class="ml-auto transform transition-transform duration-200 {customerCenterOpen ? 'rotate-90' : ''}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if customerCenterOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="pl-4 mt-1 space-y-1">                  
              <!-- Sales Invoice -->
              <li>
                <a
                  href="/customerCenter/salesInvoice/list"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/customerCenter/salesInvoice') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/customerCenter/salesInvoice/list')}
                >
                  <iconify-icon icon="material-symbols:receipt-long-rounded" width="20" height="20" class="mr-2 {isActive('/customerCenter/salesInvoice') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Sales Invoice</span>
                  {#if isActive('/customerCenter/salesInvoice')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Customer Payment Receipt -->
              <li>
                <a
                  href="/customerCenter/receivePayment/list"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/customerCenter/receivePayment') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/customerCenter/receivePayment/list')}
                >
                  <iconify-icon icon="material-symbols:payments-outline" width="20" height="20" class="mr-2 {isActive('/customerCenter/receivePayment') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Receive Payment</span>
                  {#if isActive('/customerCenter/receivePayment')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Credit Memo -->
              <li>
                <a
                  href="/customerCenter/creditMemo/list"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/customerCenter/creditMemo') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/customerCenter/creditMemo/list')}
                >
                  <iconify-icon icon="material-symbols:assignment-return-outline" width="20" height="20" class="mr-2 {isActive('/customerCenter/creditMemo') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Credit Memo</span>
                  {#if isActive('/customerCenter/creditMemo')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              

            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Vendor Center with animated dropdown -->
      <li class="mb-1">
        <button
          type="button"
          class="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-gray-700 group hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 {vendorCenterOpen ? 'bg-blue-50 text-blue-700' : ''}"
          on:click={() => vendorCenterOpen = !vendorCenterOpen}
          aria-expanded={vendorCenterOpen}
        >
          <iconify-icon icon="material-symbols:store" width="22" height="22" class="mr-2"></iconify-icon>
          <span>Vendor Center</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="20"
            height="20"
            class="ml-auto transform transition-transform duration-200 {vendorCenterOpen ? 'rotate-90' : ''}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if vendorCenterOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="pl-4 mt-1 space-y-1">
              <li>
                <a
                  href="/vendorCenter/apv/list"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/vendorCenter/apv') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/vendorCenter/apv/list')}
                >
                  <iconify-icon icon="material-symbols:description-outline-rounded" width="20" height="20" class="mr-2 {isActive('/vendorCenter/apv') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>APV</span>
                  {#if isActive('/vendorCenter/apv')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Vendor Payment -->
              <li>
                <a
                  href="/vendorCenter/payment/list"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/vendorCenter/payment') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/vendorCenter/payment/list')}
                >
                  <iconify-icon icon="material-symbols:account-balance-wallet-outline" width="20" height="20" class="mr-2 {isActive('/vendorCenter/payment') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Make Payment</span>
                  {#if isActive('/vendorCenter/payment')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Receiving Report -->
              <li>
                <a
                  href="/vendorCenter/receivingReport/list"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/vendorCenter/receivingReport') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/vendorCenter/receivingReport/list')}
                >
                  <iconify-icon icon="material-symbols:inventory-2-outline" width="20" height="20" class="mr-2 {isActive('/vendorCenter/receivingReport') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Receiving Report</span>
                  {#if isActive('/vendorCenter/receivingReport')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Regular menu items with active state highlight -->
      <!-- Banking (simple item) -->
      <li class="mb-1">
        <a
          href="/banking"
          class="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/banking') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}"
          on:click|preventDefault={() => handleNav('/banking')}
        >
          <iconify-icon icon="material-symbols:account-balance" width="22" height="22" class="mr-2 {isActive('/banking') ? 'text-blue-600' : ''}"></iconify-icon>
          <span>Banking</span>
          {#if isActive('/banking')}
            <div class="ml-auto w-1.5 h-6 bg-blue-500 rounded-sm"></div>
          {/if}
        </a>
      </li>
      
      <!-- Reports section with dropdown -->
      <li class="mb-1">
        <button
          type="button"
          class="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-gray-700 group hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 {reportsOpen ? 'bg-blue-50 text-blue-700' : ''}"
          on:click={() => reportsOpen = !reportsOpen}
          aria-expanded={reportsOpen}
        >
          <iconify-icon icon="material-symbols:summarize" width="22" height="22" class="mr-2"></iconify-icon>
          <span>Reports</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="20"
            height="20"
            class="ml-auto transform transition-transform duration-200 {reportsOpen ? 'rotate-90' : ''}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown for reports -->
        {#if reportsOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="pl-4 mt-1 space-y-1">
              <!-- Financial Reports Section -->
              <li>
                <a
                  href="/accounting/reports/balanceSheet"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/reports/balanceSheet') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/balanceSheet')}
                >
                  <iconify-icon icon="material-symbols:balance" width="20" height="20" class="mr-2 {isActive('/accounting/reports/balanceSheet') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Balance Sheet</span>
                  {#if isActive('/accounting/reports/balanceSheet')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Income Statement -->
              <li>
                <a
                  href="/accounting/reports/incomeStatement"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/reports/incomeStatement') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/incomeStatement')}
                >
                  <iconify-icon icon="material-symbols:insert-chart-outline" width="20" height="20" class="mr-2 {isActive('/accounting/reports/incomeStatement') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Income Statement</span>
                  {#if isActive('/accounting/reports/incomeStatement')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Trial Balance -->
              <li>
                <a
                  href="/accounting/reports/trialBalance"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/reports/trialBalance') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/trialBalance')}
                >
                  <iconify-icon icon="material-symbols:fact-check-outline" width="20" height="20" class="mr-2 {isActive('/accounting/reports/trialBalance') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Trial Balance</span>
                  {#if isActive('/accounting/reports/trialBalance')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              
              <!-- A/R Aging -->
              <li>
                <a
                  href="/accounting/reports/arAging"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/reports/arAging') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/arAging')}
                >
                  <iconify-icon icon="material-symbols:pending-actions" width="20" height="20" class="mr-2 {isActive('/accounting/reports/arAging') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>A/R Aging</span>
                  {#if isActive('/accounting/reports/arAging')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              
              <!-- A/P Aging -->
              <li>
                <a
                  href="/accounting/reports/apAging"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/reports/apAging') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/apAging')}
                >
                  <iconify-icon icon="material-symbols:calendar-month-outline" width="20" height="20" class="mr-2 {isActive('/accounting/reports/apAging') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>A/P Aging</span>
                  {#if isActive('/accounting/reports/apAging')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Inventory with dropdown -->
      <li class="mb-1">
        <button
          type="button"
          class="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-gray-700 group hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 {inventoryOpen ? 'bg-blue-50 text-blue-700' : ''}"
          on:click={() => inventoryOpen = !inventoryOpen}
          aria-expanded={inventoryOpen}
        >
          <iconify-icon icon="material-symbols:inventory" width="22" height="22" class="mr-2"></iconify-icon>
          <span>Inventory</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="20"
            height="20"
            class="ml-auto transform transition-transform duration-200 {inventoryOpen ? 'rotate-90' : ''}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if inventoryOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="pl-4 mt-1 space-y-1">
              <li>
                <a
                  href="/inventory/adjustment/list"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/inventory/adjustment') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/inventory/adjustment/list')}
                >
                  <iconify-icon icon="material-symbols:inventory-2-outline" width="20" height="20" class="mr-2 {isActive('/inventory/adjustment') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Inventory Adjustment</span>
                  {#if isActive('/inventory/adjustment')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Accounting with dropdown -->
      <li class="mb-1">
        <button
          type="button"
          class="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-gray-700 group hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 {accountingOpen ? 'bg-blue-50 text-blue-700' : ''}"
          on:click={() => accountingOpen = !accountingOpen}
          aria-expanded={accountingOpen}
        >
          <iconify-icon icon="material-symbols:calculate" width="22" height="22" class="mr-2"></iconify-icon>
          <span>Accounting</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="20"
            height="20"
            class="ml-auto transform transition-transform duration-200 {accountingOpen ? 'rotate-90' : ''}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if accountingOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="pl-4 mt-1 space-y-1">
              <li>
                <a
                  href="/masterlist/accounts"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/masterlist/accounts') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/masterlist/accounts')}
                >
                  <iconify-icon icon="material-symbols:menu-book-outline-rounded" width="20" height="20" class="mr-2 {isActive('/masterlist/accounts') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Chart of Accounts</span>
                  {#if isActive('/masterlist/accounts')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/generalJournal/list"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/generalJournal') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/generalJournal/list')}
                >
                  <iconify-icon icon="material-symbols:note-add-outline" width="20" height="20" class="mr-2 {isActive('/accounting/generalJournal') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>General Journal</span>
                  {#if isActive('/accounting/generalJournal')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/periodClosing"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/periodClosing') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/periodClosing')}
                >
                  <iconify-icon icon="material-symbols:lock-outline" width="20" height="20" class="mr-2 {isActive('/accounting/periodClosing') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Period Closing</span>
                  {#if isActive('/accounting/periodClosing')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/taxReporting"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/taxReporting') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/taxReporting')}
                >
                  <iconify-icon icon="material-symbols:receipt-long-outline" width="20" height="20" class="mr-2 {isActive('/accounting/taxReporting') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Tax Reporting</span>
                  {#if isActive('/accounting/taxReporting')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/auditTrail"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/accounting/auditTrail') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/accounting/auditTrail')}
                >
                  <iconify-icon icon="material-symbols:history" width="20" height="20" class="mr-2 {isActive('/accounting/auditTrail') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Audit Trail</span>
                  {#if isActive('/accounting/auditTrail')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Masterlist with animation -->
      <li class="mb-1">
        <button
          type="button"
          class="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-gray-700 group hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 {masterlistOpen ? 'bg-blue-50 text-blue-700' : ''}"
          on:click={() => masterlistOpen = !masterlistOpen}
          aria-expanded={masterlistOpen}
        >
          <iconify-icon icon="material-symbols:grid-view-rounded" width="22" height="22" class="mr-2"></iconify-icon>
          <span>Masterlist</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="20"
            height="20"
            class="ml-auto transform transition-transform duration-200 {masterlistOpen ? 'rotate-90' : ''}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if masterlistOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="pl-4 mt-1 space-y-1">
              <li>
                <a
                  href="/masterlist/accounts"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/masterlist/accounts') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/masterlist/accounts')}
                >
                  <iconify-icon icon="material-symbols:menu-book-outline-rounded" width="20" height="20" class="mr-2 {isActive('/masterlist/accounts') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Chart of Accounts</span>
                  {#if isActive('/masterlist/accounts')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/masterlist/items"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/masterlist/items') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/masterlist/items')}
                >
                  <iconify-icon icon="material-symbols:inventory-2-rounded" width="20" height="20" class="mr-2 {isActive('/masterlist/items') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Items</span>
                  {#if isActive('/masterlist/items')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/masterlist/customers"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/masterlist/customers') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/masterlist/customers')}
                >
                  <iconify-icon icon="material-symbols:group-rounded" width="20" height="20" class="mr-2 {isActive('/masterlist/customers') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Customers</span>
                  {#if isActive('/masterlist/customers')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/masterlist/vendors"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/masterlist/vendors') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/masterlist/vendors')}
                >
                  <iconify-icon icon="material-symbols:store-rounded" width="20" height="20" class="mr-2 {isActive('/masterlist/vendors') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Vendors</span>
                  {#if isActive('/masterlist/vendors')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/masterlist/others"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/masterlist/others') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/masterlist/others')}
                >
                  <iconify-icon icon="material-symbols:image-rounded" width="20" height="20" class="mr-2 {isActive('/masterlist/others') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Other Name</span>
                  {#if isActive('/masterlist/others')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Other List with animation -->
      <li class="mb-1">
        <button
          type="button"
          class="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-gray-700 group hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 {otherlistOpen ? 'bg-blue-50 text-blue-700' : ''}"
          on:click={() => otherlistOpen = !otherlistOpen}
          aria-expanded={otherlistOpen}
        >
          <iconify-icon icon="material-symbols:settings-rounded" width="22" height="22" class="mr-2"></iconify-icon>
          <span>Other List</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="20"
            height="20"
            class="ml-auto transform transition-transform duration-200 {otherlistOpen ? 'rotate-90' : ''}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if otherlistOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="pl-4 mt-1 space-y-1">
              <li>
                <a
                  href="/otherlist/categories"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/otherlist/categories') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/otherlist/categories')}
                >
                  <iconify-icon icon="material-symbols:category" width="20" height="20" class="mr-2 {isActive('/otherlist/categories') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Categories</span>
                  {#if isActive('/otherlist/categories')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/units"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/otherlist/units') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/otherlist/units')}
                >
                  <iconify-icon icon="material-symbols:straighten" width="20" height="20" class="mr-2 {isActive('/otherlist/units') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Units</span>
                  {#if isActive('/otherlist/units')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/locations"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/otherlist/locations') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/otherlist/locations')}
                >
                  <iconify-icon icon="material-symbols:location-on" width="20" height="20" class="mr-2 {isActive('/otherlist/locations') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Locations</span>
                  {#if isActive('/otherlist/locations')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/discounts"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/otherlist/discounts') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/otherlist/discounts')}
                >
                  <iconify-icon icon="material-symbols:percent" width="20" height="20" class="mr-2 {isActive('/otherlist/discounts') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Discounts</span>
                  {#if isActive('/otherlist/discounts')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/paymentmethods"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/otherlist/paymentmethods') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/otherlist/paymentmethods')}
                >
                  <iconify-icon icon="material-symbols:payments" width="20" height="20" class="mr-2 {isActive('/otherlist/paymentmethods') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Payment Methods</span>
                  {#if isActive('/otherlist/paymentmethods')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/terms"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/otherlist/terms') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/otherlist/terms')}
                >
                  <iconify-icon icon="material-symbols:calendar-month" width="20" height="20" class="mr-2 {isActive('/otherlist/terms') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Terms</span>
                  {#if isActive('/otherlist/terms')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/tax"
                  class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/otherlist/tax') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                  on:click|preventDefault={() => handleNav('/otherlist/tax')}
                >
                  <iconify-icon icon="material-symbols:percent" width="20" height="20" class="mr-2 {isActive('/otherlist/tax') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
                  <span>Tax</span>
                  {#if isActive('/otherlist/tax')}
                    <div class="ml-auto w-1 h-5 bg-blue-500 rounded-sm"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
    </ul>
  </nav>
  
  <!-- User controls with sign out and profile options -->
  <div class="mt-auto">
    <div class="px-3 pt-3 pb-2">
      <div class="flex items-center justify-between bg-blue-50 px-3 py-2 rounded-lg mb-2">
        <div class="flex items-center">
          <div class="bg-blue-100 rounded-full p-1.5 mr-2">
            <iconify-icon icon="material-symbols:support-agent" width="16" height="16" class="text-blue-600"></iconify-icon>
          </div>
          <span class="text-xs font-medium text-blue-800">Need help?</span>
        </div>
        <button class="text-xs text-blue-600 hover:text-blue-800 font-medium">Support</button>
      </div>
    </div>
    <div class="px-3 py-3 border-t border-gray-100 bg-gray-50">
      <button
        class="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-white border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all duration-200 shadow-sm"
        on:click={handleSignOut}
      >
        <div class="flex items-center">
          <iconify-icon icon="material-symbols:logout" width="18" height="18" class="mr-2 text-gray-500"></iconify-icon>
          <span>Sign Out</span>
        </div>
        <iconify-icon icon="material-symbols:arrow-right-alt" width="16" height="16"></iconify-icon>
      </button>
    </div>
  </div>
</aside>