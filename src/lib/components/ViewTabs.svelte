<script lang="ts">
	type View = 'exercise' | 'declension';

	let {
		activeView,
		onViewChange
	}: {
		activeView: View;
		onViewChange: (view: View) => void;
	} = $props();

	let tablistEl: HTMLDivElement | undefined = $state();

	const tabs: { id: View; label: string }[] = [
		{ id: 'exercise', label: 'Exercises' },
		{ id: 'declension', label: 'Look Up' }
	];

	function handleKeydown(e: KeyboardEvent, currentIndex: number) {
		let newIndex = currentIndex;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
		} else if (e.key === 'Home') {
			e.preventDefault();
			newIndex = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			newIndex = tabs.length - 1;
		} else {
			return;
		}
		onViewChange(tabs[newIndex].id);
		// Focus the newly active tab after the DOM updates
		requestAnimationFrame(() => {
			const buttons = tablistEl?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
			buttons?.[newIndex]?.focus();
		});
	}
</script>

<div class="mx-auto w-full max-w-4xl px-4 pt-6 pb-3">
	<div
		bind:this={tablistEl}
		role="tablist"
		aria-label="View switcher"
		class="flex overflow-hidden rounded-xl border border-card-stroke bg-card-bg"
	>
		{#each tabs as tab, index (tab.id)}
			<button
				type="button"
				role="tab"
				aria-selected={activeView === tab.id}
				tabindex={activeView === tab.id ? 0 : -1}
				onclick={() => onViewChange(tab.id)}
				onkeydown={(e) => handleKeydown(e, index)}
				class="flex-1 py-2.5 text-center text-sm font-semibold transition-colors
					{activeView === tab.id
					? 'bg-brand-600 text-on-accent dark:bg-brand-500'
					: 'text-text-subtitle hover:bg-shaded-background hover:text-text-default'}"
			>
				{tab.label}
			</button>
		{/each}
	</div>
</div>
