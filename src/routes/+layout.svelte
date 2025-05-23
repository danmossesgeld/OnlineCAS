<script lang="ts">
	import '../app.css';
	import Sidebar from '../lib/components/Sidebar.svelte';
	import { onMount } from 'svelte';
	import { getAuth, onAuthStateChanged } from 'firebase/auth';
	import { app } from '../lib/firebase';
	import { user } from '../lib/user';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let sidebarOpen = false;

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	onMount(() => {
		const auth = getAuth(app);
		onAuthStateChanged(auth, (u) => {
			user.set(u);
			const path = window.location.pathname;
			if (!u && path !== '/') goto('/');
			if (u && path === '/') goto('/main');
		});
	});
</script>

{#if $user && $page.url.pathname !== '/'}
	<div class="flex h-screen bg-[#f6f7fb] overflow-hidden">
		<!-- Sidebar for desktop, drawer for mobile -->
		<div class="hidden md:block h-full">
			<Sidebar />
		</div>
		<!-- Drawer overlay for mobile -->
		<div class="md:hidden">
			{#if sidebarOpen}
				<div class="fixed inset-0 z-40 bg-black/30" on:click={toggleSidebar} tabindex="0" role="button" aria-label="Close sidebar" on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSidebar(); }}></div>
				<div class="fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-lg">
					<Sidebar />
				</div>
			{/if}
		</div>
		<!-- Main content -->
		<div class="flex-1 flex flex-col h-full">
			<!-- Topbar for mobile -->
			<div class="md:hidden flex items-center justify-between px-4 py-2 bg-white shadow z-20">
				<button class="btn btn-ghost btn-circle" on:click={toggleSidebar} aria-label="Open menu">
					<iconify-icon icon="material-symbols:menu" width="28" height="28"></iconify-icon>
				</button>
				<span class="font-bold text-lg">DIGISOFT</span>
			</div>
			<main class="flex-1 overflow-auto p-2 md:p-8 bg-white rounded-tl-3xl shadow-2xl transition-all duration-300 mt-0 md:mt-6 mx-0 md:mx-6 mb-0 md:mb-6">
				<slot />
			</main>
		</div>
	</div>
{:else}
	<slot />
{/if}
