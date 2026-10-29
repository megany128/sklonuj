<script lang="ts">
	import type { DrillType, ContentMode, WordMode, Difficulty } from '$lib/types';
	import { ALL_DRILL_TYPES, DRILL_TYPE_LABELS } from '$lib/types';
	import type { GatedContent } from '$lib/engine/level-settings';
	import Lock from '@lucide/svelte/icons/lock';

	interface Settings {
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
		contentMode?: ContentMode;
		wordMode?: WordMode;
		includeDemonstratives?: boolean;
	}

	interface LockedContent {
		content: GatedContent;
		unlockLevel: Difficulty;
	}

	let {
		selectedDrillTypes,
		numberMode,
		contentMode = 'nouns' as ContentMode,
		wordMode = 'nouns' as WordMode,
		pronounsUnlocked = false,
		adjectivesUnlocked = false,
		includeDemonstratives = false,
		demonstrativesUnlocked = false,
		lockedContent = [],
		onLockedSelect,
		onSettingsChange,
		hiddenDrillTypes = [],
		hideNumberMode = false,
		hideContent = false,
		hideDrillTypes = false
	}: {
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
		contentMode?: ContentMode;
		wordMode?: WordMode;
		pronounsUnlocked?: boolean;
		adjectivesUnlocked?: boolean;
		includeDemonstratives?: boolean;
		demonstrativesUnlocked?: boolean;
		/**
		 * Content the learner's level hasn't unlocked yet. Shown greyed;
		 * picking one calls onLockedSelect, which offers the unlocking level.
		 */
		lockedContent?: LockedContent[];
		onLockedSelect?: (locked: LockedContent) => void;
		onSettingsChange: (settings: Settings) => void;
		hiddenDrillTypes?: DrillType[];
		hideNumberMode?: boolean;
		/** A deck picks its own words, so the content toggles would do nothing. */
		hideContent?: boolean;
		/** The determiner decks ask only fill-ins, so exercise types would do nothing. */
		hideDrillTypes?: boolean;
	} = $props();

	let visibleDrillTypes = $derived(ALL_DRILL_TYPES.filter((dt) => !hiddenDrillTypes.includes(dt)));

	// --- Content multi-select ---
	// Derive the selected content set from contentMode + wordMode
	let selectedContent = $derived.by(() => {
		// wordMode 'adjectives' means adjectives only, whatever contentMode says
		// (same precedence as enabledContentTypes on the practice page).
		if (wordMode === 'adjectives') return ['adjectives'];
		const items: string[] = [];
		if (contentMode === 'nouns' || contentMode === 'both') items.push('nouns');
		if (contentMode === 'pronouns' || contentMode === 'both') items.push('pronouns');
		if (wordMode === 'both') items.push('adjectives');
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
			wordMode: newWordMode,
			includeDemonstratives
		});
	}

	// Ten, ta, to is an add-on: it mixes ten questions into whatever else is
	// on, so it never counts as the last selected content.
	function toggleDemonstratives() {
		onSettingsChange({
			selectedDrillTypes,
			numberMode,
			contentMode,
			wordMode,
			includeDemonstratives: !includeDemonstratives
		});
	}

	type ContentItem =
		| { value: string; label: string; state: 'unlocked' }
		| { value: string; label: string; state: 'locked'; locked: LockedContent };

	// Every content toggle shows at every level. One the level hasn't unlocked
	// is greyed and offers the level that does; one no level up unlocks either
	// (KzK1 chapters stay nouns-only) is left out.
	let contentItems = $derived.by(() => {
		const all: { value: string; label: string; unlocked: boolean }[] = [
			{ value: 'nouns', label: 'Nouns', unlocked: true },
			{ value: 'pronouns', label: 'Pronouns', unlocked: pronounsUnlocked },
			{ value: 'adjectives', label: 'Adjectives', unlocked: adjectivesUnlocked },
			{ value: 'demonstratives', label: 'Ten, ta, to', unlocked: demonstrativesUnlocked }
		];
		const items: ContentItem[] = [];
		for (const item of all) {
			if (item.unlocked) {
				items.push({ value: item.value, label: item.label, state: 'unlocked' });
				continue;
			}
			const locked = lockedContent.find((l) => l.content === item.value);
			if (locked) items.push({ value: item.value, label: item.label, state: 'locked', locked });
		}
		return items;
	});

	function isPressed(value: string): boolean {
		return value === 'demonstratives' ? includeDemonstratives : selectedContent.includes(value);
	}

	function toggleDrillType(dt: DrillType) {
		const isSelected = selectedDrillTypes.includes(dt);
		if (isSelected && selectedDrillTypes.length <= 1) return;
		const next = isSelected
			? selectedDrillTypes.filter((x) => x !== dt)
			: [...selectedDrillTypes, dt];
		onSettingsChange({
			selectedDrillTypes: next,
			numberMode,
			contentMode,
			wordMode,
			includeDemonstratives
		});
	}

	function setNumberMode(mode: 'sg' | 'pl' | 'both') {
		onSettingsChange({
			selectedDrillTypes,
			numberMode: mode,
			contentMode,
			wordMode,
			includeDemonstratives
		});
	}

	const numberOptions: { value: 'sg' | 'pl' | 'both'; label: string }[] = [
		{ value: 'sg', label: 'Singular' },
		{ value: 'pl', label: 'Plural' },
		{ value: 'both', label: 'Both' }
	];
</script>

<div class="flex flex-col gap-3">
	<!-- Content multi-select -->
	{#if contentItems.length > 1 && !hideContent}
		<div
			class="grid grid-cols-[4.5rem_1fr] items-baseline gap-2"
			role="group"
			aria-label="Content type"
		>
			<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Content</span>
			<div class="flex flex-wrap gap-1.5">
				{#each contentItems as opt (opt.value)}
					{#if opt.state === 'locked'}
						<button
							onclick={() => onLockedSelect?.(opt.locked)}
							title="Unlocks at {opt.locked.unlockLevel}"
							class="flex items-center gap-1 rounded-full border border-dashed border-card-stroke bg-transparent px-2.5 py-1 text-xs text-text-subtitle/70 transition-all hover:border-text-subtitle"
						>
							<Lock class="h-3 w-3 shrink-0" aria-hidden="true" />
							{opt.label}
							<span class="sr-only">(unlocks at {opt.locked.unlockLevel})</span>
						</button>
					{:else}
						{@const active = isPressed(opt.value)}
						<button
							onclick={() =>
								opt.value === 'demonstratives' ? toggleDemonstratives() : toggleContent(opt.value)}
							class="rounded-full border px-2.5 py-1 text-xs transition-all {active
								? 'border-emphasis bg-shaded-background font-semibold text-text-default'
								: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
							aria-pressed={active}
						>
							{opt.label}
						</button>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	<!-- Drill types -->
	{#if !hideDrillTypes}
		<div
			class="grid grid-cols-[4.5rem_1fr] items-baseline gap-2"
			role="group"
			aria-label="Exercise type"
		>
			<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Type</span>
			<div class="flex flex-wrap gap-1.5">
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
	{/if}

	<!-- Number mode (hidden when chapter forces singular only) -->
	{#if !hideNumberMode}
		<div
			class="grid grid-cols-[4.5rem_1fr] items-baseline gap-2"
			role="group"
			aria-label="Grammatical number"
		>
			<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">Number</span>
			<div class="flex flex-wrap gap-1.5">
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
