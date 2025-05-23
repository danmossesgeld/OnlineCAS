<script lang="ts">
  import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
  import { app } from '../firebase';
  import { goto } from '$app/navigation';
  let email = '';
  let password = '';
  let error = '';
  let loading = false;
  let showPassword = false;

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

<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f6f7fb] via-[#f0e6f6] to-[#e9f0fb]">
  <form class="backdrop-blur-lg bg-white/70 border border-gray-200 shadow-2xl rounded-2xl p-8 w-full max-w-md flex flex-col gap-6" on:submit={handleLogin}>
    <div class="flex flex-col items-center gap-2">
      <img src="/companylogo.png" alt="Company Logo" class="w-14 h-14 rounded-full shadow mb-1" />
      <span class="font-extrabold text-2xl text-[#8B1F3B] tracking-wide">DIGIMAX</span>
      <span class="text-xs text-gray-500 font-medium">Welcome back! Please sign in to continue.</span>
    </div>
    {#if error}
      <div class="alert alert-error animate-fade-in mb-2 text-xs">{error}</div>
    {/if}
    <div class="relative mb-2">
      <input
        id="email"
        type="email"
        class="peer input input-sm w-full border-2 border-gray-300 focus:border-[#8B1F3B] focus:ring-2 focus:ring-[#8B1F3B] bg-gray-50 rounded-md pl-10 placeholder-transparent"
        bind:value={email}
        required
        autocomplete="username"
        placeholder="Email"
      />
      <label for="email" class="absolute left-10 top-1/2 -translate-y-1/2 text-gray-400 text-xs transition-all duration-200 peer-focus:-top-2 peer-focus:left-2 peer-focus:text-[#8B1F3B] peer-focus:text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:left-10 peer-placeholder-shown:text-gray-400 peer-placeholder-shown:text-xs bg-white/70 px-1 pointer-events-none">Email</label>
      <iconify-icon icon="material-symbols:mail" width="18" height="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
    </div>
    <div class="relative mb-2">
      <input
        id="password"
        type={showPassword ? 'text' : 'password'}
        class="peer input input-sm w-full border-2 border-gray-300 focus:border-[#8B1F3B] focus:ring-2 focus:ring-[#8B1F3B] bg-gray-50 rounded-md pl-10 pr-10 placeholder-transparent"
        bind:value={password}
        required
        autocomplete="current-password"
        placeholder="Password"
      />
      <label for="password" class="absolute left-10 top-1/2 -translate-y-1/2 text-gray-400 text-xs transition-all duration-200 peer-focus:-top-2 peer-focus:left-2 peer-focus:text-[#8B1F3B] peer-focus:text-xs peer-placeholder-shown:top-1/2 peer-placeholder-shown:left-10 peer-placeholder-shown:text-gray-400 peer-placeholder-shown:text-xs bg-white/70 px-1 pointer-events-none">Password</label>
      <iconify-icon icon="material-symbols:lock" width="18" height="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#8B1F3B] transition" on:click={() => showPassword = !showPassword} tabindex="-1">
        <iconify-icon icon={showPassword ? 'material-symbols:visibility-off' : 'material-symbols:visibility'} width="18" height="18"></iconify-icon>
      </button>
    </div>
    <div class="flex justify-end mb-2">
      <a href="#" class="text-xs text-[#8B1F3B] hover:underline font-medium">Forgot password?</a>
    </div>
    <button class="btn w-full text-white font-bold text-base bg-gradient-to-r from-[#8B1F3B] to-[#7a1a34] border-0 hover:scale-105 hover:shadow-lg transition rounded-md py-2 flex items-center justify-center gap-2" type="submit" disabled={loading}>
      {#if loading}
        <span class="loading loading-spinner loading-xs"></span>
      {/if}
      <iconify-icon icon="material-symbols:login" width="18" height="18" class="mr-1"></iconify-icon>
      {loading ? 'Signing in...' : 'Sign In'}
    </button>
  </form>
</div>

<style>
  .animate-fade-in {
    animation: fadeIn 0.3s;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style> 