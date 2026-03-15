<script lang="ts">
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
	import { progress, recordResult, setLevel } from '$lib/engine/progress';
	import { speak, isTTSAvailable } from '$lib/audio';
	import paradigmsData from '$lib/data/paradigms.json';
	import curriculumData from '$lib/data/curriculum.json';

	import DrillSettings_ from '$lib/components/DrillSettings.svelte';
	import DrillCard from '$lib/components/DrillCard.svelte';
	import WhyPanel from '$lib/components/WhyPanel.svelte';
	import ProgressGrid from '$lib/components/ProgressGrid.svelte';
	import SessionStats from '$lib/components/SessionStats.svelte';
	import ReferenceSidebar from '$lib/components/ReferenceSidebar.svelte';
	import DeclensionTable from '$lib/components/DeclensionTable.svelte';
	import ViewTabs from '$lib/components/ViewTabs.svelte';

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

	function getDefaultSettings(level: Difficulty): DrillSettings {
		const config = curriculum[level];
		const selectedCases = config.unlocked_cases as Case[];

		let selectedDrillTypes: DrillType[];
		if (level === 'A1') {
			selectedDrillTypes = ['form_production', 'case_identification'];
		} else {
			selectedDrillTypes = ['form_production', 'case_identification', 'sentence_fill_in'];
		}

		let numberMode: 'sg' | 'pl' | 'both';
		if (config.plural_unlocked === false) {
			numberMode = 'sg';
		} else {
			numberMode = 'both';
		}

		return { selectedCases, selectedDrillTypes, numberMode, showWordHint: true };
	}

	function settingsMatchLevel(settings: DrillSettings, level: Difficulty): boolean {
		const defaults = getDefaultSettings(level);
		if (settings.numberMode !== defaults.numberMode) return false;
		if (settings.selectedCases.length !== defaults.selectedCases.length) return false;
		if (settings.selectedDrillTypes.length !== defaults.selectedDrillTypes.length) return false;
		const casesMatch = defaults.selectedCases.every((c) => settings.selectedCases.includes(c));
		const typesMatch = defaults.selectedDrillTypes.every((dt) =>
			settings.selectedDrillTypes.includes(dt)
		);
		return casesMatch && typesMatch;
	}

	function loadSettingsFromStorage(level: Difficulty): DrillSettings {
		if (typeof window === 'undefined') return getDefaultSettings(level);
		try {
			const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
			if (raw === null) return getDefaultSettings(level);
			const parsed: unknown = JSON.parse(raw);
			if (isValidDrillSettings(parsed)) {
				return { ...parsed, showWordHint: parsed.showWordHint ?? true };
			}
			return getDefaultSettings(level);
		} catch {
			return getDefaultSettings(level);
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
		if (obj.showWordHint !== undefined && typeof obj.showWordHint !== 'boolean') return false;
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
	let drillSettings: DrillSettings = $state(getDefaultSettings('A1'));
	let question: DrillQuestion | null = $state(null);
	let lastResult: DrillResult | null = $state(null);
	let currentProgress = $state(get(progress));
	let paradigmNotes: Record<string, string> | null = $state(null);
	let submitted = $state(false);
	let advanceTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let initialized = $state(false);
	let ttsAvailable = $state(false);
	let sessionCount = $state(0);

	// Session stats
	let sessionCorrect = $state(0);
	let sessionWrong = $state(0);
	let sessionCaseMisses: Record<string, number> = $state({});
	let showSessionSummary = $state(false);
	let lastSummaryAt = $state(0);

	// Review mistakes
	let mistakes: DrillResult[] = $state([]);
	let reviewMode = $state(false);
	let reviewIndex = $state(0);
	let reviewComplete = $state(false);

	// Top-level view
	let activeView = $state<'exercise' | 'declension'>('exercise');

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
		refSidebarWord = '';
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

	let isCustom = $derived(!settingsMatchLevel(drillSettings, currentLevel));

	let sessionAccuracyText = $derived.by(() => {
		const total = sessionCorrect + sessionWrong;
		if (total === 0) return '';
		const pct = Math.round((sessionCorrect / total) * 100);
		return `${sessionCorrect}/${total} correct (${pct}%)`;
	});

	let weakestCaseKey = $derived.by(() => {
		let worst: string | null = null;
		let worstCount = 0;
		for (const [key, count] of Object.entries(sessionCaseMisses)) {
			if (count > worstCount) {
				worstCount = count;
				worst = key;
			}
		}
		return worst;
	});

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
		const savedSettings = loadSettingsFromStorage(currentLevel);
		drillSettings = savedSettings;
		generateNextQuestion();

		return () => {
			if (advanceTimer !== null) {
				clearTimeout(advanceTimer);
				advanceTimer = null;
			}
		};
	});

	function pickRandomCase(): { case_: Case; number_: Number_ } {
		const cases = drillSettings.selectedCases;
		const case_ = cases[Math.floor(Math.random() * cases.length)];

		let number_: Number_;
		if (drillSettings.numberMode === 'sg') {
			number_ = 'sg';
		} else if (drillSettings.numberMode === 'pl') {
			number_ = 'pl';
		} else {
			number_ = Math.random() < 0.5 ? 'sg' : 'pl';
		}

		return { case_, number_ };
	}

	function pickDrillType(): DrillType {
		const allowed = drillSettings.selectedDrillTypes;

		if (allowed.length === 1) return allowed[0];

		// Check if sentence-based drills are viable
		if (allowed.includes('case_identification') || allowed.includes('sentence_fill_in')) {
			const templates = loadTemplates();
			const levelConfig = curriculum[currentLevel];
			const unlockedDifficulties = levelConfig.unlocked_difficulty;
			const eligibleTemplates = templates.filter(
				(t) =>
					drillSettings.selectedCases.includes(t.requiredCase) &&
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
		// If in review mode, serve next mistake
		if (reviewMode) {
			if (reviewIndex < mistakes.length) {
				question = mistakes[reviewIndex].question;
				lastResult = null;
				paradigmNotes = null;
				submitted = false;
				if (advanceTimer !== null) {
					clearTimeout(advanceTimer);
					advanceTimer = null;
				}
				return;
			} else {
				reviewComplete = true;
				reviewMode = false;
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

		if (drillType === 'form_production') {
			const { case_, number_ } = pickRandomCase();
			const word = weightedRandom(eligibleWords, prog, case_, number_);
			question = generateFormProduction(word, case_, number_);
		} else {
			const templates = loadTemplates();
			const eligibleTemplates = templates.filter(
				(t) =>
					drillSettings.selectedCases.includes(t.requiredCase) &&
					unlockedDifficulties.includes(t.difficulty) &&
					matchesNumberMode(t.number)
			);

			if (eligibleTemplates.length === 0) {
				const { case_, number_ } = pickRandomCase();
				const word = weightedRandom(eligibleWords, prog, case_, number_);
				question = generateFormProduction(word, case_, number_);
			} else {
				const template = eligibleTemplates[Math.floor(Math.random() * eligibleTemplates.length)];
				const candidates = getCandidates(template, prog);

				if (candidates.length === 0) {
					const { case_, number_ } = pickRandomCase();
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
			// Only add to mistakes list during normal mode (not during review)
			if (!reviewMode) {
				mistakes = [...mistakes, result];
			}
		}

		// Check if we should show summary (every 10 questions)
		const total = sessionCorrect + sessionWrong;
		if (total > 0 && total % 10 === 0 && total !== lastSummaryAt) {
			lastSummaryAt = total;
			showSessionSummary = true;
		}
	}

	function handleSubmit(answer: string): void {
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
			if (ttsAvailable && question.drillType !== 'case_identification') {
				speak(question.correctAnswer);
			}
			return;
		}

		if (answer === '__advance__') {
			if (advanceTimer !== null) {
				clearTimeout(advanceTimer);
				advanceTimer = null;
			}
			if (reviewMode) {
				reviewIndex++;
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

		if (!result.correct) {
			paradigmNotes = lookupParadigmNotes(question.word.paradigm);
			if (ttsAvailable && question.drillType !== 'case_identification') {
				speak(question.correctAnswer);
			}
		}

		if (result.correct) {
			advanceTimer = setTimeout(() => {
				if (reviewMode) {
					reviewIndex++;
				}
				generateNextQuestion();
			}, 800);
		}
	}

	function handleLevelChange(level: Difficulty): void {
		setLevel(level);
		drillSettings = getDefaultSettings(level);
		saveSettingsToStorage(drillSettings);
		generateNextQuestion();
	}

	function handleSettingsChange(settings: DrillSettings): void {
		drillSettings = settings;
		saveSettingsToStorage(settings);
		generateNextQuestion();
	}

	function handleSpeak(text: string): void {
		speak(text);
	}

	function dismissSummary(): void {
		showSessionSummary = false;
	}

	function startReviewMistakes(): void {
		if (mistakes.length === 0) return;
		reviewMode = true;
		reviewIndex = 0;
		reviewComplete = false;
		generateNextQuestion();
	}

	function exitReviewMode(): void {
		reviewComplete = false;
		reviewMode = false;
		mistakes = [];
		generateNextQuestion();
	}
</script>

<svelte:head>
	<title>Skloňuj -- Czech Declension Trainer</title>
	<meta
		name="description"
		content="Master Czech noun declensions with smart drilling and grammar explanations."
	/>
</svelte:head>

<div
	class="flex min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900"
>
	<!-- Main column -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Top bar -->
		<nav class="sticky top-0 z-10 bg-white/80 backdrop-blur-md dark:bg-slate-900/80">
			<div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
				<h1
					class="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-lg font-extrabold tracking-tight text-transparent dark:from-brand-400 dark:to-brand-200"
				>
					Skloňuj
				</h1>

				<div class="flex items-center gap-2">
					{#if activeView === 'exercise'}
						{#if sessionCount > 0}
							<span class="text-xs text-slate-400 dark:text-slate-500">
								{sessionAccuracyText || `${sessionCount} answered`}
							</span>
						{/if}

						{#if mistakes.length > 0 && !reviewMode && !reviewComplete}
							<button
								onclick={startReviewMistakes}
								class="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-400 dark:hover:bg-rose-950"
							>
								Review
								<span
									class="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white dark:bg-rose-500"
								>
									{mistakes.length}
								</span>
							</button>
						{/if}
					{/if}

					<button
						type="button"
						onclick={toggleDarkMode}
						class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
						aria-label="Toggle dark mode"
					>
						{#if darkMode}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
							>
								<path
									d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.06 1.06l1.06 1.06z"
								/>
							</svg>
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-4 w-4"
							>
								<path
									fill-rule="evenodd"
									d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z"
									clip-rule="evenodd"
								/>
							</svg>
						{/if}
					</button>

					{#if activeView === 'exercise'}
						<button
							type="button"
							onclick={toggleReferenceSidebar}
							class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors
								{refSidebarOpen
								? 'bg-brand-600 text-white dark:bg-brand-500 dark:text-white'
								: 'bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-950/50 dark:text-brand-400 dark:hover:bg-brand-950'}"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="h-3.5 w-3.5"
							>
								<path
									d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06V4.31a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3.25a9.007 9.007 0 00-4.25 1.065V16.82zM9.25 4.315A9.007 9.007 0 005 3.25a9.006 9.006 0 00-2.454.339A.75.75 0 002 4.31v10.75a.75.75 0 00.954.721A7.462 7.462 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.315z"
								/>
							</svg>
							Reference
						</button>
					{/if}
				</div>
			</div>
		</nav>

		<ViewTabs
			{activeView}
			onViewChange={(view) => {
				activeView = view;
				if (view === 'declension') refSidebarOpen = false;
			}}
		/>

		{#if activeView === 'exercise'}
			<!-- Main content area -->
			<main class="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
				<!-- Settings (full width, collapsible) -->
				<div class="mb-6">
					<DrillSettings_
						selectedCases={drillSettings.selectedCases}
						selectedDrillTypes={drillSettings.selectedDrillTypes}
						numberMode={drillSettings.numberMode}
						showWordHint={drillSettings.showWordHint}
						level={currentLevel}
						{isCustom}
						onSettingsChange={handleSettingsChange}
						onLevelChange={handleLevelChange}
					/>
				</div>

				<!-- Status banners -->
				{#if reviewMode}
					<div class="mb-4">
						<div
							class="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-center text-sm font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
						>
							Reviewing mistakes ({reviewIndex + 1}/{mistakes.length})
						</div>
					</div>
				{/if}

				{#if reviewComplete}
					<div class="mb-5">
						<div
							class="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-5 text-center dark:border-emerald-800/40 dark:bg-emerald-950/30"
						>
							<p class="text-sm font-bold text-emerald-700 dark:text-emerald-400">
								All mistakes reviewed!
							</p>
							<p class="mt-1 text-xs text-emerald-600 dark:text-emerald-500">
								Great job practicing those tricky ones.
							</p>
							<button
								onclick={exitReviewMode}
								class="mt-3 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.98] dark:bg-emerald-500 dark:hover:bg-emerald-400"
							>
								Continue drilling
							</button>
						</div>
					</div>
				{/if}

				{#if showSessionSummary && !reviewMode}
					<div class="mb-6">
						<SessionStats
							totalAnswered={sessionCorrect + sessionWrong}
							correctCount={sessionCorrect}
							weakestArea={weakestCaseKey}
							ondismiss={dismissSummary}
						/>
					</div>
				{/if}

				<!-- Drill area (centered, constrained width) -->
				<div class="mx-auto max-w-lg">
					{#if !reviewComplete}
						<DrillCard
							{question}
							result={lastResult}
							onSubmit={handleSubmit}
							onSpeak={ttsAvailable ? handleSpeak : null}
							selectedCases={drillSettings.selectedCases}
							showWordHint={drillSettings.showWordHint}
							onWordClick={handleWordClick}
						/>
					{/if}

					<div class="mt-5">
						<WhyPanel result={lastResult} {paradigmNotes} />
					</div>
				</div>

				<!-- Progress -->
				<div class="mx-auto mt-8 max-w-lg">
					<ProgressGrid progress={currentProgress} />
				</div>
			</main>
		{:else}
			<!-- Declension view -->
			<main class="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
				<DeclensionTable alwaysExpanded={true} />
			</main>
		{/if}

		<!-- Footer -->
		<footer class="pb-6 pt-4 text-center">
			<p class="text-xs text-slate-300 dark:text-slate-700">Skloňuj</p>
		</footer>
	</div>

	<!-- Reference sidebar (side-by-side, slides in from right) -->
	{#if activeView === 'exercise'}
		<aside
			class="shrink-0 overflow-hidden border-l border-slate-200/60 bg-white transition-[width] duration-300 ease-in-out dark:border-slate-800/60 dark:bg-slate-900
				{refSidebarOpen ? 'w-full sm:w-96' : 'w-0 border-l-0'}"
			style="position: sticky; top: 0; height: 100vh;"
		>
			<div class="h-full w-full sm:w-96">
				<ReferenceSidebar
					initialWord={refSidebarWord}
					initialTab={refSidebarTab}
					onClose={() => (refSidebarOpen = false)}
				/>
			</div>
		</aside>
	{/if}
</div>
