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
	import ProgressGrid from '$lib/components/ProgressGrid.svelte';
	import SessionStats from '$lib/components/SessionStats.svelte';
	import ReferenceSidebar from '$lib/components/ReferenceSidebar.svelte';
	import DeclensionTable from '$lib/components/DeclensionTable.svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import ViewToggle from '$lib/components/ui/ViewToggle.svelte';
	import ExerciseConfigToggle from '$lib/components/ui/ExerciseConfigToggle.svelte';

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
	let autoplayAudio = $state(true);
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

	// Settings expanded state
	let settingsExpanded = $state(false);

	let exerciseTabs = $derived([
		{ id: 'practice', label: 'Declination practice' },
		{
			id: 'review',
			label: 'Review mistakes',
			badge: mistakes.length > 0 ? mistakes.length : undefined
		}
	]);

	function handleExerciseTabChange(id: string) {
		if (id === 'review' && mistakes.length > 0) {
			startReviewMistakes();
		} else if (id === 'practice' && reviewMode) {
			exitReviewMode();
		}
	}

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
		const storedAutoplay = localStorage.getItem('sklonuj_autoplay');
		if (storedAutoplay !== null) {
			autoplayAudio = storedAutoplay !== 'false';
		}
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
				autoPlayPrompt(question);
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
			autoPlayAnswer(question);
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
		}

		autoPlayAnswer(question);
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

	function questionPromptText(q: DrillQuestion): string {
		if (q.drillType === 'form_production') {
			return q.word.lemma;
		} else if (q.drillType === 'sentence_fill_in') {
			return q.template.template.replace('___', '...');
		} else {
			// case_identification: read full sentence with the word filled in
			return q.template.template.replace('___', q.correctAnswer);
		}
	}

	function autoPlayPrompt(q: DrillQuestion): void {
		if (!ttsAvailable || !autoplayAudio) return;
		if (q.drillType === 'case_identification') return;
		speak(questionPromptText(q));
	}

	function autoPlayAnswer(q: DrillQuestion): void {
		if (!ttsAvailable || !autoplayAudio) return;
		if (q.drillType === 'case_identification') return;
		speak(q.correctAnswer);
	}

	function toggleAutoplay(): void {
		autoplayAudio = !autoplayAudio;
		localStorage.setItem('sklonuj_autoplay', String(autoplayAudio));
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

<div class="flex min-h-screen flex-col">
	<NavBar
		activePage={activeView === 'exercise' ? 'exercises' : 'lookup'}
		onNavigate={(page) => {
			activeView = page === 'exercises' ? 'exercise' : 'declension';
			if (activeView === 'declension') refSidebarOpen = false;
		}}
	/>

	{#if activeView === 'exercise'}
		<main class="mx-auto w-full max-w-[867px] flex-1 px-4 py-8">
			<!-- ViewToggle for practice / review -->
			<div class="mb-6">
				<ViewToggle
					tabs={exerciseTabs}
					activeTab={reviewMode ? 'review' : 'practice'}
					onTabChange={handleExerciseTabChange}
				/>
			</div>

			<!-- Question counter -->
			<p class="mb-4 text-center text-sm font-medium text-text-subtitle">
				Question {sessionCount + 1}{#if sessionCorrect + sessionWrong > 0}
					({Math.round((sessionCorrect / (sessionCorrect + sessionWrong)) * 100)}% correct){/if}
			</p>

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
						<p class="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
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

			<!-- Drill area -->
			<div class="mx-auto max-w-[867px]">
				{#if !reviewComplete}
					<DrillCard
						{question}
						result={lastResult}
						onSubmit={handleSubmit}
						onSpeak={ttsAvailable ? handleSpeak : null}
						selectedCases={drillSettings.selectedCases}
						showWordHint={drillSettings.showWordHint}
						{paradigmNotes}
						onWordClick={handleWordClick}
					/>
				{/if}
			</div>

			<!-- Exercise Configuration toggle (below card) -->
			<div class="mt-5 flex justify-center">
				<ExerciseConfigToggle onclick={() => (settingsExpanded = !settingsExpanded)} />
			</div>

			<!-- Settings panel (collapsible) -->
			{#if settingsExpanded}
				<div class="mt-4">
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
			{/if}

			<!-- Session stats -->
			{#if sessionCount > 0}
				<div class="mt-6 text-center">
					<span class="text-xs text-text-subtitle">
						{sessionAccuracyText || `${sessionCount} answered`}
					</span>
				</div>
			{/if}

			<!-- Progress -->
			<div class="mx-auto mt-8 max-w-lg">
				<ProgressGrid progress={currentProgress} />
			</div>

			<!-- Autoplay & dark mode toggles -->
			<div class="mt-8 flex items-center justify-center gap-2">
				{#if ttsAvailable}
					<button
						type="button"
						onclick={toggleAutoplay}
						class="rounded-lg p-2 text-text-subtitle transition-colors hover:text-text-default"
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
								class="h-4 w-4"
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
								class="h-4 w-4"
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
					onclick={toggleDarkMode}
					class="rounded-lg p-2 text-text-subtitle transition-colors hover:text-text-default"
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
			</div>
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
			class="fixed top-0 right-0 z-40 flex h-full transition-transform duration-300 ease-in-out"
			style="transform: translateX({refSidebarOpen ? '0px' : 'calc(100% - 40px)'})"
		>
			<button
				type="button"
				onclick={toggleReferenceSidebar}
				class="self-center shrink-0 rounded-bl-[12px] rounded-tl-[12px] bg-emphasis px-2 py-4 text-text-inverted shadow-lg transition-opacity hover:opacity-90"
				aria-label="Toggle reference sidebar"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					class="h-4 w-4"
				>
					<path
						d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06V4.31a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3.25a9.007 9.007 0 00-4.25 1.065V16.82zM9.25 4.315A9.007 9.007 0 005 3.25a9.006 9.006 0 00-2.454.339A.75.75 0 002 4.31v10.75a.75.75 0 00.954.721A7.462 7.462 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.315z"
					/>
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
