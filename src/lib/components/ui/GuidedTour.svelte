<script lang="ts">
	interface TourStep {
		target: string | null;
		text: string;
		title?: string;
		// Optional setup hook called before the step is shown. Use this to ensure
		// the target element will actually be in the DOM (e.g. switching tabs).
		setup?: () => void;
	}

	interface Props {
		steps: TourStep[];
		onComplete: () => void;
	}

	let { steps, onComplete }: Props = $props();

	let currentStep = $state(0);
	let spotlightRect = $state<{ top: number; left: number; width: number; height: number } | null>(
		null
	);
	let tooltipStyle = $state('');
	let transitioning = $state(false);
	let ready = $state(false);
	let tooltipEl = $state<HTMLDivElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	function getTargetElement(step: number): HTMLElement | null {
		const target = steps[step].target;
		if (!target) return null;
		return document.querySelector(`[data-tour="${target}"]`);
	}

	function computePositions(): void {
		const step = steps[currentStep];

		// Intro step (no target) — center the tooltip
		if (!step.target) {
			spotlightRect = null;
			const tooltipWidth = Math.min(360, window.innerWidth - 32);
			const top = Math.max(16, window.innerHeight * 0.3);
			const left = Math.max(16, (window.innerWidth - tooltipWidth) / 2);
			tooltipStyle = `top: ${top}px; left: ${left}px; width: ${tooltipWidth}px;`;
			ready = true;
			return;
		}

		const el = getTargetElement(currentStep);
		if (!el) {
			spotlightRect = null;
			return;
		}

		const rect = el.getBoundingClientRect();
		const padding = 8;

		spotlightRect = {
			top: rect.top - padding,
			left: rect.left - padding,
			width: rect.width + padding * 2,
			height: rect.height + padding * 2
		};

		// Compute tooltip position
		const tooltipWidth = Math.min(320, window.innerWidth - 32);
		const tooltipHeight = 140; // approximate
		const gap = 12;

		let top: number;
		let left: number;

		// Prefer below the element
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceAbove = rect.top;

		if (spaceBelow >= tooltipHeight + gap) {
			top = rect.bottom + gap;
		} else if (spaceAbove >= tooltipHeight + gap) {
			top = rect.top - tooltipHeight - gap;
		} else {
			// Not enough space above or below; place at vertical center
			top = Math.max(16, (window.innerHeight - tooltipHeight) / 2);
		}

		// Horizontally center on the element, clamped to viewport
		left = rect.left + rect.width / 2 - tooltipWidth / 2;
		left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

		// Clamp top to viewport
		top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

		tooltipStyle = `top: ${top}px; left: ${left}px; width: ${tooltipWidth}px;`;
		ready = true;
	}

	function waitForElement(step: number): Promise<void> {
		return new Promise<void>((resolve) => {
			// No target (intro step) — resolve immediately
			if (!steps[step].target) {
				resolve();
				return;
			}
			const el = getTargetElement(step);
			if (el) {
				resolve();
				return;
			}
			// Poll for the element (short window — steps should use `setup` to
			// ensure their target exists, this is just a safety net for async DOM updates).
			let attempts = 0;
			const interval = setInterval(() => {
				attempts++;
				const found = getTargetElement(step);
				if (found || attempts > 20) {
					clearInterval(interval);
					resolve();
				}
			}, 25);
		});
	}

	function advance(): void {
		if (currentStep >= steps.length - 1) {
			onComplete();
			return;
		}
		transitioning = true;
		currentStep++;
		steps[currentStep].setup?.();
		waitForElement(currentStep).then(() => {
			computePositions();
			transitioning = false;
		});
	}

	function getFocusableElements(): HTMLElement[] {
		if (!tooltipEl) return [];
		const selector =
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
		return Array.from(tooltipEl.querySelectorAll<HTMLElement>(selector));
	}

	function focusFirstElement(): void {
		const focusable = getFocusableElements();
		if (focusable.length > 0) {
			focusable[0].focus();
		} else if (tooltipEl) {
			tooltipEl.focus();
		}
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (!ready || transitioning) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			onComplete();
			return;
		}

		const target = e.target instanceof Node ? e.target : null;
		const focusInside = tooltipEl !== null && target !== null && tooltipEl.contains(target);

		if (e.key === 'Tab') {
			// Focus trap
			const focusable = getFocusableElements();
			if (focusable.length === 0) {
				e.preventDefault();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			if (e.shiftKey) {
				if (active === first || !focusInside) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (active === last || !focusInside) {
					e.preventDefault();
					first.focus();
				}
			}
			return;
		}

		if (!focusInside) return;

		if (e.key === 'Enter' || e.key === ' ') {
			// Let native activation handle buttons that are already focused
			const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			if (active && active.tagName === 'BUTTON') return;
			e.preventDefault();
			advance();
			return;
		}

		if (e.key === 'ArrowRight') {
			e.preventDefault();
			advance();
			return;
		}
	}

	// Set up positions on mount and handle resize
	$effect(() => {
		// Track currentStep to recompute when it changes
		void currentStep;

		waitForElement(currentStep).then(() => {
			computePositions();
		});

		function handleResize() {
			computePositions();
		}

		window.addEventListener('resize', handleResize);
		window.addEventListener('scroll', handleResize, true);

		return () => {
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('scroll', handleResize, true);
		};
	});

	// Focus management: capture previously focused element, move focus in, restore on unmount
	$effect(() => {
		previouslyFocused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		return () => {
			if (previouslyFocused && document.contains(previouslyFocused)) {
				previouslyFocused.focus();
			}
		};
	});

	// When the tooltip becomes ready (or step changes), move focus into it
	$effect(() => {
		void currentStep;
		if (ready && !transitioning && tooltipEl) {
			// Defer to ensure the element is rendered
			queueMicrotask(() => {
				focusFirstElement();
			});
		}
	});

	// SVG mask path for the spotlight cutout
	let maskPath = $derived.by(() => {
		if (!spotlightRect) return '';
		const { top, left, width, height } = spotlightRect;
		const r = 12; // border radius
		// Outer rectangle (full viewport) + inner rounded rectangle (cutout, counterclockwise)
		const outer = `M0,0 H${window.innerWidth} V${window.innerHeight} H0 Z`;
		const inner = `M${left + r},${top}
			H${left + width - r}
			Q${left + width},${top} ${left + width},${top + r}
			V${top + height - r}
			Q${left + width},${top + height} ${left + width - r},${top + height}
			H${left + r}
			Q${left},${top + height} ${left},${top + height - r}
			V${top + r}
			Q${left},${top} ${left + r},${top}
			Z`;
		return `${outer} ${inner}`;
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- Overlay with spotlight cutout -->
{#if ready}
	<div
		class="fixed inset-0 z-[60]"
		role="dialog"
		aria-modal="true"
		aria-label="Guided tour"
		data-modal
	>
		{#if spotlightRect}
			<svg
				class="pointer-events-none absolute inset-0 h-full w-full transition-all duration-300 ease-in-out"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path d={maskPath} fill="rgba(0,0,0,0.5)" fill-rule="evenodd" />
			</svg>
		{:else}
			<div class="pointer-events-none absolute inset-0 bg-black/50"></div>
		{/if}

		<!-- Tooltip card -->
		{#if !transitioning}
			{@const isIntro = !steps[currentStep].target}
			{@const totalNumbered = steps.length - 1}
			<div
				bind:this={tooltipEl}
				tabindex="-1"
				data-modal
				class="absolute rounded-2xl border border-card-stroke bg-card-bg px-5 py-4 shadow-xl transition-all duration-300 ease-in-out focus:outline-none {isIntro
					? 'text-center'
					: ''}"
				style={tooltipStyle}
			>
				<button
					type="button"
					onclick={onComplete}
					class="absolute right-1.5 top-1.5 p-1.5 text-text-subtitle transition-colors hover:text-text-default"
					aria-label="Skip tour"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="size-4"
					>
						<path
							d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
						/>
					</svg>
				</button>
				{#if steps[currentStep].title}
					<h2 class="mb-1 text-lg font-semibold text-text-default sm:text-xl">
						{steps[currentStep].title}
					</h2>
				{/if}
				<p class="mb-3 text-sm leading-relaxed text-text-default {isIntro ? '' : 'pr-4'}">
					{steps[currentStep].text}
				</p>
				<div class="flex items-center {isIntro ? 'justify-center' : 'justify-between'}">
					{#if !isIntro}
						<span class="text-xs font-medium text-text-subtitle">
							{currentStep} of {totalNumbered}
						</span>
					{/if}
					<button
						type="button"
						onclick={advance}
						class="rounded-xl bg-emphasis px-5 py-2 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
					>
						{currentStep === steps.length - 1 ? 'Jdeme na to!' : 'Next'}
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
