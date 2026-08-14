<script lang="ts">
  import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
  import { app } from '../firebase';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  let email = '';
  let password = '';
  let error = '';
  let loading = false;
  let showPassword = false;
  let formVisible = false;

  // Show form with animation after component mounts
  setTimeout(() => formVisible = true, 100);

  async function handleLogin(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';
    try {
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, email, password);
      goto('/main');
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style="background: var(--color-neutral-50);">
  {#if formVisible}
  <div in:fade={{ duration: 500, delay: 100 }}>
    <form
      class="border rounded-lg p-6 w-full max-w-3xl flex flex-row gap-8 relative z-10"
      style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); box-shadow: var(--shadow-md);"
      on:submit={handleLogin}
      in:fly={{ y: 20, duration: 600, delay: 300, easing: cubicOut }}
    >
      <!-- Logo and title section -->
      <div class="flex flex-col items-center justify-center w-1/3 pr-6" style="border-right: 1px solid var(--color-neutral-200);">
      <img src="/companylogo.png" alt="Company Logo" class="w-24 h-24 mb-3" in:fly={{ y: 10, duration: 700, delay: 400, easing: cubicOut }} />
      <div class="space-y-1 text-center" in:fly={{ y: 10, duration: 700, delay: 500, easing: cubicOut }}>
        <h1 class="font-bold text-3xl text-[#FF6600] tracking-wide">DIGIMAX</h1>
        <p class="text-sm font-medium uppercase tracking-wide" style="color: var(--color-neutral-500);">I.T. SOLUTIONS</p>
      </div>
      </div>

      <!-- Form fields section -->
      <div class="flex-1 py-2">
        {#if error}
          <div in:fly={{ y: -10, duration: 300 }} class="text-xs px-4 py-3 rounded-lg flex items-center gap-2 mb-4 border" style="background: var(--color-error-50); border-color: var(--color-error-500); color: var(--color-error-700);">
            <iconify-icon icon="mdi:alert-circle" width="16" height="16" style="color: var(--color-error-600);"></iconify-icon>
            <span>{error}</span>
          </div>
        {/if}
        <div class="mb-4" in:fly={{ y: 10, duration: 700, delay: 500, easing: cubicOut }}>
          <label for="email" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Email</label>
          <div class="relative">
            <input
              id="email"
              type="email"
              class="w-full px-4 py-2.5 border rounded-md focus:outline-none focus:ring-1 transition-colors"
              style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: #ff6600;"
              bind:value={email}
              required
              autocomplete="username"
            />
          </div>
        </div>
        <div class="mb-6" in:fly={{ y: 10, duration: 700, delay: 600, easing: cubicOut }}>
          <label for="password" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Password</label>
          <div class="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              class="w-full px-4 py-2.5 pr-11 border rounded-md focus:outline-none focus:ring-1 transition-colors"
              style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: #ff6600;"
              bind:value={password}
              required
              autocomplete="current-password"
            />
            <button
              type="button"
              class="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 focus:outline-none"
              style="color: var(--color-neutral-400);"
              on:click={() => showPassword = !showPassword}
              tabindex="-1"
              aria-label="Toggle password visibility"
            >
              <iconify-icon icon={showPassword ? 'material-symbols:visibility-off' : 'material-symbols:visibility'} width="18" height="18"></iconify-icon>
            </button>
          </div>
        </div>

        <div in:fly={{ y: 10, duration: 700, delay: 800, easing: cubicOut }}>
          <button 
            class="relative w-full overflow-hidden group bg-[#FF6600] text-white font-medium text-base rounded-none py-3 flex items-center justify-center gap-2 transition-all duration-200 hover:bg-orange-600"
            type="submit" 
            disabled={loading}
          >
            {#if loading}
              <span class="inline-block h-4 w-4 border-2 border-white/80 border-t-transparent rounded-full animate-spin"></span>
            {/if}
            <iconify-icon icon="material-symbols:login" width="18" height="18" class="mr-1"></iconify-icon>
            <span>{loading ? 'Signing in...' : 'Sign In'}</span>
          </button>
        </div>
      </div>
    </form>
  </div>
  {/if}
</div>

<style>
  /* Fix autofill styles for light background */
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus {
    -webkit-text-fill-color: #374151;
    -webkit-box-shadow: 0 0 0px 1000px #EFF6FF inset;
    transition: background-color 5000s ease-in-out 0s;
  }
</style>