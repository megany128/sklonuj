<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import type { EmailOtpType } from '@supabase/supabase-js';

	onMount(async () => {
		const authBase = resolve('/auth');
		const token_hash = page.url.searchParams.get('token_hash');
		const type = page.url.searchParams.get('type') as EmailOtpType | null;

		if (!token_hash || !type) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- authBase uses resolve()
			await goto(`${authBase}?error=missing_token`, { replaceState: true });
			return;
		}

		const supabase = getSupabaseBrowserClient();
		const { error } = await supabase.auth.verifyOtp({ token_hash, type });

		if (error) {
			console.error('Email confirmation error:', error.message);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- authBase uses resolve()
			await goto(`${authBase}?error=auth_failed`, { replaceState: true });
			return;
		}

		if (type === 'recovery') {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- authBase uses resolve()
			await goto(`${authBase}?recovery=true`, { replaceState: true });
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

<div class="flex min-h-screen items-center justify-center">
	<p class="text-text-subtitle">Verifying...</p>
</div>
