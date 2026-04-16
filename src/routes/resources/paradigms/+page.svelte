<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Star from '@lucide/svelte/icons/star';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import { loadWordBank } from '$lib/engine/drill';
	import dictionaryData from '$lib/data/dictionary.json';
	import { CASE_LABELS, CASE_INDEX, CASE_NUMBER } from '$lib/types';
	import type { Case, CaseForms } from '$lib/types';

	let user = $derived(page.data.user);

	interface Paradigm {
		id: string;
		title: string;
		subtitle: string;
		model: string;
		gender: 'masculine' | 'feminine' | 'neuter';
		singular: string[];
		plural: string[];
		howToIdentify: string;
		examples: string[];
		notes?: string;
	}

	// TOC active section tracking
	let activeSection = $state('');
	let expandedGenders = $state<Set<string>>(new Set());

	function toggleGender(id: string) {
		expandedGenders = expandedGenders.has(id) ? new Set() : new Set([id]);
	}

	onMount(() => {
		const paramSection = page.url.searchParams.get('paradigm');
		if (paramSection) {
			const el = document.getElementById(paramSection.toLowerCase());
			if (el) {
				el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		}

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

	const genderColors = {
		masculine: { bg: 'bg-case-gen', text: 'text-case-gen' },
		feminine: { bg: 'bg-case-loc', text: 'text-case-loc' },
		neuter: { bg: 'bg-case-dat', text: 'text-case-dat' }
	};

	const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

	/** Currently selected example word per paradigm, keyed by paradigm id. */
	let selectedExample = $state<Record<string, string>>({});

	/** Split a form (possibly with " / " variants) into stem+ending+suffix segments. */
	function splitFormParts(
		form: string,
		stem: string
	): Array<{ stem: string; ending: string; suffix: string; separator: boolean }> {
		if (!stem || !form) return [{ stem: form, ending: '', suffix: '', separator: false }];
		const variants = form.split('/').map((v) => v.trim());
		const parts: Array<{ stem: string; ending: string; suffix: string; separator: boolean }> = [];
		for (let i = 0; i < variants.length; i++) {
			if (i > 0) parts.push({ stem: '', ending: '', suffix: '', separator: true });
			const v = variants[i];
			const hasExcl = v.endsWith('!');
			const clean = hasExcl ? v.slice(0, -1) : v;
			const suffix = hasExcl ? '!' : '';
			if (clean.startsWith(stem)) {
				parts.push({ stem, ending: clean.slice(stem.length), suffix, separator: false });
			} else {
				parts.push({ stem: clean, ending: '', suffix, separator: false });
			}
		}
		return parts;
	}

	/** Compute the longest common prefix (stem) from an array of forms. */
	function computeStem(forms: string[]): string {
		const normalized = forms
			.flatMap((f) => f.replace(/!/g, '').split('/'))
			.map((f) => f.trim())
			.filter((f) => f !== '');
		if (normalized.length === 0) return '';
		let prefix = normalized[0];
		for (let i = 1; i < normalized.length; i++) {
			while (!normalized[i].startsWith(prefix) && prefix.length > 0) {
				prefix = prefix.slice(0, -1);
			}
			if (prefix.length === 0) return '';
		}
		return prefix;
	}

	function lookupExampleForms(lemma: string): { sg: CaseForms; pl: CaseForms } | null {
		const wordBank = loadWordBank();
		const wb = wordBank.find((w) => w.lemma.toLowerCase() === lemma.toLowerCase());
		if (wb) return { sg: wb.forms.sg, pl: wb.forms.pl };

		for (const raw of dictionaryData) {
			if (String(raw[0]).toLowerCase() === lemma.toLowerCase()) {
				const sgRaw = raw[2];
				const plRaw = raw[3];
				if (!Array.isArray(sgRaw) || !Array.isArray(plRaw)) continue;
				return {
					sg: [
						String(sgRaw[0]),
						String(sgRaw[1]),
						String(sgRaw[2]),
						String(sgRaw[3]),
						String(sgRaw[4]),
						String(sgRaw[5]),
						String(sgRaw[6])
					] satisfies CaseForms,
					pl: [
						String(plRaw[0]),
						String(plRaw[1]),
						String(plRaw[2]),
						String(plRaw[3]),
						String(plRaw[4]),
						String(plRaw[5]),
						String(plRaw[6])
					] satisfies CaseForms
				};
			}
		}
		return null;
	}

	const paradigms: Paradigm[] = [
		// MASCULINE ANIMATE
		{
			id: 'pán',
			title: 'pán',
			subtitle: 'Hard Masculine Animate',
			model: 'pán',
			gender: 'masculine',
			singular: ['pán', 'pána', 'pánovi / pánu', 'pána', 'pane!', 'pánovi / pánu', 'pánem'],
			plural: ['páni / pánové', 'pánů', 'pánům', 'pány', 'páni / pánové!', 'pánech', 'pány'],
			howToIdentify:
				'Masculine animate nouns ending in a hard consonant (d, h, k, n, r, t…). The nominative singular has a zero ending (bare stem).',
			examples: ['student', 'bratr', 'chlapec', 'soused'],
			notes:
				'Vocative singular takes -e, with r softening to ř (bratr→bratře). After velars k, g, h, ch, the ending is -u instead (žák→žáku, kluk→kluku, biolog→biologu) — člověk→člověče is the main exception. Accusative singular always matches genitive for animate nouns.'
		},
		{
			id: 'muž',
			title: 'muž',
			subtitle: 'Soft Masculine Animate',
			model: 'muž',
			gender: 'masculine',
			singular: ['muž', 'muže', 'muži / mužovi', 'muže', 'muži!', 'muži / mužovi', 'mužem'],
			plural: ['muži / mužové', 'mužů', 'mužům', 'muže', 'muži / mužové!', 'mužích', 'muži'],
			howToIdentify:
				'Masculine animate nouns ending in a soft consonant (ž, š, č, ř, c, j, ň, ď, ť) or -tel, -ec.',
			examples: ['učitel', 'lékař', 'rodič', 'otec'],
			notes:
				'The soft paradigm uses -e/-i endings instead of -a/-u. Locative plural takes -ích (not -ech like hard stems).'
		},
		{
			id: 'předseda',
			title: 'předseda',
			subtitle: 'Masculine Animate ending in -a',
			model: 'předseda',
			gender: 'masculine',
			singular: [
				'předseda',
				'předsedy',
				'předsedovi',
				'předsedu',
				'předsedo!',
				'předsedovi',
				'předsedou'
			],
			plural: [
				'předsedové',
				'předsedů',
				'předsedům',
				'předsedy',
				'předsedové!',
				'předsedech',
				'předsedy'
			],
			howToIdentify:
				'Masculine animate nouns that end in -a in nominative singular. These look feminine but refer to male persons.',
			examples: ['táta', 'kolega', 'policista', 'turista'],
			notes:
				'Despite the -a ending, these are grammatically masculine. Adjectives and verbs agree in masculine form: "dobrý kolega", not "dobrá kolega".'
		},
		{
			id: 'soudce',
			title: 'soudce',
			subtitle: 'Masculine Animate ending in -e',
			model: 'soudce',
			gender: 'masculine',
			singular: [
				'soudce',
				'soudce',
				'soudci / soudcovi',
				'soudce',
				'soudce!',
				'soudci / soudcovi',
				'soudcem'
			],
			plural: [
				'soudci / soudcové',
				'soudců',
				'soudcům',
				'soudce',
				'soudci / soudcové!',
				'soudcích',
				'soudci'
			],
			howToIdentify:
				'Masculine animate nouns ending in -ce or -e that denote male persons. A small but important group.',
			examples: ['správce', 'vůdce'],
			notes:
				'Nominative, genitive, accusative, and vocative singular are all identical ("soudce"), so context is crucial.'
		},
		// MASCULINE INANIMATE
		{
			id: 'hrad',
			title: 'hrad',
			subtitle: 'Hard Masculine Inanimate',
			model: 'hrad',
			gender: 'masculine',
			singular: ['hrad', 'hradu', 'hradu', 'hrad', 'hrade!', 'hradě / hradu', 'hradem'],
			plural: ['hrady', 'hradů', 'hradům', 'hrady', 'hrady!', 'hradech', 'hrady'],
			howToIdentify:
				'Masculine inanimate nouns ending in a hard consonant. The key difference from "pán": accusative singular equals nominative (not genitive).',
			examples: ['sešit', 'obchod', 'oběd', 'vlak'],
			notes:
				'Locative singular can take -ě or -u — some nouns prefer one or the other. Consonant changes occur before -ě: d→ď, t→ť, n→ň, h→z, k→c, r→ř.'
		},
		{
			id: 'stroj',
			title: 'stroj',
			subtitle: 'Soft Masculine Inanimate',
			model: 'stroj',
			gender: 'masculine',
			singular: ['stroj', 'stroje', 'stroji', 'stroj', 'stroji!', 'stroji', 'strojem'],
			plural: ['stroje', 'strojů', 'strojům', 'stroje', 'stroje!', 'strojích', 'stroji'],
			howToIdentify:
				'Masculine inanimate nouns ending in a soft consonant (ž, š, č, ř, c, j) or sometimes -l.',
			examples: ['počítač', 'čaj', 'konec', 'cíl'],
			notes:
				'Dative, vocative, and locative singular are all identical (-i). Instrumental plural is -i (not -y like hard stems).'
		},
		// FEMININE
		{
			id: 'žena',
			title: 'žena',
			subtitle: 'Feminine ending in -a (hard)',
			model: 'žena',
			gender: 'feminine',
			singular: ['žena', 'ženy', 'ženě', 'ženu', 'ženo!', 'ženě', 'ženou'],
			plural: ['ženy', 'žen', 'ženám', 'ženy', 'ženy!', 'ženách', 'ženami'],
			howToIdentify:
				'Feminine nouns ending in -a after a hard consonant. The most common feminine paradigm.',
			examples: ['matka', 'dcera', 'sestra', 'škola'],
			notes:
				'Dative and locative singular are identical (-ě). Consonant changes before -ě: k→c (matka→matce), h→z, r→ř, d→ď, t→ť, n→ň.'
		},
		{
			id: 'růže',
			title: 'růže',
			subtitle: 'Feminine ending in -e (soft)',
			model: 'růže',
			gender: 'feminine',
			singular: ['růže', 'růže', 'růži', 'růži', 'růže!', 'růži', 'růží'],
			plural: ['růže', 'růží', 'růžím', 'růže', 'růže!', 'růžích', 'růžemi'],
			howToIdentify:
				'Feminine nouns ending in -e, -ě, or a soft consonant + e. Also includes nouns ending in -ice, -ance, -ence.',
			examples: ['restaurace', 'ulice', 'vesnice', 'přítelkyně'],
			notes:
				'Many forms look the same (nominative = genitive = vocative singular). Context and prepositions are key to telling cases apart.'
		},
		{
			id: 'píseň',
			title: 'píseň',
			subtitle: 'Feminine ending in soft consonant',
			model: 'píseň',
			gender: 'feminine',
			singular: ['píseň', 'písně', 'písni', 'píseň', 'písni!', 'písni', 'písní'],
			plural: ['písně', 'písní', 'písním', 'písně', 'písně!', 'písních', 'písněmi'],
			howToIdentify:
				'Feminine nouns ending in a soft consonant (-ň, -ď, -ť, -ř, -j) — typically with -eň, -áň, -seň.',
			examples: ['daň', 'dlaň', 'báseň', 'zeď'],
			notes:
				'Accusative singular equals nominative (unlike žena-type). The -ň/-ď/-ť may lose its háček before -e: píseň→písně.'
		},
		{
			id: 'kost',
			title: 'kost',
			subtitle: 'Feminine ending in hard consonant',
			model: 'kost',
			gender: 'feminine',
			singular: ['kost', 'kosti', 'kosti', 'kost', 'kosti!', 'kosti', 'kostí'],
			plural: ['kosti', 'kostí', 'kostem', 'kosti', 'kosti!', 'kostech', 'kostmi'],
			howToIdentify:
				'Feminine nouns ending in -st, -c (after a vowel), or other hard consonants. A smaller paradigm.',
			examples: ['místnost', 'věc', 'radost', 'noc'],
			notes:
				'Genitive, dative, vocative, and locative singular are all -i — very uniform. Instrumental plural is the distinctive -mi ending.'
		},
		// NEUTER
		{
			id: 'město',
			title: 'město',
			subtitle: 'Neuter ending in -o',
			model: 'město',
			gender: 'neuter',
			singular: ['město', 'města', 'městu', 'město', 'město!', 'městě / městu', 'městem'],
			plural: ['města', 'měst', 'městům', 'města', 'města!', 'městech', 'městy'],
			howToIdentify:
				'Neuter nouns ending in -o. The most common neuter paradigm. Nominative = accusative = vocative.',
			examples: ['auto', 'okno', 'kino', 'jablko'],
			notes:
				'Locative singular can take -ě or -u. Genitive plural is often a bare stem (zero ending), which sometimes requires a fleeting -e- vowel: okno→oken.'
		},
		{
			id: 'moře',
			title: 'moře',
			subtitle: 'Neuter ending in -e',
			model: 'moře',
			gender: 'neuter',
			singular: ['moře', 'moře', 'moři', 'moře', 'moře!', 'moři', 'mořem'],
			plural: ['moře', 'moří', 'mořím', 'moře', 'moře!', 'mořích', 'moři'],
			howToIdentify:
				'Neuter nouns ending in -e after a soft consonant. Also includes -ce words (srdce, vejce).',
			examples: ['srdce', 'vejce', 'slunce', 'pole'],
			notes:
				'Nominative, genitive, accusative, and vocative singular all look the same. Very similar to feminine růže in ending patterns.'
		},
		{
			id: 'kuře',
			title: 'kuře',
			subtitle: 'Neuter ending in -e/-ě (with -ete expansion)',
			model: 'kuře',
			gender: 'neuter',
			singular: ['kuře', 'kuřete', 'kuřeti', 'kuře', 'kuře!', 'kuřeti', 'kuřetem'],
			plural: ['kuřata', 'kuřat', 'kuřatům', 'kuřata', 'kuřata!', 'kuřatech', 'kuřaty'],
			howToIdentify:
				'Neuter nouns (often young beings) ending in -e/-ě that expand with -et- in oblique cases and -at- in plural.',
			examples: ['děvče', 'zvíře', 'štěně', 'kotě'],
			notes:
				'The stem expansion is the key feature: kuře→kuřete (sg), kuřata (pl). This paradigm is used for young animals (kotě, štěně) and some other nouns.'
		},
		{
			id: 'stavení',
			title: 'stavení',
			subtitle: 'Neuter ending in -í',
			model: 'stavení',
			gender: 'neuter',
			singular: ['stavení', 'stavení', 'stavení', 'stavení', 'stavení!', 'stavení', 'stavením'],
			plural: ['stavení', 'stavení', 'stavením', 'stavení', 'stavení!', 'staveních', 'staveními'],
			howToIdentify:
				'Neuter nouns ending in -í. Very easy — almost all forms are identical to the nominative.',
			examples: ['nádraží', 'náměstí', 'štěstí', 'příjmení'],
			notes:
				'The most regular paradigm: only instrumental singular (-ím) and plural forms (-ím, -ích, -ími) differ from the base form.'
		}
	];

	const genderGroups = [
		{
			label: 'Masculine',
			id: 'masculine',
			paradigms: paradigms.filter((p) => p.gender === 'masculine')
		},
		{
			label: 'Feminine',
			id: 'feminine',
			paradigms: paradigms.filter((p) => p.gender === 'feminine')
		},
		{ label: 'Neuter', id: 'neuter', paradigms: paradigms.filter((p) => p.gender === 'neuter') }
	];
</script>

{#snippet highlightedForm(form: string, stem: string)}
	{#each splitFormParts(form, stem) as part, i (i)}
		{#if part.separator}
			<span class="text-text-subtitle"> / </span>
		{:else if part.ending}
			<span class="text-text-subtitle">{part.stem}</span><span class="font-semibold text-emphasis"
				>{part.ending}</span
			>{#if part.suffix}<span class="text-text-subtitle">{part.suffix}</span>{/if}
		{:else}
			<span class="text-text-default">{part.stem}{part.suffix}</span>
		{/if}
	{/each}
{/snippet}

<svelte:head>
	<title>Czech Declension Paradigms — Skloňuj</title>
	<meta
		name="description"
		content="Complete reference for all 14 Czech noun declension paradigms. Full tables for every model word from pán to stavení, with identification tips and examples."
	/>
	<meta
		name="keywords"
		content="Czech paradigms, Czech declension patterns, vzory podstatných jmen, pán muž hrad stroj žena růže píseň kost město moře kuře stavení, Czech grammar, skloňování"
	/>
	<link rel="canonical" href="https://sklonuj.com/resources/paradigms" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com/resources/paradigms" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com/resources/paradigms" />
	<meta property="og:title" content="Czech Declension Paradigms — Skloňuj" />
	<meta
		property="og:description"
		content="Complete reference for all 14 Czech noun declension paradigms. Full tables for every model word, with identification tips and examples."
	/>
	<meta property="og:url" content="https://sklonuj.com/resources/paradigms" />
	<meta property="og:type" content="article" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Czech Declension Paradigms — Skloňuj" />
	<meta
		name="twitter:description"
		content="Complete reference for all 14 Czech noun declension paradigms. Full tables for every model word, with identification tips and examples."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "LearningResource",
			"name": "All Czech Declension Paradigms",
			"description": "Complete reference for all 14 Czech noun declension paradigms with tables, identification tips, and examples.",
			"url": "https://sklonuj.com/resources/paradigms",
			"educationalLevel": "Beginner",
			"learningResourceType": "Reference",
			"inLanguage": ["en", "cs"],
			"datePublished": "2025-01-15",
			"dateModified": "2025-06-01",
			"about": {
				"@type": "Thing",
				"name": "Czech language noun declension paradigms"
			},
			"isPartOf": {
				"@type": "WebSite",
				"name": "Skloňuj",
				"url": "https://sklonuj.com"
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
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": "Czech Declension Paradigms",
					"item": "https://sklonuj.com/resources/paradigms"
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
			Paradigms
		</h2>
		<ul class="space-y-1">
			{#each genderGroups as group (group.id)}
				<li class="mt-2 first:mt-0">
					<button
						onclick={() => {
							toggleGender(group.id);
							document
								.getElementById(group.id)
								?.scrollIntoView({ behavior: 'smooth', block: 'start' });
						}}
						class="flex w-full items-center gap-1 text-left text-[10px] font-bold uppercase tracking-widest transition-colors {activeSection ===
							group.id || group.paradigms.some((p) => activeSection === p.id)
							? 'text-emphasis'
							: 'text-darker-subtitle hover:text-text-default'}"
					>
						<ChevronRight
							class="size-2.5 shrink-0 transition-transform {expandedGenders.has(group.id)
								? 'rotate-90'
								: ''}"
							aria-hidden="true"
						/>
						{group.label}
					</button>
					{#if expandedGenders.has(group.id)}
						<ul class="mt-1 space-y-1 pl-3.5">
							{#each group.paradigms as paradigm (paradigm.id)}
								<li>
									<a
										href="#{paradigm.id}"
										onclick={(e) => {
											e.preventDefault();
											document
												.getElementById(paradigm.id)
												?.scrollIntoView({ behavior: 'smooth', block: 'start' });
										}}
										class="block max-w-40 truncate text-xs transition-colors {activeSection ===
										paradigm.id
											? 'font-semibold text-emphasis'
											: 'text-darker-subtitle hover:text-text-default'}"
									>
										{paradigm.title}
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</nav>

	<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
		<!-- Back link -->
		<a
			href={resolve('/resources')}
			class="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-darker-subtitle transition-colors hover:text-emphasis"
		>
			<ArrowLeft class="size-4" aria-hidden="true" />
			Back to Resources
		</a>

		<!-- Header -->
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold text-emphasis">Czech Declension Paradigms</h1>
			<p class="mt-2 text-sm leading-relaxed text-darker-subtitle">
				Czech has 14 standard noun declension paradigms, organized by gender and stem type. Each
				paradigm is named after a model word whose endings serve as the pattern for all nouns in
				that group. Learning to identify which paradigm a noun belongs to is the key to declining it
				correctly.
			</p>
		</div>

		<!-- How to use this guide -->
		<div class="mb-8 rounded-2xl border border-card-stroke bg-card-bg p-5">
			<h2 class="mb-2 text-sm font-semibold text-text-default">How to find the right paradigm</h2>
			<ol class="space-y-1.5 text-sm leading-relaxed text-text-subtitle">
				<li class="flex items-start gap-2">
					<span class="mt-0.5 shrink-0 text-xs font-bold text-emphasis">1.</span>
					<span
						>Determine the <strong class="text-text-default">gender</strong>. Quick rules: consonant
						ending → masculine, <strong class="text-text-default">-a</strong> → feminine,
						<strong class="text-text-default">-o/-í/-e</strong> → neuter. Exceptions exist (e.g.
						<em>táta</em> is masculine), so check a dictionary if unsure.</span
					>
				</li>
				<li class="flex items-start gap-2">
					<span class="mt-0.5 shrink-0 text-xs font-bold text-emphasis">2.</span>
					<span
						>For masculine nouns, check if the noun is <strong class="text-text-default"
							>animate</strong
						>
						(living being) or <strong class="text-text-default">inanimate</strong> (thing/concept).</span
					>
				</li>
				<li class="flex items-start gap-2">
					<span class="mt-0.5 shrink-0 text-xs font-bold text-emphasis">3.</span>
					<span
						>Look at the <strong class="text-text-default">ending</strong> of the nominative singular.
						This usually tells you the paradigm directly.</span
					>
				</li>
			</ol>
		</div>

		<!-- Gender group sections -->
		<div class="space-y-10">
			{#each genderGroups as group (group.id)}
				<div>
					<section id={group.id} class="scroll-mt-20">
						<div
							class="mb-6 flex flex-col items-center gap-1.5 border-b border-card-stroke pb-5 text-center"
						>
							<span
								class="inline-flex h-8 items-center rounded-full px-5 text-sm font-bold text-white {genderColors[
									group.id as keyof typeof genderColors
								].bg}"
							>
								{group.label}
							</span>
							<span class="text-xs text-darker-subtitle">
								{group.paradigms.length} paradigm{group.paradigms.length > 1 ? 's' : ''}
							</span>
						</div>
					</section>

					<div class="space-y-4">
						{#each group.paradigms as paradigm (paradigm.id)}
							{@const activeExample = selectedExample[paradigm.id]}
							{@const exampleForms = activeExample ? lookupExampleForms(activeExample) : null}
							{@const sgStem = exampleForms
								? computeStem([...exampleForms.sg])
								: computeStem([...paradigm.singular])}
							{@const plStem = exampleForms
								? computeStem([...exampleForms.pl])
								: computeStem([...paradigm.plural])}
							<section
								id={paradigm.id}
								class="scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5"
							>
								<!-- Paradigm header -->
								<div class="mb-4">
									<div class="mb-1 flex items-center gap-2.5">
										<h3 class="text-lg font-semibold text-text-default">{paradigm.title}</h3>
										<span
											class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
										>
											{paradigm.subtitle}
										</span>
									</div>
									<p class="text-sm leading-relaxed text-text-subtitle">
										{paradigm.howToIdentify}
									</p>
								</div>

								<!-- Word selector -->
								<div class="mb-4">
									<h4
										class="mb-2 text-xs font-semibold uppercase tracking-widest text-text-subtitle"
									>
										Show declension for
									</h4>
									<div class="flex flex-wrap gap-1.5">
										<button
											type="button"
											onclick={() => {
												const next = { ...selectedExample };
												delete next[paradigm.id];
												selectedExample = next;
											}}
											class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors {!activeExample
												? 'border-emphasis bg-emphasis/10 text-emphasis'
												: 'border-card-stroke bg-shaded-background text-text-default hover:border-emphasis/50 hover:text-emphasis'}"
										>
											{paradigm.model}
											<Star class="size-3 shrink-0 opacity-50" aria-hidden="true" />
										</button>
										{#each paradigm.examples as example (example)}
											<button
												type="button"
												onclick={() => {
													if (activeExample === example) {
														const next = { ...selectedExample };
														delete next[paradigm.id];
														selectedExample = next;
													} else {
														selectedExample = { ...selectedExample, [paradigm.id]: example };
													}
												}}
												class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors {activeExample ===
												example
													? 'border-emphasis bg-emphasis/10 text-emphasis'
													: 'border-card-stroke bg-shaded-background text-text-default hover:border-emphasis/50 hover:text-emphasis'}"
											>
												{example}
											</button>
										{/each}
									</div>
								</div>

								<!-- Declension table -->
								<div class="mb-4 overflow-x-auto">
									<table class="w-full table-fixed text-left text-xs">
										<thead>
											<tr>
												<th
													class="rounded-tl-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
												>
													Case
												</th>
												<th
													class="bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
												>
													Singular
												</th>
												<th
													class="rounded-tr-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
												>
													Plural
												</th>
											</tr>
										</thead>
										<tbody>
											{#if activeExample && exampleForms}
												{#each CASE_ORDER as c, i (c)}
													{@const idx = CASE_INDEX[c]}
													<tr
														class="border-t border-card-stroke {i % 2 === 0
															? 'bg-shaded-background/50'
															: ''}"
													>
														<td class="whitespace-nowrap px-3 py-2 font-medium text-text-subtitle">
															{CASE_NUMBER[c]}. {CASE_LABELS[c]}
														</td>
														<td class="px-3 py-2">
															{@render highlightedForm(exampleForms.sg[idx], sgStem)}
														</td>
														<td class="px-3 py-2">
															{@render highlightedForm(exampleForms.pl[idx], plStem)}
														</td>
													</tr>
												{/each}
											{:else if activeExample && !exampleForms}
												{#each CASE_ORDER as c, i (c)}
													{@const idx = CASE_INDEX[c]}
													<tr
														class="border-t border-card-stroke {i % 2 === 0
															? 'bg-shaded-background/50'
															: ''}"
													>
														<td class="whitespace-nowrap px-3 py-2 font-medium text-text-subtitle">
															{CASE_NUMBER[c]}. {CASE_LABELS[c]}
														</td>
														<td colspan="2" class="px-3 py-2 text-text-subtitle italic">
															{#if idx === 0}Data not available for "{activeExample}"{/if}
														</td>
													</tr>
												{/each}
											{:else}
												{#each CASE_ORDER as c, i (c)}
													{@const idx = CASE_INDEX[c]}
													<tr
														class="border-t border-card-stroke {i % 2 === 0
															? 'bg-shaded-background/50'
															: ''}"
													>
														<td class="whitespace-nowrap px-3 py-2 font-medium text-text-subtitle">
															{CASE_NUMBER[c]}. {CASE_LABELS[c]}
														</td>
														<td class="px-3 py-2">
															{@render highlightedForm(paradigm.singular[idx], sgStem)}
														</td>
														<td class="px-3 py-2">
															{@render highlightedForm(paradigm.plural[idx], plStem)}
														</td>
													</tr>
												{/each}
											{/if}
										</tbody>
									</table>
								</div>

								<!-- Notes -->
								{#if paradigm.notes}
									<div
										class="rounded-xl bg-shaded-background px-4 py-2.5 text-xs leading-relaxed text-text-subtitle"
									>
										<span class="font-semibold text-text-default">Note:</span>
										{paradigm.notes}
									</div>
								{/if}

								<!-- Practice link -->
								<a
									href="{resolve('/')}?selectParadigm={paradigm.id}"
									class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emphasis transition-opacity hover:opacity-70"
								>
									Practice this paradigm
									<ArrowRight class="size-4" aria-hidden="true" />
								</a>
							</section>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!-- Related Resources -->
		<div class="mt-10 rounded-2xl border border-card-stroke bg-card-bg p-5">
			<h2 class="mb-3 text-sm font-semibold text-text-default">Related Resources</h2>
			<div class="space-y-2">
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
					href={resolve('/resources/pronouns')}
					class="group flex items-center justify-between rounded-xl bg-shaded-background px-4 py-2.5 transition-colors hover:bg-shaded-background/80"
				>
					<div>
						<span class="text-sm font-medium text-text-default">Pronoun Declension</span>
						<p class="text-xs text-text-subtitle">
							Personal, demonstrative, and possessive pronouns
						</p>
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
