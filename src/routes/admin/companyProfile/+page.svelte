<script lang="ts">
  import { onMount } from 'svelte';
  import { user as currentUser } from '$lib/user';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import {
    getCompanyProfile,
    saveCompanyProfile,
    EMPTY_COMPANY_PROFILE,
    type CompanyProfile
  } from '$lib/utils/companyProfileService';

  let profile: CompanyProfile = { ...EMPTY_COMPANY_PROFILE };
  let isLoading = true;
  let isSaving = false;
  let loadError = '';
  let saveError = '';
  let saved = false;

  onMount(async () => {
    try {
      const existing = await getCompanyProfile();
      if (existing) profile = { ...EMPTY_COMPANY_PROFILE, ...existing };
    } catch (e) {
      loadError = 'Failed to load company profile: ' + (e as Error).message;
    } finally {
      isLoading = false;
    }
  });

  async function handleSave() {
    saveError = '';
    saved = false;
    if (!profile.registeredName.trim()) {
      saveError = 'Registered Business Name is required.';
      return;
    }
    if (!profile.tin.trim()) {
      saveError = 'TIN is required.';
      return;
    }
    if (!profile.registeredAddress.trim()) {
      saveError = 'Registered Address is required.';
      return;
    }
    if (!$currentUser) return;

    isSaving = true;
    try {
      await saveCompanyProfile(profile, $currentUser.uid);
      saved = true;
    } catch (e) {
      saveError = 'Failed to save: ' + (e as Error).message;
    } finally {
      isSaving = false;
    }
  }
</script>

<FormLayout title="Company Profile" backPath="/admin">
  <p class="text-sm mb-4" style="color: var(--color-neutral-500);">
    This is the seller-side identity BIR requires on the face of every Sales Invoice / Official Receipt (registered
    name, TIN, registered address, VAT status — RA 11976 EOPT Act, RR 3-2024). Nothing prints or validates against
    this yet; this is the data it will pull from once invoice printing and BIR Form 2307 generation are built.
  </p>

  {#if isLoading}
    <div class="text-center py-8" style="color: var(--color-neutral-500);">Loading...</div>
  {:else}
    {#if loadError}
      <div class="text-sm px-4 py-3 rounded-lg mb-4" style="background: var(--color-error-50); color: var(--color-error-700);">{loadError}</div>
    {/if}

    <div class="max-w-2xl space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2">
          <label for="cp-registered-name" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Registered Business Name*</label>
          <input id="cp-registered-name" type="text" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.registeredName} placeholder="As registered with the BIR / SEC / DTI" />
        </div>

        <div class="sm:col-span-2">
          <label for="cp-trade-name" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Trade / Business Name</label>
          <input id="cp-trade-name" type="text" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.tradeName} placeholder="Leave blank if same as registered name" />
        </div>

        <div>
          <label for="cp-tin" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">TIN*</label>
          <input id="cp-tin" type="text" class="w-full rounded border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.tin} placeholder="000-000-000-0000" />
        </div>

        <div>
          <label for="cp-rdo" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">RDO Code</label>
          <input id="cp-rdo" type="text" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.rdoCode} placeholder="e.g. 044" />
        </div>

        <div class="sm:col-span-2">
          <label for="cp-address" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Registered Address*</label>
          <input id="cp-address" type="text" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.registeredAddress} />
        </div>

        <div>
          <label for="cp-vat-status" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">VAT Status*</label>
          <select id="cp-vat-status" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.vatStatus}>
            <option value="vat">VAT Registered</option>
            <option value="non-vat">Non-VAT</option>
          </select>
        </div>

        <div>
          <label for="cp-line-of-business" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Line of Business</label>
          <input id="cp-line-of-business" type="text" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.lineOfBusiness} />
        </div>

        <div>
          <label for="cp-contact" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Contact Number</label>
          <input id="cp-contact" type="text" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.contactNumber} />
        </div>

        <div>
          <label for="cp-email" class="block text-sm font-medium mb-1" style="color: var(--color-neutral-600);">Email</label>
          <input id="cp-email" type="email" class="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-300);" bind:value={profile.email} />
        </div>
      </div>

      {#if saveError}
        <div class="text-sm px-4 py-3 rounded-lg" style="background: var(--color-error-50); color: var(--color-error-700);">{saveError}</div>
      {/if}
      {#if saved}
        <div class="text-sm px-4 py-3 rounded-lg" style="background: var(--color-success-50); color: var(--color-success-700);">Company profile saved.</div>
      {/if}

      <div class="flex justify-end">
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-60"
          style="background: var(--color-primary-600);"
          disabled={isSaving}
          on:click={handleSave}
        >
          {isSaving ? 'Saving...' : 'Save Company Profile'}
        </button>
      </div>
    </div>
  {/if}
</FormLayout>
