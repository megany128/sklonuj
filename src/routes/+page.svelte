<script lang="ts">
	import { slide } from 'svelte/transition';
	import { get } from 'svelte/store';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import type {
		Case,
		ContentMode,
		Difficulty,
		DrillQuestion,
		DrillResult,
		DrillSettings,
		DrillType,
		MultiStepQuestion,
		MultiStepResult,
		Number_,
		PronounEntry,
		Progress,
		WordEntry,
		SentenceTemplate
	} from '$lib/types';
	import { ALL_CASES, CASE_LABELS, CASE_SHORT_LABELS, CASE_HEX, CASE_INDEX } from '$lib/types';

	import {
		loadWordBank,
		loadTemplates,
		generateFormProduction,
		generateCaseIdentification,
		generateSentenceDrill,
		generateMultiStepQuestion,
		getCandidates,
		checkAnswer,
		weightedRandom,
		hasValidForm,
		applyPrepositionVoicing,
		type CurriculumLevel
	} from '$lib/engine/drill';
	import {
		progress,
		STORAGE_USER_KEY,
		recordResult,
		recordMultiStepResult,
		setLevel,
		getAllCaseStrengths,
		getCombinedCaseStrength,
		pickWeightedCase
	} from '$lib/engine/progress';
	import { mergeProgress, loadProgressFromLocalStorage } from '$lib/engine/progress-merge';
	import { recordPractice } from '$lib/engine/streak';
	import {
		loadPronounBank,
		loadPronounTemplates,
		generatePronounFormProduction,
		generatePronounSentenceDrill,
		getPronounCandidates,
		weightedRandomPronoun,
		makePlaceholderWord
	} from '$lib/engine/pronoun-drill';
	import {
		speak,
		isTTSAvailable,
		warmUpVoices,
		playCorrectSound,
		playStreakSound,
		prepareSentenceForTTS
	} from '$lib/audio';
	import paradigmsData from '$lib/data/paradigms.json';
	import curriculumData from '$lib/data/curriculum.json';

	import type { KzkChaptersConfig, KzkChapter } from '$lib/types';
	import kzkChaptersData from '$lib/data/kzk_chapters.json';

	import CasePillBar from '$lib/components/CasePillBar.svelte';
	import CasePillBarSkeleton from '$lib/components/CasePillBarSkeleton.svelte';
	import ChapterSelector from '$lib/components/ChapterSelector.svelte';
	import DrillSettings_ from '$lib/components/DrillSettings.svelte';
	import DrillCard from '$lib/components/DrillCard.svelte';
	import MultiStepCard from '$lib/components/MultiStepCard.svelte';
	import ReferenceSidebar from '$lib/components/ReferenceSidebar.svelte';
	import DeclensionTable from '$lib/components/DeclensionTable.svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import MilestoneToast from '$lib/components/ui/MilestoneToast.svelte';
	import AuthModal from '$lib/components/ui/AuthModal.svelte';
	import GuidedTour from '$lib/components/ui/GuidedTour.svelte';

	const kzkChapters: KzkChaptersConfig = kzkChaptersData as KzkChaptersConfig;

	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import posthog from '$lib/posthog';

	let user = $derived($page.data.user);

	// Debounced sync to Supabase via server API (browser client auth is unreliable)
	let syncTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleSyncToSupabase(): void {
		if (!user) return;
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			const current = get(progress);
			fetch('/api/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					progress: {
						level: current.level,
						caseScores: current.caseScores,
						paradigmScores: current.paradigmScores,
						lastSession: current.lastSession
					}
				})
			}).catch(() => {});
		}, 1000);
	}

	// Practice session tracking (per-day upsert)
	let todayAttempted = $state(0);
	let todayCorrect = $state(0);
	let sessionSyncTimer: ReturnType<typeof setTimeout> | null = null;

	function getTodayDate(): string {
		const d = new Date();
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	function scheduleSessionSync(): void {
		if (!user) return;
		if (sessionSyncTimer) clearTimeout(sessionSyncTimer);
		sessionSyncTimer = setTimeout(() => {
			fetch('/api/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					session: {
						sessionDate: getTodayDate(),
						questionsAttempted: todayAttempted,
						questionsCorrect: todayCorrect
					}
				})
			}).catch(() => {});
		}, 1000);
	}

	function recordSessionActivity(correct: boolean): void {
		if (!user) return;
		todayAttempted++;
		if (correct) todayCorrect++;
		scheduleSessionSync();
	}

	function loadTodaySession(): void {
		if (!user) return;
		// Load via server API to avoid browser client auth issues
		fetch('/api/sync')
			.then((res) => res.json())
			.then(
				(data: { todaySession?: { questions_attempted: number; questions_correct: number } }) => {
					if (data.todaySession) {
						todayAttempted = data.todaySession.questions_attempted;
						todayCorrect = data.todaySession.questions_correct;
					}
				}
			)
			.catch(() => {});
	}

	interface ParadigmEntry {
		id: string;
		name: string;
		gender: string;
		animate: boolean;
		exampleLemma: string;
		whyNotes: Record<string, string>;
	}

	const paradigms: ParadigmEntry[] = paradigmsData;
	const curriculum: Record<string, CurriculumLevel> = curriculumData;

	const SETTINGS_STORAGE_KEY = 'sklonuj_settings';

	function getDefaultSettings(): DrillSettings {
		return {
			selectedCases: ALL_CASES,
			selectedDrillTypes: [
				'form_production',
				'case_identification',
				'sentence_fill_in',
				'multi_step'
			],
			numberMode: 'both',
			contentMode: 'both'
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
		if (
			obj.contentMode !== undefined &&
			obj.contentMode !== 'nouns' &&
			obj.contentMode !== 'pronouns' &&
			obj.contentMode !== 'both'
		)
			return false;
		const validCases = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
		const validTypes = ['form_production', 'case_identification', 'sentence_fill_in', 'multi_step'];
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

	let currentProgress = $state(get(progress));
	let currentLevel: Difficulty = $derived(currentProgress.level);
	let drillSettings: DrillSettings = $state(getDefaultSettings());
	let question: DrillQuestion | null = $state(null);
	let multiStepQuestion: MultiStepQuestion | null = $state(null);
	let lastResult: DrillResult | null = $state(null);
	let paradigmNotes: Record<string, string> | null = $state(null);
	let submitted = $state(false);
	let advanceTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let initialized = $state(false);
	let wordsLoading = $state(true);
	let ttsAvailable = $state(false);
	let autoplayAudio = $state(true);
	let hasInteracted = $state(false);
	let sessionCount = $state(0);
	let signupPromptDismissed = $state(false);
	let authModalOpen = $state(false);
	let showOnboarding = $state(true);

	// Session stats
	let sessionCorrect = $state(0);
	let sessionWrong = $state(0);
	let sessionCaseMisses: Record<string, number> = $state({});

	// Streak tracking
	let streak = $state(0);
	let bestStreak = $state(0);

	// Milestone toasts
	interface MilestoneToast_ {
		id: number;
		message: string;
		emoji: string;
	}
	let toasts = $state<MilestoneToast_[]>([]);
	let celebratedMilestones = $state(new Set<string>());
	let toastIdCounter = $state(0);

	// Animated stat counters
	let prefersReducedMotion = $derived(
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
	let tweenDuration = $derived(prefersReducedMotion ? 0 : 600);
	const displayTotal = tweened(0, { duration: 600, easing: cubicOut });
	const displayPct = tweened(0, { duration: 600, easing: cubicOut });

	// Update animated counters when stats change
	$effect(() => {
		const total = sessionCorrect + sessionWrong;
		const dur = tweenDuration;
		displayTotal.set(total, { duration: dur });
		displayPct.set(total > 0 ? Math.round((sessionCorrect / total) * 100) : 0, { duration: dur });
	});

	// Mistakes
	let mistakes: DrillResult[] = $state([]);

	// Case pill bar selection
	let selectedCase = $state<Case | 'all'>('all');
	let enabledCases = $state<Case[]>([...ALL_CASES]);

	// KzK chapter mode
	let chapterBook = $state<'kzk1' | 'kzk2' | null>(null);
	let chapterSelection = $state<string | null>(null);
	const CHAPTER_STORAGE_KEY = 'sklonuj_chapter';
	const CHAPTER_SCORES_KEY = 'sklonuj_chapter_scores';

	/** Multi-step questions are available in KZK 2 (any chapter), KZK 1 chapter 6+, or free practice. */
	function isMultiStepUnlocked(): boolean {
		if (chapterBook === null) return true; // free practice
		if (chapterBook === 'kzk2') return true; // all KZK 2 chapters
		// KZK 1: only chapter 6 (index 5) and later
		if (chapterBook === 'kzk1' && chapterSelection) {
			const chIdx = kzkChapters.kzk1.chapters.findIndex((ch) => ch.id === chapterSelection);
			return chIdx >= 5; // chapter 6 = index 5
		}
		return false;
	}
	let chapterScores = $state<Record<string, { attempts: number; correct: number }>>({});

	function loadChapterScores(): void {
		if (typeof window === 'undefined') return;
		try {
			const raw = localStorage.getItem(CHAPTER_SCORES_KEY);
			if (raw === null) return;
			const parsed: unknown = JSON.parse(raw);
			if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
				const valid: Record<string, { attempts: number; correct: number }> = {};
				for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
					if (
						typeof val === 'object' &&
						val !== null &&
						'attempts' in val &&
						'correct' in val &&
						typeof val.attempts === 'number' &&
						typeof val.correct === 'number'
					) {
						valid[key] = { attempts: val.attempts, correct: val.correct };
					}
				}
				chapterScores = valid;
			}
		} catch {
			// ignore
		}
	}

	function recordChapterResult(chapterId: string, correct: boolean): void {
		const existing = chapterScores[chapterId] ?? { attempts: 0, correct: 0 };
		chapterScores = {
			...chapterScores,
			[chapterId]: {
				attempts: existing.attempts + 1,
				correct: existing.correct + (correct ? 1 : 0)
			}
		};
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem(CHAPTER_SCORES_KEY, JSON.stringify(chapterScores));
			} catch {
				// ignore
			}
		}
	}

	function loadChapterFromStorage(): void {
		if (typeof window === 'undefined') return;
		try {
			const raw = localStorage.getItem(CHAPTER_STORAGE_KEY);
			if (raw === null) return;
			const parsed: unknown = JSON.parse(raw);
			if (
				typeof parsed === 'object' &&
				parsed !== null &&
				'book' in parsed &&
				'chapter' in parsed
			) {
				const obj = parsed as Record<string, unknown>;
				if (
					(obj.book === 'kzk1' || obj.book === 'kzk2' || obj.book === null) &&
					(typeof obj.chapter === 'string' || obj.chapter === null)
				) {
					chapterBook = obj.book;
					chapterSelection = typeof obj.chapter === 'string' ? obj.chapter : null;
				}
			}
		} catch {
			// ignore
		}
	}

	function saveChapterToStorage(): void {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem(
				CHAPTER_STORAGE_KEY,
				JSON.stringify({ book: chapterBook, chapter: chapterSelection })
			);
		} catch {
			// ignore
		}
	}

	function getSelectedKzkChapter(): KzkChapter | null {
		if (!chapterBook || !chapterSelection) return null;
		const book = kzkChapters[chapterBook];
		return book.chapters.find((ch) => ch.id === chapterSelection) ?? null;
	}

	/**
	 * Get all coreLemmas from the current chapter and all previous chapters in the same book,
	 * with current-chapter lemmas tagged separately for weighting.
	 */
	function getChapterLemmas(): {
		currentLemmas: string[];
		previousLemmas: string[];
	} {
		if (!chapterBook || !chapterSelection) return { currentLemmas: [], previousLemmas: [] };
		const book = kzkChapters[chapterBook];
		const chapterIndex = book.chapters.findIndex((ch) => ch.id === chapterSelection);
		if (chapterIndex < 0) return { currentLemmas: [], previousLemmas: [] };

		const currentLemmas = book.chapters[chapterIndex].coreLemmas;
		const previousLemmas: string[] = [];
		for (let i = 0; i < chapterIndex; i++) {
			previousLemmas.push(...book.chapters[i].coreLemmas);
		}
		return { currentLemmas, previousLemmas };
	}

	function handleModeChange(book: 'kzk1' | 'kzk2' | null): void {
		if (book === null) {
			handleChapterChange(null, null);
		} else {
			const firstChapter = kzkChapters[book].chapters[0];
			handleChapterChange(book, firstChapter.id);
		}
	}

	function handleChapterChange(book: 'kzk1' | 'kzk2' | null, chapterId: string | null): void {
		chapterBook = book;
		chapterSelection = chapterId;
		saveChapterToStorage();

		// When chapter mode is active, override enabledCases, number mode, and difficulty
		if (book && chapterId) {
			const chapter = getSelectedKzkChapter();
			if (chapter) {
				enabledCases = [...chapter.unlockedCases];
				if (!chapter.pluralUnlocked) {
					drillSettings = { ...drillSettings, numberMode: 'sg' };
					saveSettingsToStorage(drillSettings);
				}
				// Set CEFR level based on chapter position (use setLevel directly
				// to avoid double generateNextQuestion call)
				const chIdx = kzkChapters[book].chapters.findIndex((ch) => ch.id === chapterId);
				if (book === 'kzk1') {
					// KzK1 L1-13 = A1, L14+ = A2
					setLevel(chIdx >= 13 ? 'A2' : 'A1');
				} else if (book === 'kzk2') {
					setLevel('B1');
				}
			}
		} else {
			// Restore all cases when chapter mode is turned off
			enabledCases = [...ALL_CASES];
		}

		selectedCase = 'all';
		generateNextQuestion();
	}

	function handleChapterStep(direction: 'prev' | 'next'): void {
		if (!chapterBook || !chapterSelection) return;
		const chapters = kzkChapters[chapterBook].chapters;
		const idx = chapters.findIndex((ch) => ch.id === chapterSelection);
		if (idx < 0) return;
		let newIdx = direction === 'prev' ? idx - 1 : idx + 1;
		if (newIdx < 0) newIdx = chapters.length - 1;
		if (newIdx >= chapters.length) newIdx = 0;
		handleChapterChange(chapterBook, chapters[newIdx].id);
	}

	function chapterAccuracyColor(accuracy: number): string {
		if (accuracy < 0.5) return '#d73e3e';
		if (accuracy < 0.8) return '#e5a000';
		return '#40c607';
	}

	// Derived: whether pronouns are unlocked at the current level
	let pronounsUnlocked = $derived(curriculum[currentLevel]?.pronouns_unlocked ?? false);

	// Derived: effective content mode (forced to nouns if pronouns not unlocked)
	let effectiveContentMode: ContentMode = $derived(
		pronounsUnlocked ? (drillSettings.contentMode ?? 'both') : 'nouns'
	);

	// Derived: effective enabled cases (constrained by chapter if active)
	let effectiveEnabledCases = $derived.by(() => {
		const chapter = getSelectedKzkChapter();
		if (chapter) {
			// Intersect user-enabled cases with chapter's unlocked cases
			const unlocked = chapter.unlockedCases;
			const filtered = enabledCases.filter((c) => unlocked.includes(c));
			return filtered.length > 0 ? filtered : unlocked;
		}
		return enabledCases;
	});

	// Derived: whether number mode should be forced to sg
	let effectiveNumberMode = $derived.by(() => {
		const chapter = getSelectedKzkChapter();
		if (chapter && !chapter.pluralUnlocked) {
			return 'sg' as const;
		}
		return drillSettings.numberMode;
	});

	// Top-level view — derived from SvelteKit page store to avoid SSR/client mismatch
	let activeView = $state<'exercise' | 'declension'>(
		get(page).url.searchParams.get('view') === 'lookup' ? 'declension' : 'exercise'
	);

	// Settings expanded state
	let settingsExpanded = $state(false);
	let caseFilterExpanded = $state(false);
	let chapterPickerOpen = $state(false);
	let practicingMistakes = $state(false);
	let lastMistakeIndex = $state(-1);
	let lastTemplateId: string | null = null;

	let relevantMistakeCount = $derived(
		selectedCase === 'all'
			? mistakes.filter((m) => effectiveEnabledCases.includes(m.question.case)).length
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
	let refSidebarPronoun = $state('');
	let refSidebarTab = $state<'declension' | 'pronouns' | 'cases'>('cases');

	function handleWordClick(lemma: string) {
		const pronounBank = loadPronounBank();
		const isPronoun = pronounBank.some((p) => p.lemma === lemma);
		if (isPronoun) {
			refSidebarPronoun = lemma;
			refSidebarWord = '';
			refSidebarTab = 'pronouns';
		} else {
			refSidebarWord = lemma;
			refSidebarPronoun = '';
			refSidebarTab = 'declension';
		}
		refSidebarOpen = true;
	}

	function openReferenceSidebar() {
		refSidebarWord = question?.word.lemma ?? multiStepQuestion?.word.lemma ?? '';
		refSidebarTab = 'cases';
		refSidebarOpen = true;
	}

	function toggleReferenceSidebar() {
		if (refSidebarOpen) {
			refSidebarOpen = false;
		} else {
			openReferenceSidebar();
		}
	}

	function dismissOnboarding() {
		showOnboarding = false;
		try {
			localStorage.setItem('sklonuj_onboarded', '1');
		} catch {
			// ignore
		}
	}

	// Keep sidebar word in sync with the current question
	$effect(() => {
		if (!refSidebarOpen) return;
		if (question) {
			if (question.wordCategory === 'pronoun' && question.pronoun) {
				refSidebarPronoun = question.pronoun.lemma;
			} else {
				const lemma = question.word.lemma;
				if (lemma) refSidebarWord = lemma;
			}
		} else if (multiStepQuestion) {
			const lemma = multiStepQuestion.word.lemma;
			if (lemma) refSidebarWord = lemma;
		}
	});

	// Dark mode (shared module)
	import { darkMode as darkModeStore, initDarkMode, toggleDarkMode } from '$lib/darkmode';
	let darkMode = $state(false);
	$effect(() => {
		const unsub = darkModeStore.subscribe((v) => {
			darkMode = v;
		});
		return unsub;
	});

	// Subscribe to progress store to keep local rune state in sync
	$effect(() => {
		const unsubscribe = progress.subscribe((value) => {
			currentProgress = value;
		});
		return unsubscribe;
	});

	// Keep URL in sync with filter state so the link is always shareable
	$effect(() => {
		// Read reactive dependencies to track them
		void selectedCase;
		void enabledCases;

		if (initialized) {
			syncStateToUrl();
		}
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
		if (localStorage.getItem('sklonuj_onboarded') === '1') {
			showOnboarding = false;
		}
		const savedSettings = loadSettingsFromStorage();
		drillSettings = savedSettings;
		loadChapterFromStorage();
		loadChapterScores();

		// If chapter mode is active, apply its constraints
		if (chapterBook && chapterSelection) {
			const chapter = getSelectedKzkChapter();
			if (chapter) {
				enabledCases = [...chapter.unlockedCases];
				if (!chapter.pluralUnlocked) {
					drillSettings = { ...drillSettings, numberMode: 'sg' };
				}
				// Set CEFR level to match the chapter position
				const chIdx = kzkChapters[chapterBook].chapters.findIndex(
					(ch) => ch.id === chapterSelection
				);
				if (chapterBook === 'kzk1') {
					setLevel(chIdx >= 13 ? 'A2' : 'A1');
				} else if (chapterBook === 'kzk2') {
					setLevel('B1');
				}
			}
		}

		// Apply URL query params for shareable filter links
		const params = get(page).url.searchParams;

		// ?selectCase= auto-selects a single case pill (e.g. from resources/czech-cases)
		const selectCaseParam = params.get('selectCase');
		if (selectCaseParam) {
			const matchedCase = ALL_CASES.find((c) => c === selectCaseParam);
			if (matchedCase) {
				selectedCase = matchedCase;
				enabledCases = [...ALL_CASES];
				chapterBook = null;
				chapterSelection = null;
				saveChapterToStorage();
			}
		}

		// ?cases= comma-separated enabled cases (e.g. cases=gen,dat,acc)
		const casesParam = params.get('cases');
		if (casesParam) {
			const parsed = casesParam
				.split(',')
				.filter((c): c is Case => ALL_CASES.includes(c as Case)) as Case[];
			if (parsed.length > 0) {
				enabledCases = parsed;
				chapterBook = null;
				chapterSelection = null;
				saveChapterToStorage();
			}
		}

		// Hydrate progress from server-loaded Supabase data (available before mount)
		// Use get(page) to avoid creating a reactive dependency on $page.data
		const savedProgress = get(page).data.savedProgress;
		if (savedProgress) {
			const VALID_LEVELS: ReadonlySet<string> = new Set(['A1', 'A2', 'B1', 'B2']);
			if (VALID_LEVELS.has(savedProgress.level)) {
				const serverProgress: Progress = {
					level: savedProgress.level as Difficulty,
					caseScores: savedProgress.case_scores,
					paradigmScores: savedProgress.paradigm_scores,
					lastSession: savedProgress.last_session ?? ''
				};
				const localProgress = loadProgressFromLocalStorage();
				if (localProgress && Object.keys(localProgress.caseScores).length > 0) {
					progress.set(mergeProgress(localProgress, serverProgress));
				} else {
					progress.set(serverProgress);
				}
				if (user) {
					localStorage.setItem(STORAGE_USER_KEY, user.id);
				}
			}
		}

		// Load today's session stats if logged in
		if (user) {
			loadTodaySession();
		}

		// Generate first question using hydrated progress
		generateNextQuestion();
		wordsLoading = false;

		// Flush pending syncs on page unload to avoid data loss
		function handleBeforeUnload(): void {
			if (syncTimer) {
				clearTimeout(syncTimer);
				syncTimer = null;
				const current = get(progress);
				const blob = new Blob(
					[
						JSON.stringify({
							progress: {
								level: current.level,
								caseScores: current.caseScores,
								paradigmScores: current.paradigmScores,
								lastSession: current.lastSession
							}
						})
					],
					{ type: 'application/json' }
				);
				navigator.sendBeacon('/api/sync', blob);
			}
			if (sessionSyncTimer) {
				clearTimeout(sessionSyncTimer);
				sessionSyncTimer = null;
				const blob = new Blob(
					[
						JSON.stringify({
							session: {
								sessionDate: getTodayDate(),
								questionsAttempted: todayAttempted,
								questionsCorrect: todayCorrect
							}
						})
					],
					{ type: 'application/json' }
				);
				navigator.sendBeacon('/api/sync', blob);
			}
		}

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			if (advanceTimer !== null) {
				clearTimeout(advanceTimer);
				advanceTimer = null;
			}
			if (syncTimer) {
				clearTimeout(syncTimer);
			}
			if (sessionSyncTimer) {
				clearTimeout(sessionSyncTimer);
			}
		};
	});

	function pickDrillType(): DrillType {
		// No case identification when a specific case is selected or fewer than 2 cases enabled
		let allowed = drillSettings.selectedDrillTypes;
		if (selectedCase !== 'all' || effectiveEnabledCases.length < 2) {
			allowed = allowed.filter((dt) => dt !== 'case_identification');
		}
		// No form_production when only nominative is enabled — nom→nom is trivial
		const nonNomCases = effectiveEnabledCases.filter((c) => c !== 'nom');
		if (nonNomCases.length === 0) {
			allowed = allowed.filter((dt) => dt !== 'form_production');
		}
		// multi_step is gated: KZK 2 any chapter, KZK 1 chapter 6+, or free practice
		if (!isMultiStepUnlocked()) {
			allowed = allowed.filter((dt) => dt !== 'multi_step');
		}
		// multi_step requires templates (like sentence_fill_in), filter it the same way
		if (allowed.length === 0) allowed = ['sentence_fill_in'];

		if (allowed.length === 1) return allowed[0];

		const activeCases = selectedCase === 'all' ? effectiveEnabledCases : [selectedCase];

		// Check if sentence-based drills are viable (sentence_fill_in, case_identification, multi_step all need templates)
		const needsTemplates = allowed.some(
			(dt) => dt === 'case_identification' || dt === 'sentence_fill_in' || dt === 'multi_step'
		);
		if (needsTemplates) {
			const templates = loadTemplates();
			const prog = get(progress);
			const levelDifficulties = curriculum[prog.level].unlocked_difficulty;
			const eligibleTemplates = templates.filter(
				(t) =>
					activeCases.includes(t.requiredCase) &&
					matchesNumberMode(t.number) &&
					levelDifficulties.includes(t.difficulty)
			);

			if (eligibleTemplates.length === 0) {
				// No templates available — remove all template-requiring types
				allowed = allowed.filter(
					(dt) => dt !== 'case_identification' && dt !== 'sentence_fill_in' && dt !== 'multi_step'
				);
				if (allowed.length === 0) allowed = ['form_production'];
				if (allowed.includes('form_production')) return 'form_production';
				return allowed[Math.floor(Math.random() * allowed.length)];
			}
		}

		return allowed[Math.floor(Math.random() * allowed.length)];
	}

	function matchesNumberMode(templateNumber: Number_): boolean {
		if (effectiveNumberMode === 'both') return true;
		return templateNumber === effectiveNumberMode;
	}

	/**
	 * Pick a word from the word bank, biased toward chapter coreLemmas.
	 * In chapter mode:
	 *   - 75% current chapter, 25% previous chapters
	 *   - From chapter 13 onward, 20% chance of a CEFR-level-filtered general pool word
	 */
	function pickWordForChapter(
		eligibleWords: WordEntry[],
		prog: Progress,
		case_: Case,
		number_: Number_
	): WordEntry | null {
		const { currentLemmas, previousLemmas } = getChapterLemmas();

		// If no chapter lemmas, fall back to normal selection
		if (currentLemmas.length === 0 && previousLemmas.length === 0) {
			const valid = eligibleWords.filter((w) => hasValidForm(w, case_, number_));
			return valid.length > 0 ? weightedRandom(valid, prog, case_, number_) : null;
		}

		const allLemmasLower = new Set([
			...currentLemmas.map((l) => l.toLowerCase()),
			...previousLemmas.map((l) => l.toLowerCase())
		]);
		const currentLemmasLower = new Set(currentLemmas.map((l) => l.toLowerCase()));

		// Chapter coreLemmas bypass the CEFR difficulty filter — if the textbook
		// teaches a word in this chapter, we drill it regardless of its CEFR level.
		const fullWordBank = loadWordBank();
		const coreCurrentWords = fullWordBank.filter(
			(w) => currentLemmasLower.has(w.lemma.toLowerCase()) && hasValidForm(w, case_, number_)
		);
		const corePreviousWords = fullWordBank.filter(
			(w) =>
				!currentLemmasLower.has(w.lemma.toLowerCase()) &&
				allLemmasLower.has(w.lemma.toLowerCase()) &&
				hasValidForm(w, case_, number_)
		);

		const hasCoreWords = coreCurrentWords.length > 0 || corePreviousWords.length > 0;

		if (!hasCoreWords) {
			const valid = eligibleWords.filter((w) => hasValidForm(w, case_, number_));
			return valid.length > 0 ? weightedRandom(valid, prog, case_, number_) : null;
		}

		// General pool only from chapter 13 onward, at 20%
		const chapterIndex = getChapterIndex();
		const generalPoolEnabled = chapterIndex >= 12; // 0-indexed, so 12 = chapter 13

		if (generalPoolEnabled && Math.random() < 0.2) {
			const generalWords = eligibleWords.filter(
				(w) => !allLemmasLower.has(w.lemma.toLowerCase()) && hasValidForm(w, case_, number_)
			);
			if (generalWords.length > 0) {
				return weightedRandom(generalWords, prog, case_, number_);
			}
		}

		// Pick from chapter vocab: 75% current, 25% previous
		const innerRoll = Math.random();
		if (innerRoll < 0.75 && coreCurrentWords.length > 0) {
			return weightedRandom(coreCurrentWords, prog, case_, number_);
		} else if (corePreviousWords.length > 0) {
			return weightedRandom(corePreviousWords, prog, case_, number_);
		} else if (coreCurrentWords.length > 0) {
			return weightedRandom(coreCurrentWords, prog, case_, number_);
		}

		// Absolute fallback
		const allValid = eligibleWords.filter((w) => hasValidForm(w, case_, number_));
		return allValid.length > 0 ? weightedRandom(allValid, prog, case_, number_) : null;
	}

	function getChapterIndex(): number {
		if (!chapterBook || !chapterSelection) return 0;
		const chapters = kzkChapters[chapterBook].chapters;
		const idx = chapters.findIndex((ch) => ch.id === chapterSelection);
		return idx >= 0 ? idx : 0;
	}

	function pickTemplate(templates: SentenceTemplate[]): SentenceTemplate {
		if (templates.length > 1 && lastTemplateId !== null) {
			const filtered = templates.filter((t) => t.id !== lastTemplateId);
			if (filtered.length > 0) {
				return filtered[Math.floor(Math.random() * filtered.length)];
			}
		}
		return templates[Math.floor(Math.random() * templates.length)];
	}

	function generatePronounQuestion(): DrillQuestion | null {
		const prog = get(progress);
		const levelConfig = curriculum[prog.level];
		const unlockedDifficulties = levelConfig.unlocked_difficulty;

		const pronounBank = loadPronounBank();
		const eligiblePronouns = pronounBank.filter((p) => unlockedDifficulties.includes(p.difficulty));

		if (eligiblePronouns.length === 0) return null;

		// In chapter mode, filter by corePronounLemmas
		const isChapterMode = chapterBook !== null && chapterSelection !== null;
		let candidates = eligiblePronouns;
		if (isChapterMode) {
			const chapter = getSelectedKzkChapter();
			if (chapter?.corePronounLemmas && chapter.corePronounLemmas.length > 0) {
				const chapterLemmas = new Set(chapter.corePronounLemmas);
				const filtered = eligiblePronouns.filter((p) => chapterLemmas.has(p.lemma));
				if (filtered.length > 0) candidates = filtered;
			}
		}

		const drillType = pickDrillType();
		// Exclude vocative for pronoun drills (almost no pronoun has a vocative form)
		const pronounCases: Case[] = (
			selectedCase === 'all' ? effectiveEnabledCases : [selectedCase]
		).filter((c) => c !== 'voc');
		if (pronounCases.length === 0) return null;
		const case_ = pronounCases.length === 1 ? pronounCases[0] : pickWeightedCase(pronounCases);

		// Pick number - for pronouns, we need to respect whether the pronoun has sg or pl forms
		let number_: Number_;
		if (effectiveNumberMode === 'sg') number_ = 'sg';
		else if (effectiveNumberMode === 'pl') number_ = 'pl';
		else number_ = Math.random() < 0.5 ? 'sg' : 'pl';

		// Filter candidates that have the right number forms
		let numberCandidates = candidates.filter((p) => {
			if (number_ === 'sg') return p.forms.sg !== null;
			return p.forms.pl !== null;
		});

		// If no candidates for this number, try the other
		if (numberCandidates.length === 0) {
			number_ = number_ === 'sg' ? 'pl' : 'sg';
			numberCandidates = candidates.filter((p) => {
				if (number_ === 'sg') return p.forms.sg !== null;
				return p.forms.pl !== null;
			});
			if (numberCandidates.length === 0) return null;
		}
		candidates = numberCandidates;

		if (drillType === 'form_production') {
			// Skip nominative for form_production (trivial)
			let fpCase = case_;
			if (fpCase === 'nom') {
				const nonNom = pronounCases.filter((c) => c !== 'nom');
				if (nonNom.length > 0) {
					fpCase = nonNom[Math.floor(Math.random() * nonNom.length)];
				} else {
					return null;
				}
			}

			const pronoun = weightedRandomPronoun(candidates, prog, fpCase, number_);
			return generatePronounFormProduction(pronoun, fpCase, number_);
		} else if (drillType === 'sentence_fill_in') {
			// Use pronoun templates
			const templates = loadPronounTemplates();
			const eligibleTemplates = templates.filter(
				(t) =>
					pronounCases.includes(t.requiredCase) &&
					matchesNumberMode(t.number) &&
					unlockedDifficulties.includes(t.difficulty)
			);

			if (eligibleTemplates.length === 0) {
				// Fall back to form production
				let fpCase = case_;
				if (fpCase === 'nom') {
					const nonNom = pronounCases.filter((c) => c !== 'nom');
					if (nonNom.length > 0) fpCase = nonNom[Math.floor(Math.random() * nonNom.length)];
					else return null;
				}
				const pronoun = weightedRandomPronoun(candidates, prog, fpCase, number_);
				return generatePronounFormProduction(pronoun, fpCase, number_);
			}

			const template = pickTemplate(eligibleTemplates);

			// Get pronoun candidates for this specific template
			const templateCandidates = getPronounCandidates(
				template,
				prog,
				isChapterMode ? getSelectedKzkChapter()?.corePronounLemmas : undefined
			);

			// Filter by number
			const validCandidates = templateCandidates.filter((p) => {
				if (template.number === 'sg') return p.forms.sg !== null;
				return p.forms.pl !== null;
			});

			if (validCandidates.length === 0) {
				// Fall back: pick any candidate and do form production
				const pronoun = weightedRandomPronoun(candidates, prog, case_, number_);
				return generatePronounFormProduction(pronoun, case_, number_);
			}

			const pronoun = weightedRandomPronoun(
				validCandidates,
				prog,
				template.requiredCase,
				template.number
			);
			return generatePronounSentenceDrill(template, pronoun);
		} else {
			// case_identification - use pronoun templates too
			const templates = loadPronounTemplates();
			const eligibleTemplates = templates.filter(
				(t) =>
					pronounCases.includes(t.requiredCase) &&
					matchesNumberMode(t.number) &&
					unlockedDifficulties.includes(t.difficulty)
			);

			if (eligibleTemplates.length === 0) return null;

			const template = pickTemplate(eligibleTemplates);
			const templateCandidates = getPronounCandidates(
				template,
				prog,
				isChapterMode ? getSelectedKzkChapter()?.corePronounLemmas : undefined
			);
			const validCandidates = templateCandidates.filter((p) => {
				if (template.number === 'sg') return p.forms.sg !== null;
				return p.forms.pl !== null;
			});

			if (validCandidates.length === 0) return null;

			const pronoun = weightedRandomPronoun(
				validCandidates,
				prog,
				template.requiredCase,
				template.number
			);
			const placeholder = makePlaceholderWord(pronoun);

			// For case identification, create a question where the answer is the case name
			const q: DrillQuestion = {
				word: placeholder,
				template: template,
				correctAnswer: template.requiredCase,
				case: template.requiredCase,
				number: template.number,
				drillType: 'case_identification',
				wordCategory: 'pronoun',
				pronoun: pronoun
			};
			return q;
		}
	}

	function generateFallbackQuestion(): DrillQuestion | null {
		const wordBank = loadWordBank();
		const prog = get(progress);
		const levelConfig = curriculum[prog.level];
		const eligibleWords = wordBank.filter((w) =>
			levelConfig.unlocked_difficulty.includes(w.difficulty)
		);
		const fallbackCases: Case[] = ['gen', 'acc', 'dat', 'loc', 'ins', 'voc'];
		for (const fc of fallbackCases) {
			const validWords = eligibleWords.filter((w) => hasValidForm(w, fc, 'sg'));
			if (validWords.length > 0) {
				const word = validWords[Math.floor(Math.random() * validWords.length)];
				const q = generateFormProduction(word, fc, 'sg');
				if (q) return q;
			}
		}
		return null;
	}

	function generateNextQuestion(): void {
		try {
			generateNextQuestionInner();
		} catch (err) {
			console.error('generateNextQuestion error, attempting fallback:', err);
			question = null;
			multiStepQuestion = null;
		}

		// If question generation failed (null question and no multi-step), try a
		// simple form_production fallback so the user never sees "No exercises available"
		// while there are valid words in the bank.
		if (!question && !multiStepQuestion) {
			const fallbackQ = generateFallbackQuestion();
			if (fallbackQ) {
				question = fallbackQ;
				multiStepQuestion = null;
				lastResult = null;
				paradigmNotes = null;
				submitted = false;
				lastTemplateId = fallbackQ.template.id;
				if (advanceTimer !== null) {
					clearTimeout(advanceTimer);
					advanceTimer = null;
				}
				autoPlayPrompt(fallbackQ);
			}
		}
	}

	function generateNextQuestionInner(): void {
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

		// Decide if this should be a pronoun question
		const shouldDoPronoun = (() => {
			if (effectiveContentMode === 'pronouns') return true;
			if (effectiveContentMode === 'nouns') return false;
			// 'both' mode: ~30% chance of pronoun
			return Math.random() < 0.3;
		})();

		if (shouldDoPronoun) {
			const pronounQ = generatePronounQuestion();
			if (pronounQ) {
				question = pronounQ;
				multiStepQuestion = null;
				lastResult = null;
				paradigmNotes = pronounQ.pronoun?.notes ?? null;
				submitted = false;
				lastTemplateId = pronounQ.template.id;
				if (advanceTimer !== null) {
					clearTimeout(advanceTimer);
					advanceTimer = null;
				}
				autoPlayPrompt(pronounQ);
				return;
			}
			// If pronoun generation failed, fall through to noun generation
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

		// Use effective cases (constrained by chapter if active)
		const activeCasesForPick = selectedCase === 'all' ? effectiveEnabledCases : [selectedCase];

		// Pick case: either the selected one, or weighted random from effective enabled cases
		const case_ = selectedCase === 'all' ? pickWeightedCase(effectiveEnabledCases) : selectedCase;

		// Pick number (respecting chapter constraints)
		let number_: Number_;
		if (effectiveNumberMode === 'sg') number_ = 'sg';
		else if (effectiveNumberMode === 'pl') number_ = 'pl';
		else number_ = Math.random() < 0.5 ? 'sg' : 'pl';

		const isChapterMode = chapterBook !== null && chapterSelection !== null;

		if (drillType === 'multi_step') {
			// Multi-step: needs a template + word, produces a MultiStepQuestion
			const templates = loadTemplates();
			const msEligibleTemplates = templates.filter(
				(t) =>
					activeCasesForPick.includes(t.requiredCase) &&
					matchesNumberMode(t.number) &&
					unlockedDifficulties.includes(t.difficulty)
			);
			if (msEligibleTemplates.length > 0) {
				const template = pickTemplate(msEligibleTemplates);
				let candidates: WordEntry[];
				if (isChapterMode) {
					const diffFiltered = getCandidates(template, prog).filter((w) =>
						hasValidForm(w, template.requiredCase, template.number)
					);
					const { currentLemmas: curL, previousLemmas: prevL } = getChapterLemmas();
					const chapterLemmasLower = new Set([
						...curL.map((l) => l.toLowerCase()),
						...prevL.map((l) => l.toLowerCase())
					]);
					const diffLemmas = new Set(diffFiltered.map((w) => w.lemma));
					const chapterExtras = loadWordBank().filter(
						(w) =>
							chapterLemmasLower.has(w.lemma.toLowerCase()) &&
							!diffLemmas.has(w.lemma) &&
							w.categories.includes(template.lemmaCategory) &&
							hasValidForm(w, template.requiredCase, template.number)
					);
					candidates = [...diffFiltered, ...chapterExtras];
				} else {
					candidates = getCandidates(template, prog).filter((w) =>
						hasValidForm(w, template.requiredCase, template.number)
					);
				}
				if (candidates.length > 0) {
					const word = weightedRandom(candidates, prog, template.requiredCase, template.number);
					const showCaseStep = effectiveEnabledCases.length > 1;
					const msq = generateMultiStepQuestion(word, template, showCaseStep);
					if (msq) {
						multiStepQuestion = msq;
						question = null;
						lastResult = null;
						paradigmNotes = lookupParadigmNotes(word.paradigm, word);
						submitted = false;
						lastTemplateId = template.id;
						if (advanceTimer !== null) {
							clearTimeout(advanceTimer);
							advanceTimer = null;
						}
						return;
					}
				}
			}
			// Fall through to form_production if multi-step generation failed
		}

		if (drillType === 'form_production' || drillType === 'multi_step') {
			// Skip nominative for form_production — the answer is just the lemma itself,
			// which is trivially obvious. Re-pick a non-nominative case.
			let fpCase = case_;
			if (fpCase === 'nom') {
				const nonNomCases = effectiveEnabledCases.filter((c) => c !== 'nom');
				if (nonNomCases.length > 0) {
					fpCase = nonNomCases[Math.floor(Math.random() * nonNomCases.length)];
				} else {
					// Only nominative is enabled — no meaningful declension drills possible.
					// Show nothing rather than trivial nom→nom exercises.
					question = null;
					multiStepQuestion = null;
					return;
				}
			}
			let word: WordEntry | null;
			if (isChapterMode) {
				word = pickWordForChapter(eligibleWords, prog, fpCase, number_);
			} else {
				const validWords = eligibleWords.filter((w) => hasValidForm(w, fpCase, number_));
				word = validWords.length > 0 ? weightedRandom(validWords, prog, fpCase, number_) : null;
			}
			if (!word) {
				question = null;
				multiStepQuestion = null;
				return;
			}
			multiStepQuestion = null;
			question = generateFormProduction(word, fpCase, number_);
		} else {
			multiStepQuestion = null;
			const templates = loadTemplates();
			const eligibleTemplates = templates.filter(
				(t) =>
					activeCasesForPick.includes(t.requiredCase) &&
					matchesNumberMode(t.number) &&
					unlockedDifficulties.includes(t.difficulty)
			);

			if (eligibleTemplates.length === 0) {
				// Fallback to form_production — but skip nom (trivial nom→nom)
				let fallbackCase = case_;
				if (fallbackCase === 'nom') {
					const nonNom = effectiveEnabledCases.filter((c) => c !== 'nom');
					if (nonNom.length > 0) {
						fallbackCase = nonNom[Math.floor(Math.random() * nonNom.length)];
					} else {
						question = null;
						return;
					}
				}
				let word: WordEntry | null;
				if (isChapterMode) {
					word = pickWordForChapter(eligibleWords, prog, fallbackCase, number_);
				} else {
					const validWords = eligibleWords.filter((w) => hasValidForm(w, fallbackCase, number_));
					word =
						validWords.length > 0 ? weightedRandom(validWords, prog, fallbackCase, number_) : null;
				}
				if (!word) {
					question = null;
					return;
				}
				question = generateFormProduction(word, fallbackCase, number_);
			} else {
				const template = pickTemplate(eligibleTemplates);

				let candidates: WordEntry[];
				if (isChapterMode) {
					// In chapter mode, get candidates but bias toward coreLemmas.
					// Chapter coreLemmas bypass CEFR difficulty — include them from
					// the full word bank even if their level isn't unlocked yet.
					const diffFiltered = getCandidates(template, prog).filter((w) =>
						hasValidForm(w, template.requiredCase, template.number)
					);
					const { currentLemmas: curL, previousLemmas: prevL } = getChapterLemmas();
					const chapterLemmasLower = new Set([
						...curL.map((l) => l.toLowerCase()),
						...prevL.map((l) => l.toLowerCase())
					]);
					const diffLemmas = new Set(diffFiltered.map((w) => w.lemma));
					const chapterExtras = loadWordBank().filter(
						(w) =>
							chapterLemmasLower.has(w.lemma.toLowerCase()) &&
							!diffLemmas.has(w.lemma) &&
							w.categories.includes(template.lemmaCategory) &&
							hasValidForm(w, template.requiredCase, template.number)
					);
					const baseCandidates = [...diffFiltered, ...chapterExtras];
					if (baseCandidates.length === 0) {
						// Try picking a chapter word directly
						const word = pickWordForChapter(
							eligibleWords,
							prog,
							template.requiredCase,
							template.number
						);
						if (!word) {
							question = null;
							return;
						}
						if (drillType === 'case_identification') {
							question = generateCaseIdentification(template, word);
						} else {
							question = generateSentenceDrill(template, word);
						}
						lastResult = null;
						paradigmNotes = null;
						submitted = false;
						lastTemplateId = question?.template.id ?? null;
						if (advanceTimer !== null) {
							clearTimeout(advanceTimer);
							advanceTimer = null;
						}
						if (question) autoPlayPrompt(question);
						return;
					}
					// Apply chapter weighting to the template candidates
					const { currentLemmas, previousLemmas } = getChapterLemmas();
					const allLemmasLower = new Set([
						...currentLemmas.map((l) => l.toLowerCase()),
						...previousLemmas.map((l) => l.toLowerCase())
					]);
					const currentLemmasLower = new Set(currentLemmas.map((l) => l.toLowerCase()));

					const coreCurrent = baseCandidates.filter((w) =>
						currentLemmasLower.has(w.lemma.toLowerCase())
					);
					const corePrevious = baseCandidates.filter(
						(w) =>
							!currentLemmasLower.has(w.lemma.toLowerCase()) &&
							allLemmasLower.has(w.lemma.toLowerCase())
					);
					const general = baseCandidates.filter((w) => !allLemmasLower.has(w.lemma.toLowerCase()));

					const hasCoreWords = coreCurrent.length > 0 || corePrevious.length > 0;
					let picked: WordEntry;

					// Before chapter 13, only use chapter words — don't leak general pool words
					const chIdx = getChapterIndex();
					const allowGeneral = chIdx >= 12; // 0-indexed, so 12 = chapter 13

					if (hasCoreWords && Math.random() < 0.7) {
						if (Math.random() < 0.75 && coreCurrent.length > 0) {
							picked = weightedRandom(coreCurrent, prog, template.requiredCase, template.number);
						} else if (corePrevious.length > 0) {
							picked = weightedRandom(corePrevious, prog, template.requiredCase, template.number);
						} else {
							picked = weightedRandom(coreCurrent, prog, template.requiredCase, template.number);
						}
					} else if (hasCoreWords) {
						// 30% chance we still pick from chapter words instead of general
						const allCore = [...coreCurrent, ...corePrevious];
						picked = weightedRandom(allCore, prog, template.requiredCase, template.number);
					} else if (allowGeneral && general.length > 0) {
						picked = weightedRandom(general, prog, template.requiredCase, template.number);
					} else if (!allowGeneral) {
						// Early chapter, no chapter words match this template — use the
						// template with a chapter word directly (sentence fill-in is still
						// valid even when the word's category doesn't perfectly match).
						const word = pickWordForChapter(
							eligibleWords,
							prog,
							template.requiredCase,
							template.number
						);
						if (!word) {
							question = null;
							return;
						}
						if (drillType === 'case_identification') {
							question = generateCaseIdentification(template, word);
						} else {
							question = generateSentenceDrill(template, word);
						}
						if (!question) {
							question = null;
							return;
						}
						lastResult = null;
						paradigmNotes = null;
						submitted = false;
						lastTemplateId = question.template.id;
						if (advanceTimer !== null) {
							clearTimeout(advanceTimer);
							advanceTimer = null;
						}
						autoPlayPrompt(question);
						return;
					} else {
						picked = weightedRandom(baseCandidates, prog, template.requiredCase, template.number);
					}

					if (drillType === 'case_identification') {
						question = generateCaseIdentification(template, picked);
					} else {
						question = generateSentenceDrill(template, picked);
					}
				} else {
					candidates = getCandidates(template, prog).filter((w) =>
						hasValidForm(w, template.requiredCase, template.number)
					);

					if (candidates.length === 0) {
						// Fallback to form_production — skip nom→nom (trivial)
						let fbCase2 = case_;
						if (fbCase2 === 'nom') {
							const nonNom = effectiveEnabledCases.filter((c) => c !== 'nom');
							if (nonNom.length > 0) {
								fbCase2 = nonNom[Math.floor(Math.random() * nonNom.length)];
							} else {
								question = null;
								return;
							}
						}
						const validWords = eligibleWords.filter((w) => hasValidForm(w, fbCase2, number_));
						if (validWords.length === 0) {
							question = null;
							return;
						}
						const word = weightedRandom(validWords, prog, fbCase2, number_);
						question = generateFormProduction(word, fbCase2, number_);
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
		}

		multiStepQuestion = null;
		lastResult = null;
		paradigmNotes = null;
		submitted = false;
		lastTemplateId = question?.template.id ?? null;

		if (advanceTimer !== null) {
			clearTimeout(advanceTimer);
			advanceTimer = null;
		}

		if (question) {
			autoPlayPrompt(question);
		}
	}

	function lookupPronounNotes(
		pronoun: PronounEntry,
		case_: string,
		number_: string
	): Record<string, string> | null {
		const noteKey = `${case_}_${number_}`;
		const notes: Record<string, string> = {};
		if (pronoun.notes[noteKey]) {
			notes[noteKey] = pronoun.notes[noteKey];
		}
		if (pronoun.notes['general']) {
			notes[noteKey] = notes[noteKey]
				? `${notes[noteKey]} ${pronoun.notes['general']}`
				: pronoun.notes['general'];
		}
		return Object.keys(notes).length > 0 ? notes : null;
	}

	function getPronounFormForTTS(q: DrillQuestion): string {
		if (!q.pronoun) return '';
		const caseForms = q.number === 'sg' ? q.pronoun.forms.sg : q.pronoun.forms.pl;
		if (!caseForms) return '';
		const form = caseForms[q.case];
		return form.prep || form.bare || '';
	}

	function lookupParadigmNotes(paradigmId: string, word: WordEntry): Record<string, string> | null {
		const entry = paradigms.find((p) => p.id === paradigmId);
		const notes: Record<string, string> = entry?.whyNotes ? { ...entry.whyNotes } : {};

		// Add a note for plural-only words (all sg forms are empty)
		const allSgEmpty = word.forms.sg.every((f) => f === '');
		if (allSgEmpty) {
			const pluralNote = `"${word.lemma}" is always plural — it has no singular form.`;
			for (const c of ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'] as const) {
				const key = `${c}_pl`;
				notes[key] = notes[key] ? `${notes[key]} ${pluralNote}` : pluralNote;
			}
		}

		return Object.keys(notes).length > 0 ? notes : null;
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

	const TOTAL_MILESTONES = [10, 25, 50, 100];

	function addToast(message: string, emoji: string): void {
		const id = toastIdCounter++;
		toasts = [...toasts, { id, message, emoji }];
	}

	function removeToast(id: number): void {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function checkMilestones(result: DrillResult): void {
		const candidates: { message: string; emoji: string; priority: number }[] = [];

		// Streak milestones (only toast for 10+)
		if (result.correct && streak >= 10 && [10, 25, 50].includes(streak)) {
			const key = `streak_${streak}`;
			if (!celebratedMilestones.has(key)) {
				celebratedMilestones = new Set([...celebratedMilestones, key]);
				candidates.push({
					message: `${streak} in a row!`,
					emoji: streak >= 25 ? '🏆' : '🔥',
					priority: streak
				});
			}
		}

		// Total questions milestones (not in practice-mistakes mode)
		if (!practicingMistakes) {
			const total = sessionCorrect + sessionWrong;
			for (const milestone of TOTAL_MILESTONES) {
				if (total === milestone) {
					const key = `total_${milestone}`;
					if (!celebratedMilestones.has(key)) {
						celebratedMilestones = new Set([...celebratedMilestones, key]);
						const messages: Record<number, string> = {
							10: '10 questions done!',
							25: '25 and counting!',
							50: 'Half century!',
							100: '100 questions!'
						};
						candidates.push({
							message: messages[milestone] ?? `${milestone} questions!`,
							emoji: milestone >= 50 ? '🎉' : '👏',
							priority: milestone / 10
						});
					}
				}
			}
		}

		// Case mastery: 80%+ accuracy after 10+ attempts (skip nom)
		if (result.correct) {
			const casesToCheck: Case[] = ['gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
			for (const c of casesToCheck) {
				const strength = getCombinedCaseStrength(c);
				if (strength.attempts >= 10 && strength.accuracy >= 0.8) {
					const key = `mastery_${c}`;
					if (!celebratedMilestones.has(key)) {
						celebratedMilestones = new Set([...celebratedMilestones, key]);
						candidates.push({
							message: `You're mastering ${CASE_LABELS[c]}!`,
							emoji: '🧠',
							priority: 5
						});
					}
				}
			}
		}

		// Pick the most impressive milestone
		if (candidates.length > 0) {
			candidates.sort((a, b) => b.priority - a.priority);
			addToast(candidates[0].message, candidates[0].emoji);
		}
	}

	function handleSubmit(answer: string): void {
		if (!hasInteracted) {
			posthog.capture('practice_started', { level: currentLevel, drillType: question?.drillType });
		}
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
			recordPractice();
			if (chapterSelection) recordChapterResult(chapterSelection, false);
			scheduleSyncToSupabase();
			trackSessionStats(result);
			recordSessionActivity(false);
			streak = 0;
			if (question.wordCategory === 'pronoun' && question.pronoun) {
				paradigmNotes = lookupPronounNotes(question.pronoun, question.case, question.number);
			} else {
				paradigmNotes = lookupParadigmNotes(question.word.paradigm, question.word);
			}
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
		const result = checkAnswer(question, answer, currentLevel);

		// If checkAnswer returns null, the question had an empty correct answer (data issue).
		// Skip it and generate the next question without recording anything.
		if (result === null) {
			submitted = false;
			sessionCount--;
			generateNextQuestion();
			return;
		}

		lastResult = result;
		recordResult(result);
		recordPractice();
		if (chapterSelection) recordChapterResult(chapterSelection, result.correct);
		scheduleSyncToSupabase();
		trackSessionStats(result);
		recordSessionActivity(result.correct);
		posthog.capture('question_answered', {
			correct: result.correct,
			drillType: result.question.drillType,
			case: result.question.case,
			level: currentLevel
		});
		if (sessionCount === 10) {
			posthog.capture('ten_questions_completed', { level: currentLevel });
		}

		if (result.correct) {
			streak++;
			if (streak > bestStreak) bestStreak = streak;
			if (autoplayAudio) {
				if (streak >= 3) {
					playStreakSound(streak);
				} else {
					playCorrectSound();
				}
			}
		} else {
			streak = 0;
		}

		// Always populate paradigm notes so "Why?" explanations show for both correct and incorrect answers
		if (question.wordCategory === 'pronoun' && question.pronoun) {
			paradigmNotes = lookupPronounNotes(question.pronoun, question.case, question.number);
		} else {
			paradigmNotes = lookupParadigmNotes(question.word.paradigm, question.word);
		}

		checkMilestones(result);

		autoPlayAnswer(question);
	}

	function handleMultiStepComplete(result: MultiStepResult): void {
		if (!hasInteracted) {
			posthog.capture('practice_started', { level: currentLevel, drillType: 'multi_step' });
		}
		hasInteracted = true;

		sessionCount++;
		recordMultiStepResult(result);
		recordPractice();
		scheduleSyncToSupabase();

		// Count as correct only if all steps are correct
		const allCorrect =
			result.paradigmCorrect &&
			(result.caseCorrect === null || result.caseCorrect) &&
			result.formCorrect;

		if (allCorrect) {
			sessionCorrect++;
			streak++;
			if (streak > bestStreak) bestStreak = streak;
			if (autoplayAudio) {
				if (streak >= 3) {
					playStreakSound(streak);
				} else {
					playCorrectSound();
				}
			}
		} else {
			sessionWrong++;
			streak = 0;
		}

		if (chapterSelection) recordChapterResult(chapterSelection, allCorrect);
		recordSessionActivity(allCorrect);
		posthog.capture('question_answered', {
			correct: allCorrect,
			drillType: 'multi_step',
			case: result.question.case,
			level: currentLevel,
			paradigmCorrect: result.paradigmCorrect,
			caseCorrect: result.caseCorrect,
			formCorrect: result.formCorrect
		});
		if (sessionCount === 10) {
			posthog.capture('ten_questions_completed', { level: currentLevel });
		}

		generateNextQuestion();
	}

	function handleLevelChange(level: Difficulty): void {
		const previousLevel = currentLevel;
		setLevel(level);
		posthog.capture('level_changed', { from: previousLevel, to: level });
		scheduleSyncToSupabase();
		generateNextQuestion();
	}

	function handleSettingsChange(settings: {
		selectedDrillTypes: DrillType[];
		numberMode: 'sg' | 'pl' | 'both';
		contentMode?: ContentMode;
	}): void {
		drillSettings = { ...drillSettings, selectedCases: ALL_CASES, ...settings };
		saveSettingsToStorage(drillSettings);
		generateNextQuestion();
	}

	function handleCaseSelect(selected: Case | 'all'): void {
		selectedCase = selected;
		generateNextQuestion();
	}

	function syncStateToUrl(): void {
		if (typeof window === 'undefined') return;

		const url = new URL(window.location.href);
		const params = url.searchParams;

		// Clear filter-related params first, then set only non-default ones
		params.delete('selectCase');
		params.delete('cases');

		if (selectedCase !== 'all') {
			params.set('selectCase', selectedCase);
		}

		const sortedEnabled = [...enabledCases].sort(
			(a, b) => ALL_CASES.indexOf(a) - ALL_CASES.indexOf(b)
		);
		if (
			enabledCases.length !== ALL_CASES.length ||
			!ALL_CASES.every((c) => enabledCases.includes(c))
		) {
			params.set('cases', sortedEnabled.join(','));
		}

		// Replace URL without triggering navigation or adding history entries.
		// Base path is already resolved; dynamic query string is appended.
		const basePath = resolve('/');
		const newUrl = basePath + (params.toString() ? '?' + params.toString() : '');
		try {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- basePath uses resolve('/')
			replaceState(newUrl, {});
		} catch {
			// Router not yet initialized during initial $effect flush; safe to ignore.
		}
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
			return q.wordCategory === 'pronoun' ? (q.pronoun?.lemma ?? q.word.lemma) : q.word.lemma;
		} else if (q.drillType === 'sentence_fill_in') {
			const form =
				q.wordCategory === 'pronoun'
					? getPronounFormForTTS(q)
					: q.word.forms[q.number][CASE_INDEX[q.case]];
			const voiced = applyPrepositionVoicing(q.template.template, form);
			return prepareSentenceForTTS(voiced);
		} else {
			// case_identification: read only the nominative/lemma form so the user figures out the case
			return q.wordCategory === 'pronoun' ? (q.pronoun?.lemma ?? '') : q.word.forms[q.number][0];
		}
	}

	function autoPlayPrompt(q: DrillQuestion): void {
		if (!ttsAvailable || !autoplayAudio || !hasInteracted) return;
		speak(questionPromptText(q));
	}

	function autoPlayAnswer(q: DrillQuestion): void {
		if (!ttsAvailable || !autoplayAudio || !hasInteracted) return;
		if (q.drillType === 'case_identification') {
			if (q.wordCategory === 'pronoun') {
				const form = getPronounFormForTTS(q);
				const voiced = applyPrepositionVoicing(q.template.template, form);
				speak(voiced.replace('___', form));
			} else {
				// After revealing the answer, read the full sentence with the correct form
				const form = q.word.forms[q.number][CASE_INDEX[q.case]];
				const voiced = applyPrepositionVoicing(q.template.template, form);
				speak(voiced.replace('___', form));
			}
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
		if (e.key === 'Escape') {
			if (chapterPickerOpen) {
				chapterPickerOpen = false;
			} else if (authModalOpen) {
				authModalOpen = false;
			} else if (refSidebarOpen) {
				refSidebarOpen = false;
			}
		}
	}}
	onclick={(e) => {
		if (chapterPickerOpen) {
			const target = e.target as HTMLElement;
			if (!target.closest('[aria-haspopup="listbox"], [role="listbox"]')) {
				chapterPickerOpen = false;
			}
		}
	}}
/>

<svelte:head>
	<title>Skloňuj — Czech Declension Practice & Noun Case Trainer</title>
	<meta
		name="description"
		content="Practice Czech declension with interactive drills. Master all 7 Czech noun cases, learn grammar patterns, and build fluency with smart exercises for every level from A1 to B2."
	/>
	<meta
		name="keywords"
		content="Czech declension practice, Czech noun cases, Czech grammar trainer, learn Czech cases, Czech declension drill, skloňování, Czech language exercises, pádové koncovky"
	/>
	<link rel="canonical" href="https://sklonuj.com" />
	<link rel="alternate" hreflang="en" href="https://sklonuj.com" />
	<link rel="alternate" hreflang="x-default" href="https://sklonuj.com" />
	<meta property="og:title" content="Skloňuj — Czech Declension Practice & Noun Case Trainer" />
	<meta
		property="og:description"
		content="Practice Czech declension with interactive drills. Master all 7 noun cases with smart exercises for every level from A1 to B2."
	/>
	<meta property="og:url" content="https://sklonuj.com" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="en" />
	<meta property="og:site_name" content="Skloňuj" />
	<meta property="og:image" content="https://sklonuj.com/og.png" />
	<meta property="og:image:width" content="2400" />
	<meta property="og:image:height" content="1260" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Skloňuj — Czech Declension Practice & Noun Case Trainer" />
	<meta
		name="twitter:description"
		content="Practice Czech declension with interactive drills. Master all 7 noun cases with smart exercises for every level from A1 to B2."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "WebApplication",
			"name": "Skloňuj",
			"url": "https://sklonuj.com",
			"description": "Interactive Czech declension practice tool. Drill all 7 noun cases with grammar explanations, smart exercises, and progress tracking from A1 to B2.",
			"applicationCategory": "EducationalApplication",
			"operatingSystem": "Any",
			"offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
			"inLanguage": ["en", "cs"],
			"audience": { "@type": "EducationalAudience", "educationalRole": "student" }
		}
	</script>
</svelte:head>

<div class="flex flex-col">
	<NavBar
		activePage={activeView === 'exercise' ? 'exercises' : 'lookup'}
		onNavigate={(page) => {
			activeView = page === 'exercises' ? 'exercise' : 'declension';
			if (activeView === 'declension') refSidebarOpen = false;
		}}
		{darkMode}
		onToggleDarkMode={toggleDarkMode}
		{user}
		onSignIn={() => (authModalOpen = true)}
		isHomePage={true}
	/>

	{#if activeView === 'exercise'}
		<main class="mx-auto w-full max-w-[867px] flex-1 px-3 py-4 sm:px-4 sm:py-8">
			<!-- Mode selector + Level (level only in Free Practice) -->
			<div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3" data-tour="mode-selector">
				<ChapterSelector selectedBook={chapterBook} onModeChange={handleModeChange} />
				{#if chapterBook === null}
					<div class="flex items-center gap-2">
						<span class="text-xs font-semibold uppercase tracking-[0.15em] text-text-subtitle"
							>Level</span
						>
						<div class="inline-flex rounded-[16px] border border-card-stroke bg-card-bg p-1">
							{#each ['A1', 'A2', 'B1', 'B2'] as const as lvl (lvl)}
								<button
									onclick={() => handleLevelChange(lvl)}
									class="flex flex-col items-center justify-center rounded-[12px] px-3 py-2.5 transition-all
										{currentLevel === lvl
										? 'bg-shaded-background text-text-default'
										: 'text-text-subtitle hover:text-text-default'}"
								>
									<span class="text-xs font-normal">{lvl}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			{#if chapterBook === null}
				<!-- Case selection pill bar (Free Practice mode) -->
				<div class="mb-4" data-tour="case-pills">
					{#if wordsLoading}
						<CasePillBarSkeleton />
					{:else}
						<CasePillBar {selectedCase} {caseStrengths} onSelect={handleCaseSelect} />
					{/if}
				</div>
			{/if}

			<!-- Toolbar: filter cases / chapter stepper (KzK) + mistakes + mute + settings -->
			<div class="relative z-30 mb-2 grid grid-cols-[1fr_auto_1fr] items-center">
				<div></div>
				<div class="flex min-w-0 justify-center">
					{#if chapterBook !== null}
						{@const kzkChapter = getSelectedKzkChapter()}
						{#if kzkChapter}
							{@const chScore = chapterScores[kzkChapter.id]}
							{@const chapterAccPct =
								chScore && chScore.attempts > 0
									? Math.round((chScore.correct / chScore.attempts) * 100)
									: null}
							{@const chapterAccColor =
								chScore && chScore.attempts > 0
									? chapterAccuracyColor(chScore.correct / chScore.attempts)
									: null}
							<div class="flex min-w-0 items-center gap-2.5">
								<button
									onclick={() => handleChapterStep('prev')}
									class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-card-stroke bg-card-bg text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
									aria-label="Previous chapter"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="h-4 w-4"
									>
										<path
											fill-rule="evenodd"
											d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
											clip-rule="evenodd"
										/>
									</svg>
								</button>
								<div class="relative flex min-w-0 flex-col items-center gap-0.5">
									<button
										type="button"
										onclick={() => (chapterPickerOpen = !chapterPickerOpen)}
										class="flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-icon-hover"
										aria-expanded={chapterPickerOpen}
										aria-haspopup="listbox"
									>
										<span class="truncate text-base font-semibold leading-tight text-text-default">
											{kzkChapter.label}{kzkChapter.subtitle ? ` — ${kzkChapter.subtitle}` : ''}
										</span>
										{#if chapterAccPct !== null && chapterAccColor}
											<span class="text-xs font-bold" style="color: {chapterAccColor}"
												>{chapterAccPct}%</span
											>
										{/if}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="h-3.5 w-3.5 shrink-0 text-text-subtitle transition-transform duration-200 {chapterPickerOpen
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
									{#if chapterPickerOpen}
										<div
											class="fixed left-2 right-2 z-50 max-h-72 overflow-y-auto rounded-2xl border border-card-stroke bg-card-bg p-1.5 shadow-lg sm:absolute sm:left-1/2 sm:right-auto sm:top-full sm:mt-1 sm:w-80 sm:-translate-x-1/2"
											role="listbox"
											tabindex="-1"
											aria-label="Select chapter"
											onkeydown={(e) => {
												if (e.key === 'Escape') chapterPickerOpen = false;
											}}
										>
											{#each kzkChapters[chapterBook].chapters as ch (ch.id)}
												{@const chSc = chapterScores[ch.id]}
												{@const accPct =
													chSc && chSc.attempts > 0
														? Math.round((chSc.correct / chSc.attempts) * 100)
														: null}
												{@const accClr =
													chSc && chSc.attempts > 0
														? chapterAccuracyColor(chSc.correct / chSc.attempts)
														: null}
												<button
													type="button"
													role="option"
													aria-selected={ch.id === chapterSelection}
													onclick={() => {
														handleChapterChange(chapterBook, ch.id);
														chapterPickerOpen = false;
													}}
													class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors {ch.id ===
													chapterSelection
														? 'font-semibold text-text-default'
														: 'text-text-subtitle hover:bg-shaded-background hover:text-text-default'}"
													style={accClr
														? `background-color: ${accClr}${ch.id === chapterSelection ? '20' : '10'}`
														: ch.id === chapterSelection
															? 'background-color: var(--color-shaded-background)'
															: ''}
												>
													<span class="shrink-0 font-semibold">{ch.label}</span>
													{#if ch.subtitle}
														<span class="truncate text-xs text-text-subtitle">{ch.subtitle}</span>
													{/if}
													{#if accPct !== null && accClr}
														<span class="ml-auto shrink-0 text-xs font-bold" style="color: {accClr}"
															>{accPct}%</span
														>
													{/if}
												</button>
											{/each}
										</div>
									{/if}
									<div class="flex flex-wrap items-center justify-center gap-1">
										{#if kzkChapter.unlockedCases.length === ALL_CASES.length}
											<span
												class="inline-flex items-center rounded-full border border-card-stroke bg-shaded-background px-1.5 py-0.5 text-xs font-semibold leading-none text-text-subtitle"
											>
												All cases
											</span>
										{:else}
											{#each kzkChapter.unlockedCases as c (c)}
												<span
													class="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-bold leading-none"
													style="background-color: {CASE_HEX[c]}18; color: {CASE_HEX[c]}"
												>
													{CASE_SHORT_LABELS[c]}
												</span>
											{/each}
										{/if}
										<span
											class="inline-flex items-center rounded-full border border-card-stroke bg-shaded-background px-1.5 py-0.5 text-xs font-semibold leading-none text-text-subtitle"
										>
											{kzkChapter.pluralUnlocked ? 'Sg + Pl' : 'Sg only'}
										</span>
									</div>
								</div>

								<button
									onclick={() => handleChapterStep('next')}
									class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-card-stroke bg-card-bg text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
									aria-label="Next chapter"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="h-4 w-4"
									>
										<path
											fill-rule="evenodd"
											d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
											clip-rule="evenodd"
										/>
									</svg>
								</button>
							</div>
						{/if}
					{/if}
					{#if chapterBook === null && selectedCase === 'all'}
						<button
							onclick={() => {
								caseFilterExpanded = !caseFilterExpanded;
								if (caseFilterExpanded) settingsExpanded = false;
							}}
							class="inline-flex min-h-[44px] items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-text-subtitle transition-colors hover:text-text-default"
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
					{/if}
				</div>
				<div class="flex items-center justify-end gap-2">
					{#if relevantMistakeCount > 0}
						<button
							type="button"
							onclick={() => {
								practicingMistakes = !practicingMistakes;
								lastMistakeIndex = -1;
								generateNextQuestion();
							}}
							class="flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-150
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
							class="flex size-11 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
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
						onclick={() => {
							settingsExpanded = !settingsExpanded;
							if (settingsExpanded) caseFilterExpanded = false;
						}}
						class="flex size-11 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
						aria-label="Exercise settings"
						data-tour="settings"
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
			</div>

			<!-- Expandable case filter (inline, pushes content down) -->
			{#if chapterBook === null && caseFilterExpanded}
				<div
					transition:slide={{ duration: 200 }}
					class="flex flex-wrap justify-center gap-1.5 rounded-2xl border border-card-stroke bg-card-bg px-3 py-3"
				>
					{#each ALL_CASES as c (c)}
						{@const enabled = enabledCases.includes(c)}
						<button
							onclick={() => toggleEnabledCase(c)}
							class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150"
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
							class="text-xs font-medium text-text-subtitle underline decoration-dotted underline-offset-2 transition-colors hover:text-text-default"
						>
							Reset
						</button>
					{/if}
				</div>
			{/if}

			<!-- Expandable settings (inline, pushes content down) -->
			{#if settingsExpanded}
				<div
					transition:slide={{ duration: 200 }}
					class="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-2xl border border-card-stroke bg-card-bg px-3 py-3 sm:gap-x-6 sm:px-5 sm:py-4"
				>
					<DrillSettings_
						selectedDrillTypes={drillSettings.selectedDrillTypes}
						numberMode={effectiveNumberMode}
						contentMode={drillSettings.contentMode ?? 'nouns'}
						{pronounsUnlocked}
						onSettingsChange={handleSettingsChange}
						hiddenDrillTypes={(() => {
							const hidden: DrillType[] = [];
							if (selectedCase !== 'all' || effectiveEnabledCases.length < 2) {
								hidden.push('case_identification');
							}
							if (!isMultiStepUnlocked()) {
								hidden.push('multi_step');
							}
							return hidden;
						})()}
						hideNumberMode={chapterBook !== null && !getSelectedKzkChapter()?.pluralUnlocked}
					/>
				</div>
			{/if}

			<!-- Sign-up prompt for guests after 10 questions -->
			{#if !user && sessionCount >= 10 && !signupPromptDismissed}
				<div
					transition:slide={{ duration: 200 }}
					class="mx-auto mb-3 mt-6 max-w-[867px] rounded-2xl border border-card-stroke bg-card-bg px-4 py-3 sm:px-5 sm:py-3.5"
				>
					<div class="flex items-center gap-4">
						<div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
							<p class="shrink-0 text-sm font-semibold text-text-default">
								You're on a roll — don't lose it!
							</p>
							<p class="text-xs text-text-subtitle">
								Save progress across devices &middot; smart weak-spot drilling &middot; track
								accuracy
							</p>
						</div>
						<button
							type="button"
							onclick={() => (authModalOpen = true)}
							class="shrink-0 rounded-xl bg-emphasis px-4 py-2 text-xs font-semibold text-text-inverted transition-opacity hover:opacity-90"
						>
							Sign up free
						</button>
						<button
							type="button"
							onclick={() => (signupPromptDismissed = true)}
							class="shrink-0 p-1 text-text-subtitle transition-colors hover:text-text-default"
							aria-label="Dismiss"
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
					</div>
				</div>
			{/if}

			<!-- Drill area -->
			<div class="mx-auto mt-6 max-w-[867px]">
				{#if multiStepQuestion}
					<MultiStepCard
						question={multiStepQuestion}
						onComplete={handleMultiStepComplete}
						{paradigmNotes}
						onSpeak={ttsAvailable ? handleSpeak : null}
						level={currentLevel}
					/>
				{:else}
					<DrillCard
						{question}
						loading={wordsLoading || (question === null && !initialized)}
						result={lastResult}
						onSubmit={handleSubmit}
						onSpeak={ttsAvailable ? handleSpeak : null}
						selectedCases={ALL_CASES}
						{paradigmNotes}
						onWordClick={handleWordClick}
						{streak}
						soundEnabled={autoplayAudio}
					/>
				{/if}
			</div>

			<!-- Session stats -->
			{#if sessionCount > 0}
				<div class="mt-6 text-center text-xs text-text-subtitle">
					{Math.round($displayTotal)} completed &middot; {Math.round($displayPct)}% accuracy
				</div>
			{/if}

			<!-- Milestone toasts -->
			{#each toasts as toast (toast.id)}
				<MilestoneToast
					message={toast.message}
					emoji={toast.emoji}
					onDismiss={() => removeToast(toast.id)}
				/>
			{/each}

			<!-- SEO description (always server-rendered for indexing) -->
			<p class="mx-auto mt-10 max-w-lg text-center text-xs leading-relaxed text-text-subtitle/70">
				Practice Czech noun declension across all 7 cases. Skloňuj offers interactive drills that
				adapt to your level, from A1 beginner to B2 intermediate, with smart tracking that focuses
				on the paradigms and patterns you get wrong most. Follow along with Krok za krokem textbook
				chapters or practice freely.
			</p>
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
			class="fixed top-14 right-0 z-40 flex h-[calc(100%-3.5rem)] transition-transform duration-300 ease-in-out sm:top-16 sm:h-[calc(100%-4rem)]"
			style="transform: translateX({refSidebarOpen ? '0px' : 'calc(100% - 44px)'})"
		>
			<button
				type="button"
				onclick={toggleReferenceSidebar}
				class="self-center shrink-0 rounded-bl-[12px] rounded-tl-[12px] bg-emphasis px-2.5 py-5 text-text-inverted shadow-lg transition-opacity hover:opacity-90 sm:px-3.5 sm:py-6"
				aria-label="Toggle reference sidebar"
				data-tour="ref-sidebar"
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
			<aside class="h-full w-[calc(100vw-44px)] bg-card-bg shadow-2xl sm:w-screen sm:max-w-md">
				<ReferenceSidebar
					initialWord={refSidebarWord}
					initialPronoun={refSidebarPronoun}
					initialTab={refSidebarTab}
					onClose={() => (refSidebarOpen = false)}
				/>
			</aside>
		</div>
	{/if}
</div>

{#if showOnboarding}
	<GuidedTour onComplete={dismissOnboarding} />
{/if}

<AuthModal open={authModalOpen} onClose={() => (authModalOpen = false)} />
