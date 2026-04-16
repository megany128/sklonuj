<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let user = $derived(page.data.user);
</script>

<svelte:head>
	<title>Privacy Policy — Skloňuj Czech Declension Trainer</title>
	<meta
		name="description"
		content="Privacy policy for Skloňuj — learn how we handle analytics, cookies, and your account data."
	/>
	<meta name="author" content="Megan Yap" />
	<link rel="canonical" href="https://sklonuj.com/privacy" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com/privacy" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com/privacy" />
	<meta property="og:title" content="Privacy Policy — Skloňuj Czech Declension Trainer" />
	<meta
		property="og:description"
		content="Privacy policy for Skloňuj — learn how we handle analytics, cookies, and your account data."
	/>
	<meta property="og:url" content="https://sklonuj.com/privacy" />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Privacy Policy — Skloňuj Czech Declension Trainer" />
	<meta
		name="twitter:description"
		content="Privacy policy for Skloňuj — learn how we handle analytics, cookies, and your account data."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar {user} onSignIn={() => goto(resolve('/auth'))} />

	<main class="mx-auto w-full max-w-xl flex-1 px-4 py-10">
		<!-- Header -->
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold text-emphasis">Privacy Policy</h1>
			<p class="mt-1 text-sm text-darker-subtitle">Last updated: March 2026</p>
		</div>

		<!-- Sections -->
		<div class="space-y-4">
			<!-- Analytics -->
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-2 text-sm font-semibold text-text-default">Analytics</h2>
				<p class="text-sm leading-relaxed text-text-subtitle">
					We use PostHog to collect anonymous usage data — pages visited, practice sessions started,
					and questions answered. This helps us understand how the app is used and improve it.
					PostHog may record your session (screen activity) to help us spot usability issues. No
					personally identifiable information is collected for analytics unless you create an
					account. We also use Cloudflare Web Analytics for aggregate traffic data.
				</p>
			</div>

			<!-- Cookies & Local Storage -->
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-2 text-sm font-semibold text-text-default">Cookies & Local Storage</h2>
				<p class="text-sm leading-relaxed text-text-subtitle">
					Your practice progress is saved in your browser's localStorage so it persists between
					visits without an account. PostHog uses cookies to distinguish between separate visits and
					sessions.
				</p>
			</div>

			<!-- Account Data -->
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-2 text-sm font-semibold text-text-default">Account Data</h2>
				<p class="text-sm leading-relaxed text-text-subtitle">
					If you create an account, your email address and practice progress are stored securely. We
					do not sell or share your personal data with third parties.
				</p>
			</div>

			<!-- Contact -->
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
				<h2 class="mb-2 text-sm font-semibold text-text-default">Contact</h2>
				<p class="text-sm leading-relaxed text-text-subtitle">
					Questions about this policy? Reach out via the
					<a
						href={resolve('/contact')}
						class="font-medium text-text-default underline decoration-dotted underline-offset-2 hover:text-emphasis"
						>contact page</a
					>.
				</p>
			</div>
		</div>
	</main>
</div>
