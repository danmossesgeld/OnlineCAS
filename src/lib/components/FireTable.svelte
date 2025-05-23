<script lang="ts">
  import { collectionStore } from '$lib/utils/firestoreStores';
  import { onDestroy } from 'svelte';
  import type { Unsubscriber } from 'svelte/store';

  export let collectionPath: string;
  export let columns: Array<{ label: string; key: string; width?: string }> = [];
  export let queryOptions: any[] = [];
  export let actions: (row: any) => any = () => null;

  let rows: any[] = [];
  let unsub: Unsubscriber | null = null;

  $: {
    if (unsub) unsub();
    unsub = collectionStore(collectionPath, queryOptions).subscribe((data) => {
      rows = data;
    });
  }
  onDestroy(() => { if (unsub) unsub(); });
</script>

<div class="overflow-x-auto w-full">
  <table class="table w-full text-sm border-separate border-spacing-0 border border-gray-200 rounded-xl shadow-sm">
    <thead>
      <tr class="bg-gray-50 text-gray-600">
        {#each columns as col}
          <th class="px-3 py-2 font-semibold text-xs tracking-wide border-b border-r border-gray-200 first:rounded-tl-xl last:rounded-tr-xl" style={col.width ? `width:${col.width}` : ''}>{col.label}</th>
        {/each}
        <th class="px-3 py-2 border-b border-gray-200 border-r first:rounded-tl-xl last:rounded-tr-xl"></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row, idx}
        <tr class="{idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100 transition-all hover:bg-[#f8e9ed]/40">
          {#each columns as col}
            <td class="px-3 py-2 align-middle border-b border-r border-gray-200 last:border-r-0">{row[col.key]}</td>
          {/each}
          <td class="px-2 py-2 text-center border-b border-r border-gray-200 last:border-r-0"><slot name="actions" {row} /></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div> 