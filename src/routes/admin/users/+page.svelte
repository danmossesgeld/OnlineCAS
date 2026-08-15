<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getFirestore, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
  import { app } from '$lib/firebase';
  import { user as currentUser } from '$lib/user';
  import { DEFAULT_ADMIN_EMAIL, type UserProfile, type UserRole } from '$lib/stores/userProfile';
  import { createUserAccount, updateUserProfile, sendUserPasswordReset } from '$lib/utils/adminService';
  import { formatDate } from '$lib/utils/formatters';
  import FormLayout from '$lib/components/FormLayout.svelte';

  let profiles: UserProfile[] = [];
  let isLoading = true;
  let loadError = '';
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    const db = getFirestore(app);
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    unsubscribe = onSnapshot(
      q,
      (snap) => {
        profiles = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) }));
        isLoading = false;
      },
      (err) => {
        console.error('Error loading users:', err);
        loadError = err.message;
        isLoading = false;
      }
    );
  });

  onDestroy(() => unsubscribe?.());

  let showCreateModal = false;
  let newEmail = '';
  let newPassword = '';
  let newDisplayName = '';
  let newRole: UserRole = 'user';
  let createError = '';
  let isCreating = false;

  function openCreateModal() {
    newEmail = '';
    newPassword = '';
    newDisplayName = '';
    newRole = 'user';
    createError = '';
    showCreateModal = true;
  }

  async function handleCreate() {
    createError = '';
    const email = newEmail.trim();
    if (!email) {
      createError = 'Email is required.';
      return;
    }
    if (newPassword.length < 6) {
      createError = 'Password must be at least 6 characters.';
      return;
    }
    if (!$currentUser) return;

    isCreating = true;
    try {
      await createUserAccount({
        email,
        password: newPassword,
        displayName: newDisplayName.trim(),
        role: newRole,
        createdByUid: $currentUser.uid
      });
      showCreateModal = false;
    } catch (e) {
      createError = 'Failed to create user: ' + (e as Error).message;
    } finally {
      isCreating = false;
    }
  }

  async function toggleActive(profile: UserProfile) {
    if (profile.uid === $currentUser?.uid) return;
    if (!confirm(`${profile.isActive ? 'Deactivate' : 'Reactivate'} ${profile.email}?`)) return;
    try {
      await updateUserProfile(profile.uid, { isActive: !profile.isActive });
    } catch (e) {
      alert('Failed to update user: ' + (e as Error).message);
    }
  }

  async function toggleRole(profile: UserProfile) {
    if (profile.uid === $currentUser?.uid) return;
    const nextRole: UserRole = profile.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change ${profile.email}'s role to "${nextRole}"?`)) return;
    try {
      await updateUserProfile(profile.uid, { role: nextRole });
    } catch (e) {
      alert('Failed to update user: ' + (e as Error).message);
    }
  }

  async function handleSendReset(profile: UserProfile) {
    if (!confirm(`Send a password reset email to ${profile.email}?`)) return;
    try {
      await sendUserPasswordReset(profile.email);
      alert(`Password reset email sent to ${profile.email}.`);
    } catch (e) {
      alert('Failed to send reset email: ' + (e as Error).message);
    }
  }
</script>

<FormLayout title="User Management" backPath="/admin">
  <svelte:fragment slot="header-actions">
    <button
      type="button"
      class="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors"
      style="background: var(--color-primary-600);"
      on:click={openCreateModal}
    >
      <iconify-icon icon="material-symbols:person-add" width="18" height="18" class="align-[-3px] mr-1"></iconify-icon>
      New User
    </button>
  </svelte:fragment>

  <p class="text-sm mb-4" style="color: var(--color-neutral-500);">
    Deactivating a user blocks them from using this app on their next sign-in check, but does not delete or disable
    their underlying login credentials — do that from the Firebase Console if needed. Only accounts created here, or
    that have signed in at least once, appear in this list.
  </p>

  {#if isLoading}
    <div class="text-center py-8" style="color: var(--color-neutral-500);">Loading users...</div>
  {:else if loadError}
    <div class="text-center py-8" style="color: var(--color-error-600);">Failed to load users: {loadError}</div>
  {:else if profiles.length === 0}
    <div class="text-center py-8" style="color: var(--color-neutral-500);">No users yet.</div>
  {:else}
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Email</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Name</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Role</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Status</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Created</th>
            <th class="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each profiles as profile (profile.uid)}
            {@const isSelf = profile.uid === $currentUser?.uid}
            <tr>
              <td class="px-4 py-3 whitespace-nowrap" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">
                {profile.email}
                {#if profile.email?.toLowerCase() === DEFAULT_ADMIN_EMAIL}
                  <span class="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium" style="background: var(--color-primary-100); color: var(--color-primary-700);">default admin</span>
                {/if}
                {#if isSelf}
                  <span class="ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium" style="background: var(--color-neutral-100); color: var(--color-neutral-600);">you</span>
                {/if}
              </td>
              <td class="px-4 py-3 whitespace-nowrap" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">{profile.displayName || '-'}</td>
              <td class="px-4 py-3 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium" style={profile.role === 'admin' ? 'background: var(--color-primary-100); color: var(--color-primary-700);' : 'background: var(--color-neutral-100); color: var(--color-neutral-600);'}>
                  {profile.role}
                </span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium" style={profile.isActive ? 'background: var(--color-success-100); color: var(--color-success-700);' : 'background: var(--color-error-100); color: var(--color-error-700);'}>
                  {profile.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">{formatDate(profile.createdAt as any)}</td>
              <td class="px-4 py-3 whitespace-nowrap text-right" style="border-bottom: 1px solid var(--color-neutral-100);">
                <div class="flex justify-end gap-1.5">
                  <button
                    type="button"
                    class="px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style="background: var(--color-neutral-100); color: var(--color-neutral-700);"
                    disabled={isSelf}
                    title={isSelf ? "You can't change your own role" : ''}
                    on:click={() => toggleRole(profile)}
                  >
                    Make {profile.role === 'admin' ? 'User' : 'Admin'}
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={profile.isActive ? 'background: var(--color-error-50); color: var(--color-error-700);' : 'background: var(--color-success-50); color: var(--color-success-700);'}
                    disabled={isSelf}
                    title={isSelf ? "You can't deactivate your own account" : ''}
                    on:click={() => toggleActive(profile)}
                  >
                    {profile.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                    style="background: var(--color-neutral-100); color: var(--color-neutral-700);"
                    on:click={() => handleSendReset(profile)}
                  >
                    Send Reset Email
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</FormLayout>

{#if showCreateModal}
  <div class="fixed inset-0 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4" style="background: rgba(15, 23, 42, 0.55);">
    <div class="w-full max-w-md p-5 rounded-md" style="background: var(--color-neutral-0); border: 1px solid var(--color-neutral-200); box-shadow: var(--shadow-lg);">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-medium" style="color: var(--color-neutral-800);">New User</h3>
        <button type="button" style="color: var(--color-neutral-400);" aria-label="Close" on:click={() => (showCreateModal = false)}>
          <iconify-icon icon="material-symbols:close" width="24" height="24"></iconify-icon>
        </button>
      </div>

      {#if createError}
        <div class="text-xs px-3 py-2 rounded mb-3" style="background: var(--color-error-50); color: var(--color-error-700);">{createError}</div>
      {/if}

      <div class="space-y-3">
        <div>
          <label for="new-user-email" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Email*</label>
          <input id="new-user-email" type="email" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={newEmail} />
        </div>
        <div>
          <label for="new-user-name" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Display Name</label>
          <input id="new-user-name" type="text" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={newDisplayName} />
        </div>
        <div>
          <label for="new-user-password" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Temporary Password*</label>
          <input id="new-user-password" type="text" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={newPassword} placeholder="At least 6 characters" />
          <p class="text-xs mt-1" style="color: var(--color-neutral-500);">Share this with them directly, or use "Send Reset Email" afterward so they can set their own.</p>
        </div>
        <div>
          <label for="new-user-role" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Role</label>
          <select id="new-user-role" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={newRole}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <div class="flex justify-end gap-3 mt-5">
        <button type="button" class="px-4 py-2 text-sm font-medium rounded-md transition-colors" style="color: var(--color-neutral-700); background: var(--color-neutral-100);" on:click={() => (showCreateModal = false)}>
          Cancel
        </button>
        <button type="button" class="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-60" style="background: var(--color-primary-600);" disabled={isCreating} on:click={handleCreate}>
          {isCreating ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </div>
  </div>
{/if}
