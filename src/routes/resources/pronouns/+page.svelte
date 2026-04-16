<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let user = $derived(page.data.user);

	const personalHeaders = ['Case', 'já', 'ty', 'on', 'ona', 'ono', 'my', 'vy', 'oni'];
	const personalRows = [
		['Nom', 'já', 'ty', 'on', 'ona', 'ono', 'my', 'vy', 'oni'],
		[
			'Gen',
			'mě/mne',
			'tě/tebe',
			'jeho/něho/ho',
			'jí/ní',
			'jeho/něho/ho',
			'nás',
			'vás',
			'jich/nich'
		],
		['Dat', 'mně/mi', 'tobě/ti', 'jemu/němu/mu', 'jí/ní', 'jemu/němu/mu', 'nám', 'vám', 'jim/nim'],
		[
			'Acc',
			'mě/mne',
			'tě/tebe',
			'jeho/něho/ho/jej/něj',
			'ji/ni',
			'je/ně/ho',
			'nás',
			'vás',
			'je/ně'
		],
		['Voc', '\u2014', '\u2014', '\u2014', '\u2014', '\u2014', '\u2014', '\u2014', '\u2014'],
		['Loc', 'mně', 'tobě', 'něm', 'ní', 'něm', 'nás', 'vás', 'nich'],
		['Ins', 'mnou', 'tebou', 'jím/ním', 'jí/ní', 'jím/ním', 'námi', 'vámi', 'jimi/nimi']
	];

	const demonstrativeHeaders = ['Case', 'Masc', 'Fem', 'Neut', 'Pl (M anim)', 'Pl (other)'];
	const demonstrativeRows = [
		['Nom', 'ten', 'ta', 'to', 'ti', 'ty/ta'],
		['Gen', 'toho', 'té', 'toho', 'těch', 'těch'],
		['Dat', 'tomu', 'té', 'tomu', 'těm', 'těm'],
		['Acc', 'toho/ten', 'tu', 'to', 'ty', 'ty/ta'],
		['Voc', '\u2014', '\u2014', '\u2014', '\u2014', '\u2014'],
		['Loc', 'tom', 'té', 'tom', 'těch', 'těch'],
		['Ins', 'tím', 'tou', 'tím', 'těmi', 'těmi']
	];

	// TOC active section tracking
	let activeSection = $state('');

	const tocEntries = [
		{ id: 'personal', label: 'Personal' },
		{ id: 'demonstrative', label: 'Demonstrative' },
		{ id: 'possessive', label: 'Possessive' }
	];

	onMount(() => {
		const sections = document.querySelectorAll('section[id]');
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						activeSection = entry.target.id;
					}
				}
			},
			{ rootMargin: '-20% 0px -60% 0px' }
		);
		sections.forEach((s) => observer.observe(s));
		return () => observer.disconnect();
	});

	const possessiveHeaders = ['Case', 'Masc', 'Fem', 'Neut', 'Pl'];
	const possessiveRows = [
		['Nom', 'můj', 'moje/má', 'moje/mé', 'moji/mí (anim), moje/mé'],
		['Gen', 'mého', 'mojí/mé', 'mého', 'mých'],
		['Dat', 'mému', 'mojí/mé', 'mému', 'mým'],
		['Acc', 'mého/můj', 'moji/mou', 'moje/mé', 'moje/mé'],
		['Loc', 'mém', 'mojí/mé', 'mém', 'mých'],
		['Ins', 'mým', 'mojí/mou', 'mým', 'mými']
	];
</script>

<svelte:head>
	<title>Czech Pronoun Declension — Skloňuj</title>
	<meta
		name="description"
		content="Complete Czech pronoun declension tables: personal, demonstrative, and possessive pronouns across all 7 cases."
	/>
	<meta
		name="keywords"
		content="Czech pronoun declension, Czech personal pronouns, Czech demonstrative pronouns, Czech possessive pronouns, Czech grammar, skloňování zájmen, learn Czech"
	/>
	<link rel="canonical" href="https://sklonuj.com/resources/pronouns" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com/resources/pronouns" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com/resources/pronouns" />
	<meta property="og:title" content="Czech Pronoun Declension — Skloňuj" />
	<meta
		property="og:description"
		content="Complete Czech pronoun declension tables: personal, demonstrative, and possessive pronouns across all 7 cases."
	/>
	<meta property="og:url" content="https://sklonuj.com/resources/pronouns" />
	<meta property="og:type" content="article" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Czech Pronoun Declension — Skloňuj" />
	<meta
		name="twitter:description"
		content="Complete Czech pronoun declension tables: personal, demonstrative, and possessive pronouns across all 7 cases."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "LearningResource",
			"name": "Czech Pronoun Declension",
			"description": "Complete Czech pronoun declension tables: personal, demonstrative, and possessive pronouns across all 7 cases.",
			"url": "https://sklonuj.com/resources/pronouns",
			"inLanguage": "en",
			"educationalLevel": "Beginner",
			"learningResourceType": "Reference",
			"teaches": "Czech pronoun declension across all 7 grammatical cases",
			"datePublished": "2025-01-15",
			"dateModified": "2025-06-01",
			"isPartOf": { "@type": "WebSite", "name": "Skloňuj", "url": "https://sklonuj.com" },
			"about": { "@type": "Thing", "name": "Czech language declension" }
		}
	</script>
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			"itemListElement": [
				{
					"@type": "ListItem",
					"position": 1,
					"name": "Home",
					"item": "https://sklonuj.com"
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": "Resources",
					"item": "https://sklonuj.com/resources"
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": "Pronoun Declension",
					"item": "https://sklonuj.com/resources/pronouns"
				}
			]
		}
	</script>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar {user} onSignIn={() => goto(resolve('/auth'))} />

	<!-- Table of Contents - desktop only -->
	<nav
		class="fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 lg:block"
		aria-label="Table of contents"
	>
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-widest text-darker-subtitle">
			Table of Contents
		</h2>
		<ul class="space-y-2">
			{#each tocEntries as entry (entry.id)}
				<li>
					<a
						href="#{entry.id}"
						onclick={(e) => {
							e.preventDefault();
							document
								.getElementById(entry.id)
								?.scrollIntoView({ behavior: 'smooth', block: 'start' });
						}}
						class="block max-w-40 truncate text-xs transition-colors {activeSection === entry.id
							? 'font-semibold text-emphasis'
							: 'text-darker-subtitle hover:text-text-default'}"
					>
						{entry.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
		<a
			href={resolve('/resources')}
			class="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-darker-subtitle transition-colors hover:text-emphasis"
		>
			<ArrowLeft class="size-4" aria-hidden="true" />
			Back to Resources
		</a>

		<!-- Header -->
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold text-emphasis">Czech Pronoun Declension</h1>
			<p class="mt-2 text-sm leading-relaxed text-darker-subtitle">
				Czech pronouns change their forms across all 7 grammatical cases. This guide covers
				personal, demonstrative, and possessive pronouns with complete declension tables.
			</p>
		</div>

		<!-- Personal Pronouns -->
		<section
			id="personal"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<div class="mb-4">
				<h2 class="text-lg font-semibold text-text-default">Personal Pronouns</h2>
				<p class="mt-1 text-sm text-text-subtitle">
					Personal pronouns replace specific people or things — "I", "you", "he/she/it", "we",
					"they". In Czech, they change form across all 7 cases.
				</p>
			</div>

			<div class="overflow-x-auto rounded-xl">
				<table class="w-full text-left text-xs sm:text-sm">
					<thead>
						<tr>
							{#each personalHeaders as header (header)}
								<th
									class="whitespace-nowrap bg-shaded-background px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-subtitle"
								>
									{header}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each personalRows as row, i (row[0])}
							<tr class={i % 2 === 0 ? '' : 'bg-shaded-background/40'}>
								{#each row as cell, j (j)}
									<td
										class="whitespace-nowrap px-3 py-2 {j === 0
											? 'font-semibold text-text-subtitle'
											: 'text-text-default'}"
									>
										{cell}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<p class="mt-3 text-xs leading-relaxed text-text-subtitle">
				Note: forms with n- (něj, ní, něm, etc.) are used after prepositions.
			</p>
		</section>

		<!-- Demonstrative Pronouns -->
		<section
			id="demonstrative"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<div class="mb-4">
				<h2 class="text-lg font-semibold text-text-default">Demonstrative Pronouns</h2>
				<p class="mt-1 text-sm text-text-subtitle">
					Demonstrative pronouns point to specific things — "this", "that", "these", "those". In
					Czech, ten/ta/to decline by gender, number, and case.
				</p>
			</div>

			<div class="overflow-x-auto rounded-xl">
				<table class="w-full text-left text-xs sm:text-sm">
					<thead>
						<tr>
							{#each demonstrativeHeaders as header (header)}
								<th
									class="whitespace-nowrap bg-shaded-background px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-subtitle"
								>
									{header}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each demonstrativeRows as row, i (row[0])}
							<tr class={i % 2 === 0 ? '' : 'bg-shaded-background/40'}>
								{#each row as cell, j (j)}
									<td
										class="whitespace-nowrap px-3 py-2 {j === 0
											? 'font-semibold text-text-subtitle'
											: 'text-text-default'}"
									>
										{cell}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<!-- Possessive Pronouns -->
		<section
			id="possessive"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<div class="mb-4">
				<h2 class="text-lg font-semibold text-text-default">Possessive Pronouns</h2>
				<p class="mt-1 text-sm text-text-subtitle">
					Possessive pronouns show ownership — "my", "your", "our". They agree with the noun they
					modify in gender, number, and case. The table below uses můj (my) as the model.
				</p>
			</div>

			<div class="overflow-x-auto rounded-xl">
				<table class="w-full text-left text-xs sm:text-sm">
					<thead>
						<tr>
							{#each possessiveHeaders as header (header)}
								<th
									class="whitespace-nowrap bg-shaded-background px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-subtitle"
								>
									{header}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each possessiveRows as row, i (row[0])}
							<tr class={i % 2 === 0 ? '' : 'bg-shaded-background/40'}>
								{#each row as cell, j (j)}
									<td
										class="whitespace-nowrap px-3 py-2 {j === 0
											? 'font-semibold text-text-subtitle'
											: 'text-text-default'}"
									>
										{cell}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<!-- Related Resources -->
		<div class="mt-10 rounded-2xl border border-card-stroke bg-card-bg p-5">
			<h2 class="mb-3 text-sm font-semibold text-text-default">Related Resources</h2>
			<div class="space-y-2">
				<a
					href={resolve('/resources/tips')}
					class="group flex items-center justify-between rounded-xl bg-shaded-background px-4 py-2.5 transition-colors hover:bg-shaded-background/80"
				>
					<div>
						<span class="text-sm font-medium text-text-default"
							>Practical Tips for Learning Czech Declension</span
						>
						<p class="text-xs text-text-subtitle">
							Which cases to learn first, memorization strategies, and common mistakes
						</p>
					</div>
					<ArrowRight
						class="size-4 shrink-0 text-text-subtitle transition-transform group-hover:translate-x-0.5 group-hover:text-emphasis"
						aria-hidden="true"
					/>
				</a>
				<a
					href={resolve('/resources/czech-cases')}
					class="group flex items-center justify-between rounded-xl bg-shaded-background px-4 py-2.5 transition-colors hover:bg-shaded-background/80"
				>
					<div>
						<span class="text-sm font-medium text-text-default">The 7 Czech Cases Explained</span>
						<p class="text-xs text-text-subtitle">
							When to use each case, with examples and prepositions
						</p>
					</div>
					<ArrowRight
						class="size-4 shrink-0 text-text-subtitle transition-transform group-hover:translate-x-0.5 group-hover:text-emphasis"
						aria-hidden="true"
					/>
				</a>
				<a
					href={resolve('/resources/paradigms')}
					class="group flex items-center justify-between rounded-xl bg-shaded-background px-4 py-2.5 transition-colors hover:bg-shaded-background/80"
				>
					<div>
						<span class="text-sm font-medium text-text-default">All Declension Paradigms</span>
						<p class="text-xs text-text-subtitle">Full tables for all 14 noun paradigms</p>
					</div>
					<ArrowRight
						class="size-4 shrink-0 text-text-subtitle transition-transform group-hover:translate-x-0.5 group-hover:text-emphasis"
						aria-hidden="true"
					/>
				</a>
				<a
					href={resolve('/')}
					class="group flex items-center justify-between rounded-xl bg-shaded-background px-4 py-2.5 transition-colors hover:bg-shaded-background/80"
				>
					<div>
						<span class="text-sm font-medium text-text-default">Practice Czech Declension</span>
						<p class="text-xs text-text-subtitle">Interactive drills to test your knowledge</p>
					</div>
					<ArrowRight
						class="size-4 shrink-0 text-text-subtitle transition-transform group-hover:translate-x-0.5 group-hover:text-emphasis"
						aria-hidden="true"
					/>
				</a>
			</div>
		</div>

		<!-- Back link -->
		<div class="mt-6 text-center">
			<a
				href={resolve('/resources')}
				class="text-sm font-medium text-darker-subtitle transition-colors hover:text-text-default"
			>
				&larr; Back to Resources
			</a>
		</div>
	</main>
</div>
