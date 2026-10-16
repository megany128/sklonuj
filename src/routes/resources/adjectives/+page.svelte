<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let user = $derived(page.data.user);

	const description =
		'Czech adjective declension tables for the hard type (mladý) and the soft type (jarní): every case, gender and number, with agreement rules, plural consonant changes and examples.';

	const genderHeaders = ['Case', 'Masc. anim.', 'Masc. inan.', 'Fem.', 'Neut.'];
	const caseLabels = ['Nom', 'Gen', 'Dat', 'Acc', 'Voc', 'Loc', 'Ins'];

	// One column per gender, cases in CASE_INDEX order (nom, gen, dat, acc, voc, loc, ins).
	type GenderColumns = [string[], string[], string[], string[]];

	function toRows(columns: GenderColumns): string[][] {
		return caseLabels.map((label, i) => [label, ...columns.map((col) => col[i])]);
	}

	const hardSingular = toRows([
		['mladý', 'mladého', 'mladému', 'mladého', 'mladý', 'mladém', 'mladým'],
		['mladý', 'mladého', 'mladému', 'mladý', 'mladý', 'mladém', 'mladým'],
		['mladá', 'mladé', 'mladé', 'mladou', 'mladá', 'mladé', 'mladou'],
		['mladé', 'mladého', 'mladému', 'mladé', 'mladé', 'mladém', 'mladým']
	]);
	const hardPlural = toRows([
		['mladí', 'mladých', 'mladým', 'mladé', 'mladí', 'mladých', 'mladými'],
		['mladé', 'mladých', 'mladým', 'mladé', 'mladé', 'mladých', 'mladými'],
		['mladé', 'mladých', 'mladým', 'mladé', 'mladé', 'mladých', 'mladými'],
		['mladá', 'mladých', 'mladým', 'mladá', 'mladá', 'mladých', 'mladými']
	]);
	const softSingular = toRows([
		['jarní', 'jarního', 'jarnímu', 'jarního', 'jarní', 'jarním', 'jarním'],
		['jarní', 'jarního', 'jarnímu', 'jarní', 'jarní', 'jarním', 'jarním'],
		['jarní', 'jarní', 'jarní', 'jarní', 'jarní', 'jarní', 'jarní'],
		['jarní', 'jarního', 'jarnímu', 'jarní', 'jarní', 'jarním', 'jarním']
	]);
	const softPlural = toRows([
		['jarní', 'jarních', 'jarním', 'jarní', 'jarní', 'jarních', 'jarními'],
		['jarní', 'jarních', 'jarním', 'jarní', 'jarní', 'jarních', 'jarními'],
		['jarní', 'jarních', 'jarním', 'jarní', 'jarní', 'jarních', 'jarními'],
		['jarní', 'jarních', 'jarním', 'jarní', 'jarní', 'jarních', 'jarními']
	]);

	const hardTables = [
		{ caption: 'Singular', stem: 'mlad', rows: hardSingular },
		{ caption: 'Plural', stem: 'mlad', rows: hardPlural }
	];
	const softTables = [
		{ caption: 'Singular', stem: 'jarn', rows: softSingular },
		{ caption: 'Plural', stem: 'jarn', rows: softPlural }
	];

	const consonantChanges = [
		{ ending: '-ký → -cí', example: 'velký → velcí', gloss: 'velcí kluci (big boys)' },
		{ ending: '-hý → -zí', example: 'drahý → drazí', gloss: 'drazí přátelé (dear friends)' },
		{ ending: '-chý → -ší', example: 'tichý → tiší', gloss: 'tiší sousedé (quiet neighbours)' },
		{ ending: '-rý → -ří', example: 'dobrý → dobří', gloss: 'dobří učitelé (good teachers)' },
		{ ending: '-ský → -ští', example: 'český → čeští', gloss: 'čeští studenti (Czech students)' },
		{
			ending: '-cký → -čtí',
			example: 'německý → němečtí',
			gloss: 'němečtí turisté (German tourists)'
		}
	];

	const agreementExamples = [
		{ czech: 'Mám nového kamaráda.', english: 'I have a new friend.', note: 'masc. anim. acc sg' },
		{ czech: 'Mám nový telefon.', english: 'I have a new phone.', note: 'masc. inan. acc sg' },
		{
			czech: 'Bydlím v malém bytě.',
			english: 'I live in a small flat.',
			note: 'masc. inan. loc sg'
		},
		{
			czech: 'Jdu s mladou ženou.',
			english: 'I am walking with a young woman.',
			note: 'fem. ins sg'
		},
		{
			czech: 'To jsou noví sousedé.',
			english: 'Those are the new neighbours.',
			note: 'masc. anim. nom pl'
		},
		{
			czech: 'Ve velkých městech je hluk.',
			english: 'Big cities are noisy.',
			note: 'neut. loc pl'
		},
		{
			czech: 'Těším se na letní prázdniny.',
			english: 'I am looking forward to the summer holidays.',
			note: 'soft, fem. acc pl'
		}
	];

	const faqs = [
		{
			question: 'How many adjective declension patterns does Czech have?',
			answer:
				'Czech has two main adjective patterns. Hard adjectives end in -ý in the masculine nominative singular (mladý, velký, dobrý) and have different endings for each gender: mladý, mladá, mladé. Soft adjectives end in -í (jarní, cizí, moderní) and look the same in all three genders in the nominative: jarní muž, jarní žena, jarní město. A small third group, possessive adjectives such as otcův and matčin, mixes noun and adjective endings.'
		},
		{
			question: 'How do I know if a Czech adjective is hard or soft?',
			answer:
				'Look at the dictionary form. If it ends in -ý (mladý, nový, český), it is hard. If it ends in -í (jarní, cizí, letní, moderní), it is soft. Comparatives and superlatives are always soft: lepší, větší, nejlepší.'
		},
		{
			question: 'Do Czech adjectives agree with nouns?',
			answer:
				'Yes. An adjective takes the same gender, number and case as the noun it describes: nový dům (new house, masc. nom), v novém domě (in the new house, masc. loc), s novou knihou (with the new book, fem. ins). In the masculine, animacy matters too: the accusative singular of an animate noun copies the genitive (vidím nového studenta), while an inanimate noun keeps the nominative (vidím nový dům).'
		},
		{
			question: 'Why does velký become velcí in the plural?',
			answer:
				'In the nominative plural of masculine animate nouns, hard adjectives end in -í, and that -í softens the consonant before it: k → c (velcí), h → z (drazí), ch → š (tiší), r → ř (dobří), sk → šť (čeští) and ck → čť (němečtí). The change only happens in this one form, for people and animals: velcí kluci but velké domy.'
		},
		{
			question: 'Which adjective endings are the same across genders?',
			answer:
				'In the hard pattern, masculine and neuter share every oblique singular ending (-ého, -ému, -ém, -ým). In the plural, all genders share -ých, -ým and -ými in the genitive, dative, locative and instrumental. In the soft pattern, the feminine singular is jarní in every case, and the whole plural uses jarní, jarních, jarním and jarními for every gender.'
		},
		{
			question: 'How do Czech adjectives sound in spoken Czech?',
			answer:
				'In everyday spoken Czech (obecná čeština), hard adjective endings often shift: -ý becomes -ej (velkej dům), -é becomes -ý (velký auto) and the instrumental plural -ými becomes -ejma (s velkejma klukama). These forms are normal in conversation but are not used in writing or in exams, so learn the standard endings in the tables first.'
		}
	];

	const tocEntries = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'hard', label: 'Hard (mladý)' },
		{ id: 'soft', label: 'Soft (jarní)' },
		{ id: 'consonant-changes', label: 'Plural changes' },
		{ id: 'agreement', label: 'Agreement' },
		{ id: 'possessive', label: 'Possessive' },
		{ id: 'faq', label: 'FAQ' }
	];

	// TOC active section tracking
	let activeSection = $state('');

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
</script>

<svelte:head>
	<title>Czech Adjective Declension — Hard & Soft Tables | Skloňuj</title>
	<meta name="description" content={description} />
	<meta
		name="keywords"
		content="Czech adjective declension, Czech adjectives cases, hard adjectives mladý, soft adjectives jarní, Czech adjective endings, Czech adjective agreement, skloňování přídavných jmen, learn Czech"
	/>
	<link rel="canonical" href="https://sklonuj.com/resources/adjectives" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com/resources/adjectives" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com/resources/adjectives" />
	<meta property="og:title" content="Czech Adjective Declension — Hard & Soft Tables | Skloňuj" />
	<meta property="og:description" content={description} />
	<meta property="og:url" content="https://sklonuj.com/resources/adjectives" />
	<meta property="og:type" content="article" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Czech Adjective Declension — Hard & Soft Tables | Skloňuj" />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<!-- eslint-disable svelte/no-at-html-tags -- structured data JSON-LD -->
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'LearningResource',
		name: 'Czech Adjective Declension',
		description,
		url: 'https://sklonuj.com/resources/adjectives',
		inLanguage: 'en',
		educationalLevel: 'Beginner',
		learningResourceType: 'Reference',
		teaches: 'Czech adjective declension: hard and soft patterns across all 7 cases',
		datePublished: '2026-10-16',
		dateModified: '2026-10-16',
		isPartOf: {
			'@type': 'WebSite',
			name: 'Skloňuj',
			url: 'https://sklonuj.com'
		},
		about: {
			'@type': 'Thing',
			name: 'Czech language declension'
		}
	})}${'<'}/script>`}
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: faqs.map((faq) => ({
			'@type': 'Question',
			name: faq.question,
			acceptedAnswer: {
				'@type': 'Answer',
				text: faq.answer
			}
		}))
	})}${'<'}/script>`}
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: [
			{
				'@type': 'ListItem',
				position: 1,
				name: 'Home',
				item: 'https://sklonuj.com'
			},
			{
				'@type': 'ListItem',
				position: 2,
				name: 'Resources',
				item: 'https://sklonuj.com/resources'
			},
			{
				'@type': 'ListItem',
				position: 3,
				name: 'Czech Adjective Declension',
				item: 'https://sklonuj.com/resources/adjectives'
			}
		]
	})}${'<'}/script>`}
</svelte:head>

{#snippet declensionTable(caption: string, stem: string, rows: string[][])}
	<div class="overflow-x-auto rounded-xl">
		<table class="w-full text-left text-xs sm:text-sm">
			<caption
				class="mb-2 text-left text-xs font-semibold uppercase tracking-widest text-text-subtitle"
			>
				{caption}
			</caption>
			<thead>
				<tr>
					{#each genderHeaders as header (header)}
						<th
							scope="col"
							class="whitespace-nowrap bg-shaded-background px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-subtitle"
						>
							{header}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i (row[0])}
					<tr class={i % 2 === 0 ? '' : 'bg-shaded-background/40'}>
						{#each row as cell, j (j)}
							{#if j === 0}
								<th
									scope="row"
									class="whitespace-nowrap px-3 py-2 font-semibold text-text-subtitle"
								>
									{cell}
								</th>
							{:else}
								<td class="whitespace-nowrap px-3 py-2 text-text-default"
									>{stem}<strong class="font-semibold text-emphasis"
										>{cell.slice(stem.length)}</strong
									></td
								>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

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
			<h1 class="text-2xl font-semibold text-emphasis">Czech Adjective Declension</h1>
			<p class="mt-2 text-sm leading-relaxed text-darker-subtitle">
				Czech adjectives change their endings to match the noun they describe in gender, number and
				case. There are two main patterns: hard adjectives ending in -ý, modelled on
				<em>mladý</em> (young), and soft adjectives ending in -í, modelled on <em>jarní</em> (spring).
				This guide gives the full tables for both, with the rules that trip learners up.
			</p>
		</div>

		<!-- Overview -->
		<section
			id="overview"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<h2 class="mb-3 text-lg font-semibold text-text-default">Key facts at a glance</h2>
			<ul class="space-y-1.5 text-sm leading-relaxed text-text-subtitle">
				<li class="flex items-start gap-2">
					<span class="mt-0.5 shrink-0 text-xs font-bold text-emphasis">•</span>
					<span
						><strong class="text-text-default">Hard adjectives</strong> end in -ý / -á / -é in the nominative
						singular (mladý muž, mladá žena, mladé město) and have distinct endings for each gender.</span
					>
				</li>
				<li class="flex items-start gap-2">
					<span class="mt-0.5 shrink-0 text-xs font-bold text-emphasis">•</span>
					<span
						><strong class="text-text-default">Soft adjectives</strong> end in -í for all genders (jarní
						muž, jarní žena, jarní město). Comparatives such as lepší and větší are always soft.</span
					>
				</li>
				<li class="flex items-start gap-2">
					<span class="mt-0.5 shrink-0 text-xs font-bold text-emphasis">•</span>
					<span
						><strong class="text-text-default">Agreement:</strong> the adjective takes the gender, number
						and case of its noun, and for masculine nouns its animacy as well.</span
					>
				</li>
				<li class="flex items-start gap-2">
					<span class="mt-0.5 shrink-0 text-xs font-bold text-emphasis">•</span>
					<span
						><strong class="text-text-default">Shared endings:</strong> masculine and neuter share all
						oblique singular forms (-ého, -ému, -ém, -ým), and every gender shares -ých, -ým, -ými in
						the plural.</span
					>
				</li>
				<li class="flex items-start gap-2">
					<span class="mt-0.5 shrink-0 text-xs font-bold text-emphasis">•</span>
					<span
						><strong class="text-text-default">Vocative</strong> is the same as the nominative for
						adjectives: <em>Milý Petře!</em> (Dear Petr!).</span
					>
				</li>
			</ul>
		</section>

		<!-- Hard -->
		<section
			id="hard"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<div class="mb-4">
				<h2 class="text-lg font-semibold text-text-default">Hard Adjectives: mladý (young)</h2>
				<p class="mt-1 text-sm text-text-subtitle">
					Most Czech adjectives are hard. They end in -ý in the dictionary form: nový, velký, dobrý,
					český, starý. Endings are shown in bold; the stem <em>mlad-</em> never changes.
				</p>
			</div>

			<div class="space-y-5">
				{#each hardTables as table (table.caption)}
					{@render declensionTable(table.caption, table.stem, table.rows)}
				{/each}
			</div>

			<p class="mt-3 text-xs leading-relaxed text-text-subtitle">
				Masculine animate and inanimate differ only in the accusative singular (mladého / mladý) and
				the nominative and vocative plural (mladí / mladé).
			</p>
		</section>

		<!-- Soft -->
		<section
			id="soft"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<div class="mb-4">
				<h2 class="text-lg font-semibold text-text-default">Soft Adjectives: jarní (spring)</h2>
				<p class="mt-1 text-sm text-text-subtitle">
					Soft adjectives end in -í: jarní, letní, cizí, moderní, poslední, and every comparative
					and superlative (lepší, nejlepší). They have far fewer distinct forms than hard
					adjectives.
				</p>
			</div>

			<div class="space-y-5">
				{#each softTables as table (table.caption)}
					{@render declensionTable(table.caption, table.stem, table.rows)}
				{/each}
			</div>

			<p class="mt-3 text-xs leading-relaxed text-text-subtitle">
				The feminine singular is jarní in every case, and the plural is the same for all genders.
				The only animacy difference is the masculine accusative singular (jarního / jarní).
			</p>
		</section>

		<!-- Consonant changes -->
		<section
			id="consonant-changes"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<div class="mb-4">
				<h2 class="text-lg font-semibold text-text-default">
					Consonant Changes in the Masculine Animate Plural
				</h2>
				<p class="mt-1 text-sm text-text-subtitle">
					When a hard adjective describes people or animals in the nominative plural, its ending -í
					softens the consonant before it. This happens only in that one form: velcí kluci (big
					boys), but velké domy (big houses).
				</p>
			</div>

			<div class="overflow-x-auto rounded-xl">
				<table class="w-full text-left text-xs sm:text-sm">
					<thead>
						<tr>
							{#each ['Change', 'Adjective', 'Example'] as header (header)}
								<th
									scope="col"
									class="whitespace-nowrap bg-shaded-background px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-subtitle"
								>
									{header}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each consonantChanges as change, i (change.ending)}
							<tr class={i % 2 === 0 ? '' : 'bg-shaded-background/40'}>
								<th
									scope="row"
									class="whitespace-nowrap px-3 py-2 font-semibold text-text-subtitle"
								>
									{change.ending}
								</th>
								<td class="whitespace-nowrap px-3 py-2 text-text-default">{change.example}</td>
								<td class="whitespace-nowrap px-3 py-2 text-text-default">{change.gloss}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<!-- Agreement -->
		<section
			id="agreement"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<div class="mb-4">
				<h2 class="text-lg font-semibold text-text-default">
					Adjective–Noun Agreement in Practice
				</h2>
				<p class="mt-1 text-sm text-text-subtitle">
					To choose the right ending, find the noun's gender (and animacy, if masculine), its
					number, and the case the sentence needs. Then read the form off the table.
				</p>
			</div>

			<ul class="space-y-2">
				{#each agreementExamples as example (example.czech)}
					<li class="rounded-xl bg-shaded-background px-4 py-2.5">
						<p class="text-sm font-medium text-text-default">{example.czech}</p>
						<p class="text-xs text-text-subtitle">
							{example.english} <span class="text-darker-subtitle">({example.note})</span>
						</p>
					</li>
				{/each}
			</ul>
		</section>

		<!-- Possessive -->
		<section
			id="possessive"
			class="mb-6 scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
		>
			<div class="mb-4">
				<h2 class="text-lg font-semibold text-text-default">Possessive Adjectives</h2>
				<p class="mt-1 text-sm text-text-subtitle">
					Czech can turn a person's name or a noun for a person into an adjective meaning "X's": -ův
					for masculine owners and -in for feminine owners. They mix short noun-like endings with
					adjective endings.
				</p>
			</div>

			<div class="overflow-x-auto rounded-xl">
				<table class="w-full text-left text-xs sm:text-sm">
					<thead>
						<tr>
							{#each ['Owner', 'Masc.', 'Fem.', 'Neut.'] as header (header)}
								<th
									scope="col"
									class="whitespace-nowrap bg-shaded-background px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-subtitle"
								>
									{header}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						<tr>
							<th scope="row" class="whitespace-nowrap px-3 py-2 font-semibold text-text-subtitle"
								>otec (father)</th
							>
							<td class="whitespace-nowrap px-3 py-2 text-text-default">otcův dům</td>
							<td class="whitespace-nowrap px-3 py-2 text-text-default">otcova kniha</td>
							<td class="whitespace-nowrap px-3 py-2 text-text-default">otcovo auto</td>
						</tr>
						<tr class="bg-shaded-background/40">
							<th scope="row" class="whitespace-nowrap px-3 py-2 font-semibold text-text-subtitle"
								>matka (mother)</th
							>
							<td class="whitespace-nowrap px-3 py-2 text-text-default">matčin dům</td>
							<td class="whitespace-nowrap px-3 py-2 text-text-default">matčina kniha</td>
							<td class="whitespace-nowrap px-3 py-2 text-text-default">matčino auto</td>
						</tr>
					</tbody>
				</table>
			</div>

			<p class="mt-3 text-xs leading-relaxed text-text-subtitle">
				Many learners simply use the genitive instead (dům otce, kniha matky), which is always
				correct. You will still meet possessive adjectives in names like Karlův most (Charles
				Bridge).
			</p>
		</section>

		<!-- FAQ -->
		<section id="faq" class="scroll-mt-20">
			<h2 class="mb-4 text-lg font-semibold text-text-default">
				Frequently Asked Questions About Czech Adjectives
			</h2>
			<div class="space-y-4">
				{#each faqs as faq, i (faq.question)}
					<div class="rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6">
						<div class="mb-1 flex items-start gap-3">
							<span
								class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-emphasis text-xs font-bold text-text-inverted"
							>
								{i + 1}
							</span>
							<h3 class="text-sm font-semibold leading-snug text-text-default">
								{faq.question}
							</h3>
						</div>
						<p class="mt-3 pl-9 text-sm leading-relaxed text-text-subtitle">
							{faq.answer}
						</p>
					</div>
				{/each}
			</div>
		</section>

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
					href={resolve('/resources/pronouns')}
					class="group flex items-center justify-between rounded-xl bg-shaded-background px-4 py-2.5 transition-colors hover:bg-shaded-background/80"
				>
					<div>
						<span class="text-sm font-medium text-text-default">Pronoun Declension</span>
						<p class="text-xs text-text-subtitle">
							Personal, demonstrative, and possessive pronoun tables
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
						<p class="text-xs text-text-subtitle">
							Interactive drills, including adjective–noun agreement
						</p>
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
