<script lang="ts">
	import '../app.css';
	import Sidebar from '../lib/components/Sidebar.svelte';
	import Navbar from '../lib/components/Navbar.svelte';
	import { onMount } from 'svelte';
	import { getAuth, onAuthStateChanged } from 'firebase/auth';
	import { app } from '../lib/firebase';
	import { goto } from '$app/navigation';
</script>

<div class="flex min-h-screen bg-base-200">
	<Sidebar />
	<div class="flex-1 flex flex-col">
		<Navbar />
		<main class="flex-1 p-6">
			<slot />
		</main>
	</div>
</div>

<script lang="ts">
	onMount(() => {
		const auth = getAuth(app);
		onAuthStateChanged(auth, (user) => {
			if (!user && window.location.pathname !== '/login') {
				goto('/login');
			}
			if (user && window.location.pathname === '/login') {
				goto('/');
			}
		});
	});
</script>
