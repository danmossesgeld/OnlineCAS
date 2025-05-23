<script lang="ts">
  export let primaryButtonLabel: string = 'Primary Action';
  export let onPrimaryClick: () => void = () => {};
  export let secondaryButtonLabel: string = 'Secondary Action';
  export let onSecondaryClick: () => void = () => {};
</script>

<div class="flex gap-2 justify-end w-full flex-wrap mt-2">
  <button
    class="btn btn-outline btn-xs border-2 border-[#8B1F3B] text-[#8B1F3B] hover:bg-[#f8e9ed] hover:border-[#7a1a34] font-semibold rounded-md px-5 py-2 transition"
    type="button"
    on:click={onSecondaryClick}
  >
    {secondaryButtonLabel}
  </button>
  <button
    class="btn btn-primary btn-xs bg-[#8B1F3B] hover:bg-[#7a1a34] text-white font-semibold rounded-md px-5 py-2 transition"
    type="submit"
    on:click={onPrimaryClick}
  >
    {primaryButtonLabel}
  </button>
</div> 