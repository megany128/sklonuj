<script lang="ts">
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

	let pendingAssignmentCount = $derived(
		typeof page.data.pendingAssignmentCount === 'number' ? page.data.pendingAssignmentCount : 0
	);

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
	function closeMenu() {
		menuOpen = false;
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
			class="nav-tab relative text-xs transition-colors sm:text-sm {isClassesPage
				? 'font-semibold text-text-default'
				: 'text-text-subtitle hover:text-text-default'}"
			data-label="Classes"
			data-tour="classes-link"
		>
			Classes
			{#if pendingAssignmentCount > 0}
				<span
					class="absolute -right-3.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold leading-none text-white sm:-right-4 sm:-top-2 sm:size-[18px] sm:text-[11px]"
					aria-label="{pendingAssignmentCount} pending assignment{pendingAssignmentCount === 1
						? ''
						: 's'}"
				>
					{pendingAssignmentCount > 9 ? '9+' : pendingAssignmentCount}
				</span>
			{/if}
		</a>
		{#if $streak.currentStreak > 0}
			<span
				class="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
				title="Daily practice streak"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-3.5"
					aria-hidden="true"
				>
					<path
						fill-rule="evenodd"
						clip-rule="evenodd"
						d="M12.9633 2.28579C12.8416 2.12249 12.6586 2.01575 12.4565 1.9901C12.2545 1.96446 12.0506 2.02211 11.8919 2.14981C10.0218 3.65463 8.7174 5.83776 8.35322 8.32637C7.69665 7.85041 7.11999 7.27052 6.6476 6.61081C6.51764 6.42933 6.3136 6.31516 6.09095 6.29934C5.8683 6.28353 5.65017 6.36771 5.49587 6.529C3.95047 8.14442 3 10.3368 3 12.7497C3 17.7202 7.02944 21.7497 12 21.7497C16.9706 21.7497 21 17.7202 21 12.7497C21 9.08876 18.8143 5.93999 15.6798 4.53406C14.5706 3.99256 13.6547 3.21284 12.9633 2.28579ZM15.75 14.25C15.75 16.3211 14.0711 18 12 18C9.92893 18 8.25 16.3211 8.25 14.25C8.25 13.8407 8.31559 13.4467 8.43682 13.0779C9.06529 13.5425 9.78769 13.8874 10.5703 14.0787C10.7862 12.6779 11.4866 11.437 12.4949 10.5324C14.3321 10.7746 15.75 12.3467 15.75 14.25Z"
					/>
				</svg>
				{$streak.currentStreak}
			</span>
		{/if}
		{#if user}
			<div class="relative">
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
					class="flex size-9 cursor-pointer items-center justify-center rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-80 sm:size-10"
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
			class="flex size-9 cursor-pointer items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default sm:size-10"
			aria-label="Toggle dark mode"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 32 32"
				class="sun-moon-svg size-5 {themeBounce ? 'theme-bounce' : ''}"
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
