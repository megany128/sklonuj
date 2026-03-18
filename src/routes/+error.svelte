<script lang="ts">
	import { page } from '$app/stores';
	import { resolve } from '$app/paths';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import { goto } from '$app/navigation';

	// Dark mode (shared module)
	import { darkMode as darkModeStore, initDarkMode, toggleDarkMode } from '$lib/darkmode';
	let darkMode = $state(false);
	let darkModeInitialized = $state(false);
	$effect(() => {
		if (darkModeInitialized) return;
		darkModeInitialized = true;
		initDarkMode();
		const unsub = darkModeStore.subscribe((v) => {
			darkMode = v;
		});
		return unsub;
	});

	let user = $derived($page.data.user);
	let status = $derived($page.status);
	let errorMessage = $derived($page.error?.message ?? 'Something went wrong.');

	const statusMessages: Record<number, { title: string; description: string }> = {
		404: {
			title: 'Page not found',
			description: "The page you're looking for doesn't exist or has been moved."
		},
		500: {
			title: 'Something went wrong',
			description: 'An unexpected error occurred. Please try again later.'
		},
		403: {
			title: 'Access denied',
			description: "You don't have permission to access this page."
		},
		401: {
			title: 'Authentication required',
			description: 'You need to be logged in to view this page.'
		}
	};

	let statusInfo = $derived(
		statusMessages[status] ?? {
			title: 'Error',
			description: errorMessage
		}
	);
</script>

<svelte:head>
	<title>{statusInfo.title} — Skloňuj</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar
		{darkMode}
		onToggleDarkMode={toggleDarkMode}
		{user}
		onSignIn={() => goto(resolve('/'))}
		onNavigate={(page) => {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- appending query param to resolved route
			goto(page === 'lookup' ? `${resolve('/')}?view=lookup` : resolve('/'));
		}}
	/>

	<main class="flex flex-1 flex-col items-center justify-center px-4 text-center">
		<div class="mx-auto max-w-md">
			<p class="mb-3 text-7xl font-bold text-emphasis">{status}</p>
			<h1 class="mb-2 text-2xl font-semibold text-emphasis">{statusInfo.title}</h1>
			<p class="mb-8 text-base text-text-subtitle">
				{statusInfo.description}
			</p>
			<a
				href={resolve('/')}
				class="inline-block rounded-xl bg-emphasis px-5 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
			>
				Go back home
			</a>
		</div>
	</main>
</div>
