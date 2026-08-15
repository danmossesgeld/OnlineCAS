<script lang="ts">
import { user } from '../user';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '../firebase';
import { goto } from '$app/navigation';
import { fly, slide } from 'svelte/transition';
import { quintOut } from 'svelte/easing';
import { page } from '$app/stores';
import { onMount } from 'svelte';
import ThemeToggle from './ThemeToggle.svelte';
import { isAdmin } from '../stores/userProfile';

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
let adminToolsOpen = false;

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
  /* Enhanced scrollbar styling */
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: var(--color-neutral-300) transparent;
  }
  
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--color-neutral-300);
    border-radius: var(--radius-lg);
    transition: background var(--transition-normal);
  }
  
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--color-neutral-400);
  }

  /* Modern navigation styles */
  .nav-item {
    position: relative;
    transition: all var(--transition-normal);
  }

  /* Force a visible hover state even when inline styles are present */
  .nav-item:hover,
  .nav-dropdown a:hover,
  .nav-dropdown button:hover {
    background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)) !important;
    color: var(--color-primary-700) !important;
    box-shadow: var(--shadow-sm);
  }

  .nav-item:hover iconify-icon,
  .nav-dropdown a:hover iconify-icon,
  .nav-dropdown button:hover iconify-icon {
    color: var(--color-primary-600) !important;
  }

  .nav-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 0;
    background: linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600));
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    transition: height var(--transition-normal);
  }

  .nav-item.active::before {
    height: 70%;
  }

  .nav-dropdown {
    background: linear-gradient(135deg, var(--color-neutral-0), var(--color-neutral-50));
    border-radius: var(--radius-lg);
    margin: var(--space-1) 0;
    overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
  }
</style>

<!-- Modern mobile toggle button -->
<button
  class="fixed top-4 left-4 z-50 md:hidden glass-effect p-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 group"
  on:click={toggleSidebar}
  aria-label="Toggle Sidebar"
  style="backdrop-filter: blur(10px);"
>
  <iconify-icon
    icon="material-symbols:menu"
    width="20"
    height="20"
    class="transition-colors duration-200"
    style="color: var(--color-neutral-700);"
  ></iconify-icon>
</button>

<aside
  class="w-64 glass-effect flex flex-col p-0 fixed top-0 left-0 z-40 transform transition-all duration-300 ease-in-out {collapsed ? '-translate-x-full' : 'translate-x-0'} md:translate-x-0 overflow-hidden"
  style="height: {viewportHeight}px; border-right: 1px solid var(--color-neutral-200);"
>
  <!-- Compact header: logo + user + theme toggle, single row -->
  <div class="flex items-center gap-2.5 px-4 py-3" style="border-bottom: 1px solid var(--color-neutral-200);">
    <img src="/companylogo.png" alt="Company Logo" class="w-8 h-8 rounded-md object-contain shrink-0" />
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium truncate" style="color: var(--color-neutral-800);">
        {#if $user}{$user.displayName || $user.email?.split('@')[0] || 'User'}{/if}
      </p>
      <p class="text-xs truncate" style="color: var(--color-neutral-500);">
        {#if $user}{$user.email}{/if}
      </p>
    </div>
  </div>

  <!-- Navigation section with modern styling -->
  <nav class="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
    <ul style="padding: var(--space-2) 0;">
      <!-- Dashboard - enhanced styling -->
      <li class="nav-item {isActive('/main') ? 'active' : ''}" style="margin-bottom: var(--space-1);">
        <a
          href="/main/dashboard"
          class="flex items-center transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); {isActive('/main') ? 'background: linear-gradient(135deg, var(--color-primary-100), var(--color-primary-50)); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
          on:click|preventDefault={() => handleNav('/main/dashboard')}
        >
          <iconify-icon 
            icon="material-symbols:dashboard" 
            width="20" 
            height="20" 
            class="mr-3 transition-colors duration-200"
            style="color: {isActive('/main') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
          <span style="font-weight: var(--font-medium); font-size: var(--text-sm);">Dashboard</span>
          {#if isActive('/main')}
            <iconify-icon 
              icon="material-symbols:chevron-right" 
              width="16" 
              height="16" 
              class="ml-auto"
              style="color: var(--color-primary-600);"
            ></iconify-icon>
          {/if}
        </a>
      </li>

      <!-- Masterlist with animation -->
      <li style="margin-bottom: var(--space-1);">
        <button
          type="button"
          class="nav-item flex items-center w-full transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); font-size: var(--text-sm); font-weight: var(--font-medium); {masterlistOpen ? 'background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)); color: var(--color-primary-700); box-shadow: var(--shadow-sm);' : 'color: var(--color-neutral-700);'}"
          on:click={() => masterlistOpen = !masterlistOpen}
          aria-expanded={masterlistOpen}
        >
          <iconify-icon
            icon="material-symbols:grid-view-rounded"
            width="20"
            height="20"
            class="mr-3 transition-colors duration-200"
            style="color: {masterlistOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-500)'}"
          ></iconify-icon>
          <span>Masterlist</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="18"
            height="18"
            class="ml-auto transform transition-transform duration-200 {masterlistOpen ? 'rotate-90' : ''}"
            style="color: {masterlistOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
        </button>

        <!-- Animated dropdown content -->
        {#if masterlistOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="nav-dropdown" style="padding-left: var(--space-4); margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1);">
              <li>
                <a
                  href="/masterlist/accounts"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/masterlist/accounts') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/masterlist/accounts')}
                >
                  <iconify-icon
                    icon="material-symbols:menu-book-outline-rounded"
                    width="16"
                    height="16"
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/masterlist/accounts') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Chart of Accounts</span>
                  {#if isActive('/masterlist/accounts')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/masterlist/items"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/masterlist/items') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/masterlist/items')}
                >
                  <iconify-icon
                    icon="material-symbols:inventory-2-rounded"
                    width="16"
                    height="16"
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/masterlist/items') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Items</span>
                  {#if isActive('/masterlist/items')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/masterlist/customers"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/masterlist/customers') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/masterlist/customers')}
                >
                  <iconify-icon
                    icon="material-symbols:group-rounded"
                    width="16"
                    height="16"
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/masterlist/customers') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Customers</span>
                  {#if isActive('/masterlist/customers')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/masterlist/vendors"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/masterlist/vendors') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/masterlist/vendors')}
                >
                  <iconify-icon
                    icon="material-symbols:store-rounded"
                    width="16"
                    height="16"
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/masterlist/vendors') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Vendors</span>
                  {#if isActive('/masterlist/vendors')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/masterlist/others"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/masterlist/others') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/masterlist/others')}
                >
                  <iconify-icon
                    icon="material-symbols:image-rounded"
                    width="16"
                    height="16"
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/masterlist/others') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Other Name</span>
                  {#if isActive('/masterlist/others')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>

      <!-- Customer Center with modern dropdown styling -->
      <li class="nav-item" style="margin-bottom: var(--space-1);">
        <button
          type="button"
          class="flex items-center w-full transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); {customerCenterOpen ? 'background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
          on:click={() => customerCenterOpen = !customerCenterOpen}
          aria-expanded={customerCenterOpen}
        >
          <iconify-icon 
            icon="material-symbols:group" 
            width="20" 
            height="20" 
            class="mr-3 transition-colors duration-200"
            style="color: {customerCenterOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
          <span style="font-weight: var(--font-medium); font-size: var(--text-sm);">Customer Center</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="16"
            height="16"
            class="ml-auto transform transition-transform duration-200 {customerCenterOpen ? 'rotate-90' : ''}"
            style="color: {customerCenterOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
        </button>
        
        <!-- Modern dropdown content -->
        {#if customerCenterOpen}
          <div class="nav-dropdown" transition:slide={{duration: 200, easing: quintOut}} style="margin-top: var(--space-2);">
            <ul style="padding: var(--space-2);">
                  
              <!-- Sales Invoice -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/customerCenter/salesInvoice/list"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/customerCenter/salesInvoice') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/customerCenter/salesInvoice/list')}
                >
                  <iconify-icon 
                    icon="material-symbols:receipt-long-rounded" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/customerCenter/salesInvoice') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Sales Invoice</span>
                  {#if isActive('/customerCenter/salesInvoice')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Customer Payment Receipt -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/customerCenter/receivePayment/list"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/customerCenter/receivePayment') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/customerCenter/receivePayment/list')}
                >
                  <iconify-icon 
                    icon="material-symbols:payments-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/customerCenter/receivePayment') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Receive Payment</span>
                  {#if isActive('/customerCenter/receivePayment')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Credit Memo -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/customerCenter/creditMemo/list"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/customerCenter/creditMemo') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/customerCenter/creditMemo/list')}
                >
                  <iconify-icon 
                    icon="material-symbols:assignment-return-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/customerCenter/creditMemo') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Credit Memo</span>
                  {#if isActive('/customerCenter/creditMemo')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              

            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Vendor Center with modern dropdown styling -->
      <li class="nav-item" style="margin-bottom: var(--space-1);">
        <button
          type="button"
          class="flex items-center w-full transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); {vendorCenterOpen ? 'background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
          on:click={() => vendorCenterOpen = !vendorCenterOpen}
          aria-expanded={vendorCenterOpen}
        >
          <iconify-icon 
            icon="material-symbols:store" 
            width="20" 
            height="20" 
            class="mr-3 transition-colors duration-200"
            style="color: {vendorCenterOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
          <span style="font-weight: var(--font-medium); font-size: var(--text-sm);">Vendor Center</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="16"
            height="16"
            class="ml-auto transform transition-transform duration-200 {vendorCenterOpen ? 'rotate-90' : ''}"
            style="color: {vendorCenterOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
        </button>
        
        <!-- Modern dropdown content -->
        {#if vendorCenterOpen}
          <div class="nav-dropdown" transition:slide={{duration: 200, easing: quintOut}} style="margin-top: var(--space-2);">
            <ul style="padding: var(--space-2);">
              <!-- APV -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/vendorCenter/apv/list"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/vendorCenter/apv') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/vendorCenter/apv/list')}
                >
                  <iconify-icon 
                    icon="material-symbols:description-outline-rounded" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/vendorCenter/apv') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">APV</span>
                  {#if isActive('/vendorCenter/apv')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Vendor Payment -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/vendorCenter/payment/list"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/vendorCenter/payment') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/vendorCenter/payment/list')}
                >
                  <iconify-icon 
                    icon="material-symbols:account-balance-wallet-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/vendorCenter/payment') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Make Payment</span>
                  {#if isActive('/vendorCenter/payment')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Receiving Report -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/vendorCenter/receivingReport/list"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/vendorCenter/receivingReport') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/vendorCenter/receivingReport/list')}
                >
                  <iconify-icon 
                    icon="material-symbols:inventory-2-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/vendorCenter/receivingReport') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Receiving Report</span>
                  {#if isActive('/vendorCenter/receivingReport')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Banking (simple item) -->
      <li class="nav-item" style="margin-bottom: var(--space-1);">
        <a
          href="/banking"
          class="flex items-center transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); {isActive('/banking') ? 'background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
          on:click|preventDefault={() => handleNav('/banking')}
        >
          <iconify-icon 
            icon="material-symbols:account-balance" 
            width="20" 
            height="20" 
            class="mr-3 transition-colors duration-200"
            style="color: {isActive('/banking') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
          <span style="font-weight: var(--font-medium); font-size: var(--text-sm);">Banking</span>
          {#if isActive('/banking')}
            <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
          {/if}
        </a>
      </li>
      
      <!-- Reports section with modern dropdown styling -->
      <li class="nav-item" style="margin-bottom: var(--space-1);">
        <button
          type="button"
          class="flex items-center w-full transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); {reportsOpen ? 'background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
          on:click={() => reportsOpen = !reportsOpen}
          aria-expanded={reportsOpen}
        >
          <iconify-icon 
            icon="material-symbols:summarize" 
            width="20" 
            height="20" 
            class="mr-3 transition-colors duration-200"
            style="color: {reportsOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
          <span style="font-weight: var(--font-medium); font-size: var(--text-sm);">Reports</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="16"
            height="16"
            class="ml-auto transform transition-transform duration-200 {reportsOpen ? 'rotate-90' : ''}"
            style="color: {reportsOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
        </button>
        
        <!-- Modern dropdown for reports -->
        {#if reportsOpen}
          <div class="nav-dropdown" transition:slide={{duration: 200, easing: quintOut}} style="margin-top: var(--space-2);">
            <ul style="padding: var(--space-2);">
              <!-- Balance Sheet -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/accounting/reports/balanceSheet"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/reports/balanceSheet') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/balanceSheet')}
                >
                  <iconify-icon 
                    icon="material-symbols:balance" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/reports/balanceSheet') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Balance Sheet</span>
                  {#if isActive('/accounting/reports/balanceSheet')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Income Statement -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/accounting/reports/incomeStatement"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/reports/incomeStatement') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/incomeStatement')}
                >
                  <iconify-icon 
                    icon="material-symbols:insert-chart-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/reports/incomeStatement') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Income Statement</span>
                  {#if isActive('/accounting/reports/incomeStatement')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              
              <!-- Trial Balance -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/accounting/reports/trialBalance"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/reports/trialBalance') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/trialBalance')}
                >
                  <iconify-icon 
                    icon="material-symbols:fact-check-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/reports/trialBalance') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Trial Balance</span>
                  {#if isActive('/accounting/reports/trialBalance')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              
              <!-- A/R Aging -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/accounting/reports/arAging"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/reports/arAging') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/arAging')}
                >
                  <iconify-icon 
                    icon="material-symbols:pending-actions" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/reports/arAging') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">A/R Aging</span>
                  {#if isActive('/accounting/reports/arAging')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              
              <!-- A/P Aging -->
              <li style="margin-bottom: var(--space-1);">
                <a
                  href="/accounting/reports/apAging"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/reports/apAging') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/reports/apAging')}
                >
                  <iconify-icon 
                    icon="material-symbols:calendar-month-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/reports/apAging') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">A/P Aging</span>
                  {#if isActive('/accounting/reports/apAging')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Inventory with dropdown -->
      <li style="margin-bottom: var(--space-1);">
        <button
          type="button"
          class="nav-item flex items-center w-full transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); font-size: var(--text-sm); font-weight: var(--font-medium); {inventoryOpen ? 'background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)); color: var(--color-primary-700); box-shadow: var(--shadow-sm);' : 'color: var(--color-neutral-700);'}"
          on:click={() => inventoryOpen = !inventoryOpen}
          aria-expanded={inventoryOpen}
        >
          <iconify-icon 
            icon="material-symbols:inventory" 
            width="20" 
            height="20" 
            class="mr-3 transition-colors duration-200"
            style="color: {inventoryOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-500)'}"
          ></iconify-icon>
          <span>Inventory</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="18"
            height="18"
            class="ml-auto transform transition-transform duration-200 {inventoryOpen ? 'rotate-90' : ''}"
            style="color: {inventoryOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if inventoryOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="nav-dropdown" style="padding-left: var(--space-4); margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1);">
              <li>
                <a
                  href="/inventory/adjustment/list"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/inventory/adjustment') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/inventory/adjustment/list')}
                >
                  <iconify-icon 
                    icon="material-symbols:inventory-2-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/inventory/adjustment') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Inventory Adjustment</span>
                  {#if isActive('/inventory/adjustment')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Accounting with dropdown -->
      <li style="margin-bottom: var(--space-1);">
        <button
          type="button"
          class="nav-item flex items-center w-full transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); font-size: var(--text-sm); font-weight: var(--font-medium); {accountingOpen ? 'background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)); color: var(--color-primary-700); box-shadow: var(--shadow-sm);' : 'color: var(--color-neutral-700);'}"
          on:click={() => accountingOpen = !accountingOpen}
          aria-expanded={accountingOpen}
        >
          <iconify-icon 
            icon="material-symbols:calculate" 
            width="20" 
            height="20" 
            class="mr-3 transition-colors duration-200"
            style="color: {accountingOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-500)'}"
          ></iconify-icon>
          <span>Accounting</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="18"
            height="18"
            class="ml-auto transform transition-transform duration-200 {accountingOpen ? 'rotate-90' : ''}"
            style="color: {accountingOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if accountingOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="nav-dropdown" style="padding-left: var(--space-4); margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1);">
              <li>
                <a
                  href="/masterlist/accounts"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/masterlist/accounts') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/masterlist/accounts')}
                >
                  <iconify-icon 
                    icon="material-symbols:menu-book-outline-rounded" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/masterlist/accounts') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Chart of Accounts</span>
                  {#if isActive('/masterlist/accounts')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/generalJournal/list"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/generalJournal') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/generalJournal/list')}
                >
                  <iconify-icon 
                    icon="material-symbols:note-add-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/generalJournal') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">General Journal</span>
                  {#if isActive('/accounting/generalJournal')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/periodClosing"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/periodClosing') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/periodClosing')}
                >
                  <iconify-icon 
                    icon="material-symbols:lock-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/periodClosing') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Period Closing</span>
                  {#if isActive('/accounting/periodClosing')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/taxReporting"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/taxReporting') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/taxReporting')}
                >
                  <iconify-icon 
                    icon="material-symbols:receipt-long-outline" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/taxReporting') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Tax Reporting</span>
                  {#if isActive('/accounting/taxReporting')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/auditTrail"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/auditTrail') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/auditTrail')}
                >
                  <iconify-icon 
                    icon="material-symbols:receipt-long" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/auditTrail') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Transaction Journal</span>
                  {#if isActive('/accounting/auditTrail')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/accounting/auditor"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/accounting/auditor') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/accounting/auditor')}
                >
                  <iconify-icon 
                    icon="material-symbols:security" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/accounting/auditor') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Data Auditor</span>
                  {#if isActive('/accounting/auditor')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>
      
      <!-- Other List with animation -->
      <li style="margin-bottom: var(--space-1);">
        <button
          type="button"
          class="nav-item flex items-center w-full transition-all duration-200 group"
          style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); font-size: var(--text-sm); font-weight: var(--font-medium); {otherlistOpen ? 'background: linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100)); color: var(--color-primary-700); box-shadow: var(--shadow-sm);' : 'color: var(--color-neutral-700);'}"
          on:click={() => otherlistOpen = !otherlistOpen}
          aria-expanded={otherlistOpen}
        >
          <iconify-icon 
            icon="material-symbols:settings-rounded" 
            width="20" 
            height="20" 
            class="mr-3 transition-colors duration-200"
            style="color: {otherlistOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-500)'}"
          ></iconify-icon>
          <span>Other List</span>
          <iconify-icon
            icon="material-symbols:chevron-right"
            width="18"
            height="18"
            class="ml-auto transform transition-transform duration-200 {otherlistOpen ? 'rotate-90' : ''}"
            style="color: {otherlistOpen ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
          ></iconify-icon>
        </button>
        
        <!-- Animated dropdown content -->
        {#if otherlistOpen}
          <div transition:slide={{duration: 200, easing: quintOut}}>
            <ul class="nav-dropdown" style="padding-left: var(--space-4); margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1);">
              <li>
                <a
                  href="/otherlist/categories"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/otherlist/categories') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/otherlist/categories')}
                >
                  <iconify-icon 
                    icon="material-symbols:category" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/otherlist/categories') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Categories</span>
                  {#if isActive('/otherlist/categories')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/units"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/otherlist/units') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/otherlist/units')}
                >
                  <iconify-icon 
                    icon="material-symbols:straighten" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/otherlist/units') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Units</span>
                  {#if isActive('/otherlist/units')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/locations"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/otherlist/locations') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/otherlist/locations')}
                >
                  <iconify-icon 
                    icon="material-symbols:location-on" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/otherlist/locations') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Locations</span>
                  {#if isActive('/otherlist/locations')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/discounts"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/otherlist/discounts') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/otherlist/discounts')}
                >
                  <iconify-icon 
                    icon="material-symbols:percent" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/otherlist/discounts') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Discounts</span>
                  {#if isActive('/otherlist/discounts')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/paymentmethods"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/otherlist/paymentmethods') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/otherlist/paymentmethods')}
                >
                  <iconify-icon 
                    icon="material-symbols:payments" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/otherlist/paymentmethods') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Payment Methods</span>
                  {#if isActive('/otherlist/paymentmethods')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/terms"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/otherlist/terms') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/otherlist/terms')}
                >
                  <iconify-icon 
                    icon="material-symbols:calendar-month" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/otherlist/terms') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Terms</span>
                  {#if isActive('/otherlist/terms')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/tax"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/otherlist/tax') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/otherlist/tax')}
                >
                  <iconify-icon 
                    icon="material-symbols:percent" 
                    width="16" 
                    height="16" 
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/otherlist/tax') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Tax</span>
                  {#if isActive('/otherlist/tax')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
              <li>
                <a
                  href="/otherlist/costcenters"
                  class="flex items-center transition-all duration-200 group"
                  style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/otherlist/costcenters') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                  on:click|preventDefault={() => handleNav('/otherlist/costcenters')}
                >
                  <iconify-icon
                    icon="material-symbols:account-tree"
                    width="16"
                    height="16"
                    class="mr-2 transition-colors duration-200"
                    style="color: {isActive('/otherlist/costcenters') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                  ></iconify-icon>
                  <span style="font-weight: var(--font-medium);">Cost Centers</span>
                  {#if isActive('/otherlist/costcenters')}
                    <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                  {/if}
                </a>
              </li>
            </ul>
          </div>
        {/if}
      </li>

      {#if $isAdmin}
        <li>
          <button
            type="button"
            class="nav-item flex items-center w-full transition-all duration-200 group"
            style="padding: var(--space-2) var(--space-4); border-radius: var(--radius-lg); font-size: var(--text-sm); font-weight: var(--font-medium); {adminToolsOpen ? 'background: linear-gradient(135deg, var(--color-error-50), var(--color-error-100)); color: var(--color-error-700); box-shadow: var(--shadow-sm);' : 'color: var(--color-neutral-700);'}"
            on:click={() => adminToolsOpen = !adminToolsOpen}
            aria-expanded={adminToolsOpen}
          >
            <iconify-icon
              icon="material-symbols:shield-person"
              width="20"
              height="20"
              class="mr-3 transition-colors duration-200"
              style="color: {adminToolsOpen ? 'var(--color-error-600)' : 'var(--color-neutral-500)'}"
            ></iconify-icon>
            <span>Admin Tools</span>
            <iconify-icon
              icon="material-symbols:chevron-right-rounded"
              width="18"
              height="18"
              class="ml-auto transform transition-transform duration-200 {adminToolsOpen ? 'rotate-90' : ''}"
              style="color: {adminToolsOpen ? 'var(--color-error-600)' : 'var(--color-neutral-400)'}"
            ></iconify-icon>
          </button>

          {#if adminToolsOpen}
            <div transition:slide={{duration: 200, easing: quintOut}}>
              <ul class="nav-dropdown" style="padding-left: var(--space-4); margin-top: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1);">
                <li>
                  <a
                    href="/admin/users"
                    class="flex items-center transition-all duration-200 group"
                    style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/admin/users') ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'color: var(--color-neutral-600);'}"
                    on:click|preventDefault={() => handleNav('/admin/users')}
                  >
                    <iconify-icon
                      icon="material-symbols:manage-accounts"
                      width="16"
                      height="16"
                      class="mr-2 transition-colors duration-200"
                      style="color: {isActive('/admin/users') ? 'var(--color-primary-600)' : 'var(--color-neutral-400)'}"
                    ></iconify-icon>
                    <span style="font-weight: var(--font-medium);">User Management</span>
                    {#if isActive('/admin/users')}
                      <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-primary-500);"></div>
                    {/if}
                  </a>
                </li>
                <li>
                  <a
                    href="/admin/resetTransactions"
                    class="flex items-center transition-all duration-200 group"
                    style="padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); {isActive('/admin/resetTransactions') ? 'background: var(--color-error-100); color: var(--color-error-700);' : 'color: var(--color-neutral-600);'}"
                    on:click|preventDefault={() => handleNav('/admin/resetTransactions')}
                  >
                    <iconify-icon
                      icon="material-symbols:warning"
                      width="16"
                      height="16"
                      class="mr-2 transition-colors duration-200"
                      style="color: {isActive('/admin/resetTransactions') ? 'var(--color-error-600)' : 'var(--color-neutral-400)'}"
                    ></iconify-icon>
                    <span style="font-weight: var(--font-medium);">Reset Transactions</span>
                    {#if isActive('/admin/resetTransactions')}
                      <div class="ml-auto w-1.5 h-1.5 rounded-full" style="background: var(--color-error-500);"></div>
                    {/if}
                  </a>
                </li>
              </ul>
            </div>
          {/if}
        </li>
      {/if}
    </ul>
  </nav>
  
  <!-- User controls: theme toggle + sign out -->
  <div class="mt-auto">
    <div class="px-3 py-3 flex flex-col gap-2" style="border-top: 1px solid var(--color-neutral-200);">
      <div class="flex justify-center">
        <ThemeToggle />
      </div>
      <button
        class="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors"
        style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); color: var(--color-neutral-700);"
        on:click={handleSignOut}
      >
        <div class="flex items-center">
          <iconify-icon icon="material-symbols:logout" width="18" height="18" class="mr-2" style="color: var(--color-neutral-400);"></iconify-icon>
          <span>Sign Out</span>
        </div>
        <iconify-icon icon="material-symbols:arrow-right-alt" width="16" height="16"></iconify-icon>
      </button>
    </div>
  </div>
</aside>