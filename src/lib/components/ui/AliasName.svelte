<script lang="ts">
	import type { AliasGloss } from '$lib/engine/leaderboard-alias';

	/**
	 * A weekly-board name with its English and background in a tooltip. Hover
	 * or keyboard focus opens it; a tap toggles it on touch screens, where
	 * there is no hover. The tooltip is positioned against the viewport so the
	 * truncated leaderboard rows can't clip it, and clicks on the name don't
	 * reach the banner (which would expand or collapse it).
	 */
	let { name, gloss }: { name: string; gloss: AliasGloss } = $props();

	let open = $state(false);
	let trigger: HTMLButtonElement | undefined = $state(undefined);
	let tip: HTMLSpanElement | undefined = $state(undefined);
	let pos = $state({ left: 0, top: 0, above: true });
	/** The press that focused the name was a finger: the tap toggles the
	 * tooltip, so focus mustn't open it too. Cleared on blur, so focus from the
	 * keyboard later always opens it. */
	let touch = false;
	const id = `alias-tip-${Math.random().toString(36).slice(2, 9)}`;

	const GUTTER = 12;

	function place(): void {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const width = tip?.offsetWidth ?? 240;
		const height = tip?.offsetHeight ?? 60;
		const half = width / 2;
		const center = Math.min(
			Math.max(r.left + r.width / 2, GUTTER + half),
			window.innerWidth - GUTTER - half
		);
		const above = r.top - height - 8 >= GUTTER;
		pos = { left: center, top: above ? r.top - 8 : r.bottom + 8, above };
	}

	function show(): void {
		open = true;
		place();
		// Measure again once the tooltip has rendered at its real size.
		requestAnimationFrame(place);
	}

	function hide(): void {
		open = false;
	}

	$effect(() => {
		if (!open) return;
		const close = (e: Event) => {
			if (e.target instanceof Node && trigger?.contains(e.target)) return;
			hide();
		};
		window.addEventListener('scroll', hide, true);
		window.addEventListener('resize', hide);
		document.addEventListener('pointerdown', close);
		return () => {
			window.removeEventListener('scroll', hide, true);
			window.removeEventListener('resize', hide);
			document.removeEventListener('pointerdown', close);
		};
	});
</script>

<button
	bind:this={trigger}
	type="button"
	class="max-w-full cursor-help truncate align-bottom underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-emphasis"
	aria-describedby={open ? id : undefined}
	onpointerdown={(e) => (touch = e.pointerType === 'touch')}
	onpointerenter={(e) => {
		if (e.pointerType !== 'touch') show();
	}}
	onpointerleave={(e) => {
		if (e.pointerType !== 'touch') hide();
	}}
	onfocus={() => {
		if (!touch) show();
	}}
	onblur={() => {
		touch = false;
		hide();
	}}
	onclick={(e) => {
		e.stopPropagation();
		if (touch) {
			if (open) hide();
			else show();
		}
	}}
	onkeydown={(e) => {
		// Enter/Space on the name shouldn't toggle the banner around it.
		if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
		// Escape closes just the tooltip, not the leaderboard list around it.
		if (e.key === 'Escape' && open) {
			e.stopPropagation();
			hide();
		}
	}}>{name}</button
>
{#if open}
	<span
		bind:this={tip}
		{id}
		role="tooltip"
		class="pointer-events-none fixed z-50 w-max max-w-[240px] whitespace-normal rounded-[10px] bg-emphasis px-2.5 py-2 text-left text-xs font-medium leading-snug text-text-inverted shadow-lg"
		style="left: {pos.left}px; top: {pos.top}px; transform: translate(-50%, {pos.above
			? '-100%'
			: '0'});"
	>
		<span class="block font-semibold">{gloss.english}</span>
		<span class="mt-0.5 block font-normal opacity-80">{gloss.note}</span>
	</span>
{/if}
