<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let user = $derived(page.data.user);

	const guides = [
		{
			title: 'The 7 Czech Cases Explained',
			description:
				'A complete guide to all 7 grammatical cases — when to use each one, key prepositions, and example sentences.',
			route: '/resources/czech-cases' as const
		},
		{
			title: 'All Declension Paradigms',
			description:
				'Complete reference for all 14 Czech noun paradigms — from pán to stavení — with full tables, identification tips, and notes.',
			route: '/resources/paradigms' as const
		},
		{
			title: 'Pronoun Declension',
			description:
				'How personal, demonstrative, and possessive pronouns change across all 7 cases.',
			route: '/resources/pronouns' as const
		},
		{
			title: 'Practical Tips for Learning Czech Declension',
			description:
				'Which cases to learn first, how to memorize paradigms, common mistakes to avoid, and effective daily practice strategies.',
			route: '/resources/tips' as const
		}
	];
</script>

<svelte:head>
	<title>Czech Declension Resources — Learn Cases, Patterns & Grammar | Skloňuj</title>
	<meta
		name="description"
		content="Free guides to Czech declension: all 7 cases explained, noun paradigm tables, pronoun charts, and study tips. Everything you need to master Czech grammar."
	/>
	<meta
		name="keywords"
		content="Czech declension guide, Czech cases explained, Czech grammar resources, learn Czech noun cases, Czech declension tables, skloňování, Czech language learning"
	/>
	<link rel="canonical" href="https://sklonuj.com/resources" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com/resources" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com/resources" />
	<meta
		property="og:title"
		content="Czech Declension Resources — Learn Cases, Patterns & Grammar | Skloňuj"
	/>
	<meta
		property="og:description"
		content="Free guides to Czech declension: all 7 cases explained, noun paradigm tables, pronoun charts, and study tips."
	/>
	<meta property="og:url" content="https://sklonuj.com/resources" />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta
		name="twitter:title"
		content="Czech Declension Resources — Learn Cases, Patterns & Grammar | Skloňuj"
	/>
	<meta
		name="twitter:description"
		content="Free guides to Czech declension: all 7 cases explained, noun paradigm tables, pronoun charts, and study tips."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "CollectionPage",
			"name": "Czech Declension Resources",
			"description": "Free guides to Czech declension: all 7 cases explained, noun paradigm tables, pronoun charts, and study tips.",
			"url": "https://sklonuj.com/resources",
			"isPartOf": {
				"@type": "WebSite",
				"name": "Skloňuj",
				"url": "https://sklonuj.com"
			},
			"about": {
				"@type": "Thing",
				"name": "Czech language declension"
			}
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
				}
			]
		}
	</script>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar {user} onSignIn={() => goto(resolve('/auth'))} />

	<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold text-emphasis">Czech Declension Resources</h1>
			<p class="mt-2 text-sm leading-relaxed text-text-subtitle">
				Everything you need to understand and master Czech noun declension — from individual case
				breakdowns to full paradigm tables and study strategies.
			</p>
		</div>

		<!-- Guides -->
		<section class="mb-10">
			<div class="space-y-3">
				{#each guides as guide (guide.title)}
					<a
						href={resolve(guide.route)}
						class="group block rounded-2xl border border-card-stroke bg-card-bg p-5 transition-all hover:border-emphasis/40 hover:shadow-sm"
					>
						<div class="flex items-start justify-between gap-4">
							<div>
								<h3 class="mb-1 text-sm font-semibold text-text-default">{guide.title}</h3>
								<p class="text-xs leading-relaxed text-text-subtitle">
									{guide.description}
								</p>
							</div>
							<ArrowRight
								class="mt-0.5 size-4 shrink-0 text-text-subtitle transition-transform group-hover:translate-x-0.5 group-hover:text-emphasis"
								aria-hidden="true"
							/>
						</div>
					</a>
				{/each}
			</div>
		</section>

		<!-- CTA -->
		<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
			<h2 class="mb-2 text-sm font-semibold text-text-default">Ready to practice?</h2>
			<p class="mb-4 text-xs text-text-subtitle">
				Put your knowledge to the test with interactive declension drills.
			</p>
			<a
				href={resolve('/')}
				class="inline-block rounded-xl bg-emphasis px-5 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
			>
				Start practicing
			</a>
		</div>
	</main>
</div>
