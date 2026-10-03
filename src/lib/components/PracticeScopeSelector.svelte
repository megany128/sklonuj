<script lang="ts">
	import type { Difficulty } from '$lib/types';

	/**
	 * One choice for what the learner practises from: a CEFR level (free
	 * practice) or a Krok za krokem book (chapter mode). They used to be a
	 * Mode selector plus a Level selector that hid itself in chapter mode,
	 * which made one decision look like two.
	 */
	let {
		level,
		book,
		onLevelSelect,
		onBookSelect
	}: {
		level: Difficulty;
		/** The KzK book in use, or null in free practice. */
		book: 'kzk1' | 'kzk2' | null;
		onLevelSelect: (level: Difficulty) => void;
		onBookSelect: (book: 'kzk1' | 'kzk2') => void;
	} = $props();

	const LEVELS: readonly Difficulty[] = ['A1', 'A2', 'B1', 'B2'];
	const BOOKS: ReadonlyArray<{ value: 'kzk1' | 'kzk2'; label: string; title: string }> = [
		{ value: 'kzk1', label: 'KzK 1', title: 'Krok za krokem 1 — follow the textbook chapters' },
		{ value: 'kzk2', label: 'KzK 2', title: 'Krok za krokem 2 — follow the textbook chapters' }
	];

	const OPTION =
		'rounded-[12px] px-3 py-2.5 text-xs transition-all focus-visible:outline-2 focus-visible:outline-emphasis';
	const ACTIVE = 'bg-shaded-background font-semibold text-text-default';
	const IDLE = 'text-text-subtitle hover:text-text-default';
</script>

<div class="flex items-center gap-2">
	<span
		id="practice-scope-label"
		class="text-xs font-semibold uppercase tracking-[0.15em] text-darker-subtitle">Practice</span
	>
	<div
		role="group"
		aria-labelledby="practice-scope-label"
		class="inline-flex items-center rounded-[16px] border border-card-stroke bg-card-bg p-1"
	>
		{#each LEVELS as lvl (lvl)}
			{@const active = book === null && level === lvl}
			<button
				type="button"
				aria-pressed={active}
				onclick={() => onLevelSelect(lvl)}
				class="{OPTION} {active ? ACTIVE : IDLE}"
			>
				{lvl}
			</button>
		{/each}
		<span class="mx-1 h-5 w-px shrink-0 bg-card-stroke" aria-hidden="true"></span>
		{#each BOOKS as b (b.value)}
			{@const active = book === b.value}
			<button
				type="button"
				aria-pressed={active}
				title={b.title}
				onclick={() => onBookSelect(b.value)}
				class="{OPTION} whitespace-nowrap {active ? ACTIVE : IDLE}"
			>
				{b.label}
			</button>
		{/each}
	</div>
</div>
