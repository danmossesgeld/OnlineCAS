<script lang="ts">
	import '../app.css';
	import Sidebar from '../lib/components/Sidebar.svelte';
	import { onMount } from 'svelte';
	import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
	import { app } from '../lib/firebase';
	import { user } from '../lib/user';
	import { loadUserProfile, clearUserProfile } from '$lib/stores/userProfile';
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
		onAuthStateChanged(auth, async (u) => {
			user.set(u);
			const path = window.location.pathname;

			if (!u) {
				clearUserProfile();
				if (path !== '/') goto('/');
				return;
			}

			// Deactivated accounts (see Admin Tools > Users) are blocked here, not just hidden
			// in the UI — a deactivated user who's still signed in gets signed back out on the
			// very next auth-state check.
			const profile = await loadUserProfile(u);
			if (profile && profile.isActive === false) {
				await signOut(auth);
				clearUserProfile();
				goto('/');
				return;
			}

			if (path === '/') goto('/main/dashboard');
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
