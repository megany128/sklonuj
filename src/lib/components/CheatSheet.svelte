<script lang="ts">
	let expanded = $state(false);

	interface PrepositionEntry {
		czech: string;
		english: string;
	}

	interface CaseGroup {
		case_: string;
		color: string;
		darkColor: string;
		prepositions: PrepositionEntry[];
	}

	const caseGroups: CaseGroup[] = [
		{
			case_: 'Genitive',
			color: 'bg-brand-100 text-brand-700',
			darkColor: 'dark:bg-brand-900 dark:text-brand-300',
			prepositions: [
				{ czech: 'do', english: 'to / into' },
				{ czech: 'z / ze', english: 'from / out of' },
				{ czech: 'od', english: 'from (a person)' },
				{ czech: 'bez', english: 'without' },
				{ czech: 'u', english: 'at / near' },
				{ czech: 'podle', english: 'according to' },
				{ czech: 'vedle', english: 'next to' },
				{ czech: 'kolem', english: 'around' }
			]
		},
		{
			case_: 'Dative',
			color: 'bg-emerald-100 text-emerald-700',
			darkColor: 'dark:bg-emerald-900 dark:text-emerald-300',
			prepositions: [{ czech: 'k / ke', english: 'to / toward' }]
		},
		{
			case_: 'Accusative',
			color: 'bg-amber-100 text-amber-700',
			darkColor: 'dark:bg-amber-900 dark:text-amber-300',
			prepositions: [
				{ czech: 'na', english: 'onto (motion)' },
				{ czech: 'p\u0159es', english: 'across / over' },
				{ czech: 'pro', english: 'for' },
				{ czech: 'o', english: 'about' }
			]
		},
		{
			case_: 'Locative',
			color: 'bg-rose-100 text-rose-700',
			darkColor: 'dark:bg-rose-900 dark:text-rose-300',
			prepositions: [
				{ czech: 'v / ve', english: 'in' },
				{ czech: 'na', english: 'on (location)' },
				{ czech: 'o', english: 'about' },
				{ czech: 'po', english: 'after / around' },
				{ czech: 'p\u0159i', english: 'during / at' }
			]
		},
		{
			case_: 'Instrumental',
			color: 'bg-brand-100 text-brand-600',
			darkColor: 'dark:bg-brand-900/60 dark:text-brand-400',
			prepositions: [
				{ czech: 's / se', english: 'with' },
				{ czech: 'za', english: 'behind / for' },
				{ czech: 'pod', english: 'under' },
				{ czech: 'nad', english: 'above' },
				{ czech: 'p\u0159ed', english: 'in front of' },
				{ czech: 'mezi', english: 'between' }
			]
		}
	];
</script>

<div class="w-full">
	<button
		onclick={() => (expanded = !expanded)}
		class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
		aria-expanded={expanded}
		aria-controls="cheat-sheet-panel"
	>
		<span class="font-semibold">Preposition cheat sheet</span>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			class="h-4 w-4 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
		>
			<path
				fill-rule="evenodd"
				d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
				clip-rule="evenodd"
			/>
		</svg>
	</button>

	<div
		id="cheat-sheet-panel"
		class="overflow-hidden transition-all duration-300 ease-in-out"
		style="max-height: {expanded ? '1000px' : '0px'}; opacity: {expanded ? '1' : '0'}"
	>
		<div
			class="mt-2 space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-800/80"
		>
			{#each caseGroups as group (group.case_)}
				<div>
					<span
						class="mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold {group.color} {group.darkColor}"
					>
						{group.case_}
					</span>
					<div class="ml-1 mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
						{#each group.prepositions as prep (prep.czech)}
							<span class="text-sm text-slate-700 dark:text-slate-300">
								<span class="font-semibold">{prep.czech}</span>
								<span class="text-slate-400 dark:text-slate-500"> &mdash; {prep.english}</span>
							</span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>
