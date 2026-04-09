<script lang="ts">
	import Flame from '@lucide/svelte/icons/flame';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { streak } from '$lib/engine/streak';
	import {
		darkMode as darkModeStore,
		initDarkMode,
		toggleDarkMode as toggleDarkModeFn
	} from '$lib/darkmode';
	import { onMount } from 'svelte';

	let isPracticePage = $derived(page.url.pathname === '/');
	let isResourcesPage = $derived(page.url.pathname.startsWith('/resources'));
	let isClassesPage = $derived(page.url.pathname.startsWith('/classes'));

	let {
		user = null,
		onSignIn,
		isHomePage = false
	}: {
		user?: { id: string; email?: string } | null;
		onSignIn?: () => void;
		isHomePage?: boolean;
	} = $props();

	onMount(() => {
		initDarkMode();
	});

	let darkMode = $derived($darkModeStore);

	const AVATAR_COLORS = [
		'var(--color-case-gen)',
		'var(--color-case-dat)',
		'var(--color-case-acc)',
		'var(--color-case-voc)',
		'var(--color-case-loc)',
		'var(--color-case-ins)'
	];

	let initial = $derived((user?.email?.[0] ?? '?').toUpperCase());
	let avatarColor = $derived.by(() => {
		if (!user?.id) return AVATAR_COLORS[0];
		let hash = 0;
		for (let i = 0; i < user.id.length; i++) {
			hash = (hash * 31 + user.id.charCodeAt(i)) | 0;
		}
		return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
	});

	let themeBounce = $state(false);
	let themeBounceTimer: ReturnType<typeof setTimeout> | null = null;
	let maskId = $state('sun-moon-mask-' + Math.random().toString(36).slice(2, 8));
	let menuOpen = $state(false);
	let menuRef: HTMLDivElement | undefined = $state(undefined);
	let toggleButtonRef: HTMLButtonElement | undefined = $state(undefined);
	let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
	function closeMenu() {
		menuOpen = false;
	}

	function cancelHoverClose() {
		if (hoverCloseTimer !== null) {
			clearTimeout(hoverCloseTimer);
			hoverCloseTimer = null;
		}
	}

	function handleHoverEnter() {
		cancelHoverClose();
		menuOpen = true;
	}

	function handleHoverLeave() {
		cancelHoverClose();
		hoverCloseTimer = setTimeout(() => {
			menuOpen = false;
			hoverCloseTimer = null;
		}, 150);
	}

	// Outside-click listener managed via $effect, properly cleaned up on destroy
	$effect(() => {
		if (!menuOpen) return;

		function handleDocumentClick(e: MouseEvent) {
			// Ignore clicks inside the menu or on the toggle button
			const target = e.target as Node | null;
			if (target && (menuRef?.contains(target) || toggleButtonRef?.contains(target))) return;
			closeMenu();
		}

		// Skip the opening click by deferring listener attachment
		const frameId = requestAnimationFrame(() => {
			document.addEventListener('click', handleDocumentClick);
			focusMenuItem(0);
		});

		return () => {
			cancelAnimationFrame(frameId);
			document.removeEventListener('click', handleDocumentClick);
		};
	});

	function focusMenuItem(index: number) {
		if (!menuRef) return;
		const items = menuRef.querySelectorAll<HTMLElement>('[role="menuitem"]');
		if (items.length === 0) return;
		const clamped = ((index % items.length) + items.length) % items.length;
		items[clamped].focus();
	}

	function handleMenuKeydown(e: KeyboardEvent) {
		if (!menuRef) return;
		const items = menuRef.querySelectorAll<HTMLElement>('[role="menuitem"]');
		const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLElement);

		if (e.key === 'Escape') {
			e.preventDefault();
			closeMenu();
			toggleButtonRef?.focus();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusMenuItem(currentIndex + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusMenuItem(currentIndex - 1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			focusMenuItem(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			focusMenuItem(items.length - 1);
		} else if (e.key === 'Tab') {
			e.preventDefault();
			closeMenu();
			toggleButtonRef?.focus();
		}
	}

	// Clean up bounce timer on component teardown
	$effect(() => {
		return () => {
			if (themeBounceTimer !== null) clearTimeout(themeBounceTimer);
			if (hoverCloseTimer !== null) clearTimeout(hoverCloseTimer);
		};
	});

	function toggleMenu() {
		if (menuOpen) {
			closeMenu();
		} else {
			menuOpen = true;
		}
	}
</script>

<nav
	class="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-card-stroke bg-card-bg px-3 sm:h-16 sm:px-6"
>
	<a href={resolve('/')} class="flex shrink-0 items-baseline gap-1.5 sm:gap-2">
		{#if isHomePage}
			<h1 class="text-base font-semibold uppercase tracking-wide text-emphasis sm:text-lg">
				Skloňuj
			</h1>
		{:else}
			<span class="text-base font-semibold uppercase tracking-wide text-emphasis sm:text-lg"
				>Skloňuj</span
			>
		{/if}
		<span class="hidden text-sm text-text-subtitle sm:inline">decline it!</span>
	</a>
	<div class="flex items-center gap-2 sm:gap-4">
		<a
			href={resolve('/')}
			class="nav-tab text-xs transition-colors sm:text-sm {isPracticePage
				? 'font-semibold text-text-default'
				: 'text-text-subtitle hover:text-text-default'}"
			data-label="Practice"
		>
			Practice
		</a>
		<a
			href={resolve('/resources')}
			class="nav-tab text-xs transition-colors sm:text-sm {isResourcesPage
				? 'font-semibold text-text-default'
				: 'text-text-subtitle hover:text-text-default'}"
			data-label="Resources"
		>
			Resources
		</a>
		<a
			href={resolve('/classes')}
			class="nav-tab text-xs transition-colors sm:text-sm {isClassesPage
				? 'font-semibold text-text-default'
				: 'text-text-subtitle hover:text-text-default'}"
			data-label="Classes"
			data-tour="classes-link"
		>
			Classes
		</a>
		{#if $streak.currentStreak > 0}
			<span
				class="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
				title="Daily practice streak"
			>
				<Flame class="size-3.5" fill="currentColor" aria-hidden="true" />
				{$streak.currentStreak}
			</span>
		{/if}
		{#if user}
			<div
				class="relative"
				onmouseenter={handleHoverEnter}
				onmouseleave={handleHoverLeave}
				role="presentation"
			>
				<button
					type="button"
					bind:this={toggleButtonRef}
					onclick={toggleMenu}
					onkeydown={(e) => {
						if (e.key === 'ArrowDown' && !menuOpen) {
							e.preventDefault();
							toggleMenu();
						}
					}}
					class="flex size-7 cursor-pointer items-center justify-center rounded-full text-xs font-semibold text-white transition-opacity hover:opacity-80 sm:size-8"
					style="background-color: {avatarColor}"
					aria-label="Profile menu"
					aria-expanded={menuOpen}
					aria-haspopup="true"
				>
					{initial}
				</button>
				{#if menuOpen}
					<div
						bind:this={menuRef}
						class="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-xl border border-card-stroke bg-card-bg py-1 shadow-lg"
						role="menu"
						tabindex="-1"
						onclick={(e) => e.stopPropagation()}
						onkeydown={handleMenuKeydown}
					>
						<a
							href={resolve('/profile')}
							class="block px-4 py-2 text-sm text-text-default transition-colors hover:bg-shaded-background focus:bg-shaded-background focus:outline-none"
							role="menuitem"
							tabindex="-1"
							onclick={closeMenu}
						>
							Profile
						</a>
						<form method="POST" action={resolve('/auth/signout')}>
							<button
								type="submit"
								class="block w-full cursor-pointer px-4 py-2 text-left text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default focus:bg-shaded-background focus:text-text-default focus:outline-none"
								role="menuitem"
								tabindex="-1"
							>
								Sign out
							</button>
						</form>
					</div>
				{/if}
			</div>
		{:else}
			<button
				type="button"
				onclick={() => onSignIn?.()}
				class="cursor-pointer rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
			>
				Sign in
			</button>
		{/if}
		<button
			type="button"
			onclick={() => {
				toggleDarkModeFn();
				themeBounce = true;
				if (themeBounceTimer !== null) clearTimeout(themeBounceTimer);
				themeBounceTimer = setTimeout(() => {
					themeBounce = false;
					themeBounceTimer = null;
				}, 600);
			}}
			class="flex size-7 cursor-pointer items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default sm:size-8"
			aria-label="Toggle dark mode"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 32 32"
				class="sun-moon-svg size-4 {themeBounce ? 'theme-bounce' : ''}"
				style:--crescent-x={darkMode ? '-18px' : '0px'}
				style:--rays-scale={darkMode ? '0.5' : '1'}
				style:--center-scale={darkMode ? '1.1' : '1'}
			>
				<defs>
					<mask id="{maskId}-center">
						<rect x="0" y="0" width="32" height="32" fill="white" />
						<circle class="mask-crescent" cx="40" cy="16" r="8" fill="black" />
					</mask>
					<mask id="{maskId}-rays">
						<circle class="mask-rays-circle" cx="16" cy="16" r="16" fill="white" />
					</mask>
				</defs>
				<circle
					class="sun-center"
					mask="url(#{maskId}-center)"
					r="8"
					cx="16"
					cy="16"
					fill="currentColor"
				/>
				<path
					class="sun-rays"
					mask="url(#{maskId}-rays)"
					d="M4,16l-4,0 M7.515,7.515l-2.828,-2.828 M16,4l0,-4 M24.485,7.515l2.828,-2.828 M28,16l4,0 M24.485,24.485l2.828,2.828 M16,28l0,4 M7.515,24.485l-2.828,2.828"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</div>
</nav>

<style>
	/* Reserve bold text width so layout doesn't shift on tab change */
	.nav-tab {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	.nav-tab::after {
		content: attr(data-label);
		font-weight: 600;
		height: 0;
		overflow: hidden;
		visibility: hidden;
		pointer-events: none;
	}

	/* Sun/Moon SVG mask animation driven by CSS custom properties */
	.sun-moon-svg :global(.mask-crescent) {
		transform: translateX(var(--crescent-x));
		transition: transform 350ms ease-out;
		transform-origin: center;
	}

	.sun-moon-svg :global(.mask-rays-circle) {
		transform: scale(var(--rays-scale));
		transition: transform 350ms ease-out;
		transform-origin: center;
	}

	.sun-moon-svg :global(.sun-center) {
		transform: rotate(-35deg) scale(var(--center-scale));
		transition: transform 350ms ease-out;
		transform-origin: center;
	}

	.sun-moon-svg :global(.sun-rays) {
		fill: none;
	}

	.theme-bounce {
		animation: themeBounce 600ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes themeBounce {
		0% {
			transform: scale(1);
		}
		30% {
			transform: scale(1.15);
		}
		60% {
			transform: scale(0.95);
		}
		100% {
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.theme-bounce {
			animation: none;
		}
		.sun-moon-svg :global(.mask-crescent),
		.sun-moon-svg :global(.mask-rays-circle),
		.sun-moon-svg :global(.sun-center) {
			transition: none;
		}
	}
</style>
