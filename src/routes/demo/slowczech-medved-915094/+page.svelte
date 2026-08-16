<script lang="ts">
	import { resolve } from '$app/paths';
	import Headphones from '@lucide/svelte/icons/headphones';
	import { initDarkMode } from '$lib/darkmode';
	import {
		isTTSAvailable,
		loadAudioIndex,
		onCzechVoiceReady,
		speak,
		warmUpVoices
	} from '$lib/audio';
	import posthog from '$lib/posthog';
	import { demoPackage, SLUG } from './content';
	import { buildPackage } from './build-questions';
	import DemoSection, { type SectionProgress } from './DemoSection.svelte';

	const { meta, story } = demoPackage;
	const sections = buildPackage(demoPackage);

	let ttsAvailable = $state(false);
	let initialized = false;

	let activeId = $state<string | null>(sections[0].def.id);
	type View = 'practice' | 'story';
	let view = $state<View>('practice');
	let progress = $state<Record<string, SectionProgress>>(
		Object.fromEntries(
			sections.map((s) => [
				s.def.id,
				{ order: [], position: 0, answered: 0, correct: 0, streak: 0 }
			])
		)
	);
	let activeIndex = $derived(sections.findIndex((s) => s.def.id === activeId));
	let active = $derived(activeIndex >= 0 ? sections[activeIndex] : null);

	function selectSection(id: string): void {
		activeId = id;
		// On phones the drill sits below the tab strip; bring it into view without
		// jumping on desktop where it is already visible.
		document.getElementById('drill-area')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	$effect(() => {
		if (initialized) return;
		initialized = true;
		// This page has no NavBar (which normally owns dark-mode init).
		initDarkMode();
		warmUpVoices();
		void loadAudioIndex().then(() => {
			ttsAvailable = isTTSAvailable();
		});
		ttsAvailable = isTTSAvailable();
		if (!ttsAvailable) {
			onCzechVoiceReady(() => {
				ttsAvailable = true;
			});
		}
		// DrillCard focuses its input on mount, which would scroll past the header
		// on first paint. Reset once; later section switches scroll intentionally.
		requestAnimationFrame(() => window.scrollTo({ top: 0 }));
		// Lightweight "the link was opened" flag (no-op on localhost / without a key).
		posthog.capture('demo_viewed', { demo: SLUG, episode: meta.episode });
	});
</script>

<svelte:head>
	<title>Skloňuj × {meta.partnerName} — {meta.storyTitle}</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="description" content="Prototype: case practice generated from a slowczech story." />
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -- external partner URLs come from content.ts; internal links below still use resolve() -->
<div class="theme-slowczech flex min-h-screen flex-col">
	<!-- Header -->
	<header class="sc-header border-b border-card-stroke bg-card-bg">
		<div
			class="mx-auto flex w-full max-w-[867px] items-center justify-between gap-2 px-3 py-2.5 sm:px-4 lg:max-w-6xl"
		>
			<div class="flex items-center gap-2">
				<a
					href={resolve('/')}
					class="text-base leading-none font-semibold tracking-wide text-emphasis uppercase sm:text-lg"
					>Skloňuj</a
				>
				<span class="text-text-subtitle" aria-hidden="true">×</span>
				<a
					href={meta.partnerUrl}
					target="_blank"
					rel="noopener"
					class="sc-wordmark inline-flex items-center gap-1.5 text-base leading-none font-bold sm:text-lg"
				>
					<!-- slowczech balloon mark (simplified from the official logo) -->
					<svg viewBox="0 0 24 32" class="h-[1.15em] w-auto" aria-hidden="true">
						<path
							d="M12 1.5C6 1.5 1.5 6.2 1.5 12.2c0 4.6 3.4 8.6 6.4 12.4L12 30.5l4.1-5.9c3-3.8 6.4-7.8 6.4-12.4C22.5 6.2 18 1.5 12 1.5z"
							fill="#333"
						/>
						<path
							d="M9.6 4.2C6 5.3 3.7 8.6 3.7 12.2c0 3.6 2.7 7 5.4 10.5l1.4 2C8.5 19 7.6 15.5 7.6 12.2c0-3 .8-5.8 2-8z"
							fill="var(--sc-blue)"
						/>
						<path
							d="M12 3.6c-1.7 1.6-2.7 4.9-2.7 8.6 0 4.6 1.2 9.5 2.7 14.4 1.5-4.9 2.7-9.8 2.7-14.4 0-3.7-1-7-2.7-8.6z"
							fill="var(--sc-red)"
						/>
						<path
							d="M14.4 4.2c1.2 2.2 2 5 2 8 0 3.3-.9 6.8-2.9 12.5l1.4-2c2.7-3.5 5.4-6.9 5.4-10.5 0-3.6-2.3-6.9-5.9-8z"
							fill="var(--sc-cream)"
						/>
					</svg>
					{meta.partnerName}
				</a>
			</div>
			<span
				class="sc-badge rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase"
				>prototype</span
			>
		</div>
	</header>

	<main class="mx-auto w-full max-w-[867px] flex-1 px-3 py-5 sm:px-4 sm:py-8 lg:max-w-6xl">
		<!-- Title -->
		<div class="mb-5 text-center sm:mb-6">
			<h1 class="text-2xl font-semibold text-emphasis sm:text-3xl">
				{meta.title}
				<span class="ml-1 align-middle text-sm font-normal text-text-subtitle">#{meta.episode}</span
				>
			</h1>
			<p class="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-darker-subtitle sm:text-base">
				{meta.subtitle}
			</p>
		</div>

		<!-- Top-level tabs -->
		<div
			class="mb-5 grid w-full grid-cols-2 rounded-full border-2 border-card-stroke bg-card-bg p-1 sm:mb-6"
			role="tablist"
			aria-label="Page sections"
		>
			<button
				type="button"
				role="tab"
				aria-selected={view === 'practice'}
				onclick={() => (view = 'practice')}
				class="rounded-full px-5 py-2.5 text-center text-sm font-semibold transition-colors {view ===
				'practice'
					? 'sc-button text-on-accent'
					: 'text-darker-subtitle hover:text-emphasis'}"
			>
				Practice
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={view === 'story'}
				onclick={() => (view = 'story')}
				class="rounded-full px-5 py-2.5 text-center text-sm font-semibold transition-colors {view ===
				'story'
					? 'sc-button text-on-accent'
					: 'text-darker-subtitle hover:text-emphasis'}"
			>
				<Headphones class="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" />Story
			</button>
		</div>

		{#if view === 'story'}
			<section
				class="rounded-[24px] border-2 border-card-stroke bg-card-bg px-4 py-5 sm:rounded-[32px] sm:px-6 sm:py-6"
				role="tabpanel"
			>
				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0 text-sm text-darker-subtitle">
						<h2 class="text-lg font-semibold text-emphasis sm:text-xl">
							{meta.storyTitle}
							<span class="text-sm font-normal text-darker-subtitle">by {meta.narrator}</span>
						</h2>
						<p class="mt-0.5 text-xs">{meta.partnerName} podcast #{meta.episode}</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<a
							href={meta.sourceUrl}
							target="_blank"
							rel="noopener"
							aria-label="Listen on {meta.partnerName}.com"
							title="Listen on {meta.partnerName}.com"
							class="sc-button flex size-10 items-center justify-center rounded-full text-on-accent transition-opacity hover:opacity-90"
						>
							<Headphones class="size-5" aria-hidden="true" />
						</a>
						<a
							href={meta.spotifyUrl}
							target="_blank"
							rel="noopener"
							aria-label="Open on Spotify"
							title="Open on Spotify"
							class="flex size-10 items-center justify-center rounded-full border-2 border-card-stroke text-emphasis transition-colors hover:bg-shaded-background"
						>
							<svg viewBox="0 0 24 24" class="size-5 fill-current" aria-hidden="true">
								<path
									d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
								/>
							</svg>
						</a>
					</div>
				</div>

				<div
					class="mt-5 space-y-3 border-t border-card-stroke pt-5 text-[15px] leading-relaxed text-text-default"
				>
					{#each story as paragraph, i (i)}
						<p lang="cs">{paragraph}</p>
					{/each}
					<p class="text-xs text-text-subtitle">
						Text and audio © {meta.partnerName} —
						<a href={meta.sourceUrl} target="_blank" rel="noopener" class="sc-link">source</a>.
					</p>
				</div>
			</section>
		{:else}
			<!-- Practice: tab strip on phones, sticky sidebar on desktop; drill always alongside -->
			<div
				class="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-8"
				role="tabpanel"
			>
				<aside class="mb-4 lg:sticky lg:top-6 lg:mb-0">
					<div class="mb-2 flex items-baseline justify-between px-1">
						<h2 class="text-sm font-semibold text-emphasis lg:text-base">Practise a case</h2>
					</div>
					<div
						class="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
						role="tablist"
						aria-label="Drill sections"
					>
						{#each sections as s (s.def.id)}
							{@const isActive = s.def.id === activeId}
							<button
								type="button"
								role="tab"
								aria-selected={isActive}
								onclick={() => selectSection(s.def.id)}
								class="sc-pick flex shrink-0 items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors lg:w-full lg:px-4 lg:py-3 {isActive
									? 'sc-pick-active'
									: 'border-card-stroke bg-card-bg hover:bg-shaded-background'}"
							>
								<span class="text-lg leading-none lg:text-xl" aria-hidden="true">{s.def.emoji}</span
								>
								<span class="flex flex-col leading-tight">
									<span class="text-sm font-semibold whitespace-nowrap text-emphasis"
										>{s.def.label[0]}</span
									>
									<span class="text-xs whitespace-nowrap text-darker-subtitle"
										>{s.def.label[1]}</span
									>
								</span>
							</button>
						{/each}
					</div>
				</aside>

				<div id="drill-area" class="scroll-mt-4">
					{#if active && activeId}
						{#key activeId}
							<DemoSection
								section={active}
								progress={progress[activeId]}
								onSpeak={ttsAvailable ? speak : null}
							/>
						{/key}
					{/if}
				</div>
			</div>
		{/if}
	</main>
</div>

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	/*
	 * slowczech accent, scoped to this route only. Re-binds a handful of the
	 * app's design tokens (Tailwind v4 utilities read them via var()) plus a
	 * few local classes. Palette taken from the slowczech logo (brick red, blue, cream,
	 * charcoal wordmark). Nothing here leaks: the class exists only on this page.
	 */
	:global(.theme-slowczech) {
		--sc-red: #c1524b;
		--sc-red-soft: rgba(193, 82, 75, 0.1);
		--sc-blue: #2a5a8e;
		--sc-blue-soft: rgba(42, 90, 142, 0.08);
		--sc-cream: #f5f0c4;
		--sc-ink: #333333;
		--color-brand-500: #cf6a63;
		--color-brand-600: var(--sc-red);
		--color-brand-700: #a3423c;
	}
	:global(.dark .theme-slowczech) {
		--sc-red: #d9675f;
		--sc-red-soft: rgba(217, 103, 95, 0.16);
		--sc-blue: #7ea3d1;
		--sc-blue-soft: rgba(126, 163, 209, 0.14);
		--sc-cream: #ece6b6;
		--sc-ink: #e8e4dc;
		--color-brand-500: #d9675f;
		--color-brand-600: #cf6a63;
		--color-brand-700: #b8524b;
	}
	:global(.theme-slowczech .sc-header) {
		border-top: 4px solid var(--sc-red);
	}
	:global(.theme-slowczech .sc-wordmark) {
		color: var(--sc-ink);
		letter-spacing: -0.01em;
	}
	:global(.theme-slowczech .sc-badge) {
		background: var(--sc-blue-soft);
		color: var(--sc-blue);
	}
	:global(.theme-slowczech .sc-button) {
		background: var(--sc-red);
	}
	:global(.theme-slowczech .sc-link) {
		color: var(--sc-blue);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	:global(.theme-slowczech .sc-pick-active) {
		border-color: var(--sc-red);
		background: var(--sc-red-soft);
	}
	:global(.theme-slowczech .sc-closing) {
		border-color: var(--sc-blue);
		background: var(--sc-blue-soft);
	}
</style>
