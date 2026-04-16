<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	let formResult = $derived(page.form);
	let errorMessage = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.message === 'string') {
			return formResult.message;
		}
		return null;
	});

	let prefillCode = $derived.by(() => {
		const val: unknown = page.data.code;
		return typeof val === 'string' ? val : '';
	});

	let savedCode = $derived.by(() => {
		if (isRecord(formResult) && typeof formResult.code === 'string') {
			return formResult.code;
		}
		return prefillCode;
	});

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Join Class - Skloňuj</title>
</svelte:head>

<NavBar user={page.data.user} onSignIn={() => goto(resolve('/auth'))} />

<div class="mx-auto max-w-lg px-4 py-8">
	<a
		href={resolve('/classes')}
		class="mb-4 inline-flex items-center gap-1 text-sm text-darker-subtitle transition-colors hover:text-text-default"
	>
		&larr; Back to Classes
	</a>

	<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
		<h1 class="mb-2 text-xl font-semibold text-text-default">Join a Class</h1>
		<p class="mb-6 text-sm text-text-subtitle">
			Enter the 6-character class code provided by your teacher.
		</p>

		{#if errorMessage}
			<div
				class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-3 text-sm text-negative-stroke"
			>
				{errorMessage}
			</div>
		{/if}

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			<div class="mb-6">
				<label for="code" class="mb-1 block text-sm font-medium text-text-default">
					Class Code
				</label>
				<input
					type="text"
					id="code"
					name="code"
					value={savedCode}
					required
					maxlength={6}
					minlength={6}
					placeholder="e.g. ABC123"
					class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 font-mono text-sm uppercase tracking-widest text-text-default placeholder:tracking-normal placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
				/>
			</div>

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{submitting ? 'Joining...' : 'Join Class'}
			</button>
		</form>
	</div>
</div>
