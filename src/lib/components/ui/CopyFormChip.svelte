<script lang="ts">
	import { tick } from 'svelte';

	/**
	 * Chip inside an empty answer box that drops in the dictionary form, so the
	 * learner only edits the ending. Tab in the empty box does the same. The
	 * word is already on screen, so using it isn't a hint. Place it inside a
	 * `relative` wrapper around the input; it hides itself once there's text.
	 */
	let {
		form,
		inputEl,
		value,
		onFill
	}: {
		/** The dictionary form to copy, or null for no chip. */
		form: string | null;
		inputEl: HTMLInputElement | undefined;
		/** The input's current value; the chip only shows while it's empty. */
		value: string;
		onFill: (form: string) => void;
	} = $props();

	let visible = $derived(form !== null && form !== '' && value === '');

	async function fill(): Promise<void> {
		if (!form) return;
		onFill(form);
		await tick();
		const el = inputEl;
		if (!el) return;
		el.focus();
		el.setSelectionRange(form.length, form.length);
	}

	// Tab in the empty box copies the form; once there's text, Tab moves focus
	// as usual.
	$effect(() => {
		const el = inputEl;
		if (!el || !visible) return;
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Tab' || e.shiftKey) return;
			e.preventDefault();
			void fill();
		};
		el.addEventListener('keydown', onKeydown);
		return () => el.removeEventListener('keydown', onKeydown);
	});
</script>

{#if visible && form}
	<!-- Out of the tab order: Tab in the box already does this. -->
	<button
		type="button"
		tabindex="-1"
		onclick={() => void fill()}
		title="Start from {form} (Tab)"
		aria-label="Fill in {form}"
		class="absolute left-2.5 top-1/2 inline-flex max-w-[60%] -translate-y-1/2 items-center gap-1.5 rounded-full border border-card-stroke bg-shaded-background px-2.5 py-1 text-sm font-semibold text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default sm:left-3"
	>
		<kbd
			class="hidden rounded border border-card-stroke bg-card-bg px-1 font-sans text-[11px] font-semibold leading-tight sm:inline"
			>Tab</kbd
		>
		<span class="truncate">{form}</span>
	</button>
{/if}
