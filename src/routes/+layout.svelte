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
	<!-- Sidebar is now fixed and lives outside the flex container -->
	<!-- Mobile sidebar toggle button is handled in the Sidebar component -->
	<Sidebar />

	<!-- Main content area with left margin to accommodate fixed sidebar -->
	<div class="min-h-screen bg-[#f6f7fb] transition-all duration-300 md:ml-64">
		<div class="flex flex-col h-full p-4">
			<main class="flex-1 overflow-auto p-4 md:p-8 bg-white rounded-xl shadow-lg">
				<slot />
			</main>
		</div>
	</div>
{:else}
	<slot />
{/if}
