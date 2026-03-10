<script lang="ts">
	const CZECH_DIACRITICS = [
		'\u00e1',
		'\u010d',
		'\u010f',
		'\u00e9',
		'\u011b',
		'\u00ed',
		'\u0148',
		'\u00f3',
		'\u0159',
		'\u0161',
		'\u0165',
		'\u00fa',
		'\u016f',
		'\u00fd',
		'\u017e'
	];

	let { inputEl }: { inputEl: HTMLInputElement | undefined } = $props();

	function insertChar(char: string) {
		if (!inputEl) return;

		const start = inputEl.selectionStart ?? inputEl.value.length;
		const end = inputEl.selectionEnd ?? start;
		const before = inputEl.value.slice(0, start);
		const after = inputEl.value.slice(end);

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
		const newPos = start + char.length;
		inputEl.setSelectionRange(newPos, newPos);
		inputEl.focus();
	}
</script>

<div
	class="flex flex-wrap justify-center gap-1 sm:gap-0.5"
	role="toolbar"
	aria-label="Czech diacritics helper"
>
	{#each CZECH_DIACRITICS as char, i (char + String(i))}
		<button
			type="button"
			onclick={() => insertChar(char)}
			class="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full border text-sm font-medium transition-all duration-150
				border-slate-200 bg-slate-50 text-slate-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 active:scale-95
				dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-brand-950 dark:hover:text-brand-300 dark:hover:border-brand-500
				sm:h-7 sm:min-w-[1.75rem] sm:text-xs sm:opacity-70 sm:hover:opacity-100"
			aria-label="Insert {char}"
			tabindex="-1"
		>
			{char}
		</button>
	{/each}
</div>
