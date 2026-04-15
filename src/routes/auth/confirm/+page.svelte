<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getSupabaseBrowserClient } from '$lib/supabase';

	let error = $state('');

	onMount(async () => {
		const code = page.url.searchParams.get('code');

		if (!code) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() is used inside the template literal
			await goto(`${resolve('/auth')}?error=missing_token`, { replaceState: true });
			return;
		}

		const supabase = getSupabaseBrowserClient();
		const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

		if (exchangeError) {
			console.error('Recovery code exchange error:', exchangeError.message);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() is used inside the template literal
			await goto(`${resolve('/auth')}?error=auth_failed`, { replaceState: true });
			return;
		}

		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() is used inside the template literal
		await goto(`${resolve('/auth')}?recovery=true`, { replaceState: true });
	});
</script>

{#if error}
	<p>{error}</p>
{:else}
	<div class="flex min-h-screen items-center justify-center">
		<p class="text-text-subtitle">Verifying...</p>
	</div>
{/if}
