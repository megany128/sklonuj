<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import { CASE_HEX, CASE_LABELS, type Difficulty } from '$lib/types';
	import { progress } from '$lib/engine/progress';
	import { loadTemplates } from '$lib/engine/drill';
	import { determinerSentenceTemplates } from '$lib/engine/determiners';
	import { deckQuery, grammarDecks, paradigmDecks, sentenceCountLabel } from '$lib/engine/decks';
	import {
		deckAccuracy,
		deckProgress as savedDeckProgress,
		type DeckProgress
	} from '$lib/engine/deck-progress';
	import { PARADIGM_KIND } from '$lib/utils/filter-paradigm-note';

	let user = $derived(page.data.user);

	// Level and progress live on the device, so the server renders the A1 view
	// with no progress and the browser fills in the learner's own after mount.
	let level: Difficulty = $state('A1');
	let deckProgress: DeckProgress = $state({});
	let paradigmScores = $state<Record<string, { attempts: number; correct: number }>>({});
	let mounted = $state(false);

	$effect(() => {
		level = $progress.level;
		paradigmScores = $progress.paradigmScores;
		// The store, so a sync or another tab's answers show up while the page is open.
		deckProgress = $savedDeckProgress;
		mounted = true;
	});

	// Every deck's sentences: tagged noun sentences plus the determiner deck's own.
	const deckTemplates = [...loadTemplates(), ...determinerSentenceTemplates()];
	let topics = $derived(grammarDecks(level, deckTemplates, deckProgress));
	let patterns = $derived(paradigmDecks(paradigmScores));

	function percent(correct: number, attempts: number): number {
		return attempts === 0 ? 0 : Math.round((correct / attempts) * 100);
	}
</script>

<svelte:head>
	<title>Decks — Practise One Czech Grammar Topic at a Time | Skloňuj</title>
	<meta
		name="description"
		content="Czech declension decks: Kam? Kde? Odkud?, verbs that decide the case, and all 14 noun patterns. Pick one topic and practise just that."
	/>
	<link rel="canonical" href="https://sklonuj.com/decks" />
	<meta
		property="og:title"
		content="Decks — Practise One Czech Grammar Topic at a Time | Skloňuj"
	/>
	<meta
		property="og:description"
		content="Czech declension decks: Kam? Kde? Odkud?, verbs that decide the case, and all 14 noun patterns."
	/>
	<meta property="og:url" content="https://sklonuj.com/decks" />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar {user} onSignIn={() => goto(resolve('/auth'))} />

	<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
		<h1 class="mb-8 text-2xl font-semibold text-emphasis">Decks</h1>

		<section class="mb-10" aria-labelledby="decks-topics">
			<h2
				id="decks-topics"
				class="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-darker-subtitle"
			>
				Grammar topics
			</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each topics as deck (deck.def.id)}
					{@const accuracy = mounted ? deckAccuracy(deck.stat) : null}
					{@const started = accuracy !== null}
					<article
						class="flex flex-col gap-2.5 rounded-[20px] border-2 border-card-stroke bg-card-bg p-4"
						data-testid="deck-{deck.def.slug}"
					>
						<h3 class="text-base font-semibold leading-tight text-emphasis">{deck.def.label}</h3>
						<p class="text-sm leading-snug text-text-default">{deck.def.blurb}</p>
						<div class="flex flex-wrap items-center gap-2 text-xs text-text-subtitle">
							<span class="rounded-full border border-card-stroke px-2 font-semibold"
								>{deck.def.unlockLevel}+</span
							>
							<span
								class="inline-flex gap-1"
								role="img"
								aria-label="Cases: {deck.cases.map((c) => CASE_LABELS[c]).join(', ')}"
							>
								{#each deck.cases as c (c)}
									<span
										class="size-2.5 rounded-full"
										style="background-color: {CASE_HEX[c]}"
										title={CASE_LABELS[c]}
									></span>
								{/each}
							</span>
							<span>{sentenceCountLabel(deck, level)}</span>
						</div>
						<div
							class="h-1.5 overflow-hidden rounded-full bg-shaded-background"
							role="progressbar"
							aria-label="{deck.def.label}: answers right"
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={accuracy ?? 0}
						>
							<div
								class="h-full rounded-full bg-positive-stroke"
								style="width: {accuracy ?? 0}%"
							></div>
						</div>
						<div class="mt-auto flex items-center justify-between gap-2">
							<span class="text-xs text-text-subtitle">
								{#if !deck.unlocked}
									Opens at {deck.def.unlockLevel}
								{:else if started && deck.stat}
									{accuracy}% right &middot; {deck.stat.attempts} answered
								{:else}
									Not started
								{/if}
							</span>
							{#if deck.unlocked}
								<a
									href="{resolve('/')}{deckQuery(deck.def.id)}"
									class="rounded-full border-2 border-emphasis bg-emphasis px-4 py-1 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
								>
									{started ? 'Continue' : 'Start'}
								</a>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		</section>

		<section aria-labelledby="decks-patterns">
			<h2
				id="decks-patterns"
				class="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-darker-subtitle"
			>
				Word patterns
			</h2>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{#each patterns as deck (deck.paradigm)}
					{@const answered = mounted ? deck.attempts : 0}
					<a
						href="{resolve('/')}?selectParadigm={deck.paradigm}"
						class="flex flex-col gap-1 rounded-2xl border-2 border-card-stroke bg-card-bg px-3.5 py-3 transition-colors hover:border-emphasis/40"
						data-testid="pattern-{deck.paradigm}"
					>
						<span class="text-base font-semibold text-emphasis">{deck.paradigm}</span>
						<span class="text-xs leading-snug text-text-default"
							>{PARADIGM_KIND[deck.paradigm]}</span
						>
						<span class="mt-1 text-xs text-text-subtitle">
							{#if answered > 0}
								{percent(deck.correct, deck.attempts)}% right &middot; {answered} answered
							{:else}
								Not started
							{/if}
						</span>
					</a>
				{/each}
			</div>
		</section>
	</main>
</div>
