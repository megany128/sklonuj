<script lang="ts">
	let {
		activePage = 'exercises',
		onNavigate,
		darkMode = false,
		onToggleDarkMode
	}: {
		activePage?: 'exercises' | 'lookup';
		onNavigate?: (page: 'exercises' | 'lookup') => void;
		darkMode?: boolean;
		onToggleDarkMode?: () => void;
	} = $props();

	let themeBounce = $state(false);
</script>

<nav
	class="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-card-stroke bg-card-bg px-6"
>
	<button type="button" class="flex items-baseline gap-2" onclick={() => onNavigate?.('exercises')}>
		<span class="text-lg font-semibold uppercase tracking-wide text-emphasis">Skloňuj</span>
		<span class="text-sm text-text-subtitle">decline it!</span>
	</button>
	<div class="flex items-center gap-4">
		{#if onNavigate}
			<button
				type="button"
				onclick={() => onNavigate?.('exercises')}
				class="nav-tab text-sm transition-colors {activePage === 'exercises'
					? 'font-semibold text-text-default'
					: 'text-text-subtitle hover:text-text-default'}"
				data-label="Exercises"
			>
				Exercises
			</button>
			<button
				type="button"
				onclick={() => onNavigate?.('lookup')}
				class="nav-tab text-sm transition-colors {activePage === 'lookup'
					? 'font-semibold text-text-default'
					: 'text-text-subtitle hover:text-text-default'}"
				data-label="Lookup"
			>
				Lookup
			</button>
		{/if}
		{#if onToggleDarkMode}
			<button
				type="button"
				onclick={() => {
					onToggleDarkMode?.();
					themeBounce = true;
					setTimeout(() => (themeBounce = false), 600);
				}}
				class="flex size-10 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
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
						<mask id="sun-moon-mask-center">
							<rect x="0" y="0" width="32" height="32" fill="white" />
							<circle class="mask-crescent" cx="40" cy="16" r="8" fill="black" />
						</mask>
						<mask id="sun-moon-mask-rays">
							<circle class="mask-rays-circle" cx="16" cy="16" r="16" fill="white" />
						</mask>
					</defs>
					<circle
						class="sun-center"
						mask="url(#sun-moon-mask-center)"
						r="8"
						cx="16"
						cy="16"
						fill="currentColor"
					/>
					<path
						class="sun-rays"
						mask="url(#sun-moon-mask-rays)"
						d="M4,16l-4,0 M7.515,7.515l-2.828,-2.828 M16,4l0,-4 M24.485,7.515l2.828,-2.828 M28,16l4,0 M24.485,24.485l2.828,2.828 M16,28l0,4 M7.515,24.485l-2.828,2.828"
						stroke="currentColor"
						stroke-width="2.5"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		{/if}
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
