<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import type { EmailOtpType } from '@supabase/supabase-js';

	let viewMode: 'verifying' | 'reset' | 'error' = $state('verifying');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');

	const supabase = getSupabaseBrowserClient();

	function clearError() {
		error = '';
	}

	async function handleResetPassword() {
		if (!newPassword) {
			error = 'Please enter a new password.';
			return;
		}

		if (newPassword.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}

		if (newPassword !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		loading = true;
		error = '';

		const { error: err } = await supabase.auth.updateUser({ password: newPassword });

		if (err) {
			error = err.message;
		} else {
			await goto(resolve('/'), { replaceState: true });
		}

		loading = false;
	}

	onMount(async () => {
		const authBase = resolve('/auth');
		const token_hash = page.url.searchParams.get('token_hash');
		const type = page.url.searchParams.get('type') as EmailOtpType | null;

		if (!token_hash || !type) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- authBase uses resolve()
			await goto(`${authBase}?error=missing_token`, { replaceState: true });
			return;
		}

		const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash, type });

		if (verifyError) {
			console.error('Email confirmation error:', verifyError.message);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- authBase uses resolve()
			await goto(`${authBase}?error=auth_failed`, { replaceState: true });
			return;
		}

		// Recovery flow: show the reset password form on this page so the
		// browser client's session (established by verifyOtp) stays live.
		if (type === 'recovery') {
			viewMode = 'reset';
			return;
		}

		const returnTo = page.url.searchParams.get('returnTo');
		if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- returnTo is a validated relative path
			await goto(returnTo, { replaceState: true });
			return;
		}

		await goto(resolve('/'), { replaceState: true });
	});
</script>

{#if viewMode === 'verifying'}
	<div class="flex min-h-screen items-center justify-center">
		<p class="text-text-subtitle">Verifying...</p>
	</div>
{:else if viewMode === 'reset'}
	<div class="flex min-h-screen items-center justify-center bg-page-bg">
		<div class="w-full max-w-sm rounded-3xl border border-card-stroke bg-card-bg p-8 shadow-sm">
			<h1 class="mb-1 text-center text-lg font-semibold text-text-default">Set new password</h1>
			<p class="mb-5 text-center text-xs text-text-subtitle">Enter your new password below.</p>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleResetPassword();
				}}
				class="flex flex-col gap-3"
			>
				<input
					type="password"
					bind:value={newPassword}
					placeholder="New password"
					required
					minlength="6"
					aria-label="New password"
					oninput={clearError}
					class="w-full cursor-text rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default caret-emphasis placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
				/>

				<input
					type="password"
					bind:value={confirmPassword}
					placeholder="Confirm new password"
					required
					minlength="6"
					aria-label="Confirm new password"
					oninput={clearError}
					class="w-full cursor-text rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default caret-emphasis placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
				/>

				<div aria-live="assertive">
					{#if error}
						<p class="text-xs text-negative-stroke" role="alert">{error}</p>
					{/if}
				</div>

				<button
					type="submit"
					disabled={loading}
					class="rounded-xl bg-emphasis px-4 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{#if loading}
						...
					{:else}
						Update password
					{/if}
				</button>
			</form>
		</div>
	</div>
{/if}
