<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getSupabaseBrowserClient, sendPasswordResetEmail } from '$lib/supabase';
	import posthog from '$lib/posthog';

	// Initialize mode synchronously from URL so the redirect effect below
	// doesn't bounce an authenticated recovery user away before onMount runs.
	let mode = $state<'login' | 'signup' | 'forgot' | 'reset'>(
		page.url.searchParams.get('recovery') === 'true' ? 'reset' : 'login'
	);
	let email = $state('');
	let password = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let confirmationSent = $state(false);
	let resetEmailSent = $state(false);
	let emailReminders = $state(true);

	const supabase = getSupabaseBrowserClient();

	const isJoiningClass = $derived(
		(page.url.searchParams.get('returnTo') ?? '').includes('/classes/join')
	);

	function getRedirectUrl(): string {
		const redirectPath =
			page.url.searchParams.get('redirect') ?? page.url.searchParams.get('returnTo') ?? '';
		// Validate redirect is a relative path to prevent open redirects
		if (redirectPath && redirectPath.startsWith('/') && !redirectPath.startsWith('//')) {
			return redirectPath;
		}
		return resolve('/');
	}

	// Redirect already-authenticated users to the intended destination or home
	// (but not if they are in recovery/reset mode — they need to set a new password)
	$effect(() => {
		if (page.data.user && mode !== 'reset') {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- getRedirectUrl validates the path or uses resolve('/')
			goto(getRedirectUrl());
		}
	});

	onMount(() => {
		// Reset loading state in case user navigates back from OAuth redirect
		loading = false;
		// Show error from OAuth callback redirect (e.g., /auth?error=...)
		const oauthError = page.url.searchParams.get('error');
		if (oauthError) {
			error = oauthError;
		}
	});

	async function handleEmailAuth() {
		if (!email.trim()) {
			error = 'Please enter your email.';
			return;
		}

		loading = true;
		error = '';

		if (!password) {
			error = 'Please enter your password.';
			loading = false;
			return;
		}

		if (mode === 'signup' && password.length < 6) {
			error = 'Password must be at least 6 characters.';
			loading = false;
			return;
		}

		if (mode === 'signup') {
			// Preserve returnTo through the email confirmation round-trip so users who
			// signed up via an invite link land back on the join flow after confirming.
			const returnTo = page.url.searchParams.get('returnTo');
			const callbackUrl =
				returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
					? `${page.url.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`
					: `${page.url.origin}/auth/callback`;
			const { data, error: err } = await supabase.auth.signUp({
				email,
				password,
				options: { emailRedirectTo: callbackUrl }
			});
			if (err) {
				error = err.message;
			} else {
				// The DB default for email_reminders is true, so we only need to
				// update the profile if the user explicitly opted out.
				if (!emailReminders && data.user) {
					await supabase.from('profiles').update({ email_reminders: false }).eq('id', data.user.id);
				}
				if (data.session) {
					posthog.capture('signed_up', { method: 'email' });
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- getRedirectUrl validates the path or uses resolve('/')
					goto(getRedirectUrl());
				} else {
					posthog.capture('signed_up', { method: 'email' });
					confirmationSent = true;
				}
			}
		} else {
			const { error: err } = await supabase.auth.signInWithPassword({ email, password });
			if (err) {
				error = err.message;
			} else {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- getRedirectUrl validates the path or uses resolve('/')
				goto(getRedirectUrl());
			}
		}

		loading = false;
	}

	async function handleGoogleOAuth() {
		loading = true;
		error = '';
		const returnTo = page.url.searchParams.get('returnTo');
		const callbackUrl =
			returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
				? `${page.url.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`
				: `${page.url.origin}/auth/callback`;
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: callbackUrl }
		});
		if (err) {
			error = err.message;
			loading = false;
		}
	}

	async function handleForgotPassword() {
		if (!email.trim()) {
			error = 'Please enter your email.';
			return;
		}

		loading = true;
		error = '';

		const returnTo = page.url.searchParams.get('returnTo');
		const recoveryRedirect =
			returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
				? `${page.url.origin}/auth/confirm?returnTo=${encodeURIComponent(returnTo)}`
				: `${page.url.origin}/auth/confirm`;

		const { error: err } = await sendPasswordResetEmail(email, recoveryRedirect);

		if (err) {
			error = err.message;
		} else {
			resetEmailSent = true;
		}

		loading = false;
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
			goto(resolve('/'));
		}

		loading = false;
	}

	function clearError() {
		error = '';
	}
</script>

<svelte:head>
	<title>Sign in - Skloňuj</title>
	<meta
		name="description"
		content="Sign in to Skloňuj to sync your Czech declension practice progress across devices."
	/>
	<link rel="canonical" href="https://sklonuj.com/auth" />
	<meta property="og:title" content="Sign in - Skloňuj" />
	<meta
		property="og:description"
		content="Sign in to Skloňuj to sync your Czech declension practice progress across devices."
	/>
	<meta property="og:url" content="https://sklonuj.com/auth" />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Sign in - Skloňuj" />
	<meta
		name="twitter:description"
		content="Sign in to Skloňuj to sync your Czech declension practice progress across devices."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<a
			href={resolve('/')}
			class="mb-8 block text-center text-lg font-semibold uppercase tracking-wide text-emphasis"
		>
			Skloňuj
		</a>

		<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
			{#if isJoiningClass}
				<div
					class="mb-4 rounded-xl border border-emphasis/20 bg-emphasis/5 px-4 py-3 text-center text-sm text-text-default"
				>
					You're joining a class! Sign in or create an account to continue.
				</div>
			{/if}

			{#if mode === 'reset'}
				<!-- Set new password after clicking recovery link -->
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
			{:else if confirmationSent}
				<div class="text-center">
					<p class="mb-2 text-lg font-semibold text-text-default">Check your email</p>
					<p class="mb-4 text-sm text-text-subtitle">
						We sent a confirmation link to <strong class="text-text-default">{email}</strong>. Click
						it to finish signing up.
					</p>
					<button
						type="button"
						onclick={() => {
							confirmationSent = false;
							mode = 'login';
						}}
						class="text-sm text-emphasis underline underline-offset-2"
					>
						Back to sign in
					</button>
				</div>
			{:else if resetEmailSent}
				<div class="text-center">
					<p class="mb-2 text-lg font-semibold text-text-default">Check your email</p>
					<p class="mb-4 text-sm text-text-subtitle">
						We sent a password reset link to <strong class="text-text-default">{email}</strong>.
						Click it to set a new password.
					</p>
					<button
						type="button"
						onclick={() => {
							resetEmailSent = false;
							mode = 'login';
						}}
						class="text-sm text-emphasis underline underline-offset-2"
					>
						Back to sign in
					</button>
				</div>
			{:else if mode === 'forgot'}
				<!-- Forgot password form -->
				<h1 class="mb-1 text-center text-lg font-semibold text-text-default">
					Reset your password
				</h1>
				<p class="mb-5 text-center text-xs text-text-subtitle">
					Enter your email and we'll send you a reset link.
				</p>

				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleForgotPassword();
					}}
					class="flex flex-col gap-3"
				>
					<input
						type="email"
						bind:value={email}
						placeholder="Email"
						required
						aria-label="Email address"
						oninput={clearError}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
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
							Send reset link
						{/if}
					</button>
				</form>

				<div class="mt-4 flex flex-col items-center gap-1.5 text-xs text-text-subtitle">
					<button
						type="button"
						onclick={() => {
							error = '';
							mode = 'login';
						}}
						class="underline underline-offset-2 hover:text-text-default"
					>
						Back to sign in
					</button>
				</div>
			{:else}
				<h1 class="mb-1 text-center text-lg font-semibold text-text-default">
					{mode === 'signup' ? 'Create your account' : 'Welcome back'}
				</h1>
				<p class="mb-5 text-center text-xs text-text-subtitle">
					{mode === 'signup'
						? 'Free forever — your future Czech self will thank you.'
						: 'Your personalized practice is waiting.'}
				</p>

				<!-- Google OAuth -->
				<button
					type="button"
					onclick={handleGoogleOAuth}
					disabled={loading}
					class="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-sm font-medium text-text-default transition-colors hover:bg-shaded-background disabled:opacity-50"
				>
					<svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
						<path
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
							fill="#4285F4"
						/>
						<path
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							fill="#34A853"
						/>
						<path
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							fill="#FBBC05"
						/>
						<path
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							fill="#EA4335"
						/>
					</svg>
					Continue with Google
				</button>

				<div class="relative mb-4">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-card-stroke"></div>
					</div>
					<div class="relative flex justify-center text-xs">
						<span class="bg-card-bg px-2 text-text-subtitle">or</span>
					</div>
				</div>

				<!-- Email form -->
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleEmailAuth();
					}}
					class="flex flex-col gap-3"
				>
					<input
						type="email"
						bind:value={email}
						placeholder="Email"
						required
						aria-label="Email address"
						oninput={clearError}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					/>

					<input
						type="password"
						bind:value={password}
						placeholder="Password"
						required
						minlength="6"
						aria-label="Password"
						oninput={clearError}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					/>

					{#if mode === 'signup'}
						<label class="flex items-center gap-2 text-sm text-text-subtitle">
							<input
								type="checkbox"
								bind:checked={emailReminders}
								class="size-4 rounded border-card-stroke text-emphasis accent-emphasis focus:ring-emphasis"
							/>
							Send me weekly practice reminders
						</label>
					{/if}

					{#if mode === 'login'}
						<div class="flex justify-end">
							<button
								type="button"
								onclick={() => {
									error = '';
									mode = 'forgot';
								}}
								class="text-xs text-text-subtitle underline underline-offset-2 hover:text-text-default"
							>
								Forgot password?
							</button>
						</div>
					{/if}

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
						{:else if mode === 'signup'}
							Create account
						{:else}
							Sign in
						{/if}
					</button>
				</form>

				<!-- Mode toggles -->
				<div class="mt-4 flex flex-col items-center gap-1.5 text-xs text-text-subtitle">
					{#if mode === 'login'}
						<button
							type="button"
							onclick={() => (mode = 'signup')}
							class="underline underline-offset-2 hover:text-text-default"
						>
							Don't have an account? Sign up
						</button>
					{:else}
						<button
							type="button"
							onclick={() => (mode = 'login')}
							class="underline underline-offset-2 hover:text-text-default"
						>
							Already have an account? Sign in
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<p class="mt-4 text-center text-xs text-darker-subtitle">
			<a href={resolve('/')} class="underline underline-offset-2 hover:text-text-default">
				Continue without account
			</a>
		</p>
	</div>
</div>
