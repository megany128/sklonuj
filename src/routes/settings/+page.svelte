<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import { resetProgress } from '$lib/engine/progress';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	const supabase = getSupabaseBrowserClient();

	let user = $derived($page.data.user);
	let displayName = $state('');
	let emailReminders = $state(false);
	let saving = $state(false);
	let loaded = $state(false);

	// Dark mode
	let darkMode = $state(false);
	let darkModeInit = $state(false);

	$effect(() => {
		if (darkModeInit) return;
		darkModeInit = true;
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

	$effect(() => {
		if (!user) {
			goto(resolve('/auth'));
			return;
		}
		loadProfile();
	});

	async function loadProfile() {
		const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single();

		if (data) {
			displayName = data.display_name ?? '';
			emailReminders = data.email_reminders ?? false;
		}
		loaded = true;
	}

	async function saveProfile() {
		if (!user) return;
		saving = true;

		await supabase
			.from('profiles')
			.update({
				display_name: displayName || null,
				email_reminders: emailReminders,
				updated_at: new Date().toISOString()
			})
			.eq('id', user.id);

		saving = false;
	}

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto(resolve('/'));
	}

	let confirmingReset = $state(false);
	let resetting = $state(false);

	async function handleResetProgress() {
		if (!user) return;
		resetting = true;
		resetProgress();
		await supabase
			.from('user_progress')
			.update({
				level: 'A1',
				case_scores: {},
				paradigm_scores: {},
				last_session: '',
				updated_at: new Date().toISOString()
			})
			.eq('user_id', user.id);
		resetting = false;
		confirmingReset = false;
	}
</script>

<svelte:head>
	<title>Settings - Skloňuj</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar
		{darkMode}
		onToggleDarkMode={toggleDarkMode}
		{user}
		onSignIn={() => goto(resolve('/'))}
		onNavigate={() => goto(resolve('/'))}
	/>

	<main class="mx-auto w-full max-w-lg flex-1 px-4 py-8">
		{#if !loaded}
			<p class="text-center text-sm text-text-subtitle">Loading...</p>
		{:else}
			<h1 class="mb-6 text-lg font-semibold text-text-default">Settings</h1>

			<!-- Display name -->
			<section class="mb-6">
				<label
					for="display-name"
					class="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-subtitle"
				>
					Display name
				</label>
				<input
					id="display-name"
					type="text"
					bind:value={displayName}
					placeholder={user?.email?.split('@')[0] ?? 'Your name'}
					maxlength="50"
					class="w-full rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
				/>
			</section>

			<!-- Email reminders -->
			<section class="mb-6">
				<label class="flex cursor-pointer items-center gap-3">
					<input type="checkbox" bind:checked={emailReminders} class="size-4 accent-emphasis" />
					<span class="text-sm text-text-default">Weekly summary email</span>
				</label>
				<p class="mt-1 ml-7 text-xs text-text-subtitle">
					Receive a weekly email with your accuracy stats and suggested focus areas.
				</p>
			</section>

			<!-- Save -->
			<button
				type="button"
				onclick={saveProfile}
				disabled={saving}
				class="mb-8 rounded-xl bg-emphasis px-6 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{saving ? 'Saving...' : 'Save changes'}
			</button>

			<hr class="mb-6 border-card-stroke" />

			<!-- Danger zone -->
			<div class="flex flex-col gap-3">
				{#if confirmingReset}
					<div class="rounded-xl border border-negative-stroke bg-negative-background p-4">
						<p class="mb-3 text-sm font-semibold text-negative-stroke">
							Are you sure? This will permanently erase all your practice data.
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={handleResetProgress}
								disabled={resetting}
								class="rounded-lg bg-negative-stroke px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
							>
								{resetting ? 'Resetting...' : 'Yes, reset everything'}
							</button>
							<button
								type="button"
								onclick={() => (confirmingReset = false)}
								class="rounded-lg px-4 py-2 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (confirmingReset = true)}
						class="text-left text-sm text-negative-stroke underline underline-offset-2 hover:opacity-80"
					>
						Reset all progress
					</button>
				{/if}
				<button
					type="button"
					onclick={handleSignOut}
					class="text-left text-sm text-text-subtitle underline underline-offset-2 hover:text-text-default"
				>
					Sign out
				</button>
			</div>
		{/if}
	</main>
</div>
