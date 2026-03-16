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

	let visibleDiacritics = $derived.by(() => {
		const lastChar = inputValue.slice(-1).toLowerCase();
		if (!lastChar) return CZECH_DIACRITICS;
		const filtered = CZECH_DIACRITICS.filter((d) => d.base === lastChar);
		return filtered.length > 0 ? filtered : CZECH_DIACRITICS;
	});

	const BASE_LOOKUP = new Map(CZECH_DIACRITICS.map((d) => [d.char, d.base]));

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
	class="flex flex-wrap justify-center gap-4"
	role="toolbar"
	aria-label="Czech diacritics helper"
>
	{#each visibleDiacritics as d (d.char)}
		<button
			type="button"
			onclick={() => insertChar(d.char)}
			class="inline-flex h-[53px] w-[53px] items-center justify-center rounded-full border border-card-stroke text-lg font-normal text-text-subtitle transition-all duration-150 hover:bg-shaded-background hover:text-text-default active:scale-95"
			aria-label="Insert {d.char}"
			tabindex="-1"
		>
			{d.char}
		</button>
	{/each}
</div>
