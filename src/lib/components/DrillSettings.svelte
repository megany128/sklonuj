<script lang="ts">
	import type { DrillType, ContentMode, WordMode } from '$lib/types';
	import { ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';

	let {
		selectedDrillTypes,
		numberMode,
		contentMode = 'nouns' as ContentMode,
		wordMode = 'nouns' as WordMode,
		pronounsUnlocked = false,
		adjectivesUnlocked = false,
		onSettingsChange,
		hiddenDrillTypes = [],
		hideNumberMode = false
	}: {
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
		contentMode?: ContentMode;
		wordMode?: WordMode;
		pronounsUnlocked?: boolean;
		adjectivesUnlocked?: boolean;
		onSettingsChange: (settings: {
			selectedDrillTypes: DrillType[];
			numberMode: 'sg' | 'pl' | 'both';
			contentMode?: ContentMode;
			wordMode?: WordMode;
		}) => void;
		hiddenDrillTypes?: DrillType[];
		hideNumberMode?: boolean;
	} = $props();

	let visibleDrillTypes = $derived(ALL_DRILL_TYPES.filter((dt) => !hiddenDrillTypes.includes(dt)));

	// --- Content multi-select ---
	// Derive the selected content set from contentMode + wordMode
	let selectedContent = $derived.by(() => {
		const items: string[] = [];
		if (contentMode === 'nouns' || contentMode === 'both') items.push('nouns');
		if (contentMode === 'pronouns' || contentMode === 'both') items.push('pronouns');
		if (wordMode === 'adjectives' || wordMode === 'both') items.push('adjectives');
		// If nothing selected (e.g. wordMode='nouns' and contentMode='nouns'), ensure nouns is there
		if (items.length === 0) items.push('nouns');
		return items;
	});

	function toggleContent(item: string) {
		const isSelected = selectedContent.includes(item);
		if (isSelected && selectedContent.length <= 1) return; // can't deselect last
		const next = isSelected
			? selectedContent.filter((x) => x !== item)
			: [...selectedContent, item];

		// Derive contentMode and wordMode from the selection
		const hasNouns = next.includes('nouns');
		const hasPronouns = next.includes('pronouns');
		const hasAdjectives = next.includes('adjectives');

		const newContentMode: ContentMode =
			hasNouns && hasPronouns ? 'both' : hasPronouns ? 'pronouns' : 'nouns';
		const newWordMode: WordMode = hasAdjectives
			? hasNouns || hasPronouns
				? 'both'
				: 'adjectives'
			: 'nouns';

		onSettingsChange({
			selectedDrillTypes,
			numberMode,
			contentMode: newContentMode,
			wordMode: newWordMode
		});
	}

	let contentItems = $derived.by(() => {
		const items: { value: string; label: string }[] = [{ value: 'nouns', label: 'Nouns' }];
		if (pronounsUnlocked) {
			items.push({ value: 'pronouns', label: 'Pronouns' });
		}
		if (adjectivesUnlocked) {
			items.push({ value: 'adjectives', label: 'Adjectives' });
		}
		return items;
	});

	function toggleDrillType(dt: DrillType) {
		const isSelected = selectedDrillTypes.includes(dt);
		if (isSelected && selectedDrillTypes.length <= 1) return;
		const next = isSelected
			? selectedDrillTypes.filter((x) => x !== dt)
			: [...selectedDrillTypes, dt];
		onSettingsChange({ selectedDrillTypes: next, numberMode, contentMode, wordMode });
	}

	function setNumberMode(mode: 'sg' | 'pl' | 'both') {
		onSettingsChange({ selectedDrillTypes, numberMode: mode, contentMode, wordMode });
	}

	const numberOptions: { value: 'sg' | 'pl' | 'both'; label: string }[] = [
		{ value: 'sg', label: 'Singular' },
		{ value: 'pl', label: 'Plural' },
		{ value: 'both', label: 'Both' }
	];
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
	<!-- Content multi-select (only shown when more than just nouns available) -->
	{#if pronounsUnlocked || adjectivesUnlocked}
		<div class="flex items-center gap-2" role="group" aria-label="Content type">
			<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Content</span>
			<div class="flex gap-1.5">
				{#each contentItems as opt (opt.value)}
					{@const active = selectedContent.includes(opt.value)}
					<button
						onclick={() => toggleContent(opt.value)}
						class="rounded-full border px-2.5 py-1 text-xs transition-all {active
							? 'border-emphasis bg-shaded-background font-semibold text-text-default'
							: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
						aria-pressed={active}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Drill types -->
	<div class="flex items-center gap-2" role="group" aria-label="Exercise type">
		<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Type</span>
		<div class="flex gap-1.5">
			{#each visibleDrillTypes as dt (dt)}
				{@const active = selectedDrillTypes.includes(dt)}
				<button
					onclick={() => toggleDrillType(dt)}
					class="rounded-full border px-2.5 py-1 text-xs transition-all {active
						? 'border-emphasis bg-shaded-background font-semibold text-text-default'
						: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
					aria-pressed={active}
				>
					{DRILL_TYPE_LABELS[dt]}
				</button>
			{/each}
		</div>
	</div>

	<!-- Number mode (hidden when chapter forces singular only) -->
	{#if !hideNumberMode}
		<div class="flex items-center gap-2" role="group" aria-label="Grammatical number">
			<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Number</span>
			<div class="flex gap-1.5">
				{#each numberOptions as opt (opt.value)}
					<button
						onclick={() => setNumberMode(opt.value)}
						aria-pressed={numberMode === opt.value}
						class="rounded-full border px-2.5 py-1 text-xs transition-all {numberMode === opt.value
							? 'border-emphasis bg-shaded-background font-semibold text-text-default'
							: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
