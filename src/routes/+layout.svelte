<script lang="ts">
	import '../app.css';
	import Sidebar from '../lib/components/Sidebar.svelte';
	import { onMount } from 'svelte';
	import { getAuth, onAuthStateChanged } from 'firebase/auth';
	import { app } from '../lib/firebase';
	import { user } from '../lib/user';
	import { theme } from '$lib/stores/themeStore';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let sidebarOpen = false;

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	onMount(() => {
		theme.init();

		const auth = getAuth(app);
		onAuthStateChanged(auth, (u) => {
			user.set(u);
			const path = window.location.pathname;
			if (!u && path !== '/') goto('/');
			if (u && path === '/') goto('/main/dashboard');
		});
	});
</script>

{#if $user && $page.url.pathname !== '/'}
	<!-- Sidebar is now fixed and lives outside the flex container -->
	<!-- Mobile sidebar toggle button is handled in the Sidebar component -->
	<Sidebar />

	<!-- Main content area with left margin to accommodate fixed sidebar. This is the
	     single page surface — inner containers (FormLayout, ListContainer, ...) should
	     not add their own competing card/shadow on top of this one. -->
	<div class="min-h-screen transition-colors duration-200 md:ml-64" style="background: var(--color-neutral-50);">
		<main class="min-h-screen flex flex-col overflow-auto p-3 sm:p-4 md:p-6">
			<slot />
		</main>
	</div>
{:else}
	<slot />
{/if}
