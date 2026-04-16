<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let user = $derived(page.data.user);
</script>

<svelte:head>
	<title>About — Skloňuj Czech Declension Trainer</title>
	<meta
		name="description"
		content="Skloňuj is built by Megan Yap, a CS &amp; linguistics student at Cornell, and is currently piloted in Czech classes at Harvard, Brown &amp; Columbia."
	/>
	<meta name="author" content="Megan Yap" />
	<link rel="canonical" href="https://sklonuj.com/about" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com/about" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com/about" />
	<meta property="og:title" content="About — Skloňuj Czech Declension Trainer" />
	<meta
		property="og:description"
		content="Skloňuj is built by Megan Yap, a CS &amp; linguistics student at Cornell, and is currently piloted in Czech classes at Harvard, Brown &amp; Columbia."
	/>
	<meta property="og:url" content="https://sklonuj.com/about" />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="About — Skloňuj Czech Declension Trainer" />
	<meta
		name="twitter:description"
		content="Skloňuj is built by Megan Yap, a CS &amp; linguistics student at Cornell, and is currently piloted in Czech classes at Harvard, Brown &amp; Columbia."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "AboutPage",
			"name": "About Skloňuj",
			"url": "https://sklonuj.com/about",
			"mainEntity": {
				"@type": "Person",
				"name": "Megan Yap",
				"url": "https://meganyap.me",
				"sameAs": [
					"https://meganyap.me",
					"https://github.com/megany128",
					"https://www.linkedin.com/in/megan-qz-yap"
				],
				"jobTitle": "Computer Science & Linguistics Student",
				"affiliation": {
					"@type": "CollegeOrUniversity",
					"name": "Cornell University"
				},
				"knowsLanguage": ["English", "Czech", "Chinese"]
			}
		}
	</script>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar {user} onSignIn={() => goto(resolve('/auth'))} />

	<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
		<!-- Header -->
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold text-emphasis">About Skloňuj</h1>
			<p class="mt-1 text-sm text-darker-subtitle">
				The story behind the app, and the person behind the story!
			</p>
		</div>

		<div class="grid gap-6 md:grid-cols-2">
			<!-- Bio section -->
			<section class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<div class="mb-4 flex items-center gap-3">
					<img
						src="/megan.jpg"
						alt="Megan Yap"
						class="size-14 shrink-0 rounded-full object-cover"
					/>
					<div>
						<h2 class="text-sm font-semibold text-emphasis">Hi, I'm Megan</h2>
						<p class="text-xs text-darker-subtitle">CS &amp; Linguistics, Cornell</p>
					</div>
				</div>
				<p class="text-sm leading-relaxed text-text-subtitle">
					I study computer science and linguistics at
					<span class="font-medium text-text-default">Cornell</span>, and this summer I'll be at
					<span class="font-medium text-text-default">Google</span>. I love languages — I spent
					COVID lockdown studying Mandarin, and I'm now slowly making my way through Czech (my
					boyfriend is Czech, which unsurprisingly turns out to be a fantastic motivator for
					language learning).
				</p>
				<p class="mt-3 text-sm leading-relaxed text-text-subtitle">
					On the side, I'm also building
					<a
						href="https://lingofable.com"
						target="_blank"
						rel="noopener noreferrer"
						class="font-medium text-text-default underline decoration-dotted underline-offset-2 hover:text-emphasis"
						>Lingofable</a
					> with said boyfriend. It's a comprehensible-input mobile app that turns short fables into language-learning
					material. Czech is coming soon!
				</p>
			</section>

			<!-- Why Skloňuj -->
			<section class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-3 text-sm font-semibold text-emphasis">Why Skloňuj exists</h2>
				<p class="text-sm leading-relaxed text-text-subtitle">
					Czech declension has been the absolute bane of my existence, and I know most learners
					struggle with it too. But when I looked for practice tools, the options were either
					reference tables or quizzes that had words way above my level.
				</p>
				<p class="mt-3 text-sm leading-relaxed text-text-subtitle">
					So <span class="font-medium text-emphasis">Skloňuj</span> is the tool I wished existed!
					Vocab that is actually at your level, adaptive drills that adjust to where you're weak,
					all 7 cases and 12 paradigms with proper morphological data, plus pronouns and
					adjective-noun agreement practice. From conversations with professors, I've realized that
					Czech is really under-resourced, and so
					<span class="font-medium text-emphasis">Skloňuj</span> is and always will be free.
				</p>
			</section>

			<!-- Trusted by section -->
			<section class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-3 text-sm font-semibold text-emphasis">Used in Czech classrooms</h2>
				<p class="text-sm leading-relaxed text-text-subtitle">
					<span class="font-medium text-emphasis">Skloňuj</span> is currently being piloted in
					introductory and intermediate Czech classes at
					<span class="font-medium text-text-default">Harvard</span>,
					<span class="font-medium text-text-default">Brown</span>, and
					<span class="font-medium text-text-default">Columbia</span>. If you teach Czech and would
					like to use <span class="font-medium text-emphasis">Skloňuj</span> with your students,
					please
					<a
						href={resolve('/contact')}
						class="font-medium text-text-default underline decoration-dotted underline-offset-2 hover:text-emphasis"
						>get in touch</a
					>. I'd love to hear from you!
				</p>
			</section>

			<!-- Connect section -->
			<section class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-3 text-sm font-semibold text-emphasis">Connect</h2>
				<ul class="space-y-2 text-sm leading-relaxed text-text-subtitle">
					<li>
						<a
							href="mailto:may52@cornell.edu"
							class="font-medium text-text-default underline decoration-dotted underline-offset-2 hover:text-emphasis"
							>Email</a
						>
					</li>
					<li>
						<a
							href="https://meganyap.me"
							rel="me noopener noreferrer"
							target="_blank"
							class="font-medium text-text-default underline decoration-dotted underline-offset-2 hover:text-emphasis"
							>Personal site</a
						>
					</li>
					<li>
						<a
							href="https://www.linkedin.com/in/megan-qz-yap"
							rel="me noopener noreferrer"
							target="_blank"
							class="font-medium text-text-default underline decoration-dotted underline-offset-2 hover:text-emphasis"
							>LinkedIn</a
						>
					</li>
					<li>
						<a
							href="https://github.com/megany128/sklonuj"
							rel="noopener noreferrer"
							target="_blank"
							class="font-medium text-text-default underline decoration-dotted underline-offset-2 hover:text-emphasis"
							>Contribute to the repository</a
						>
					</li>
				</ul>
			</section>
		</div>
	</main>
</div>
