<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let user = $derived(page.data.user);

	// TOC active section tracking
	let activeSection = $state('');

	onMount(() => {
		const caseParam = page.url.searchParams.get('case');
		if (caseParam) {
			const el = document.getElementById(caseParam.toLowerCase());
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

	const cases = [
		{
			id: 'nominative',
			caseCode: 'nom',
			name: 'Nominative',
			number: 1,
			question: 'Kdo? Co? (Who? What?)',
			mnemonic: 'The subject — who or what does the action.',
			color: 'var(--color-case-nom)',
			usage: [
				'Subject of the sentence',
				'After "to je/jsou" (that is/those are)',
				'The default dictionary form of a noun'
			],
			prepositions: 'None — this is the default/dictionary form.',
			examples: [
				{
					sentence: 'Kniha je na stole.',
					highlight: 'Kniha',
					translation: 'The book is on the table.'
				},
				{
					sentence: 'Ten muž je učitel.',
					highlight: 'muž',
					translation: 'That man is a teacher.'
				},
				{ sentence: 'Pes běží.', highlight: 'Pes', translation: 'The dog runs.' },
				{
					sentence: 'Děti si hrají.',
					highlight: 'Děti',
					translation: 'The children are playing.'
				}
			]
		},
		{
			id: 'genitive',
			caseCode: 'gen',
			name: 'Genitive',
			number: 2,
			question: 'Koho? Čeho? (Of whom? Of what?)',
			mnemonic: 'Possession, absence, origin — think "of" or "from".',
			color: 'var(--color-case-gen)',
			usage: [
				'Expressing possession: "kniha studenta" (the student\'s book)',
				'After quantities and negation: "pět studentů", "nemám času"',
				'After certain prepositions indicating origin, absence, or proximity'
			],
			prepositions: 'z/ze, do, od/ode, bez, u, kolem, vedle, během',
			examples: [
				{
					sentence: 'To je auto mého otce.',
					highlight: 'otce',
					translation: "That is my father's car."
				},
				{
					sentence: 'Jdu do obchodu.',
					highlight: 'obchodu',
					translation: "I'm going to the store."
				},
				{
					sentence: 'Pět studentů čeká.',
					highlight: 'studentů',
					translation: 'Five students are waiting.'
				},
				{
					sentence: 'Bydlím vedle parku.',
					highlight: 'parku',
					translation: 'I live next to the park.'
				}
			]
		},
		{
			id: 'dative',
			caseCode: 'dat',
			name: 'Dative',
			number: 3,
			question: 'Komu? Čemu? (To whom? To what?)',
			mnemonic: 'The receiver — who gets something or benefits.',
			color: 'var(--color-case-dat)',
			usage: [
				'Indirect object: "Dám knihu studentovi." (I give the book to the student.)',
				'After certain verbs: pomáhat, věřit, rozumět, děkovat',
				'Expressing benefit or direction toward someone'
			],
			prepositions: 'k/ke, proti, díky, kvůli, navzdory',
			examples: [
				{
					sentence: 'Pomáhám bratrovi.',
					highlight: 'bratrovi',
					translation: "I'm helping my brother."
				},
				{
					sentence: 'Jdu k doktorovi.',
					highlight: 'doktorovi',
					translation: "I'm going to the doctor."
				},
				{
					sentence: 'Díky tobě to vím.',
					highlight: 'tobě',
					translation: 'Thanks to you, I know that.'
				},
				{
					sentence: 'Dám knihu studentovi.',
					highlight: 'studentovi',
					translation: 'I give the book to the student.'
				}
			]
		},
		{
			id: 'accusative',
			caseCode: 'acc',
			name: 'Accusative',
			number: 4,
			question: 'Koho? Co? (Whom? What?)',
			mnemonic: 'The direct object — what the action is done to.',
			color: 'var(--color-case-acc)',
			usage: [
				'Direct object: "Vidím psa." (I see the dog.)',
				'Direction or motion toward a place',
				'Duration of time or expressing price'
			],
			prepositions: 'na, za, pro, přes, o, v (with motion)',
			examples: [
				{ sentence: 'Čtu knihu.', highlight: 'knihu', translation: "I'm reading a book." },
				{
					sentence: 'Mám novou práci.',
					highlight: 'práci',
					translation: 'I have a new job.'
				},
				{
					sentence: 'Jdeme na koncert.',
					highlight: 'koncert',
					translation: "We're going to a concert."
				},
				{ sentence: 'Vidím psa.', highlight: 'psa', translation: 'I see the dog.' }
			]
		},
		{
			id: 'vocative',
			caseCode: 'voc',
			name: 'Vocative',
			number: 5,
			question: 'Addressing someone directly',
			mnemonic: 'Calling out — "Hey, ...!"',
			color: 'var(--color-case-voc)',
			usage: [
				'Direct address: "Petře, pojď sem!" (Petr, come here!)',
				'Calling out to someone or getting their attention',
				'Formal and informal greetings with names and titles'
			],
			prepositions: 'None — vocative is used only for direct address.',
			examples: [
				{
					sentence: 'Mami, kde jsi?',
					highlight: 'Mami',
					translation: 'Mom, where are you?'
				},
				{
					sentence: 'Dobrý den, pane Nováku!',
					highlight: 'Nováku',
					translation: 'Good day, Mr. Novak!'
				},
				{ sentence: 'Jano, počkej!', highlight: 'Jano', translation: 'Jana, wait!' },
				{
					sentence: 'Pane profesore!',
					highlight: 'profesore',
					translation: 'Mr. Professor!'
				}
			]
		},
		{
			id: 'locative',
			caseCode: 'loc',
			name: 'Locative',
			number: 6,
			question: 'O kom? O čem? (About whom? About what?)',
			mnemonic: 'Location and topic — where something is or what you talk about.',
			color: 'var(--color-case-loc)',
			usage: [
				'Static location: "Jsem v Praze." (I am in Prague.)',
				'Topic of discussion: "Mluvíme o filmu." (We talk about the film.)',
				'Always requires a preposition — never stands alone'
			],
			prepositions: 'v/ve, na, o, po, při',
			examples: [
				{
					sentence: 'Bydlím v České republice.',
					highlight: 'republice',
					translation: 'I live in the Czech Republic.'
				},
				{
					sentence: 'Sedím na židli.',
					highlight: 'židli',
					translation: "I'm sitting on a chair."
				},
				{
					sentence: 'Po obědě jdeme ven.',
					highlight: 'obědě',
					translation: "After lunch we're going out."
				},
				{
					sentence: 'Mluvíme o filmu.',
					highlight: 'filmu',
					translation: "We're talking about the film."
				}
			]
		},
		{
			id: 'instrumental',
			caseCode: 'ins',
			name: 'Instrumental',
			number: 7,
			question: 'Kým? Čím? (By whom? By/with what?)',
			mnemonic: 'The tool, companion, or means — "with" or "by".',
			color: 'var(--color-case-ins)',
			usage: [
				'Means or instrument: "Píšu tužkou." (I write with a pencil.)',
				'Accompaniment: "Jdu s kamarádem." (I go with a friend.)',
				'Expressing location (behind, in front of, between, etc.)'
			],
			prepositions: 's/se, za, nad, pod, před, mezi',
			examples: [
				{
					sentence: 'Jedu autobusem.',
					highlight: 'autobusem',
					translation: "I'm going by bus."
				},
				{
					sentence: 'Stojím před domem.',
					highlight: 'domem',
					translation: "I'm standing in front of the house."
				},
				{
					sentence: 'Je spokojený se životem.',
					highlight: 'životem',
					translation: 'He is satisfied with life.'
				},
				{
					sentence: 'Píšu tužkou.',
					highlight: 'tužkou',
					translation: 'I write with a pencil.'
				}
			]
		}
	];

	const tocEntries = cases.map((c) => ({ id: c.id, label: c.name }));
</script>

<svelte:head>
	<title>The 7 Czech Cases Explained — Skloňuj</title>
	<meta
		name="description"
		content="Complete guide to all 7 Czech grammatical cases with examples, prepositions, and usage rules. Learn nominative through instrumental with clear explanations."
	/>
	<meta
		name="keywords"
		content="Czech cases, Czech declension, nominative, genitive, dative, accusative, vocative, locative, instrumental, Czech grammar, learn Czech, skloňování"
	/>
	<link rel="canonical" href="https://sklonuj.com/resources/czech-cases" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com/resources/czech-cases" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com/resources/czech-cases" />
	<meta property="og:title" content="The 7 Czech Cases Explained — Skloňuj" />
	<meta
		property="og:description"
		content="Complete guide to all 7 Czech grammatical cases with examples, prepositions, and usage rules. Learn nominative through instrumental with clear explanations."
	/>
	<meta property="og:url" content="https://sklonuj.com/resources/czech-cases" />
	<meta property="og:type" content="article" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="The 7 Czech Cases Explained — Skloňuj" />
	<meta
		name="twitter:description"
		content="Complete guide to all 7 Czech grammatical cases with examples, prepositions, and usage rules. Learn nominative through instrumental with clear explanations."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "LearningResource",
			"name": "The 7 Czech Cases Explained",
			"description": "Complete guide to all 7 Czech grammatical cases with examples, prepositions, and usage rules.",
			"url": "https://sklonuj.com/resources/czech-cases",
			"inLanguage": "en",
			"educationalLevel": "Beginner",
			"learningResourceType": "Reference",
			"teaches": "Czech grammatical cases and declension",
			"datePublished": "2025-01-15",
			"dateModified": "2025-06-01",
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
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": "The 7 Czech Cases",
					"item": "https://sklonuj.com/resources/czech-cases"
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
			<h1 class="text-2xl font-semibold text-emphasis">The 7 Czech Cases</h1>
			<p class="mt-2 text-sm leading-relaxed text-darker-subtitle">
				Czech nouns, adjectives, and pronouns change their endings depending on their role in a
				sentence. These changes are called declension, and Czech has 7 grammatical cases. This guide
				explains each one with usage rules, prepositions, and example sentences.
			</p>
		</div>

		<!-- Case sections -->
		<div class="space-y-6">
			{#each cases as c (c.id)}
				<section
					id={c.id}
					class="scroll-mt-20 rounded-2xl border border-card-stroke bg-card-bg p-5 sm:p-6"
				>
					<!-- Case header -->
					<div class="mb-4">
						<div class="mb-1 flex items-center gap-2.5">
							<span
								class="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
								style="background-color: {c.color}">{c.number}</span
							>
							<h2 class="text-lg font-semibold text-text-default">{c.name}</h2>
						</div>
						<p class="text-sm italic text-text-subtitle">{c.question}</p>
						<p class="mt-1 text-sm text-text-subtitle">{c.mnemonic}</p>
					</div>

					<!-- When it's used -->
					<div class="mb-4">
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-widest text-text-subtitle">
							When it's used
						</h3>
						<ul class="space-y-1.5">
							{#each c.usage as point (point)}
								<li class="flex items-start gap-2 text-sm leading-relaxed text-text-default">
									<span
										class="mt-1.5 inline-block size-1.5 shrink-0 rounded-full"
										style="background-color: {c.color}"
									></span>
									{point}
								</li>
							{/each}
						</ul>
					</div>

					<!-- Key prepositions -->
					<div class="mb-4">
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-widest text-text-subtitle">
							Key prepositions
						</h3>
						{#if c.prepositions.startsWith('None')}
							<p class="text-sm italic leading-relaxed text-text-subtitle">{c.prepositions}</p>
						{:else}
							<div class="flex flex-wrap gap-1.5">
								{#each c.prepositions.split(', ') as prep (prep)}
									<span
										class="rounded-md px-2 py-0.5 text-xs font-medium"
										style="background-color: color-mix(in srgb, {c.color} 15%, transparent); color: {c.color}"
										>{prep}</span
									>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Examples -->
					<div class="mb-4">
						<h3 class="mb-2 text-xs font-semibold uppercase tracking-widest text-text-subtitle">
							Examples
						</h3>
						<div class="space-y-2">
							{#each c.examples as ex (ex.sentence)}
								<div class="rounded-xl bg-shaded-background px-4 py-2.5">
									<p class="text-sm font-medium text-text-default">
										{#each ex.sentence.split(ex.highlight) as part, i (i)}
											{#if i > 0}<span class="font-bold" style="color: {c.color}"
													>{ex.highlight}</span
												>{/if}{part}
										{/each}
									</p>
									<p class="mt-0.5 text-xs text-text-subtitle">{ex.translation}</p>
								</div>
							{/each}
						</div>
					</div>

					<!-- Practice link -->
					<a
						href="{resolve('/')}?selectCase={c.caseCode}"
						class="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
						style="color: {c.color}"
					>
						Practice this case
						<ArrowRight class="size-4" aria-hidden="true" />
					</a>
				</section>
			{/each}
		</div>

		<!-- Related Resources -->
		<div class="mt-10 rounded-2xl border border-card-stroke bg-card-bg p-5">
			<h2 class="mb-3 text-sm font-semibold text-text-default">Related Resources</h2>
			<div class="space-y-2">
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
							Personal, demonstrative, and possessive pronouns
						</p>
					</div>
					<ArrowRight
						class="size-4 shrink-0 text-text-subtitle transition-transform group-hover:translate-x-0.5 group-hover:text-emphasis"
						aria-hidden="true"
					/>
				</a>
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
