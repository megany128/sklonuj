<script lang="ts">
	import { resolve } from '$app/paths';
	import { slide } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';
	import type { Announcement } from '$lib/engine/announcements';

	let {
		announcement,
		onAction,
		onDismiss
	}: {
		announcement: Announcement;
		/** The learner followed the button (the link then opens its page). */
		onAction: () => void;
		onDismiss: () => void;
	} = $props();
</script>

<div
	transition:slide={{ duration: 200 }}
	class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-emphasis/40 bg-emphasis/5 px-4 py-3"
	data-testid="whats-new-banner"
>
	<span
		class="shrink-0 rounded-full bg-emphasis px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-inverted"
	>
		New
	</span>
	<p class="min-w-0 flex-1 basis-48 text-sm text-text-default">
		<span class="font-semibold">{announcement.title}</span>
		<span class="ml-1 text-xs text-text-subtitle">{announcement.body}</span>
	</p>
	<a
		href={resolve(announcement.href)}
		onclick={onAction}
		class="shrink-0 rounded-full border border-emphasis/40 px-3 py-1 text-xs font-semibold text-emphasis transition-colors hover:bg-emphasis/10"
	>
		{announcement.actionLabel}
	</a>
	<button
		type="button"
		onclick={onDismiss}
		class="shrink-0 p-1 text-text-subtitle transition-colors hover:text-text-default"
		aria-label="Dismiss"
	>
		<X class="size-4" aria-hidden="true" />
	</button>
</div>
