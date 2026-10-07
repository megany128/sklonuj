<script lang="ts">
	const CZECH_DIACRITICS: Array<{ char: string; base: string }> = [
		{ char: '\u00e1', base: 'a' },
		{ char: '\u010d', base: 'c' },
		{ char: '\u010f', base: 'd' },
		{ char: '\u00e9', base: 'e' },
		{ char: '\u011b', base: 'e' },
		{ char: '\u00ed', base: 'i' },
		{ char: '\u0148', base: 'n' },
		{ char: '\u00f3', base: 'o' },
		{ char: '\u0159', base: 'r' },
		{ char: '\u0161', base: 's' },
		{ char: '\u0165', base: 't' },
		{ char: '\u00fa', base: 'u' },
		{ char: '\u016f', base: 'u' },
		{ char: '\u00fd', base: 'y' },
		{ char: '\u017e', base: 'z' }
	];

	let { inputEl, inputValue = '' }: { inputEl: HTMLInputElement | undefined; inputValue?: string } =
		$props();

	const BASE_LOOKUP = new Map(CZECH_DIACRITICS.map((d) => [d.char, d.base]));

	/** Caret position in the input; null means "end of the value". */
	let caret: number | null = $state(null);

	// Follow the caret, so moving back to a letter (arrow keys, a click) offers
	// that letter's accents. Inputs don't fire selectionchange everywhere, so
	// watch the document's and read the input's caret while it has focus.
	$effect(() => {
		const el = inputEl;
		if (!el) return;
		const update = () => {
			if (document.activeElement === el) caret = el.selectionStart;
		};
		document.addEventListener('selectionchange', update);
		el.addEventListener('input', update);
		return () => {
			document.removeEventListener('selectionchange', update);
			el.removeEventListener('input', update);
		};
	});

	/** The letter before the caret, or its base if it already has an accent (č → c). */
	let highlightedBases = $derived.by(() => {
		const end = caret === null ? inputValue.length : Math.min(caret, inputValue.length);
		const prev = inputValue.slice(end - 1, end).toLowerCase();
		if (!prev) return null;
		const base = BASE_LOOKUP.get(prev) ?? prev;
		return CZECH_DIACRITICS.some((d) => d.base === base) ? base : null;
	});

	function insertChar(char: string) {
		if (!inputEl) return;

		const start = inputEl.selectionStart ?? inputEl.value.length;
		const end = inputEl.selectionEnd ?? start;
		let before = inputEl.value.slice(0, start);
		const after = inputEl.value.slice(end);

		// If the character right before the cursor is the base letter (or another
		// diacritic variant of the same base), replace it instead of inserting
		const base = BASE_LOOKUP.get(char);
		if (base && before.length > 0) {
			const prev = before.slice(-1).toLowerCase();
			const prevBase = BASE_LOOKUP.get(prev) ?? prev;
			if (prevBase === base) {
				before = before.slice(0, -1);
			}
		}

		// Update the input value via native setter to trigger Svelte reactivity
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			'value'
		)?.set;
		if (nativeInputValueSetter) {
			nativeInputValueSetter.call(inputEl, before + char + after);
		} else {
			inputEl.value = before + char + after;
		}

		// Dispatch input event so Svelte picks up the change
		inputEl.dispatchEvent(new Event('input', { bubbles: true }));

		// Restore cursor position after the inserted character
		const newPos = before.length + char.length;
		inputEl.setSelectionRange(newPos, newPos);
		inputEl.focus();
	}
</script>

<div
	class="flex w-full flex-wrap justify-center gap-1 py-1.5 sm:gap-1.5"
	role="toolbar"
	aria-label="Czech diacritics helper"
>
	{#each CZECH_DIACRITICS as d (d.char)}
		{@const isHighlighted = highlightedBases === null || d.base === highlightedBases}
		<button
			type="button"
			onclick={() => insertChar(d.char)}
			class="inline-flex size-9 cursor-pointer items-center justify-center rounded-full border text-sm font-normal transition-all duration-150 active:scale-95 sm:size-10 sm:text-base {isHighlighted
				? 'border-card-stroke text-text-subtitle hover:bg-shaded-background hover:text-text-default'
				: 'border-transparent text-text-subtitle/30'}"
			aria-label="Insert {d.char}"
		>
			{d.char}
		</button>
	{/each}
</div>
