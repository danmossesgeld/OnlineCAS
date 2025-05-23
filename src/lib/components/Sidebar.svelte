<script lang="ts">
// Sidebar navigation items
const navItems = [
  { label: 'Dashboard', icon: 'material-symbols:dashboard', href: '/' },
  { label: 'Customer Center', icon: 'material-symbols:group', href: '/customer-center' },
  { label: 'Vendor Center', icon: 'material-symbols:store', href: '/vendor-center' },
  { label: 'Banking', icon: 'material-symbols:account-balance', href: '/banking' },
  { label: 'Accounting', icon: 'material-symbols:calculate', href: '/accounting' },
  { label: 'Inventory', icon: 'material-symbols:inventory', href: '/inventory' },
  { label: 'Masterlist', icon: 'material-symbols:list', href: '/masterlist' },
  { label: 'Other List', icon: 'material-symbols:more-horiz', href: '/other-list' }
];
</script>

<aside class="w-64 min-h-screen bg-base-100 shadow flex flex-col p-4">
  <div class="flex flex-col items-center mb-8">
    <div class="avatar placeholder mb-2">
      <div class="bg-neutral-focus text-neutral-content rounded-full w-20">
        <span class="text-2xl">Admin</span>
      </div>
    </div>
    <span class="font-bold">Main</span>
  </div>
  <input type="text" placeholder="Search" class="input input-bordered w-full mb-4" />
  <nav class="flex-1">
    <ul class="menu menu-vertical">
      {#each navItems as item}
        <li>
          <a href={item.href} class="flex items-center gap-2">
            <iconify-icon icon={item.icon} width="24" height="24"></iconify-icon>
            {item.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>
</aside> 