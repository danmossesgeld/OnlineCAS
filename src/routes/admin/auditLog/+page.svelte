<script lang="ts">
  import { onMount } from 'svelte';
  import FormLayout from '$lib/components/FormLayout.svelte';
  import { getAuditLogs, type AuditLogEntry } from '$lib/utils/auditLogService';
  import { formatDate } from '$lib/utils/formatters';

  let entries: AuditLogEntry[] = [];
  let isLoading = true;
  let loadError = '';
  let expandedId: string | null = null;

  onMount(async () => {
    try {
      entries = await getAuditLogs();
    } catch (e) {
      loadError = 'Failed to load audit log: ' + (e as Error).message;
    } finally {
      isLoading = false;
    }
  });

  function actionColor(action: string): string {
    if (action === 'create') return 'background: var(--color-success-100); color: var(--color-success-700);';
    if (action === 'delete') return 'background: var(--color-error-100); color: var(--color-error-700);';
    return 'background: var(--color-primary-100); color: var(--color-primary-700);';
  }

  function toggleExpand(id: string | undefined) {
    if (!id) return;
    expandedId = expandedId === id ? null : id;
  }
</script>

<FormLayout title="Audit Log" backPath="/admin">
  <p class="text-sm mb-4" style="color: var(--color-neutral-500);">
    Every create, update, and delete performed anywhere in the app, in order, newest first. This log is append-only —
    entries can never be edited or removed, even by an admin. Deleted records keep a full snapshot of their data here
    since the underlying document itself is gone from its live collection. Showing the most recent 500 entries.
  </p>

  {#if isLoading}
    <div class="text-center py-8" style="color: var(--color-neutral-500);">Loading...</div>
  {:else if loadError}
    <div class="text-center py-8" style="color: var(--color-error-600);">{loadError}</div>
  {:else if entries.length === 0}
    <div class="text-center py-8" style="color: var(--color-neutral-500);">No audit entries yet.</div>
  {:else}
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">When</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Who</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Action</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Collection</th>
            <th class="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider" style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);">Document ID</th>
          </tr>
        </thead>
        <tbody>
          {#each entries as entry (entry.id)}
            <tr
              class={entry.data ? 'cursor-pointer' : ''}
              on:click={() => entry.data && toggleExpand(entry.id)}
            >
              <td class="px-4 py-3 whitespace-nowrap" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">{formatDate(entry.performedAt as any)}</td>
              <td class="px-4 py-3 whitespace-nowrap" style="color: var(--color-neutral-800); border-bottom: 1px solid var(--color-neutral-100);">{entry.performedByDisplayName || entry.performedByEmail || 'Unknown'}</td>
              <td class="px-4 py-3 whitespace-nowrap" style="border-bottom: 1px solid var(--color-neutral-100);">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium" style={actionColor(entry.action)}>{entry.action}</span>
              </td>
              <td class="px-4 py-3 whitespace-nowrap font-mono text-xs" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">{entry.collectionPath}</td>
              <td class="px-4 py-3 whitespace-nowrap font-mono text-xs" style="color: var(--color-neutral-600); border-bottom: 1px solid var(--color-neutral-100);">
                {entry.docId}
                {#if entry.data}
                  <iconify-icon icon="material-symbols:{expandedId === entry.id ? 'expand-less' : 'expand-more'}-rounded" width="16" height="16" class="align-[-3px] ml-1"></iconify-icon>
                {/if}
              </td>
            </tr>
            {#if expandedId === entry.id && entry.data}
              <tr>
                <td colspan="5" class="px-4 py-3" style="background: var(--color-neutral-50); border-bottom: 1px solid var(--color-neutral-100);">
                  <pre class="text-xs overflow-x-auto" style="color: var(--color-neutral-700);">{JSON.stringify(entry.data, null, 2)}</pre>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</FormLayout>
