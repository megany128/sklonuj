<script lang="ts">
	interface Props {
		selectedBook: 'kzk1' | 'kzk2' | null;
		onModeChange: (book: 'kzk1' | 'kzk2' | null) => void;
	}

	let { selectedBook, onModeChange }: Props = $props();

	type ModeOption = { value: 'free' | 'kzk1' | 'kzk2'; label: string };
	const modeOptions: ModeOption[] = [
		{ value: 'free', label: 'Free Practice' },
		{ value: 'kzk1', label: 'KzK 1' },
		{ value: 'kzk2', label: 'KzK 2' }
	];

	let activeMode = $derived<'free' | 'kzk1' | 'kzk2'>(selectedBook ?? 'free');

	function handleModeSelect(mode: 'free' | 'kzk1' | 'kzk2') {
		onModeChange(mode === 'free' ? null : mode);
	}
</script>

<div class="flex items-center gap-2">
	<span class="text-xs font-semibold uppercase tracking-[0.15em] text-text-subtitle">Mode</span>
	<div
		role="group"
		aria-label="Practice mode"
		class="inline-flex rounded-[16px] border border-card-stroke bg-card-bg p-1"
	>
		{#each modeOptions as opt (opt.value)}
			<button
				aria-pressed={activeMode === opt.value}
				onclick={() => handleModeSelect(opt.value)}
				class="rounded-[12px] px-3 py-2.5 text-xs transition-all
					{activeMode === opt.value
					? 'bg-shaded-background font-semibold text-text-default'
					: 'text-text-subtitle hover:text-text-default'}"
			>
				{opt.label}
			</button>
		{/each}
	</div>
</div>
