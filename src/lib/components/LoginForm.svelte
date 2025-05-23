<script lang="ts">
  import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
  import { app } from '../firebase';
  let email = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleLogin(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';
    try {
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, email, password);
      // Redirect or handle success
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex items-center justify-center min-h-screen bg-base-200">
  <form class="card w-full max-w-sm bg-base-100 shadow-xl p-8" on:submit={handleLogin}>
    <h2 class="text-2xl font-bold mb-6 text-center">Login</h2>
    {#if error}
      <div class="alert alert-error mb-4">{error}</div>
    {/if}
    <div class="mb-4">
      <label class="label">Email</label>
      <input type="email" class="input input-bordered w-full" bind:value={email} required />
    </div>
    <div class="mb-6">
      <label class="label">Password</label>
      <input type="password" class="input input-bordered w-full" bind:value={password} required />
    </div>
    <button class="btn btn-primary w-full" type="submit" disabled={loading}>
      {loading ? 'Logging in...' : 'Login'}
    </button>
  </form>
</div> 