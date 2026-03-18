<script lang="ts">
	const pills = Array.from({ length: 7 }, (_, i) => i);
</script>

<div
	role="status"
	aria-label="Loading cases"
	class="grid grid-cols-4 gap-1.5 sm:grid-cols-8 sm:gap-2"
>
	<!-- "All" button skeleton -->
	<div
		class="flex h-[52px] items-center justify-center rounded-2xl border-2 border-card-stroke bg-card-bg"
	>
		<div class="h-4 w-8 animate-pulse rounded bg-shaded-background"></div>
	</div>

	<!-- Individual case pill skeletons -->
	{#each pills as pill (pill)}
		<div
			class="flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-card-stroke bg-card-bg px-1.5 py-1.5 sm:px-2 sm:py-2"
		>
			<div class="flex items-center gap-1">
				<div class="size-5 animate-pulse rounded-full bg-shaded-background"></div>
				<div class="h-3 w-8 animate-pulse rounded bg-shaded-background sm:w-10"></div>
			</div>
		</div>
	{/each}
</div>
