<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	let user = $derived(page.data.user);

	let category = $state<'bug' | 'feature' | 'general'>('feature');
	let name = $state('');
	let email = $state('');
	let message = $state('');
	let submitting = $state(false);
	let submitted = $state(false);
	let error = $state<string | null>(null);

	const categoryLabels: Record<typeof category, string> = {
		feature: 'Feature Suggestion',
		bug: 'Bug Report',
		general: 'General Feedback'
	};

	function resetForm(): void {
		name = '';
		email = '';
		message = '';
		category = 'feature';
		error = null;
		submitted = false;
	}
</script>

<svelte:head>
	<title>Contact — Skloňuj Czech Declension Trainer</title>
	<meta
		name="description"
		content="Send feedback, report issues, or get in touch with the Skloňuj team — the free Czech declension practice app."
	/>
	<meta name="author" content="Megan Yap" />
	<link rel="canonical" href="https://sklonuj.com/contact" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com/contact" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com/contact" />
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
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar {user} onSignIn={() => goto(resolve('/'))} />

	<main class="mx-auto w-full max-w-xl flex-1 px-4 py-10">
		<!-- Header -->
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold text-emphasis">Feedback & Contact</h1>
			<p class="mt-1 text-sm text-darker-subtitle">
				Hey, I'm Megan and I've been learning Czech for a while now! Declensions have been the bane
				of my existence, and so I created Skloňuj to make studying them easier. If you have ideas to
				make this better, I'd love to hear them.
			</p>
		</div>

		<!-- Feedback form -->
		<div class="mb-8 rounded-2xl border border-card-stroke bg-card-bg p-6">
			{#if submitted}
				<!-- Success message -->
				<div class="text-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="mx-auto mb-3 size-12 text-green-500"
					>
						<path
							fill-rule="evenodd"
							d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
							clip-rule="evenodd"
						/>
					</svg>
					<h2 class="mb-2 text-lg font-semibold text-text-default">Message sent!</h2>
					<p class="mb-6 text-sm text-text-subtitle">Thank you for reaching out!</p>
					<button
						type="button"
						onclick={resetForm}
						class="rounded-xl bg-emphasis px-5 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
					>
						Send another message
					</button>
				</div>
			{:else}
				<form
					method="POST"
					action="?/submit"
					use:enhance={() => {
						submitting = true;
						error = null;
						return async ({ result, update }) => {
							submitting = false;
							if (result.type === 'success') {
								submitted = true;
							} else if (result.type === 'failure') {
								const data = result.data as { error?: string } | null;
								error = data?.error ?? 'Failed to submit message. Please try again.';
							} else if (result.type === 'error') {
								error = 'An unexpected error occurred. Please try again.';
							}
							await update();
						};
					}}
				>
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
									disabled={submitting}
									class="rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150
										{category === cat
										? 'bg-emphasis text-text-inverted'
										: 'bg-shaded-background text-text-subtitle hover:text-text-default'}
										disabled:cursor-not-allowed disabled:opacity-50"
								>
									{categoryLabels[cat]}
								</button>
							{/each}
						</div>
						<input type="hidden" name="category" value={category} />
					</fieldset>

					<!-- Name input -->
					<label class="mb-4 block">
						<span
							class="mb-2 block text-xs font-semibold uppercase tracking-widest text-text-subtitle"
						>
							Name
						</span>
						<input
							type="text"
							name="name"
							bind:value={name}
							disabled={submitting}
							placeholder="Your name"
							maxlength={100}
							required
							class="w-full rounded-xl border border-card-stroke bg-shaded-background px-4 py-3 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						/>
					</label>

					<!-- Email input -->
					<label class="mb-4 block">
						<span
							class="mb-2 block text-xs font-semibold uppercase tracking-widest text-text-subtitle"
						>
							Email
						</span>
						<input
							type="email"
							name="email"
							bind:value={email}
							disabled={submitting}
							placeholder="your@email.com"
							maxlength={200}
							required
							class="w-full rounded-xl border border-card-stroke bg-shaded-background px-4 py-3 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						/>
					</label>

					<!-- Message textarea -->
					<label class="mb-4 block">
						<span
							class="mb-2 block text-xs font-semibold uppercase tracking-widest text-text-subtitle"
						>
							Message
						</span>
						<textarea
							name="message"
							bind:value={message}
							disabled={submitting}
							rows={5}
							placeholder="How can I help?"
							maxlength={5000}
							required
							class="w-full resize-y rounded-xl border border-card-stroke bg-shaded-background px-4 py-3 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
						></textarea>
					</label>

					<!-- Error message -->
					{#if error}
						<div
							class="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
							role="alert"
						>
							{error}
						</div>
					{/if}

					<!-- Submit button -->
					<button
						type="submit"
						disabled={submitting ||
							name.trim().length === 0 ||
							email.trim().length === 0 ||
							message.trim().length === 0}
						class="mx-auto block rounded-xl bg-emphasis px-5 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{submitting ? 'Submitting...' : 'Submit'}
					</button>
				</form>
			{/if}
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
