<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import PartyPopper from '@lucide/svelte/icons/party-popper';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import Confetti from '$lib/components/ui/Confetti.svelte';
	import posthog from '$lib/posthog';

	type Mode = 'login' | 'signup' | 'forgot' | 'welcome';

	let {
		open = false,
		onClose,
		initialMode = 'login'
	}: { open: boolean; onClose: () => void; initialMode?: Mode } = $props();

	let mode = $state<Mode>('login');

	// Sync mode when modal opens
	$effect(() => {
		if (open) {
			mode = initialMode;
		}
	});
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');
	let confirmationSent = $state(false);
	let resetEmailSent = $state(false);

	let modalEl = $state<HTMLDivElement | undefined>(undefined);
	let previouslyFocusedEl: Element | null = null;

	const supabase = getSupabaseBrowserClient();

	$effect(() => {
		if (open && modalEl) {
			previouslyFocusedEl = document.activeElement;
			// Auto-focus first input after a tick so the DOM is ready
			const firstInput = modalEl.querySelector<HTMLElement>(
				'input, button:not([aria-label="Close"])'
			);
			if (firstInput) {
				firstInput.focus();
			}
		}
		if (!open && previouslyFocusedEl) {
			if (previouslyFocusedEl instanceof HTMLElement && document.contains(previouslyFocusedEl)) {
				previouslyFocusedEl.focus();
			}
			previouslyFocusedEl = null;
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			handleClose();
			return;
		}
		if (e.key === 'Tab' && modalEl) {
			e.stopPropagation();
			const focusable = Array.from(
				modalEl.querySelectorAll<HTMLElement>(
					'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
				)
			);
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}
	}

	function reset() {
		mode = 'login';
		email = '';
		password = '';
		error = '';
		loading = false;
		confirmationSent = false;
		resetEmailSent = false;
	}

	function handleClose() {
		reset();
		onClose();
	}

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

		if (mode === 'signup') {
			const { data, error: err } = await supabase.auth.signUp({
				email,
				password,
				options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
			});
			if (err) {
				error = err.message;
			} else if (data.session) {
				posthog.capture('signed_up', { method: 'email' });
				mode = 'welcome';
			} else {
				posthog.capture('signed_up', { method: 'email' });
				confirmationSent = true;
			}
		} else {
			const { error: err } = await supabase.auth.signInWithPassword({ email, password });
			if (err) {
				error = err.message;
			} else {
				handleClose();
				goto(resolve('/'));
			}
		}

		loading = false;
	}

	async function handleForgotPassword() {
		if (!email.trim()) {
			error = 'Please enter your email.';
			return;
		}

		loading = true;
		error = '';

		const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${window.location.origin}/auth/callback?type=recovery`
		});

		if (err) {
			error = err.message;
		} else {
			resetEmailSent = true;
		}

		loading = false;
	}

	async function handleGoogleOAuth() {
		loading = true;
		error = '';
		const { error: err } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${window.location.origin}/auth/callback` }
		});
		if (err) {
			error = err.message;
			loading = false;
		}
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center px-4"
		data-modal
		role="presentation"
		tabindex="-1"
		onkeydown={handleKeydown}
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/40"
			onclick={handleClose}
			aria-label="Close"
			tabindex="-1"
		></button>

		<!-- Modal -->
		<div
			bind:this={modalEl}
			class="relative z-10 w-full max-w-sm"
			role="dialog"
			aria-modal="true"
			aria-label={mode === 'welcome'
				? 'Welcome'
				: mode === 'signup'
					? 'Create your account'
					: 'Sign in'}
		>
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl">
				<!-- Close button -->
				<button
					type="button"
					onclick={handleClose}
					class="absolute right-4 top-4 p-1 text-text-subtitle transition-colors hover:text-text-default"
					aria-label="Close"
				>
					<X class="size-5" aria-hidden="true" />
				</button>

				{#if mode === 'welcome'}
					<Confetti />
					<div class="text-center">
						<div class="mb-3 flex justify-center">
							<div
								class="flex size-12 items-center justify-center rounded-full bg-positive-background"
							>
								<PartyPopper class="size-6 text-positive-stroke" aria-hidden="true" />
							</div>
						</div>
						<p class="mb-2 text-lg font-semibold text-text-default">Welcome to Skloňuj!</p>
						<p class="mb-5 text-sm text-text-subtitle">
							Your account is all set. Time to master Czech declension!
						</p>
						<button
							type="button"
							onclick={() => {
								handleClose();
								goto(resolve('/'));
							}}
							class="rounded-xl bg-emphasis px-6 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
						>
							Let's go
						</button>
					</div>
				{:else if confirmationSent}
					<div class="text-center">
						<p class="mb-2 text-lg font-semibold text-text-default">Check your email</p>
						<p class="mb-4 text-sm text-text-subtitle">
							We sent a confirmation link to <strong class="text-text-default">{email}</strong>.
							Click it to finish signing up.
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
							aria-describedby={error ? 'auth-error' : undefined}
							aria-invalid={!!error}
							oninput={() => {
								error = '';
							}}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						/>

						<div aria-live="assertive">
							{#if error}
								<p id="auth-error" class="text-xs text-negative-stroke" role="alert">{error}</p>
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
							aria-describedby={error ? 'auth-error' : undefined}
							aria-invalid={!!error}
							oninput={() => {
								error = '';
							}}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						/>

						<input
							type="password"
							bind:value={password}
							placeholder="Password"
							required
							minlength="6"
							aria-label="Password"
							oninput={() => {
								error = '';
							}}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-4 py-2.5 text-base text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						/>

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
								<p id="auth-error" class="text-xs text-negative-stroke" role="alert">{error}</p>
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
		</div>
	</div>
{/if}
