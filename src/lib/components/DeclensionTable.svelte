<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { loadWordBank } from '$lib/engine/drill';
	import paradigmsData from '$lib/data/paradigms.json';
	import dictionaryData from '$lib/data/dictionary.json';
	import { CASE_LABELS, CASE_INDEX, CASE_NUMBER } from '$lib/types';
	import type { Case, CaseForms, WordEntry } from '$lib/types';
	import { stripDiacritics } from '$lib/utils/diacritics';

	// Unified display entry for the table
	interface DeclensionEntry {
		lemma: string;
		translation: string;
		sg: CaseForms;
		pl: CaseForms;
		paradigmHint: string;
	}

	let {
		selectedLemma = '',
		alwaysExpanded = false,
		onSelectLemma
	}: {
		selectedLemma?: string;
		alwaysExpanded?: boolean;
		// Called when the user picks a paradigm example lemma — parent lifts the current lemma.
		onSelectLemma?: (lemma: string) => void;
	} = $props();

	const CASE_ORDER: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
	const wordBank: WordEntry[] = loadWordBank();

	// Paradigm name lookup
	const paradigmNames: Record<string, string> = {};
	for (const p of paradigmsData) {
		paradigmNames[p.id] = p.name;
	}

	// Process dictionary JSON into typed entries.
	// Each raw entry is [lemma, translation, sg[7], pl[7], paradigmHint?].
	let cachedDictionary: DeclensionEntry[] | null = null;

	function loadDictionary(): DeclensionEntry[] {
		if (cachedDictionary) return cachedDictionary;
		const entries: DeclensionEntry[] = [];
		for (const raw of dictionaryData) {
			const lemma = String(raw[0]);
			const translation = String(raw[1]);
			const sgRaw = raw[2];
			const plRaw = raw[3];
			if (!Array.isArray(sgRaw) || !Array.isArray(plRaw)) continue;
			entries.push({
				lemma,
				translation,
				sg: [
					String(sgRaw[0]),
					String(sgRaw[1]),
					String(sgRaw[2]),
					String(sgRaw[3]),
					String(sgRaw[4]),
					String(sgRaw[5]),
					String(sgRaw[6])
				],
				pl: [
					String(plRaw[0]),
					String(plRaw[1]),
					String(plRaw[2]),
					String(plRaw[3]),
					String(plRaw[4]),
					String(plRaw[5]),
					String(plRaw[6])
				],
				paradigmHint: raw[4] != null ? String(raw[4]) : ''
			});
		}
		cachedDictionary = entries;
		return entries;
	}

	const dictionary = loadDictionary();

	// Build lookup maps for fast dictionary search by lemma (exact and stripped)
	const dictByLemma: Record<string, DeclensionEntry> = {};
	const dictByStripped: Record<string, DeclensionEntry> = {};
	for (const entry of dictionary) {
		const key = entry.lemma.toLowerCase();
		if (!(key in dictByLemma)) {
			dictByLemma[key] = entry;
		}
		const stripped = stripDiacritics(key);
		if (!(stripped in dictByStripped)) {
			dictByStripped[stripped] = entry;
		}
	}

	// Pre-compute stripped lemmas for the word bank
	const wordBankStripped: Array<{ stripped: string; word: WordEntry }> = wordBank.map((w) => ({
		stripped: stripDiacritics(w.lemma.toLowerCase()),
		word: w
	}));

	function wordBankToEntry(w: WordEntry): DeclensionEntry {
		return {
			lemma: w.lemma,
			translation: w.translation,
			sg: w.forms.sg,
			pl: w.forms.pl,
			paradigmHint: paradigmNames[w.paradigm] ?? ''
		};
	}

	function lookupWord(query: string): DeclensionEntry | null {
		const q = query.toLowerCase();
		const qStripped = stripDiacritics(q);

		// Exact match in word bank
		const wbExact = wordBank.find((w) => w.lemma.toLowerCase() === q);
		if (wbExact) return wordBankToEntry(wbExact);

		// Exact match in dictionary
		if (dictByLemma[q]) return dictByLemma[q];

		// Stripped (diacritic-insensitive) match in word bank
		const wbStripped = wordBankStripped.find((e) => e.stripped === qStripped);
		if (wbStripped) return wordBankToEntry(wbStripped.word);

		// Stripped match in dictionary
		if (dictByStripped[qStripped]) return dictByStripped[qStripped];

		return null;
	}

	// Paradigm browser data
	interface ParadigmInfo {
		id: string;
		name: string;
		exampleLemma: string;
		label: string;
	}

	const PARADIGM_LABELS: Record<string, string> = {
		pán: 'pán',
		muž: 'muž',
		předseda: 'předseda',
		soudce: 'soudce',
		hrad: 'hrad',
		stroj: 'stroj',
		žena: 'žena',
		růže: 'růže',
		píseň: 'píseň',
		kost: 'kost',
		město: 'město',
		moře: 'moře',
		kuře: 'kuře',
		stavení: 'stavení'
	};

	const paradigmList: ParadigmInfo[] = paradigmsData
		.filter((p) => p.id in PARADIGM_LABELS)
		.map((p) => ({
			id: p.id,
			name: p.name,
			exampleLemma: p.exampleLemma,
			label: PARADIGM_LABELS[p.id] ?? p.id
		}));

	interface GenderGroup {
		label: string;
		paradigms: ParadigmInfo[];
	}

	const GENDER_GROUP_ORDER = ['Masculine', 'Feminine', 'Neuter'] as const;
	const GENDER_GROUP_IDS: Record<string, string[]> = {
		Masculine: ['pán', 'muž', 'předseda', 'soudce', 'hrad', 'stroj'],
		Feminine: ['žena', 'růže', 'píseň', 'kost'],
		Neuter: ['město', 'moře', 'kuře', 'stavení']
	};

	const genderGroups: GenderGroup[] = GENDER_GROUP_ORDER.map((label) => ({
		label,
		paradigms: (GENDER_GROUP_IDS[label] ?? [])
			.map((id) => paradigmList.find((p) => p.id === id))
			.filter((p): p is ParadigmInfo => p !== undefined)
	}));

	let expanded = $state(false);
	let paradigmsExpanded = $state(false);

	const fallbackEntry = wordBankToEntry(wordBank.find((w) => w.lemma === 'žena') ?? wordBank[0]);

	let displayEntry: DeclensionEntry = $derived.by(() => {
		const lemma = selectedLemma.trim();
		if (lemma === '') return fallbackEntry;
		return lookupWord(lemma) ?? fallbackEntry;
	});

	let trimmedLemma = $derived(selectedLemma.trim().toLowerCase());
	let isPivo = $derived(trimmedLemma === 'pivo');

	// Which paradigm chip should appear "active" — the one whose example lemma is currently shown.
	let activeParadigmId = $derived.by(() => {
		const l = trimmedLemma;
		if (l === '') return null;
		const match = paradigmList.find((p) => p.exampleLemma.toLowerCase() === l);
		return match?.id ?? null;
	});

	function computeStem(forms: CaseForms): string {
		const nonEmpty = [...forms].filter((f) => f !== '');
		if (nonEmpty.length === 0) return '';

		let prefix = nonEmpty[0];
		for (let i = 1; i < nonEmpty.length; i++) {
			while (!nonEmpty[i].startsWith(prefix) && prefix.length > 0) {
				prefix = prefix.slice(0, -1);
			}
			if (prefix.length === 0) return '';
		}
		return prefix;
	}

	function splitForm(form: string, stemStr: string): { stem: string; ending: string } {
		if (stemStr.length > 0 && form.startsWith(stemStr)) {
			return { stem: stemStr, ending: form.slice(stemStr.length) };
		}
		return { stem: form, ending: '' };
	}

	function formStem(form: string, stemStr: string): string {
		return splitForm(form, stemStr).stem;
	}

	function formEnding(form: string, stemStr: string): string {
		return splitForm(form, stemStr).ending;
	}

	let sgStem: string = $derived(computeStem(displayEntry.sg));
	let plStem: string = $derived(computeStem(displayEntry.pl));

	function toggleParadigm(id: string): void {
		if (activeParadigmId === id) {
			onSelectLemma?.('');
			return;
		}
		const info = paradigmList.find((p) => p.id === id);
		if (info) onSelectLemma?.(info.exampleLemma);
	}
</script>

<div class="w-full">
	{#if !alwaysExpanded}
		<button
			onclick={() => (expanded = !expanded)}
			class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
			aria-expanded={expanded}
			aria-controls="declension-table-panel"
		>
			<span class="font-semibold">Declension table</span>
			<ChevronDown
				class="h-4 w-4 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
		</button>
	{/if}

	<div
		id="declension-table-panel"
		class={alwaysExpanded ? '' : 'overflow-hidden transition-all duration-300 ease-in-out'}
		style={alwaysExpanded
			? undefined
			: `max-height: ${expanded ? '2000px' : '0px'}; opacity: ${expanded ? '1' : '0'}`}
	>
		<div
			class="relative overflow-hidden space-y-4 {alwaysExpanded
				? isPivo
					? 'rounded-2xl border-2 border-easter-egg-border bg-card-bg p-4'
					: 'rounded-2xl border border-card-stroke bg-card-bg p-4'
				: isPivo
					? 'mt-2 rounded-2xl border-2 border-easter-egg-border bg-card-bg p-4'
					: 'mt-2 rounded-2xl border border-card-stroke bg-card-bg p-4'} {isPivo
				? 'pivo-cursor'
				: ''}"
		>
			<!-- Paradigm browser toggle -->
			<div>
				<button
					type="button"
					onclick={() => (paradigmsExpanded = !paradigmsExpanded)}
					class="flex items-center gap-1 text-xs font-medium text-text-subtitle transition-colors hover:text-text-default"
				>
					Browse paradigms
					<ChevronDown
						class="h-3 w-3 transition-transform duration-200 {paradigmsExpanded
							? 'rotate-180'
							: ''}"
						aria-hidden="true"
					/>
				</button>
				{#if paradigmsExpanded}
					<div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
						{#each genderGroups as group (group.label)}
							<div class="flex flex-wrap items-center gap-1.5">
								<span class="text-xs font-semibold uppercase tracking-wider text-text-subtitle">
									{group.label}
								</span>
								{#each group.paradigms as paradigm (paradigm.id)}
									<button
										type="button"
										onclick={() => toggleParadigm(paradigm.id)}
										class="rounded-full border px-2.5 py-1 text-xs transition-colors {activeParadigmId ===
										paradigm.id
											? 'border-emphasis bg-shaded-background font-semibold text-text-default'
											: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-text-subtitle'}"
									>
										{paradigm.label}
									</button>
								{/each}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Word info -->
			<div class="flex flex-wrap items-center gap-2 px-1">
				<span class="text-sm font-semibold text-text-default">
					{displayEntry.lemma}
				</span>
				<span class="text-xs text-text-subtitle">
					{displayEntry.translation}
				</span>
				{#if displayEntry.paradigmHint}
					<span
						class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
					>
						{displayEntry.paradigmHint}
					</span>
				{/if}
			</div>

			<!-- Declension table -->
			<div class="overflow-x-auto">
				<table class="w-full text-left text-xs">
					<thead>
						<tr>
							<th
								class="rounded-tl-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
							>
								Case
							</th>
							<th class="bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle">
								Singular
							</th>
							<th
								class="rounded-tr-lg bg-shaded-background px-3 py-2 text-xs font-semibold text-text-subtitle"
							>
								Plural
							</th>
						</tr>
					</thead>
					<tbody>
						{#each CASE_ORDER as caseKey, i (caseKey)}
							<tr
								class="border-t border-card-stroke {i % 2 === 0 ? 'bg-shaded-background/50' : ''}"
							>
								<td class="whitespace-nowrap px-3 py-2 font-medium text-text-subtitle">
									{CASE_NUMBER[caseKey]}. {CASE_LABELS[caseKey]}
								</td>
								<td class="px-3 py-2">
									{#if displayEntry.sg[CASE_INDEX[caseKey]] === ''}
										<span class="text-darker-shaded-background">&mdash;</span>
									{:else if sgStem.length > 0}
										<span class="text-text-subtitle"
											>{formStem(displayEntry.sg[CASE_INDEX[caseKey]], sgStem)}</span
										><span class="text-emphasis"
											>{formEnding(displayEntry.sg[CASE_INDEX[caseKey]], sgStem)}</span
										>
									{:else}
										<span class="text-text-default">{displayEntry.sg[CASE_INDEX[caseKey]]}</span>
									{/if}
								</td>
								<td class="px-3 py-2">
									{#if displayEntry.pl[CASE_INDEX[caseKey]] === ''}
										<span class="text-darker-shaded-background">&mdash;</span>
									{:else if plStem.length > 0}
										<span class="text-text-subtitle"
											>{formStem(displayEntry.pl[CASE_INDEX[caseKey]], plStem)}</span
										><span class="text-emphasis"
											>{formEnding(displayEntry.pl[CASE_INDEX[caseKey]], plStem)}</span
										>
									{:else}
										<span class="text-text-default">{displayEntry.pl[CASE_INDEX[caseKey]]}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if isPivo}
				{#key selectedLemma}
					<div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[40px]">
						{#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
							<span
								class="beer-float absolute bottom-0 text-2xl"
								style="left: {8 + i * 11}%; animation-delay: {i * 0.2}s">🍺</span
							>
						{/each}
					</div>
				{/key}
			{/if}
		</div>
	</div>
</div>
