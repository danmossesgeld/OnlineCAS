<script lang="ts">
import { user } from '../user';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '../firebase';
import { goto } from '$app/navigation';

// Sidebar navigation items (update routes to new structure)
const navItems = [
  { label: 'Dashboard', icon: 'material-symbols:dashboard', href: '/main' },
  { label: 'Vendor Center', icon: 'material-symbols:store', href: '/vendorCenter' },
  { label: 'Banking', icon: 'material-symbols:account-balance', href: '/banking' },
  { label: 'Accounting', icon: 'material-symbols:calculate', href: '/accounting' },
  { label: 'Inventory', icon: 'material-symbols:inventory', href: '/inventory' }
  // Removed Masterlist and Other List from here
];

let masterlistOpen = false;
let otherlistOpen = false;

function handleSignOut() {
  const auth = getAuth(app);
  signOut(auth).then(() => goto('/'));
}

function handleNav(href: string) {
  goto(href);
}
</script>

<aside class="w-full md:w-64 min-h-0 md:min-h-screen bg-white shadow flex flex-row md:flex-col p-2 md:p-4 justify-between border-b md:border-b-0 md:border-r border-gray-100 fixed md:static z-30 top-0 left-0 md:relative">
  <div class="flex-1 flex flex-row md:flex-col items-center md:items-stretch">
    <div class="flex flex-col items-center mb-4 md:mb-8 w-16 md:w-auto">
      <img src="/companylogo.png" alt="Company Logo" class="w-12 h-12 md:w-16 md:h-16 mb-2 rounded-full shadow" />
      <span class="font-bold truncate max-w-full text-center text-gray-800 text-sm md:text-lg">{#if $user}{$user.displayName || $user.email}{/if}</span>
    </div>
    <input type="text" placeholder="Search" class="input input-bordered w-32 md:w-full mb-2 md:mb-4" />
    <nav class="flex-1">
      <ul class="menu menu-horizontal md:menu-vertical w-full">
        {#each navItems as item, i}
          {#if i === 1}
            <!-- Collapsible Customer Center (inserted before Vendor Center) -->
            <li>
              <details class="w-full">
                <summary class="flex items-center gap-2 cursor-pointer px-2 py-2 rounded-lg hover:bg-gray-100 transition">
                  <iconify-icon icon="material-symbols:group" width="24" height="24" />
                  <span class="hidden md:inline">Customer Center</span>
                </summary>
                <ul class="ml-6 mt-1 flex flex-col gap-1">
                  <li>
                    <button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/customerCenter/salesInvoice/list')}>
                      <iconify-icon icon="material-symbols:receipt-long-rounded" width="22" height="22" />
                      <span class="hidden md:inline">Sales Invoice</span>
                    </button>
                  </li>
                  <li>
                    <button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/customerCenter/receivePayment')}>
                      <iconify-icon icon="material-symbols:payments-rounded" width="22" height="22" />
                      <span class="hidden md:inline">Receive Payment</span>
                    </button>
                  </li>
                  <!-- Add more subpages as needed -->
                </ul>
              </details>
            </li>
          {/if}
          <li>
            <button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav(item.href)}>
              <iconify-icon icon={item.icon} width="24" height="24"></iconify-icon>
              <span class="hidden md:inline">{item.label}</span>
            </button>
          </li>
        {/each}
        <!-- Collapsible Masterlist -->
        <li>
          <details bind:open={masterlistOpen} class="w-full">
            <summary class="flex items-center gap-2 cursor-pointer px-2 py-2 rounded-lg hover:bg-gray-100 transition">
              <iconify-icon icon="material-symbols:grid-view-rounded" width="24" height="24" />
              <span class="hidden md:inline">Masterlist</span>
            </summary>
            <ul class="ml-6 mt-1 flex flex-col gap-1">
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/masterlist/items')}><iconify-icon icon="material-symbols:category-rounded" width="22" height="22" /> <span class="hidden md:inline">Item Management</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/masterlist/customers')}><iconify-icon icon="material-symbols:person-rounded" width="22" height="22" /> <span class="hidden md:inline">Customer</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/masterlist/vendors')}><iconify-icon icon="material-symbols:local-shipping-rounded" width="22" height="22" /> <span class="hidden md:inline">Vendor</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/masterlist/others')}><iconify-icon icon="material-symbols:image-rounded" width="22" height="22" /> <span class="hidden md:inline">Other Name</span></button></li>
            </ul>
          </details>
        </li>
        <!-- Collapsible Other List -->
        <li>
          <details bind:open={otherlistOpen} class="w-full">
            <summary class="flex items-center gap-2 cursor-pointer px-2 py-2 rounded-lg hover:bg-gray-100 transition">
              <iconify-icon icon="material-symbols:settings-rounded" width="24" height="24" />
              <span class="hidden md:inline">Other List</span>
            </summary>
            <ul class="ml-6 mt-1 flex flex-col gap-1">
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/otherlist/categories')}><iconify-icon icon="material-symbols:local-offer-rounded" width="22" height="22" /> <span class="hidden md:inline">Categories</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/otherlist/units')}><iconify-icon icon="material-symbols:straighten-rounded" width="22" height="22" /> <span class="hidden md:inline">Units</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/otherlist/locations')}><iconify-icon icon="material-symbols:location-on-rounded" width="22" height="22" /> <span class="hidden md:inline">Locations</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/otherlist/discounts')}><iconify-icon icon="material-symbols:percent-rounded" width="22" height="22" /> <span class="hidden md:inline">Discounts</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/otherlist/paymentmethods')}><iconify-icon icon="material-symbols:credit-card-rounded" width="22" height="22" /> <span class="hidden md:inline">Payment Methods</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/otherlist/terms')}><iconify-icon icon="material-symbols:event-note-rounded" width="22" height="22" /> <span class="hidden md:inline">Terms</span></button></li>
              <li><button type="button" class="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-gray-100 transition text-left" on:click={() => handleNav('/otherlist/tax')}><iconify-icon icon="material-symbols:percent-rounded" width="22" height="22" /> <span class="hidden md:inline">Tax</span></button></li>
            </ul>
          </details>
        </li>
      </ul>
    </nav>
  </div>
  <button class="btn btn-error btn-outline mt-0 md:mt-8 w-12 md:w-full flex-shrink-0" on:click={handleSignOut}>
    <iconify-icon icon="material-symbols:logout" width="24" height="24"></iconify-icon>
    <span class="hidden md:inline">Sign Out</span>
  </button>
</aside> 