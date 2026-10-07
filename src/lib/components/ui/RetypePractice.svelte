<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import DiacriticsBar from '../DiacriticsBar.svelte';
	import { stripDiacritics } from '$lib/utils/diacritics';

	/**
	 * Optional "type it once" box under a missed answer. Producing the form
	 * right after seeing it sticks better than reading it. Enter on an empty
	 * box (or once it's typed right) moves on, so it never blocks the flow.
	 */
	let {
		accepted,
		canAdvance,
		onAdvance
	}: {
		/** Forms that count (case-insensitive). Missing accents also count, as
		 * in the main answer box, with a reminder to mind them. */
		accepted: string[];
		/** False until the key that submitted the answer is released. */
		canAdvance: boolean;
		onAdvance: () => void;
	} = $props();

	let value = $state('');
	let done = $state(false);
	/** Accepted with the right letters but some accents missing or wrong. */
	let accentsOff = $state(false);
	let shaking = $state(false);
	let inputEl: HTMLInputElement | undefined = $state(undefined);

	function normalize(s: string): string {
		return s.trim().toLowerCase().normalize('NFC');
	}

	let targets = $derived(new Set(accepted.map(normalize)));
	let bareTargets = $derived(new Set(accepted.map((a) => stripDiacritics(normalize(a)))));

	$effect(() => {
		const el = inputEl;
		if (!el) return;
		const frame = requestAnimationFrame(() => el.focus({ preventScroll: true }));
		return () => cancelAnimationFrame(frame);
	});

	function check(): void {
		if (done || value.trim() === '') {
			if (canAdvance) onAdvance();
			return;
		}
		if (targets.has(normalize(value))) {
			done = true;
			return;
		}
		if (bareTargets.has(stripDiacritics(normalize(value)))) {
			done = true;
			accentsOff = true;
			return;
		}
		// Restart the shake even if the last one is still running.
		shaking = false;
		requestAnimationFrame(() => (shaking = true));
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (e.repeat) return;
		check();
	}

	function handleSubmit(e: SubmitEvent): void {
		e.preventDefault();
		check();
	}
</script>

<form onsubmit={handleSubmit} novalidate class="flex w-full flex-col items-center gap-2">
	<label for="retype-answer" class="text-xs font-semibold text-darker-subtitle">
		{done
			? accentsOff
				? `Right letters — mind the accents: ${accepted[0]}`
				: "That's right"
			: 'Practice: type the correct form'}
	</label>
	<div class="flex w-full max-w-xs items-stretch gap-2">
		<input
			id="retype-answer"
			bind:this={inputEl}
			bind:value
			onkeydown={handleKeydown}
			onanimationend={() => (shaking = false)}
			readonly={done}
			type="text"
			autocomplete="off"
			autocorrect="off"
			autocapitalize="off"
			spellcheck="false"
			enterkeyhint={done ? 'next' : 'done'}
			class="min-w-0 flex-1 rounded-[14px] border-2 px-3 py-2 text-center text-base font-semibold outline-none transition-colors {done
				? 'border-positive-stroke bg-positive-background text-positive-stroke'
				: shaking
					? 'feedback-shake border-negative-stroke bg-card-bg text-emphasis'
					: 'border-card-stroke bg-card-bg text-emphasis focus:border-emphasis'}"
		/>
		<button
			type="submit"
			aria-label={done ? 'Continue' : 'Check'}
			class="flex shrink-0 items-center justify-center rounded-[14px] border-2 px-3 text-sm font-semibold transition-opacity hover:opacity-90 {done
				? 'border-positive-stroke bg-positive-stroke text-white'
				: 'border-card-stroke bg-card-bg text-darker-subtitle'}"
		>
			{#if done}<Check class="size-4" aria-hidden="true" />{:else}Check{/if}
		</button>
	</div>
	{#if !done}
		<div class="w-full">
			<DiacriticsBar {inputEl} inputValue={value} />
		</div>
	{/if}
</form>
