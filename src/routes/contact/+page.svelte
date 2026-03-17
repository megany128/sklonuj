<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let user = $derived($page.data.user);

	let category = $state<'bug' | 'feature' | 'general'>('feature');
	let message = $state('');
	let turnstileVerified = $state(false);
	let turnstileEl: HTMLDivElement | undefined = $state(undefined);

	// Dark mode
	let darkMode = $state(false);
	let initialized = $state(false);

	$effect(() => {
		if (initialized) return;
		initialized = true;
		if (typeof window === 'undefined') return;
		const stored = localStorage.getItem('sklonuj_dark');
		if (stored !== null) {
			darkMode = stored === 'true';
		} else {
			darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
		document.documentElement.classList.toggle('dark', darkMode);
	});

	function toggleDarkMode(): void {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark', darkMode);
		localStorage.setItem('sklonuj_dark', String(darkMode));
	}

	// Render Turnstile widget once the container is mounted
	interface TurnstileApi {
		render: (
			el: HTMLElement,
			opts: {
				sitekey: string;
				theme: string;
				callback: (token: string) => void;
				'expired-callback': () => void;
			}
		) => void;
	}

	function getTurnstile(): TurnstileApi | null {
		if ('turnstile' in window) {
			return window.turnstile as unknown as TurnstileApi;
		}
		return null;
	}

	$effect(() => {
		if (!turnstileEl) return;

		function tryRender(): boolean {
			const api = getTurnstile();
			if (!api) return false;
			api.render(turnstileEl!, {
				sitekey: '0x4AAAAAACr1idZsmJCaME8w',
				theme: darkMode ? 'dark' : 'light',
				callback: () => {
					turnstileVerified = true;
				},
				'expired-callback': () => {
					turnstileVerified = false;
				}
			});
			return true;
		}

		if (!tryRender()) {
			const interval = setInterval(() => {
				if (tryRender()) clearInterval(interval);
			}, 200);
			const cleanup = setTimeout(() => clearInterval(interval), 10000);
			return () => {
				clearInterval(interval);
				clearTimeout(cleanup);
			};
		}
	});

	const categoryLabels: Record<typeof category, string> = {
		feature: 'Feature Suggestion',
		bug: 'Bug Report',
		general: 'General Feedback'
	};

	function handleFormSubmit(): void {
		const subject = encodeURIComponent(`[Skloňuj] ${categoryLabels[category]}`);
		const body = encodeURIComponent(message);
		window.location.href = `mailto:hello@meganyap.me?subject=${subject}&body=${body}`;
	}
</script>

<svelte:head>
	<title>Contact — Skloňuj Czech Declension Trainer</title>
	<meta
		name="description"
		content="Send feedback, report issues, or get in touch with the Skloňuj team — the free Czech declension practice app."
	/>
	<link rel="canonical" href="https://sklonuj.com/contact" />
	<meta property="og:title" content="Contact — Skloňuj Czech Declension Trainer" />
	<meta
		property="og:description"
		content="Send feedback, report issues, or get in touch with the Skloňuj team — the free Czech declension practice app."
	/>
	<meta property="og:url" content="https://sklonuj.com/contact" />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Contact — Skloňuj Czech Declension Trainer" />
	<meta
		name="twitter:description"
		content="Send feedback, report issues, or get in touch with the Skloňuj team — the free Czech declension practice app."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar
		{darkMode}
		onToggleDarkMode={toggleDarkMode}
		{user}
		onSignIn={() => goto(resolve('/'))}
		onNavigate={() => goto(resolve('/'))}
	/>

	<main class="mx-auto w-full max-w-xl flex-1 px-4 py-10">
		<!-- Header -->
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold text-emphasis">Feedback & Contact</h1>
			<p class="mt-1 text-sm text-darker-subtitle">
				My name is Megan and I'm the creator of Skloňuj! I'm learning Czech because of my boyfriend,
				but declensions have been the bane of my Czech learning so far. If you have ideas to make
				this better, I'd love to hear them.
			</p>
		</div>

		<!-- Feedback form -->
		<div class="mb-8 rounded-2xl border border-card-stroke bg-card-bg p-6">
			<!-- Category selector -->
			<fieldset class="mb-5">
				<legend class="mb-2 text-xs font-semibold uppercase tracking-widest text-text-subtitle">
					Category
				</legend>
				<div class="flex flex-wrap gap-2">
					{#each ['feature', 'bug', 'general'] as const as cat (cat)}
						<button
							type="button"
							onclick={() => (category = cat)}
							class="rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150
								{category === cat
								? 'bg-emphasis text-text-inverted'
								: 'bg-shaded-background text-text-subtitle hover:text-text-default'}"
						>
							{categoryLabels[cat]}
						</button>
					{/each}
				</div>
			</fieldset>

			<!-- Message textarea -->
			<label class="mb-4 block">
				<span class="mb-2 block text-xs font-semibold uppercase tracking-widest text-text-subtitle">
					Message
				</span>
				<textarea
					bind:value={message}
					rows={5}
					placeholder="How can I help?"
					class="w-full resize-y rounded-xl border border-card-stroke bg-shaded-background px-4 py-3 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
				></textarea>
			</label>

			<!-- Turnstile captcha -->
			<div class="mb-4" bind:this={turnstileEl}></div>

			<!-- Submit button -->
			<button
				type="button"
				onclick={handleFormSubmit}
				disabled={message.trim().length === 0 || !turnstileVerified}
				class="rounded-xl bg-emphasis px-5 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
			>
				Submit
			</button>
		</div>

		<!-- Quick links section -->
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-5">
				<h2 class="mb-1 text-sm font-semibold text-text-default">Have a suggestion?</h2>
				<p class="text-xs leading-relaxed text-text-subtitle">
					I'd love to hear your ideas for new features, drills, or improvements.
				</p>
			</div>
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-5">
				<h2 class="mb-1 text-sm font-semibold text-text-default">Found a bug?</h2>
				<p class="text-xs leading-relaxed text-text-subtitle">
					Describe what happened and what you expected. The more detail, the better.
				</p>
			</div>
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-5">
				<h2 class="mb-1 text-sm font-semibold text-text-default">Just want to say hi?</h2>
				<p class="text-xs leading-relaxed text-text-subtitle">
					That's cool too. Drop me a line and let me know how your Czech is coming along.
				</p>
			</div>
		</div>

		<!-- Credits -->
		<div class="mt-10 rounded-2xl border border-card-stroke bg-card-bg p-6">
			<h2 class="mb-3 text-sm font-semibold text-text-default">Credits & Acknowledgments</h2>
			<ul class="space-y-2.5 text-xs leading-relaxed text-text-subtitle">
				<li>
					Morphological data powered by
					<a
						href="https://ufal.mff.cuni.cz/morphodita"
						target="_blank"
						rel="noopener noreferrer"
						class="font-medium text-text-default underline decoration-dotted underline-offset-2 hover:text-emphasis"
						>MorphoDiTa</a
					> from ÚFAL, Charles University.
				</li>
				<li>
					Huge thanks to
					<span class="font-medium text-text-default">David S. Danaher</span> for his chapter-by-chapter
					vocabulary lists for Krok za krokem. They were an enormous help in building the curriculum and
					saved me from having to compile everything manually.
				</li>
			</ul>
		</div>
	</main>
</div>
