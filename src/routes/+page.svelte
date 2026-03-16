<script lang="ts">
	import { slide } from 'svelte/transition';
	import { get } from 'svelte/store';
	import type {
		Case,
		Difficulty,
		DrillQuestion,
		DrillResult,
		DrillSettings,
		DrillType,
		Number_
	} from '$lib/types';
	import { ALL_CASES, CASE_LABELS, CASE_HEX, CASE_INDEX } from '$lib/types';
	import {
		loadWordBank,
		loadTemplates,
		generateFormProduction,
		generateCaseIdentification,
		generateSentenceDrill,
		getCandidates,
		checkAnswer,
		weightedRandom
	} from '$lib/engine/drill';
	import {
		progress,
		recordResult,
		setLevel,
		getAllCaseStrengths,
		pickWeightedCase
	} from '$lib/engine/progress';
	import { speak, isTTSAvailable, warmUpVoices, playCorrectSound } from '$lib/audio';
	import paradigmsData from '$lib/data/paradigms.json';
	import curriculumData from '$lib/data/curriculum.json';

	import CasePillBar from '$lib/components/CasePillBar.svelte';
	import DrillSettings_ from '$lib/components/DrillSettings.svelte';
	import DrillCard from '$lib/components/DrillCard.svelte';
	import ReferenceSidebar from '$lib/components/ReferenceSidebar.svelte';
	import DeclensionTable from '$lib/components/DeclensionTable.svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	interface ParadigmEntry {
		id: string;
		name: string;
		gender: string;
		animate: boolean;
		exampleLemma: string;
		whyNotes: Record<string, string>;
	}

	interface CurriculumLevel {
		unlocked_cases: string[];
		unlocked_difficulty: string[];
		adjectives_unlocked: boolean;
		plural_unlocked: boolean | string;
	}

	const paradigms: ParadigmEntry[] = paradigmsData;
	const curriculum: Record<string, CurriculumLevel> = curriculumData;

	const SETTINGS_STORAGE_KEY = 'sklonuj_settings';

	function getDefaultSettings(): DrillSettings {
		return {
			selectedCases: ALL_CASES,
			selectedDrillTypes: ['form_production', 'case_identification', 'sentence_fill_in'],
			numberMode: 'both'
		};
	}

	function loadSettingsFromStorage(): DrillSettings {
		if (typeof window === 'undefined') return getDefaultSettings();
		try {
			const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
			if (raw === null) return getDefaultSettings();
			const parsed: unknown = JSON.parse(raw);
			if (isValidDrillSettings(parsed)) {
				return { ...parsed, selectedCases: ALL_CASES };
			}
			return getDefaultSettings();
		} catch {
			return getDefaultSettings();
		}
	}

	function isValidDrillSettings(value: unknown): value is DrillSettings {
		if (typeof value !== 'object' || value === null) return false;
		const obj = value as Record<string, unknown>;
		if (!Array.isArray(obj.selectedCases) || obj.selectedCases.length === 0) return false;
		if (!Array.isArray(obj.selectedDrillTypes) || obj.selectedDrillTypes.length === 0) return false;
		if (obj.numberMode !== 'sg' && obj.numberMode !== 'pl' && obj.numberMode !== 'both')
			return false;
		const validCases = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
		const validTypes = ['form_production', 'case_identification', 'sentence_fill_in'];
		if (!obj.selectedCases.every((c: unknown) => validCases.includes(c as string))) return false;
		if (!obj.selectedDrillTypes.every((dt: unknown) => validTypes.includes(dt as string)))
			return false;
		return true;
	}

	function saveSettingsToStorage(settings: DrillSettings): void {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
		} catch {
			// localStorage may be unavailable
		}
	}

	let currentLevel: Difficulty = $state('A1');
	let drillSettings: DrillSettings = $state(getDefaultSettings());
	let question: DrillQuestion | null = $state(null);
	let lastResult: DrillResult | null = $state(null);
	let currentProgress = $state(get(progress));
	let paradigmNotes: Record<string, string> | null = $state(null);
	let submitted = $state(false);
	let advanceTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let initialized = $state(false);
	let ttsAvailable = $state(false);
	let autoplayAudio = $state(true);
	let hasInteracted = $state(false);
	let sessionCount = $state(0);

	// Session stats
	let sessionCorrect = $state(0);
	let sessionWrong = $state(0);
	let sessionCaseMisses: Record<string, number> = $state({});

	// Mistakes
	let mistakes: DrillResult[] = $state([]);

	// Case pill bar selection
	let selectedCase = $state<Case | 'all'>('all');
	let enabledCases = $state<Case[]>([...ALL_CASES]);

	// Top-level view
	let activeView = $state<'exercise' | 'declension'>('exercise');

	// Settings expanded state
	let settingsExpanded = $state(false);
	let caseFilterExpanded = $state(false);
	let practicingMistakes = $state(false);
	let lastMistakeIndex = $state(-1);

	let relevantMistakeCount = $derived(
		selectedCase === 'all'
			? mistakes.filter((m) => enabledCases.includes(m.question.case)).length
			: mistakes.filter((m) => m.question.case === selectedCase).length
	);

	// Derived: case strengths for pill bar (reactive to progress changes)
	let caseStrengths = $derived.by(() => {
		// Touch currentProgress to make this reactive
		void currentProgress;
		return getAllCaseStrengths();
	});

	// Reference sidebar
	let refSidebarOpen = $state(false);
	let refSidebarWord = $state('');
	let refSidebarTab = $state<'declension' | 'cases' | 'prepositions'>('cases');

	function handleWordClick(lemma: string) {
		refSidebarWord = lemma;
		refSidebarTab = 'declension';
		refSidebarOpen = true;
	}

	function openReferenceSidebar() {
		refSidebarWord = question?.word.lemma ?? '';
		refSidebarTab = 'declension';
		refSidebarOpen = true;
	}

	function toggleReferenceSidebar() {
		if (refSidebarOpen) {
			refSidebarOpen = false;
		} else {
			openReferenceSidebar();
		}
	}

	// Dark mode
	let darkMode = $state(false);

	function initDarkMode(): void {
		if (typeof window === 'undefined') return;
		const stored = localStorage.getItem('sklonuj_dark');
		if (stored !== null) {
			darkMode = stored === 'true';
		} else {
			darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
		document.documentElement.classList.toggle('dark', darkMode);
	}

	function toggleDarkMode(): void {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark', darkMode);
		localStorage.setItem('sklonuj_dark', String(darkMode));
	}

	// Subscribe to progress store
	$effect(() => {
		const unsubscribe = progress.subscribe((value) => {
			currentProgress = value;
			currentLevel = value.level;
		});
		return unsubscribe;
	});

	// Initialize on mount and clean up timer on destroy
	$effect(() => {
		if (initialized) return;
		initialized = true;
		initDarkMode();
		ttsAvailable = isTTSAvailable();
		if (ttsAvailable) {
			warmUpVoices();
		}
		const storedAutoplay = localStorage.getItem('sklonuj_autoplay');
		if (storedAutoplay !== null) {
			autoplayAudio = storedAutoplay !== 'false';
		}
		const savedSettings = loadSettingsFromStorage();
		drillSettings = savedSettings;
		generateNextQuestion();

		return () => {
			if (advanceTimer !== null) {
				clearTimeout(advanceTimer);
				advanceTimer = null;
			}
		};
	});

	function pickDrillType(): DrillType {
		// No case identification when a specific case is selected (you already know the case)
		let allowed = drillSettings.selectedDrillTypes;
		if (selectedCase !== 'all') {
			allowed = allowed.filter((dt) => dt !== 'case_identification');
			if (allowed.length === 0) allowed = ['form_production'];
		}

		if (allowed.length === 1) return allowed[0];

		const activeCases = selectedCase === 'all' ? enabledCases : [selectedCase];

		// Check if sentence-based drills are viable
		if (allowed.includes('case_identification') || allowed.includes('sentence_fill_in')) {
			const templates = loadTemplates();
			const levelConfig = curriculum[currentLevel];
			const unlockedDifficulties = levelConfig.unlocked_difficulty;
			const eligibleTemplates = templates.filter(
				(t) =>
					activeCases.includes(t.requiredCase) &&
					unlockedDifficulties.includes(t.difficulty) &&
					matchesNumberMode(t.number)
			);

			if (eligibleTemplates.length === 0) {
				if (allowed.includes('form_production')) return 'form_production';
				return allowed[Math.floor(Math.random() * allowed.length)];
			}
		}

		return allowed[Math.floor(Math.random() * allowed.length)];
	}

	function matchesNumberMode(templateNumber: Number_): boolean {
		if (drillSettings.numberMode === 'both') return true;
		return templateNumber === drillSettings.numberMode;
	}

	function generateNextQuestion(): void {
		// Practice mistakes mode: only serve from mistakes list
		if (practicingMistakes) {
			if (mistakes.length === 0) {
				practicingMistakes = false;
				lastMistakeIndex = -1;
			} else {
				// Pick next mistake, avoiding the same one twice in a row (unless only 1 left)
				let idx = 0;
				if (mistakes.length > 1 && lastMistakeIndex >= 0) {
					idx = (lastMistakeIndex + 1) % mistakes.length;
				}
				lastMistakeIndex = idx;
				// Spread to create a new object so {#key question} resets DrillCard
				question = { ...mistakes[idx].question };
				lastResult = null;
				paradigmNotes = null;
				submitted = false;
				if (advanceTimer !== null) {
					clearTimeout(advanceTimer);
					advanceTimer = null;
				}
				autoPlayPrompt(question);
				return;
			}
		}

		const wordBank = loadWordBank();
		const prog = get(progress);
		const levelConfig = curriculum[prog.level];
		const unlockedDifficulties = levelConfig.unlocked_difficulty;

		const eligibleWords = wordBank.filter((w) => unlockedDifficulties.includes(w.difficulty));

		if (eligibleWords.length === 0) {
			question = null;
			return;
		}

		const drillType = pickDrillType();

		// Pick case: either the selected one, or weighted random from enabled cases
		const case_ = selectedCase === 'all' ? pickWeightedCase(enabledCases) : selectedCase;

		// Pick number
		let number_: Number_;
		if (drillSettings.numberMode === 'sg') number_ = 'sg';
		else if (drillSettings.numberMode === 'pl') number_ = 'pl';
		else number_ = Math.random() < 0.5 ? 'sg' : 'pl';

		const activeCases = selectedCase === 'all' ? enabledCases : [selectedCase];

		if (drillType === 'form_production') {
			const word = weightedRandom(eligibleWords, prog, case_, number_);
			question = generateFormProduction(word, case_, number_);
		} else {
			const templates = loadTemplates();
			const eligibleTemplates = templates.filter(
				(t) =>
					activeCases.includes(t.requiredCase) &&
					unlockedDifficulties.includes(t.difficulty) &&
					matchesNumberMode(t.number)
			);

			if (eligibleTemplates.length === 0) {
				const word = weightedRandom(eligibleWords, prog, case_, number_);
				question = generateFormProduction(word, case_, number_);
			} else {
				const template = eligibleTemplates[Math.floor(Math.random() * eligibleTemplates.length)];
				const candidates = getCandidates(template, prog);

				if (candidates.length === 0) {
					const word = weightedRandom(eligibleWords, prog, case_, number_);
					question = generateFormProduction(word, case_, number_);
				} else {
					const word = weightedRandom(candidates, prog, template.requiredCase, template.number);

					if (drillType === 'case_identification') {
						question = generateCaseIdentification(template, word);
					} else {
						question = generateSentenceDrill(template, word);
					}
				}
			}
		}

		lastResult = null;
		paradigmNotes = null;
		submitted = false;

		if (advanceTimer !== null) {
			clearTimeout(advanceTimer);
			advanceTimer = null;
		}

		if (question) {
			autoPlayPrompt(question);
		}
	}

	function lookupParadigmNotes(paradigmId: string): Record<string, string> | null {
		const entry = paradigms.find((p) => p.id === paradigmId);
		return entry?.whyNotes ?? null;
	}

	function trackSessionStats(result: DrillResult): void {
		if (result.correct) {
			sessionCorrect++;
		} else {
			sessionWrong++;
			const caseKey = `${result.question.case}_${result.question.number}`;
			sessionCaseMisses[caseKey] = (sessionCaseMisses[caseKey] ?? 0) + 1;
			// Only add new mistakes (not re-served ones)
			const isReserved = mistakes.some(
				(m) =>
					m.question.word.lemma === result.question.word.lemma &&
					m.question.case === result.question.case &&
					m.question.number === result.question.number &&
					m.question.drillType === result.question.drillType
			);
			if (!isReserved) {
				mistakes = [...mistakes, result];
			}
		}
	}

	function handleSubmit(answer: string): void {
		hasInteracted = true;

		if (answer === '__skip__') {
			if (!question || submitted) return;
			submitted = true;
			sessionCount++;
			const result: DrillResult = {
				question,
				userAnswer: '',
				correct: false,
				nearMiss: false
			};
			lastResult = result;
			recordResult(result);
			trackSessionStats(result);
			paradigmNotes = lookupParadigmNotes(question.word.paradigm);
			autoPlayAnswer(question);
			return;
		}

		if (answer === '__advance__') {
			if (advanceTimer !== null) {
				clearTimeout(advanceTimer);
				advanceTimer = null;
			}
			// If the last result was a re-served mistake that was answered correctly, remove it
			if (lastResult && lastResult.correct) {
				const idx = mistakes.findIndex(
					(m) =>
						m.question.word.lemma === lastResult!.question.word.lemma &&
						m.question.case === lastResult!.question.case &&
						m.question.number === lastResult!.question.number &&
						m.question.drillType === lastResult!.question.drillType
				);
				if (idx !== -1) {
					mistakes = mistakes.filter((_, i) => i !== idx);
					// Adjust lastMistakeIndex since the array shifted
					if (lastMistakeIndex >= mistakes.length) {
						lastMistakeIndex = 0;
					} else if (idx <= lastMistakeIndex) {
						lastMistakeIndex = Math.max(0, lastMistakeIndex - 1);
					}
				}
			}
			generateNextQuestion();
			return;
		}

		if (!question || submitted) return;

		submitted = true;
		sessionCount++;
		const result = checkAnswer(question, answer);
		lastResult = result;
		recordResult(result);
		trackSessionStats(result);

		if (result.correct) {
			playCorrectSound();
		} else {
			paradigmNotes = lookupParadigmNotes(question.word.paradigm);
		}

		autoPlayAnswer(question);
	}

	function handleLevelChange(level: Difficulty): void {
		setLevel(level);
		currentLevel = level;
		generateNextQuestion();
	}

	function handleSettingsChange(settings: {
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
	}): void {
		drillSettings = { ...drillSettings, selectedCases: ALL_CASES, ...settings };
		saveSettingsToStorage(drillSettings);
		generateNextQuestion();
	}

	function handleCaseSelect(selected: Case | 'all'): void {
		selectedCase = selected;
		generateNextQuestion();
	}

	function toggleEnabledCase(c: Case): void {
		const isEnabled = enabledCases.includes(c);
		if (isEnabled && enabledCases.length <= 1) return;
		enabledCases = isEnabled ? enabledCases.filter((x) => x !== c) : [...enabledCases, c];
		generateNextQuestion();
	}

	function handleSpeak(text: string): void {
		speak(text);
	}

	function questionPromptText(q: DrillQuestion): string {
		if (q.drillType === 'form_production') {
			return q.word.lemma;
		} else if (q.drillType === 'sentence_fill_in') {
			return q.template.template.replace('___', '...');
		} else {
			// case_identification: read only the nominative form so the user figures out the case
			return q.word.forms[q.number][0];
		}
	}

	function autoPlayPrompt(q: DrillQuestion): void {
		if (!ttsAvailable || !autoplayAudio || !hasInteracted) return;
		speak(questionPromptText(q));
	}

	function autoPlayAnswer(q: DrillQuestion): void {
		if (!ttsAvailable || !autoplayAudio || !hasInteracted) return;
		if (q.drillType === 'case_identification') {
			// After revealing the answer, read the full sentence with the correct form
			speak(q.template.template.replace('___', q.word.forms[q.number][CASE_INDEX[q.case]]));
			return;
		}
		speak(q.correctAnswer);
	}

	function toggleAutoplay(): void {
		autoplayAudio = !autoplayAudio;
		localStorage.setItem('sklonuj_autoplay', String(autoplayAudio));
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && refSidebarOpen) {
			refSidebarOpen = false;
		}
	}}
/>

<svelte:head>
	<title>Skloňuj -- Czech Declension Trainer</title>
	<meta
		name="description"
		content="Master Czech noun declensions with smart drilling and grammar explanations."
	/>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<NavBar
		activePage={activeView === 'exercise' ? 'exercises' : 'lookup'}
		onNavigate={(page) => {
			activeView = page === 'exercises' ? 'exercise' : 'declension';
			if (activeView === 'declension') refSidebarOpen = false;
		}}
		{darkMode}
		onToggleDarkMode={toggleDarkMode}
	/>

	{#if activeView === 'exercise'}
		<main class="mx-auto w-full max-w-[867px] flex-1 px-4 py-8">
			<!-- Case selection pill bar -->
			<div class="mb-5">
				<CasePillBar {selectedCase} {caseStrengths} onSelect={handleCaseSelect} />
				{#if selectedCase === 'all'}
					<div class="mt-3 text-center">
						<button
							onclick={() => (caseFilterExpanded = !caseFilterExpanded)}
							class="inline-flex items-center gap-1 text-[11px] font-medium text-text-subtitle transition-colors hover:text-text-default"
						>
							Filter cases
							{#if enabledCases.length < ALL_CASES.length}
								<span class="text-emphasis">({enabledCases.length}/{ALL_CASES.length})</span>
							{/if}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-3 w-3 transition-transform duration-200 {caseFilterExpanded
									? 'rotate-180'
									: ''}"
							>
								<path
									fill-rule="evenodd"
									d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
						{#if caseFilterExpanded}
							<div
								transition:slide={{ duration: 150 }}
								class="mt-2 flex flex-wrap justify-center gap-1.5"
							>
								{#each ALL_CASES as c (c)}
									{@const enabled = enabledCases.includes(c)}
									<button
										onclick={() => toggleEnabledCase(c)}
										class="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150"
										class:opacity-35={!enabled}
										style="background-color: {CASE_HEX[c]}12; color: {CASE_HEX[
											c
										]}; border: 1px solid {enabled ? CASE_HEX[c] + '40' : 'transparent'}"
										aria-pressed={enabled}
									>
										{CASE_LABELS[c]}
									</button>
								{/each}
								{#if enabledCases.length < ALL_CASES.length}
									<button
										onclick={() => {
											enabledCases = [...ALL_CASES];
											generateNextQuestion();
										}}
										class="text-[11px] font-medium text-text-subtitle underline decoration-dotted underline-offset-2 transition-colors hover:text-text-default"
									>
										Reset
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Toolbar: mistakes + settings -->
			<div class="mb-4 flex items-center justify-end gap-2">
				{#if relevantMistakeCount > 0}
					<button
						type="button"
						onclick={() => {
							practicingMistakes = !practicingMistakes;
							lastMistakeIndex = -1;
							generateNextQuestion();
						}}
						class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-150
							{practicingMistakes
							? 'border-negative-stroke bg-negative-background text-negative-stroke'
							: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-negative-stroke/40 hover:text-negative-stroke'}"
					>
						{#if practicingMistakes}
							Reviewing {relevantMistakeCount}
							{relevantMistakeCount === 1 ? 'mistake' : 'mistakes'}
						{:else}
							Review {relevantMistakeCount}
							{relevantMistakeCount === 1 ? 'mistake' : 'mistakes'}
						{/if}
					</button>
				{/if}
				{#if ttsAvailable}
					<button
						type="button"
						onclick={toggleAutoplay}
						class="flex size-8 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
						aria-label="Toggle audio autoplay"
					>
						{#if autoplayAudio}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="size-4"
							>
								<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
								<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
								<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="size-4"
							>
								<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
								<line x1="23" y1="9" x2="17" y2="15" />
								<line x1="17" y1="9" x2="23" y2="15" />
							</svg>
						{/if}
					</button>
				{/if}
				<button
					type="button"
					onclick={() => (settingsExpanded = !settingsExpanded)}
					class="flex size-8 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
					aria-label="Exercise settings"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="size-4"
					>
						<circle cx="12" cy="12" r="3" />
						<path
							d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
						/>
					</svg>
				</button>
			</div>

			<!-- Settings panel -->
			{#if settingsExpanded}
				<div
					transition:slide={{ duration: 200 }}
					class="mb-5 flex flex-wrap items-start gap-x-6 gap-y-3 rounded-2xl border border-card-stroke bg-card-bg px-5 py-4"
				>
					<div class="flex items-center gap-2">
						<span
							class="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-text-subtitle"
							>Word Difficulty</span
						>
						<div class="inline-flex rounded-[16px] border border-card-stroke bg-card-bg p-1">
							{#each ['A1', 'A2', 'B1'] as lvl (lvl)}
								<button
									onclick={() => handleLevelChange(lvl as Difficulty)}
									class="rounded-[12px] px-3 py-1 text-xs font-normal transition-all
										{currentLevel === lvl
										? 'bg-shaded-background text-text-default'
										: 'text-text-subtitle hover:text-text-default'}"
								>
									{lvl}
								</button>
							{/each}
						</div>
					</div>
					<DrillSettings_
						selectedDrillTypes={drillSettings.selectedDrillTypes}
						numberMode={drillSettings.numberMode}
						onSettingsChange={handleSettingsChange}
					/>
				</div>
			{/if}

			<!-- Drill area -->
			<div class="mx-auto max-w-[867px]">
				<DrillCard
					{question}
					result={lastResult}
					onSubmit={handleSubmit}
					onSpeak={ttsAvailable ? handleSpeak : null}
					selectedCases={ALL_CASES}
					{paradigmNotes}
					onWordClick={handleWordClick}
				/>
			</div>

			<!-- Session stats -->
			{#if sessionCount > 0}
				{@const total = sessionCorrect + sessionWrong}
				{@const pct = total > 0 ? Math.round((sessionCorrect / total) * 100) : 0}
				<div class="mt-6 text-center text-xs text-text-subtitle">
					{total} completed &middot; {pct}% accuracy
				</div>
			{/if}
		</main>
	{:else}
		<!-- Declension/Lookup view -->
		<main class="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
			<DeclensionTable alwaysExpanded={true} />
		</main>
	{/if}

	<!-- Reference sidebar with attached handle -->
	{#if activeView === 'exercise'}
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0 z-30 transition-opacity duration-300
				{refSidebarOpen ? 'bg-black/20 opacity-100' : 'pointer-events-none opacity-0'}"
			onclick={() => (refSidebarOpen = false)}
			aria-label="Close sidebar"
			tabindex="-1"
		></button>

		<!-- Sidebar + handle -->
		<div
			class="fixed top-16 right-0 z-40 flex h-[calc(100%-4rem)] transition-transform duration-300 ease-in-out"
			style="transform: translateX({refSidebarOpen ? '0px' : 'calc(100% - 48px)'})"
		>
			<button
				type="button"
				onclick={toggleReferenceSidebar}
				class="self-center shrink-0 rounded-bl-[12px] rounded-tl-[12px] bg-emphasis px-3.5 py-6 text-text-inverted shadow-lg transition-opacity hover:opacity-90"
				aria-label="Toggle reference sidebar"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5"
				>
					<path d="M2 6h4" />
					<path d="M2 10h4" />
					<path d="M2 14h4" />
					<path d="M2 18h4" />
					<rect width="16" height="20" x="4" y="2" rx="2" />
					<path d="M9.5 8h5" />
					<path d="M9.5 12H16" />
					<path d="M9.5 16H14" />
				</svg>
			</button>
			<aside class="h-full w-screen max-w-md bg-card-bg shadow-2xl">
				<ReferenceSidebar
					initialWord={refSidebarWord}
					initialTab={refSidebarTab}
					onClose={() => (refSidebarOpen = false)}
				/>
			</aside>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="pb-6 pt-4 text-center">
		<p class="text-xs text-text-subtitle">Skloňuj</p>
	</footer>
</div>
