<script lang="ts">
import { user } from '../user';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '../firebase';
import { goto } from '$app/navigation';
import { fly, slide } from 'svelte/transition';
import { quintOut } from 'svelte/easing';
import { page } from '$app/stores';

// Sidebar states
let collapsed = false;

// Sidebar navigation items (update routes to new structure)
const navItems = [
  { label: 'Dashboard', icon: 'material-symbols:dashboard', href: '/main' },
  { label: 'Vendor Center', icon: 'material-symbols:store', href: '/vendorCenter' },
  { label: 'Banking', icon: 'material-symbols:account-balance', href: '/banking' },
  { label: 'Accounting', icon: 'material-symbols:calculate', href: '/accounting' },
  { label: 'Inventory', icon: 'material-symbols:inventory', href: '/inventory' }
  // Removed Masterlist and Other List from here
];

// Track open/closed state of expandable sections
let customerCenterOpen = false;
let masterlistOpen = false;
let otherlistOpen = false;

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
</script>

<!-- Mobile toggle button - visible only on small screens -->
<button
  class="fixed top-4 left-4 z-50 md:hidden bg-white p-2 rounded-lg shadow-md hover:bg-blue-50 transition-colors duration-200"
  on:click={toggleSidebar}
  aria-label="Toggle Sidebar"
>
  <iconify-icon icon="material-symbols:menu" width="24" height="24"></iconify-icon>
</button>

<aside
  class="w-64 min-h-screen bg-white shadow-lg flex flex-col p-0 border-r border-gray-100 fixed top-0 left-0 z-40 transform transition-transform duration-300 ease-in-out {collapsed ? '-translate-x-full' : 'translate-x-0'} md:translate-x-0"
>
  <!-- Header with logo and user info -->
  <div class="flex flex-col items-center py-6 px-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
    <div class="relative">
      <img src="/companylogo.png" alt="Company Logo" class="w-16 h-16 rounded-full shadow-md border-2 border-white" />
      <div class="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-white"></div>
    </div>
    <div class="mt-3 text-center">
      <span class="font-bold text-gray-800 text-sm block">{#if $user}{$user.displayName || 'User'}{/if}</span>
      <span class="text-xs text-gray-500 truncate max-w-full block">{#if $user}{$user.email}{/if}</span>
    </div>
  </div>
  <!-- Navigation section with animated lists -->
  <nav class="flex-1 overflow-y-auto px-3 py-4">
    <ul class="space-y-2">
      <!-- Main navigation items -->
      {#each navItems as item, i}
        {#if i === 1}
          <!-- Customer Center with animated dropdown -->
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
                  <li>
                    <a
                      href="/customerCenter/receivePayment"
                      class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 {isActive('/customerCenter/receivePayment') ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700 group'}"
                      on:click|preventDefault={() => handleNav('/customerCenter/receivePayment')}
                    >
                      <iconify-icon icon="material-symbols:payments-rounded" width="20" height="20" class="mr-2 text-gray-400 group-hover:text-blue-600"></iconify-icon>
                      <span>Receive Payment</span>
                    </a>
                  </li>
                </ul>
              </div>
            {/if}
          </li>
        {/if}
        
        <!-- Regular menu items with active state highlight -->
        <li class="mb-1">
          <a
            href={item.href}
            class="flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 {isActive(item.href) ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'}"
            on:click|preventDefault={() => handleNav(item.href)}
          >
            <iconify-icon icon={item.icon} width="22" height="22" class="mr-2 {isActive(item.href) ? 'text-blue-600' : ''}"></iconify-icon>
            <span>{item.label}</span>
            {#if isActive(item.href)}
              <div class="ml-auto w-1.5 h-6 bg-blue-500 rounded-sm"></div>
            {/if}
          </a>
        </li>
      {/each}
      
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
                  <iconify-icon icon="material-symbols:local-offer-rounded" width="20" height="20" class="mr-2 {isActive('/otherlist/categories') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
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
                  <iconify-icon icon="material-symbols:straighten-rounded" width="20" height="20" class="mr-2 {isActive('/otherlist/units') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
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
                  <iconify-icon icon="material-symbols:location-on-rounded" width="20" height="20" class="mr-2 {isActive('/otherlist/locations') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
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
                  <iconify-icon icon="material-symbols:discount-rounded" width="20" height="20" class="mr-2 {isActive('/otherlist/discounts') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
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
                  <iconify-icon icon="material-symbols:credit-card-rounded" width="20" height="20" class="mr-2 {isActive('/otherlist/paymentmethods') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
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
                  <iconify-icon icon="material-symbols:event-note-rounded" width="20" height="20" class="mr-2 {isActive('/otherlist/terms') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
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
                  <iconify-icon icon="material-symbols:percent-rounded" width="20" height="20" class="mr-2 {isActive('/otherlist/tax') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}"></iconify-icon>
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
  
  <!-- Sign out button -->
  <div class="px-3 py-4 mt-auto border-t border-gray-100">
    <button
      class="flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 transition-colors duration-200"
      on:click={handleSignOut}
    >
      <iconify-icon icon="material-symbols:logout" width="22" height="22" class="mr-2"></iconify-icon>
      <span>Sign Out</span>
    </button>
  </div>
</aside>