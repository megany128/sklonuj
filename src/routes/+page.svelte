<script lang="ts">
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Flame from '@lucide/svelte/icons/flame';
	import Target from '@lucide/svelte/icons/target';
	import Brain from '@lucide/svelte/icons/brain';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import VolumeX from '@lucide/svelte/icons/volume-x';
	import Settings from '@lucide/svelte/icons/settings';
	import X from '@lucide/svelte/icons/x';
	import NotebookText from '@lucide/svelte/icons/notebook-text';
	import Star from '@lucide/svelte/icons/star';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import ArrowUpCircle from '@lucide/svelte/icons/arrow-up-circle';
	import Confetti from '$lib/components/ui/Confetti.svelte';
	import { slide, fly, fade } from 'svelte/transition';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
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
		WordMode,
		SentenceTemplate
	} from '$lib/types';
	import {
		ALL_CASES,
		ALL_DRILL_TYPES,
		CASE_LABELS,
		CASE_SHORT_LABELS,
		CASE_HEX,
		CASE_INDEX,
		isCase
	} from '$lib/types';

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
		getAdjectiveCandidates,
		filterAdjectivesByTemplate,
		weightedRandomAdjective,
		loadAdjectiveTemplates,
		generateAdjectiveSentenceDrill,
		generateAdjectiveFormProduction,
		getAdjectiveGenderKey,
		getAdjectiveForm,
		getAllAdjectiveAcceptedForms
	} from '$lib/engine/adjective-drill';
	import {
		speak,
		isTTSAvailable,
		onCzechVoiceReady,
		warmUpVoices,
		loadAudioIndex,
		playCorrectSound,
		playStreakSound
	} from '$lib/audio';
	import { addMistake, getUniqueMistakeKeys } from '$lib/engine/mistakes';
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

	import NavBar from '$lib/components/ui/NavBar.svelte';
	import MilestoneToast from '$lib/components/ui/MilestoneToast.svelte';
	import AuthModal from '$lib/components/ui/AuthModal.svelte';
	import GuidedTour from '$lib/components/ui/GuidedTour.svelte';
	import {
		checkAndAwardBadges,
		recordPracticeDay,
		type BadgeCheckContext
	} from '$lib/engine/achievements';
	import LeaderboardBanner from '$lib/components/ui/LeaderboardBanner.svelte';

	const kzkChapters: KzkChaptersConfig = kzkChaptersData as KzkChaptersConfig;

	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import posthog from '$lib/posthog';
	import { BADGE_ICONS, BADGE_COLORS } from '$lib/data/badge-icons';
	import type { Component } from 'svelte';

	let user = $derived(page.data.user);

	// Debounced sync to Supabase via server API (browser client auth is unreliable)
	let syncTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleSyncToSupabase(): void {
		if (!user) return;
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			const current = get(progress);
			// keepalive lets the request complete through client-side navigation
			// so the server doesn't see the connection get aborted mid-flight.
			fetch('/api/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				keepalive: true,
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
	let todayCaseScores = $state<Record<string, { attempted: number; correct: number }>>({});
	let sessionSyncTimer: ReturnType<typeof setTimeout> | null = null;

	function getTodayDate(): string {
		// Must match server logic: before 5 AM UTC, treat previous day as "today"
		// so late-night sessions stay grouped with the same calendar day.
		const ms = Date.now();
		const hours = Math.floor((ms % 86_400_000) / 3_600_000);
		const d = new Date(hours < 5 ? ms - 86_400_000 : ms);
		return d.toISOString().slice(0, 10);
	}

	function scheduleSessionSync(): void {
		if (!user) return;
		if (sessionSyncTimer) clearTimeout(sessionSyncTimer);
		sessionSyncTimer = setTimeout(() => {
			fetch('/api/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				keepalive: true,
				body: JSON.stringify({
					session: {
						sessionDate: getTodayDate(),
						questionsAttempted: todayAttempted,
						questionsCorrect: todayCorrect,
						caseScores: todayCaseScores
					}
				})
			}).catch(() => {});
		}, 1000);
	}

	function recordSessionActivity(correct: boolean, caseKey?: string): void {
		if (!user) return;
		todayAttempted++;
		if (correct) todayCorrect++;
		if (caseKey) {
			const existing = todayCaseScores[caseKey] ?? { attempted: 0, correct: 0 };
			existing.attempted++;
			if (correct) existing.correct++;
			todayCaseScores = { ...todayCaseScores, [caseKey]: existing };
		}
		scheduleSessionSync();
	}

	function loadTodaySession(): void {
		if (!user) return;
		// Load via server API to avoid browser client auth issues
		fetch('/api/sync')
			.then((res) => res.json())
			.then(
				(data: {
					todaySession?: {
						questions_attempted: number;
						questions_correct: number;
						case_scores?: Record<string, { attempted: number; correct: number }>;
					};
				}) => {
					if (data.todaySession) {
						todayAttempted = data.todaySession.questions_attempted;
						todayCorrect = data.todaySession.questions_correct;
						if (data.todaySession.case_scores) {
							todayCaseScores = data.todaySession.case_scores;
						}
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
	const ANON_SESSION_STASH_KEY = 'sklonuj_anon_session';

	/** Stash current anon session stats so they can be synced after sign-up. */
	function stashAnonSession(): void {
		if (user) return;
		const attempted = sessionCorrect + sessionWrong;
		if (attempted === 0) return;
		const today = new Date().toISOString().slice(0, 10);
		localStorage.setItem(
			ANON_SESSION_STASH_KEY,
			JSON.stringify({
				sessionDate: today,
				questionsAttempted: attempted,
				questionsCorrect: sessionCorrect,
				caseScores: sessionCaseMisses
			})
		);
	}

	/** After login, sync any stashed anon session to the server. */
	function syncStashedAnonSession(): void {
		const raw = localStorage.getItem(ANON_SESSION_STASH_KEY);
		if (!raw) return;
		let stash: unknown;
		try {
			stash = JSON.parse(raw);
		} catch {
			localStorage.removeItem(ANON_SESSION_STASH_KEY);
			return;
		}
		fetch('/api/sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ session: stash })
		})
			.then((res) => {
				if (res.ok) localStorage.removeItem(ANON_SESSION_STASH_KEY);
			})
			.catch(() => {});
	}

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
			contentMode: 'both',
			wordMode: 'both'
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
		if (!isRecord(value)) return false;
		const obj = value;
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
		if (
			obj.wordMode !== undefined &&
			obj.wordMode !== 'nouns' &&
			obj.wordMode !== 'adjectives' &&
			obj.wordMode !== 'both'
		)
			return false;
		if (!obj.selectedCases.every((c: unknown) => isCaseValue(c))) return false;
		if (!obj.selectedDrillTypes.every((dt: unknown) => isDrillType(dt))) {
			// Some drill types may be legacy (e.g. adjective_agreement) - filter them
			const filtered = obj.selectedDrillTypes.filter((dt: unknown) => isDrillType(dt));
			if (filtered.length === 0) return false;
			obj.selectedDrillTypes = filtered;
		}
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
	let authModalInitialMode = $derived<'login' | 'signup' | 'forgot' | 'welcome'>(
		page.url.searchParams.get('modal') === 'welcome' ? 'welcome' : 'login'
	);

	// Auto-open modal when ?modal= query param is present (dev convenience)
	$effect(() => {
		if (page.url.searchParams.has('modal')) {
			authModalOpen = true;
		}
	});

	// Simulate achievement toast when ?toast=achievement is present (dev convenience)
	let devToastShown = $state(false);
	$effect(() => {
		if (!devToastShown && page.url.searchParams.get('toast') === 'achievement') {
			devToastShown = true;
			addToast('First Steps — Achievement unlocked!', '', {
				icon: BADGE_ICONS['first_steps'],
				iconColor: BADGE_COLORS['first_steps'],
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() is used inside the template literal
				onClick: () => goto(`${resolve('/profile')}?tab=achievements`)
			});
		}
	});
	let showOnboarding = $state(true);

	const practiceOnboardingSteps = [
		{
			target: null,
			title: 'Welcome to Skloňuj!',
			text: 'Master Czech noun declension with interactive drills across all 7 cases. Let\u2019s take a quick look around.'
		},
		{
			target: 'case-pills',
			text: 'Pick a case to focus on, or let Skloňuj choose your weakest one.'
		},
		{
			target: 'mode-selector',
			text: 'Follow Krok za krokem chapters or practice freely.'
		},
		{
			target: 'ref-sidebar',
			text: 'Tap here anytime to look up declension tables and case rules.'
		},
		{
			target: 'settings',
			text: 'Configure drill types, number, and content.'
		},
		{
			target: 'classes-link',
			text: 'If you\u2019re part of a class, find your assignments and track your progress here.'
		}
	];

	// Assignment mode
	let assignmentId = $state<string | null>(null);
	interface AssignmentInfo {
		title: string;
		classId: string;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: 'sg' | 'pl' | 'both';
		contentMode: string;
		includeAdjectives?: boolean;
		contentLevel: string | null;
		targetQuestions: number;
		attempted: number;
		correct: number;
		completedAt: string | null;
	}
	let assignmentInfo = $state<AssignmentInfo | null>(null);
	let assignmentLoading = $state(false);
	let showCompletionModal = $state(false);
	let suppressCompletionModal = $state(false);
	let mistakesExpanded = $state(false);
	let assignmentError = $state<string | null>(null);
	let assignmentErrorTimer: ReturnType<typeof setTimeout> | null = null;

	// Collect recent mistakes during assignment practice (max 20)
	interface AssignmentMistake {
		word: string;
		expectedForm: string;
		givenAnswer: string;
		case: string;
		number: string;
		sentence?: string;
		// Task context
		drillType?: string;
		prompt?: string;
		// Multi-step (full analysis) details
		correctParadigm?: string;
		userParadigm?: string;
		correctCase?: string;
		userCase?: string | null;
		paradigmCorrect?: boolean;
		caseCorrect?: boolean | null;
		formCorrect?: boolean;
		// Adjective step details
		adjectiveCorrect?: boolean | null;
		correctAdjectiveForm?: string;
		userAdjectiveForm?: string;
	}
	let assignmentMistakes = $state<AssignmentMistake[]>([]);

	function clearAssignmentErrorAfterDelay(): void {
		if (assignmentErrorTimer) clearTimeout(assignmentErrorTimer);
		assignmentErrorTimer = setTimeout(() => {
			assignmentError = null;
		}, 5000);
	}

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	const DRILL_TYPE_SET: ReadonlySet<string> = new Set<string>(ALL_DRILL_TYPES);
	function isDrillType(value: unknown): value is DrillType {
		return typeof value === 'string' && DRILL_TYPE_SET.has(value);
	}

	const DIFFICULTY_SET: ReadonlySet<string> = new Set<string>(['A1', 'A2', 'B1', 'B2']);
	function isDifficulty(value: unknown): value is Difficulty {
		return typeof value === 'string' && DIFFICULTY_SET.has(value);
	}

	function isCaseValue(value: unknown): value is Case {
		return typeof value === 'string' && isCase(value);
	}

	// Student assignments panel
	interface StudentAssignment {
		id: string;
		classId: string;
		className: string;
		title: string;
		description: string | null;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: string;
		contentMode: string;
		includeAdjectives?: boolean;
		wordMode?: WordMode;
		contentLevel: string | null;
		targetQuestions: number;
		dueDate: string | null;
		attempted: number;
		correct: number;
		completedAt: string | null;
	}
	let studentAssignments = $state<StudentAssignment[]>([]);
	let assignmentsPanelExpanded = $state(true);

	function loadStudentAssignments(): void {
		if (!user) return;
		fetch('/api/student-assignments')
			.then((res) => {
				if (!res.ok) throw new Error('Failed to load');
				return res.json();
			})
			.then((data: unknown) => {
				if (isRecord(data) && Array.isArray(data.assignments)) {
					const validated: StudentAssignment[] = [];
					for (const item of data.assignments) {
						if (
							isRecord(item) &&
							typeof item.id === 'string' &&
							typeof item.classId === 'string' &&
							typeof item.className === 'string' &&
							typeof item.title === 'string' &&
							typeof item.targetQuestions === 'number' &&
							Array.isArray(item.selectedCases) &&
							Array.isArray(item.selectedDrillTypes)
						) {
							validated.push({
								id: item.id,
								classId: item.classId,
								className: item.className,
								title: item.title,
								description: typeof item.description === 'string' ? item.description : null,
								selectedCases: item.selectedCases.filter(
									(v: unknown): v is string => typeof v === 'string'
								),
								selectedDrillTypes: item.selectedDrillTypes.filter(
									(v: unknown): v is string => typeof v === 'string'
								),
								numberMode: typeof item.numberMode === 'string' ? item.numberMode : 'both',
								contentMode: typeof item.contentMode === 'string' ? item.contentMode : 'both',
								includeAdjectives: item.includeAdjectives === true,
								contentLevel: typeof item.contentLevel === 'string' ? item.contentLevel : null,
								targetQuestions: item.targetQuestions,
								dueDate: typeof item.dueDate === 'string' ? item.dueDate : null,
								attempted: typeof item.attempted === 'number' ? item.attempted : 0,
								correct: typeof item.correct === 'number' ? item.correct : 0,
								completedAt: typeof item.completedAt === 'string' ? item.completedAt : null
							});
						}
					}
					studentAssignments = validated;
				}
			})
			.catch(() => {
				assignmentError = 'Could not load assignments.';
				clearAssignmentErrorAfterDelay();
			});
	}

	function doesPracticeMatchAssignment(
		settings: DrillSettings,
		assignment: {
			selectedCases: string[];
			selectedDrillTypes: string[];
			numberMode: string;
			contentMode: string;
		}
	): boolean {
		// Check that the student's practice covers the assignment's requirements.
		// The student may have more cases/types enabled — that's fine for a
		// suggestion; the assignment's params are a subset of the practice.
		const casesCovered = assignment.selectedCases.every(
			(c) => isCaseValue(c) && settings.selectedCases.includes(c)
		);
		const typesCovered = assignment.selectedDrillTypes.every(
			(dt) => isDrillType(dt) && settings.selectedDrillTypes.includes(dt)
		);
		const numberMatch =
			settings.numberMode === assignment.numberMode || settings.numberMode === 'both';
		const contentMatch =
			(settings.contentMode ?? 'both') === assignment.contentMode ||
			(settings.contentMode ?? 'both') === 'both';
		return casesCovered && typesCovered && numberMatch && contentMatch;
	}

	function findMatchingAssignment(): StudentAssignment | null {
		const incomplete = studentAssignments.filter((a) => a.completedAt === null);
		const matching = incomplete.filter((a) => doesPracticeMatchAssignment(drillSettings, a));
		if (matching.length === 0) return null;
		// Pick the one with the earliest due date that isn't completed
		const withDue = matching.filter((a) => a.dueDate !== null);
		if (withDue.length > 0) {
			withDue.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
			return withDue[0];
		}
		return matching[0];
	}

	// Toast prompt: shown once per assignment when practice settings match
	let assignmentToastMatch = $state<StudentAssignment | null>(null);
	let dismissedAssignmentToasts = $state(new Set<string>());
	let assignmentToastTimer: ReturnType<typeof setTimeout> | null = null;

	// Confirmation toast: shown briefly after an assignment is applied
	let appliedToastName = $state<string | null>(null);
	let appliedToastReview = $state(false);
	let appliedToastTimer: ReturnType<typeof setTimeout> | null = null;

	function showAppliedToast(name: string, review = false): void {
		appliedToastName = name;
		appliedToastReview = review;
		if (appliedToastTimer) clearTimeout(appliedToastTimer);
		appliedToastTimer = setTimeout(() => {
			appliedToastName = null;
			appliedToastTimer = null;
		}, 3000);
	}

	function checkAssignmentMatchToast(): void {
		if (assignmentId) return; // Already in explicit assignment mode
		const match = findMatchingAssignment();
		if (!match || dismissedAssignmentToasts.has(match.id)) {
			assignmentToastMatch = null;
			return;
		}
		if (assignmentToastMatch?.id === match.id) return; // Already showing
		assignmentToastMatch = match;
		// Auto-dismiss after 15 seconds
		if (assignmentToastTimer) clearTimeout(assignmentToastTimer);
		assignmentToastTimer = setTimeout(() => {
			dismissAssignmentToast();
		}, 15000);
	}

	function dismissAssignmentToast(): void {
		if (assignmentToastMatch) {
			dismissedAssignmentToasts.add(assignmentToastMatch.id);
		}
		assignmentToastMatch = null;
		if (assignmentToastTimer) {
			clearTimeout(assignmentToastTimer);
			assignmentToastTimer = null;
		}
	}

	function applyAssignmentFromToast(): void {
		if (!assignmentToastMatch) return;
		startAssignment(assignmentToastMatch);
		assignmentToastMatch = null;
		if (assignmentToastTimer) {
			clearTimeout(assignmentToastTimer);
			assignmentToastTimer = null;
		}
	}

	function startAssignment(assignment: StudentAssignment): void {
		// Update URL FIRST — the $effect that watches page.url re-activates or
		// clears assignment mode whenever it sees a mismatch between the param
		// and assignmentId. Setting state before updating the URL triggers that
		// effect with stale URL, causing it to immediately undo our changes.
		const url = new URL(window.location.href);
		url.searchParams.set('assignment', assignment.id);
		try {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- using URL object directly
			replaceState(url.pathname + url.search, {});
		} catch {
			// ignore
		}
		assignmentId = assignment.id;
		assignmentInfo = {
			title: assignment.title,
			classId: assignment.classId,
			selectedCases: assignment.selectedCases,
			selectedDrillTypes: assignment.selectedDrillTypes,
			numberMode:
				assignment.numberMode === 'sg' || assignment.numberMode === 'pl'
					? assignment.numberMode
					: 'both',
			contentMode: assignment.contentMode,
			contentLevel: assignment.contentLevel ?? null,
			targetQuestions: assignment.targetQuestions,
			attempted: assignment.attempted,
			correct: assignment.correct,
			completedAt: assignment.completedAt
		};
		const assignmentCases = assignment.selectedCases.filter(isCaseValue);
		const assignmentWordMode: WordMode =
			assignment.contentMode === 'adjectives'
				? 'adjectives'
				: assignment.contentMode === 'all' || assignment.includeAdjectives === true
					? 'both'
					: 'nouns';
		const assignmentContentMode: ContentMode =
			assignment.contentMode === 'nouns' ||
			assignment.contentMode === 'pronouns' ||
			assignment.contentMode === 'both'
				? assignment.contentMode
				: assignment.contentMode === 'adjectives'
					? 'nouns'
					: 'both';
		drillSettings = {
			selectedCases: assignmentCases,
			selectedDrillTypes: assignment.selectedDrillTypes.filter(isDrillType),
			numberMode:
				assignment.numberMode === 'sg' || assignment.numberMode === 'pl'
					? assignment.numberMode
					: 'both',
			contentMode: assignmentContentMode,
			wordMode: assignmentWordMode
		};
		enabledCases = assignmentCases.length > 0 ? [...assignmentCases] : [...ALL_CASES];
		selectedCase = 'all';
		chapterBook = null;
		chapterSelection = null;
		assignmentMistakes = [];
		// If assignment is already completed, show the celebration immediately
		if (assignment.completedAt !== null && !suppressCompletionModal) {
			showCompletionModal = true;
		} else {
			generateNextQuestion();
			suppressCompletionModal = false;
		}
		showAppliedToast(assignment.title);
	}

	function exitAssignmentMode(): void {
		// Remove ?assignment param from URL FIRST — the $effect that watches
		// page.url re-activates assignment mode whenever it sees a param that
		// differs from assignmentId, so we must clear the URL before clearing
		// state to avoid the effect immediately re-entering assignment mode.
		const url = new URL(window.location.href);
		url.searchParams.delete('assignment');
		const newPath = url.pathname + url.search;
		try {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- using URL object directly
			replaceState(newPath || '/', {});
		} catch {
			// ignore
		}
		// Suppress the "matches your settings" toast for the assignment we just left
		if (assignmentId) dismissedAssignmentToasts.add(assignmentId);
		assignmentToastMatch = null;
		assignmentId = null;
		assignmentInfo = null;
		assignmentMistakes = [];
		// Keep the assignments list collapsed — less intrusive when returning to free practice
		assignmentsPanelExpanded = false;
		generateNextQuestion();
	}

	function formatTimeSuffix(date: Date): string {
		if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0) return '';
		return (
			' at ' +
			date.toLocaleTimeString('en-US', {
				timeZone: 'UTC',
				hour: 'numeric',
				minute: '2-digit'
			})
		);
	}

	type PracticeUrgency = 'overdue' | 'soon' | 'later' | 'done' | 'none';

	function getDueDateUrgency(
		dueDate: string | null,
		completedAt: string | null
	): { label: string; urgency: PracticeUrgency } {
		if (completedAt !== null) return { label: 'Done', urgency: 'done' };
		if (dueDate === null) return { label: 'No due date', urgency: 'none' };

		const due = new Date(dueDate);
		const now = new Date();
		const msPerDay = 24 * 60 * 60 * 1000;
		const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
		const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
		const diffDays = Math.round((dueDay - today) / msPerDay);
		const timeSuffix = formatTimeSuffix(due);

		if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, urgency: 'overdue' };
		if (diffDays === 0 && due.getTime() < now.getTime())
			return { label: `Overdue${timeSuffix}`, urgency: 'overdue' };
		if (diffDays === 0) return { label: `Due today${timeSuffix}`, urgency: 'soon' };
		if (diffDays === 1) return { label: `Due tomorrow${timeSuffix}`, urgency: 'soon' };
		if (diffDays <= 3) return { label: `Due in ${diffDays}d`, urgency: 'soon' };
		return { label: `Due in ${diffDays}d`, urgency: 'later' };
	}

	let pendingAssignments = $derived(studentAssignments.filter((a) => a.completedAt === null));
	let showAssignmentsPanel = $derived(
		user !== null && pendingAssignments.length > 0 && !assignmentLoading
	);
	// When an assignment becomes active, auto-collapse the Your Assignments panel
	// so it condenses to a single framed row showing the focused assignment.
	$effect(() => {
		if (assignmentId) {
			assignmentsPanelExpanded = false;
		}
	});

	function collectAssignmentMistake(
		word: string,
		expectedForm: string,
		givenAnswer: string,
		caseKey: string,
		numberKey: string,
		sentence?: string,
		drillType?: string,
		prompt?: string
	): void {
		const mistake: AssignmentMistake = {
			word,
			expectedForm,
			givenAnswer,
			case: caseKey,
			number: numberKey,
			...(sentence ? { sentence } : {}),
			...(drillType ? { drillType } : {}),
			...(prompt ? { prompt } : {})
		};
		// Keep only the last 20 mistakes
		assignmentMistakes = [...assignmentMistakes, mistake].slice(-20);
	}

	function recordAssignmentProgress(correct: boolean, caseKey?: string, numberKey?: string): void {
		if (!assignmentId) return;
		fetch('/api/assignment-progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				assignmentId,
				correct,
				caseKey,
				numberKey,
				recentMistakes: assignmentMistakes.length > 0 ? assignmentMistakes : undefined
			})
		})
			.then((res) => res.json())
			.then((data: unknown) => {
				console.log('[assignment-progress] response:', data);
				console.log('[assignment-progress] assignmentInfo before:', assignmentInfo);
				if (assignmentInfo && isRecord(data) && typeof data.questions_attempted === 'number') {
					const wasCompleted = assignmentInfo.completedAt !== null;
					const newCompletedAt = typeof data.completed_at === 'string' ? data.completed_at : null;
					console.log('[assignment-progress] wasCompleted:', wasCompleted);
					console.log('[assignment-progress] newCompletedAt:', newCompletedAt);
					assignmentInfo = {
						...assignmentInfo,
						attempted: data.questions_attempted,
						correct:
							typeof data.questions_correct === 'number'
								? data.questions_correct
								: assignmentInfo.correct,
						completedAt: newCompletedAt
					};
					// Show completion modal when assignment just became completed
					if (!wasCompleted && assignmentInfo.completedAt !== null) {
						console.log('[completion] PATH 2: POST response');
						showCompletionModal = true;
					}
					// Also update the student assignments panel if it's showing
					const currentAssignmentId = assignmentId;
					if (currentAssignmentId) {
						studentAssignments = studentAssignments.map((a) => {
							if (a.id !== currentAssignmentId) return a;
							return {
								...a,
								attempted: assignmentInfo!.attempted,
								correct: assignmentInfo!.correct,
								completedAt: assignmentInfo!.completedAt
							};
						});
					}
				}
			})
			.catch(() => {
				assignmentError = 'Failed to save progress. Your work may not be recorded.';
				clearAssignmentErrorAfterDelay();
			});
	}

	// Leaderboard
	interface LeaderboardEntry {
		rank: number;
		userId: string;
		displayName: string;
		firstName: string;
		score: number;
		questionsAnswered: number;
		correctAnswers: number;
	}
	let leaderboardRefreshTimer: ReturnType<typeof setInterval> | null = null;

	// Global leaderboard state
	let globalLeaderboardData = $state<LeaderboardEntry[]>([]);
	let globalLeaderboardTotal = $state(0);
	let globalShowOnLeaderboard = $state(true);
	let globalLeaderboardPointsDelta = $state(0);

	function fetchGlobalLeaderboard(): void {
		fetch('/api/leaderboard/global')
			.then((res) => {
				if (!res.ok) return null;
				return res.json();
			})
			.then((data: unknown) => {
				if (!isRecord(data)) return;
				if (Array.isArray(data.leaderboard)) {
					const entries: LeaderboardEntry[] = [];
					for (const item of data.leaderboard) {
						if (
							isRecord(item) &&
							typeof item.rank === 'number' &&
							typeof item.userId === 'string' &&
							typeof item.displayName === 'string' &&
							typeof item.firstName === 'string' &&
							typeof item.score === 'number' &&
							typeof item.questionsAnswered === 'number' &&
							typeof item.correctAnswers === 'number'
						) {
							entries.push({
								rank: item.rank,
								userId: item.userId,
								displayName: item.displayName,
								firstName: item.firstName,
								score: item.score,
								questionsAnswered: item.questionsAnswered,
								correctAnswers: item.correctAnswers
							});
						}
					}
					globalLeaderboardData = entries;
				}
				if (typeof data.totalUsers === 'number') {
					globalLeaderboardTotal = data.totalUsers;
				}
				if (typeof data.showOnLeaderboard === 'boolean') {
					globalShowOnLeaderboard = data.showOnLeaderboard;
				}
			})
			.catch(() => {});
	}

	function handleGlobalLeaderboardToggle(): void {
		const newValue = !globalShowOnLeaderboard;
		globalShowOnLeaderboard = newValue;
		fetch('/api/leaderboard/global/toggle', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ visible: newValue })
		})
			.then((res) => {
				if (!res.ok) globalShowOnLeaderboard = !newValue;
			})
			.catch(() => {
				globalShowOnLeaderboard = !newValue;
			});
	}

	function updateLeaderboardAfterAnswer(correct: boolean): void {
		if (!user) return; // Anon users update via sessionCorrect/sessionWrong which feeds mergedGlobalLeaderboard

		if (globalLeaderboardData.length > 0) {
			const myGlobalEntry = globalLeaderboardData.find((e) => e.userId === user!.id);
			if (myGlobalEntry) {
				const pointsGained = correct ? 5 : 1;
				const newScore = myGlobalEntry.score + pointsGained;
				globalLeaderboardPointsDelta += pointsGained;

				globalLeaderboardData = globalLeaderboardData.map((e) => {
					if (e.userId !== user!.id) return e;
					return {
						...e,
						score: newScore,
						questionsAnswered: e.questionsAnswered + 1,
						correctAnswers: e.correctAnswers + (correct ? 1 : 0)
					};
				});
			}
		}
	}

	// Session stats
	let sessionCorrect = $state(0);
	let sessionWrong = $state(0);
	let sessionCaseMisses: Record<string, number> = $state({});

	// For anonymous users, create a client-side leaderboard entry from session stats
	const ANON_USER_ID = '__anon__';
	const ANON_ADJECTIVES = [
		'Happy',
		'Brave',
		'Clever',
		'Swift',
		'Calm',
		'Bold',
		'Bright',
		'Keen',
		'Wise',
		'Merry',
		'Witty',
		'Gentle',
		'Lively',
		'Plucky',
		'Steady',
		'Nimble'
	];
	const ANON_ANIMALS = [
		'Otter',
		'Fox',
		'Bear',
		'Owl',
		'Hare',
		'Wolf',
		'Deer',
		'Hawk',
		'Lynx',
		'Seal',
		'Crane',
		'Raven',
		'Finch',
		'Badger',
		'Robin',
		'Falcon'
	];
	const anonAlias = (() => {
		const seed = Math.floor(Math.random() * 256);
		return `${ANON_ADJECTIVES[seed % 16]} ${ANON_ANIMALS[Math.floor(seed / 16) % 16]}`;
	})();
	let mergedGlobalLeaderboard = $derived.by(() => {
		if (user) return globalLeaderboardData;
		const anonScore = sessionCorrect * 5 + sessionWrong;
		// Figure out anon rank: count how many real users have a higher score
		// The API returns windowed data, but globalLeaderboardTotal is the full count
		let anonRank = globalLeaderboardTotal + 1; // default: last
		if (anonScore > 0) {
			// Find lowest-ranked visible entry with score <= anonScore
			// If we beat some visible entries, our rank is just above them
			// Otherwise we're somewhere in the hidden middle — approximate
			const beaten = globalLeaderboardData.filter((e) => e.score < anonScore);
			if (beaten.length > 0) {
				const bestBeaten = beaten.reduce((a, b) => (a.rank < b.rank ? a : b));
				anonRank = bestBeaten.rank;
			} else if (globalLeaderboardData.length > 0) {
				const worstVisible = globalLeaderboardData.reduce((a, b) => (a.rank > b.rank ? a : b));
				if (anonScore === worstVisible.score) {
					anonRank = worstVisible.rank; // tied
				} else {
					anonRank = worstVisible.rank + 1;
				}
			}
		}
		const anonEntry: LeaderboardEntry = {
			rank: anonRank,
			userId: ANON_USER_ID,
			displayName: anonAlias,
			firstName: anonAlias,
			score: anonScore,
			questionsAnswered: sessionCorrect + sessionWrong,
			correctAnswers: sessionCorrect
		};
		const merged = [...globalLeaderboardData, anonEntry];
		merged.sort((a, b) => a.rank - b.rank || b.score - a.score);
		return merged;
	});

	let showGlobalLeaderboard = $derived(
		mergedGlobalLeaderboard.length > 0 || (user !== null && !globalShowOnLeaderboard)
	);

	// Streak tracking
	let streak = $state(0);
	let bestStreak = $state(0);

	// Milestone toasts
	interface MilestoneToast_ {
		id: number;
		message: string;
		emoji?: string;
		icon?: Component;
		iconColor?: string;
		onClick?: () => void;
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
			if (isRecord(parsed)) {
				const valid: Record<string, { attempts: number; correct: number }> = {};
				for (const [key, val] of Object.entries(parsed)) {
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
			if (isRecord(parsed) && 'book' in parsed && 'chapter' in parsed) {
				const obj = parsed;
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

	// Derived: whether adjectives are unlocked at the current level
	let adjectivesUnlocked = $derived(curriculum[currentLevel]?.adjectives_unlocked ?? false);

	// Derived: effective content mode (constrained by unlock state)
	let effectiveContentMode: ContentMode = $derived.by(() => {
		const mode = drillSettings.contentMode ?? 'both';
		if (!pronounsUnlocked) {
			if (mode === 'pronouns' || mode === 'both') return 'nouns';
		}
		return mode;
	});

	// Derived: effective word mode (constrained by unlock state)
	let effectiveWordMode: WordMode = $derived.by(() => {
		if (!adjectivesUnlocked) return 'nouns';
		return drillSettings.wordMode ?? 'nouns';
	});

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

	// Settings expanded state
	let settingsExpanded = $state(false);
	let caseFilterExpanded = $state(false);
	let showExitAssignmentConfirm = $state(false);
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

	import { initDarkMode } from '$lib/darkmode';

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

	// Assignment mode: load assignment data from URL param
	function isAssignmentResponse(v: unknown): v is AssignmentInfo {
		if (!isRecord(v)) return false;
		return (
			typeof v.title === 'string' &&
			typeof v.classId === 'string' &&
			Array.isArray(v.selectedCases) &&
			typeof v.targetQuestions === 'number'
		);
	}

	// Sync assignment mode from URL. Only subscribes to page.url — reads
	// assignmentId via untrack() so internal state changes (startAssignment,
	// exitAssignmentMode) don't cause the effect to re-run and fight with them.
	$effect(() => {
		const paramId = page.url.searchParams.get('assignment');
		const currentId = untrack(() => assignmentId);
		if (paramId && paramId !== currentId) {
			assignmentId = paramId;
			assignmentLoading = true;
			fetch(`/api/assignment-progress?assignmentId=${paramId}`)
				.then((res) => {
					if (res.status === 401) {
						const returnTo = `/?assignment=${paramId}`;
						// eslint-disable-next-line svelte/no-navigation-without-resolve -- constructed auth URL with encoded returnTo
						goto(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
						return null;
					}
					if (!res.ok) throw new Error('Failed to load assignment');
					return res.json();
				})
				.then((data: unknown) => {
					if (data === null) return;
					if (isAssignmentResponse(data)) {
						const assignmentCases = data.selectedCases.filter(isCaseValue);
						if (assignmentCases.length === 0) {
							assignmentId = null;
							assignmentInfo = null;
							assignmentError =
								'Assignment is malformed — no cases selected. Contact your teacher.';
							clearAssignmentErrorAfterDelay();
							if (!question) {
								generateNextQuestion();
							}
							return;
						}
						assignmentInfo = data;
						const fetchedWordMode: WordMode =
							data.contentMode === 'adjectives'
								? 'adjectives'
								: data.contentMode === 'all' || data.includeAdjectives === true
									? 'both'
									: 'nouns';
						const fetchedContentMode: ContentMode =
							data.contentMode === 'nouns' ||
							data.contentMode === 'pronouns' ||
							data.contentMode === 'both'
								? data.contentMode
								: data.contentMode === 'adjectives'
									? 'nouns'
									: 'both';
						drillSettings = {
							selectedCases: assignmentCases,
							selectedDrillTypes: data.selectedDrillTypes.filter(isDrillType),
							numberMode: data.numberMode,
							contentMode: fetchedContentMode,
							wordMode: fetchedWordMode
						};
						enabledCases = [...assignmentCases];
						selectedCase = 'all';
						chapterBook = null;
						chapterSelection = null;
						if (data.completedAt !== null && !suppressCompletionModal) {
							showCompletionModal = true;
						} else {
							if (!suppressCompletionModal) generateNextQuestion();
							suppressCompletionModal = false;
						}
						const isReviewMode = page.url.searchParams.get('mode') === 'review';
						showAppliedToast(data.title, isReviewMode);
					}
				})
				.catch(() => {
					assignmentId = null;
					assignmentInfo = null;
					if (!question) {
						generateNextQuestion();
					}
				})
				.finally(() => {
					assignmentLoading = false;
				});
		}
		if (!paramId && currentId) {
			assignmentId = null;
			assignmentInfo = null;
		}
	});

	// Activate assignment-specific mistake review from API data
	async function activateAssignmentMistakeReview(aId: string): Promise<boolean> {
		try {
			const res = await fetch(`/api/assignment-progress?assignmentId=${aId}`);
			if (!res.ok) return false;
			const data: unknown = await res.json();
			if (!isRecord(data) || !Array.isArray(data.mistakes)) return false;

			// Determine the assignment's drill types to generate matching questions
			const assignmentDrillTypes = Array.isArray(data.selectedDrillTypes)
				? data.selectedDrillTypes.filter((v: unknown): v is string => typeof v === 'string')
				: [];
			const needsTemplates =
				assignmentDrillTypes.includes('case_identification') ||
				assignmentDrillTypes.includes('sentence_fill_in');

			const wordBank = loadWordBank();
			const pronounBank = loadPronounBank();
			const templates = needsTemplates ? loadTemplates() : [];
			const generatedMistakes: DrillResult[] = [];
			const seen: Record<string, true> = {};
			for (const m of data.mistakes) {
				if (
					!isRecord(m) ||
					typeof m.word !== 'string' ||
					typeof m.case !== 'string' ||
					typeof m.number !== 'string'
				)
					continue;
				const key = `${m.word}|${m.case}|${m.number}`;
				if (seen[key]) continue;
				seen[key] = true;
				const targetCase = m.case;
				const targetNumber = m.number;
				if (!isCaseValue(targetCase) || (targetNumber !== 'sg' && targetNumber !== 'pl')) continue;
				const word = wordBank.find((w) => w.lemma === m.word);
				if (word) {
					// Pick a random drill type from the assignment's types
					const drillType =
						assignmentDrillTypes.length > 0
							? assignmentDrillTypes[Math.floor(Math.random() * assignmentDrillTypes.length)]
							: 'form_production';
					let q: DrillQuestion | null = null;
					if (drillType === 'case_identification' || drillType === 'sentence_fill_in') {
						const matching = templates.filter(
							(t) => t.requiredCase === targetCase && t.number === targetNumber
						);
						if (matching.length > 0) {
							const template = matching[Math.floor(Math.random() * matching.length)];
							q =
								drillType === 'case_identification'
									? generateCaseIdentification(template, word)
									: generateSentenceDrill(template, word);
						}
					}
					// Fall back to form production
					if (!q) q = generateFormProduction(word, targetCase, targetNumber);
					if (q)
						generatedMistakes.push({
							question: q,
							userAnswer: '',
							correct: false,
							nearMiss: false
						});
				} else {
					const pronoun = pronounBank.find((p) => p.lemma === m.word);
					if (pronoun) {
						const q = generatePronounFormProduction(pronoun, targetCase, targetNumber);
						if (q)
							generatedMistakes.push({
								question: q,
								userAnswer: '',
								correct: false,
								nearMiss: false
							});
					}
				}
			}
			if (generatedMistakes.length === 0) return false;
			mistakes = generatedMistakes;
			practicingMistakes = true;
			lastMistakeIndex = -1;
			chapterBook = null;
			chapterSelection = null;
			saveChapterToStorage();
			generateNextQuestion();
			return true;
		} catch {
			return false;
		}
	}

	// Activate stored-mistake review mode (reused by ?mode=review and the review button)
	function activateStoredMistakeReview(): boolean {
		const uniqueKeys = getUniqueMistakeKeys();
		if (uniqueKeys.length === 0) return false;
		const wordBank = loadWordBank();
		const pronounBank = loadPronounBank();
		const generatedMistakes: DrillResult[] = [];
		for (const mk of uniqueKeys) {
			const word = wordBank.find((w) => w.lemma === mk.lemma);
			if (word) {
				const q = generateFormProduction(word, mk.targetCase, mk.targetNumber);
				if (q) {
					generatedMistakes.push({
						question: q,
						userAnswer: '',
						correct: false,
						nearMiss: false
					});
				}
			} else {
				const pronoun = pronounBank.find((p) => p.lemma === mk.lemma);
				if (pronoun) {
					const q = generatePronounFormProduction(pronoun, mk.targetCase, mk.targetNumber);
					if (q) {
						generatedMistakes.push({
							question: q,
							userAnswer: '',
							correct: false,
							nearMiss: false
						});
					}
				}
			}
		}
		if (generatedMistakes.length > 0) {
			mistakes = generatedMistakes;
			practicingMistakes = true;
			lastMistakeIndex = -1;
			chapterBook = null;
			chapterSelection = null;
			saveChapterToStorage();
			return true;
		}
		return false;
	}

	// Initialize on mount and clean up timer on destroy
	$effect(() => {
		if (initialized) return;
		initialized = true;
		initDarkMode();
		warmUpVoices();
		void loadAudioIndex().then(() => {
			// Manifest arrival can flip TTS availability on browsers without Web Speech.
			ttsAvailable = isTTSAvailable();
		});
		ttsAvailable = isTTSAvailable();
		if (!ttsAvailable) {
			// Chrome loads voices async — listen for when Czech voice becomes available
			onCzechVoiceReady(() => {
				ttsAvailable = true;
			});
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
		const params = page.url.searchParams;

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
			const parsed: Case[] = casesParam.split(',').filter(isCaseValue);
			if (parsed.length > 0) {
				enabledCases = parsed;
				chapterBook = null;
				chapterSelection = null;
				saveChapterToStorage();
			}
		}

		// ?mode=review — auto-activate review mistakes mode
		// Suppress the completion modal so navigating here from the class
		// assignment page doesn't pop the celebration overlay.
		const modeParam = params.get('mode');
		if (modeParam === 'review') {
			suppressCompletionModal = true;
			const reviewAssignment = params.get('assignment');
			if (reviewAssignment) {
				void activateAssignmentMistakeReview(reviewAssignment);
			} else {
				activateStoredMistakeReview();
			}
		}

		// Hydrate progress from server-loaded Supabase data (available before mount)
		// Read once at init time; we don't want a reactive dependency on page.data here.
		const savedProgress = page.data.savedProgress;
		if (savedProgress) {
			if (isDifficulty(savedProgress.level)) {
				const serverProgress: Progress = {
					level: savedProgress.level,
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

		// Global leaderboard for all users (including anonymous)
		fetchGlobalLeaderboard();
		leaderboardRefreshTimer = setInterval(() => {
			fetchGlobalLeaderboard();
		}, 300_000);

		// Load today's session stats and student assignments if logged in
		if (user) {
			syncStashedAnonSession();
			loadTodaySession();
			loadStudentAssignments();
		}

		// Generate first question using hydrated progress.
		// If we're loading into assignment mode (?assignment=<id>) the effect
		// below will fetch the assignment config and generate the first
		// question with assignment-scoped settings. Skipping the initial
		// generation here prevents a Free-Practice-settings question from
		// flashing before the assignment fetch resolves (would leak the wrong
		// drill type or case set on cold navigation).
		const hasAssignmentParam = !!params.get('assignment');
		if (!hasAssignmentParam) {
			generateNextQuestion();
		}
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
								questionsCorrect: todayCorrect,
								caseScores: todayCaseScores
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
			if (leaderboardRefreshTimer) {
				clearInterval(leaderboardRefreshTimer);
			}
		};
	});

	// Re-evaluate matching assignment when settings or assignments change
	$effect(() => {
		void drillSettings;
		void studentAssignments;
		void assignmentId;
		if (initialized) {
			checkAssignmentMatchToast();
		}
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
		// multi_step is a noun-specific drill type (paradigm + case + form) — skip pronouns
		if (drillType === 'multi_step') return null;
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

	function generateAdjectiveQuestion(requestedDrillType?: DrillType): DrillQuestion | null {
		const prog = get(progress);
		const levelConfig = curriculum[prog.level];
		if (!levelConfig.adjectives_unlocked) return null;
		const unlockedDifficulties = levelConfig.unlocked_difficulty;

		// Get eligible adjectives
		const adjCandidates = getAdjectiveCandidates(unlockedDifficulties);
		if (adjCandidates.length === 0) return null;

		// Get eligible nouns to pair with
		const wordBank = loadWordBank();
		const eligibleWords = wordBank.filter((w) => unlockedDifficulties.includes(w.difficulty));
		if (eligibleWords.length === 0) return null;

		// Pick case
		const activeCases = selectedCase === 'all' ? effectiveEnabledCases : [selectedCase];

		// For form_production: pick a case/number directly and generate without a sentence template
		if (requestedDrillType === 'form_production') {
			const nonNomCases = activeCases.filter((c) => c !== 'nom');
			if (nonNomCases.length === 0) return null;
			const case_ = pickWeightedCase(nonNomCases);
			let number_: Number_;
			if (effectiveNumberMode === 'sg') number_ = 'sg';
			else if (effectiveNumberMode === 'pl') number_ = 'pl';
			else number_ = Math.random() < 0.5 ? 'sg' : 'pl';

			// Find a noun to pair the adjective with (determines gender key)
			const validWords = eligibleWords.filter((w) => hasValidForm(w, case_, number_));
			if (validWords.length === 0) return null;
			const word = weightedRandom(validWords, prog, case_, number_);
			const genderKey = getAdjectiveGenderKey(word);

			// Filter adjectives that have a valid form for this combination
			const validAdjs = adjCandidates.filter(
				(a) => getAdjectiveForm(a, genderKey, case_, number_) !== null
			);
			if (validAdjs.length === 0) return null;
			const adj = weightedRandomAdjective(validAdjs, prog, case_, number_, word);
			return generateAdjectiveFormProduction(adj, genderKey, case_, number_, word);
		}

		// For sentence_fill_in and case_identification: use sentence templates
		const templates = loadAdjectiveTemplates();
		const eligibleTemplates = templates.filter(
			(t) =>
				activeCases.includes(t.requiredCase) &&
				matchesNumberMode(t.number) &&
				unlockedDifficulties.includes(t.difficulty)
		);
		if (eligibleTemplates.length === 0) return null;

		const template = pickTemplate(eligibleTemplates);
		// Find a noun that matches template requirements
		let templateWords = eligibleWords.filter((w) =>
			hasValidForm(w, template.requiredCase, template.number)
		);
		if (template.requiredGender) {
			templateWords = templateWords.filter((w) => w.gender === template.requiredGender);
		}
		if (typeof template.requiredAnimate === 'boolean') {
			templateWords = templateWords.filter((w) => w.animate === template.requiredAnimate);
		}
		if (templateWords.length === 0) return null;

		const word = weightedRandom(templateWords, prog, template.requiredCase, template.number);
		const compatibleAdjs = filterAdjectivesByTemplate(adjCandidates, template);
		if (compatibleAdjs.length === 0) return null;
		const adj = weightedRandomAdjective(
			compatibleAdjs,
			prog,
			template.requiredCase,
			template.number,
			word
		);
		return generateAdjectiveSentenceDrill(template, adj, word);
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
		// Clear both question types before generating to prevent stacking
		question = null;
		multiStepQuestion = null;

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

		// Decide content type for this question
		const contentDecision = (() => {
			if (effectiveWordMode === 'adjectives') return 'adjective' as const;
			if (effectiveWordMode === 'both' && Math.random() < 0.3) return 'adjective' as const;
			if (effectiveContentMode === 'pronouns') return 'pronoun' as const;
			if (effectiveContentMode === 'nouns') return 'noun' as const;
			// 'both': ~30% pronoun, ~70% noun
			return Math.random() < 0.3 ? ('pronoun' as const) : ('noun' as const);
		})();

		if (contentDecision === 'pronoun') {
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
			// Fall through to noun generation if pronoun generation failed
		}

		// Adjective questions are handled in the main drill-type flow below:
		// - multi_step: creates a multi-step question with adjective step attached
		// - other types: generates an adjective sentence fill-in question
		// So we don't short-circuit here — we fall through to pickDrillType().

		const wordBank = loadWordBank();
		const prog = get(progress);

		// Determine difficulty filtering: assignment content_level overrides student level
		let effectiveLevel = prog.level;
		if (assignmentInfo?.contentLevel) {
			const cl = assignmentInfo.contentLevel;
			if (cl === 'A1' || cl === 'A2' || cl === 'B1') {
				effectiveLevel = cl;
			} else if (/^kzk[12]_\d{2}$/.test(cl)) {
				// Map KZK chapter to CEFR level
				const book = cl.startsWith('kzk1') ? 'kzk1' : 'kzk2';
				if (book === 'kzk2') {
					effectiveLevel = 'B1';
				} else {
					const chIdx = kzkChapters.kzk1.chapters.findIndex((ch) => ch.id === cl);
					effectiveLevel = chIdx >= 13 ? 'A2' : 'A1';
				}
			}
		}
		const levelConfig = curriculum[effectiveLevel];
		const unlockedDifficulties = levelConfig.unlocked_difficulty;

		// For KZK chapter assignments, prioritize chapter vocabulary
		const assignmentChapterId = assignmentInfo?.contentLevel ?? null;
		const isAssignmentChapterMode =
			assignmentChapterId !== null && /^kzk[12]_\d{2}$/.test(assignmentChapterId);
		let assignmentChapterLemmas: Set<string> | null = null;
		if (isAssignmentChapterMode) {
			const book = assignmentChapterId.startsWith('kzk1') ? 'kzk1' : 'kzk2';
			const chapter = kzkChapters[book].chapters.find((ch) => ch.id === assignmentChapterId);
			if (chapter) {
				assignmentChapterLemmas = new Set(chapter.coreLemmas.map((l) => l.toLowerCase()));
			}
		}

		// Filter eligible words — for chapter assignments, include all words from the chapter
		// regardless of difficulty (textbook may teach higher-level words early)
		const eligibleWords = wordBank.filter((w) => {
			if (assignmentChapterLemmas?.has(w.lemma.toLowerCase())) return true;
			return unlockedDifficulties.includes(w.difficulty);
		});

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

		// For adjective content with non-multi-step types, generate adjective drill
		// form_production and sentence_fill_in are both supported; case_identification
		// falls back to sentence_fill_in since adjective case ID is not yet implemented.
		if (contentDecision === 'adjective' && drillType !== 'multi_step') {
			const adjDrillType =
				drillType === 'form_production' || drillType === 'sentence_fill_in'
					? drillType
					: 'sentence_fill_in';
			const adjQ = generateAdjectiveQuestion(adjDrillType);
			if (adjQ) {
				question = adjQ;
				multiStepQuestion = null;
				lastResult = null;
				paradigmNotes = null;
				submitted = false;
				lastTemplateId = adjQ.template.id;
				if (advanceTimer !== null) {
					clearTimeout(advanceTimer);
					advanceTimer = null;
				}
				autoPlayPrompt(adjQ);
				return;
			}
			// Fall through to noun generation if adjective generation failed
		}

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
				// Prefer templates matching the weighted case pick to respect spaced repetition
				const caseMatchTemplates = msEligibleTemplates.filter((t) => t.requiredCase === case_);
				const template = pickTemplate(
					caseMatchTemplates.length > 0 ? caseMatchTemplates : msEligibleTemplates
				);
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
					candidates = [...diffFiltered, ...chapterExtras].filter((w) => !w.irregular);
				} else {
					candidates = getCandidates(template, prog)
						.filter((w) => hasValidForm(w, template.requiredCase, template.number))
						.filter((w) => !w.irregular);
				}
				if (candidates.length > 0) {
					const word = weightedRandom(candidates, prog, template.requiredCase, template.number);
					const showCaseStep = effectiveEnabledCases.length > 1;
					const msq = generateMultiStepQuestion(word, template, showCaseStep);
					if (msq) {
						// Attach an adjective step if content decision was adjective, or randomly based on word mode
						const wantAdj =
							contentDecision === 'adjective' ||
							effectiveWordMode === 'adjectives' ||
							(effectiveWordMode === 'both' && Math.random() < 0.5);
						if (wantAdj) {
							const levelConfig = curriculum[prog.level];
							if (levelConfig.adjectives_unlocked) {
								const adjCands = getAdjectiveCandidates(levelConfig.unlocked_difficulty);
								// Filter by semantic compatibility with the noun.
								// Czech grammatical animacy is only marked on masculine nouns, so
								// `word.animate` is false for feminine/neuter humans (matka, žena,
								// dítě). Use semantic categories instead to avoid pairing e.g.
								// "studená matka" or "jarní žena".
								const PERSON_CATEGORIES = ['people', 'family', 'profession', 'nationality'];
								const isPersonNoun = word.categories.some((c) => PERSON_CATEGORIES.includes(c));
								const compatAdjs = adjCands.filter((a) =>
									a.categories.some(
										(c) => c === 'universal' || (isPersonNoun ? c === 'person' : c === 'object')
									)
								);
								if (compatAdjs.length > 0) {
									const adj = weightedRandomAdjective(
										compatAdjs,
										prog,
										template.requiredCase,
										template.number,
										word
									);
									const genderKey = getAdjectiveGenderKey(word);
									const adjForm = getAdjectiveForm(
										adj,
										genderKey,
										template.requiredCase,
										template.number
									);
									if (adjForm) {
										msq.adjective = adj;
										msq.correctAdjectiveForm = adjForm;
										msq.acceptedAdjectiveForms = getAllAdjectiveAcceptedForms(
											adj,
											genderKey,
											template.requiredCase,
											template.number
										);
									}
								}
							}
						}
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
				if (assignmentChapterLemmas && validWords.length > 0) {
					// Bias 75% toward chapter vocabulary
					const chapterWords = validWords.filter((w) =>
						assignmentChapterLemmas!.has(w.lemma.toLowerCase())
					);
					const pool = chapterWords.length > 0 && Math.random() < 0.75 ? chapterWords : validWords;
					word = weightedRandom(pool, prog, fpCase, number_);
				} else {
					word = validWords.length > 0 ? weightedRandom(validWords, prog, fpCase, number_) : null;
				}
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
		// Pronoun forms can hold slash-separated alternatives (e.g. "mě/mne").
		// The TTS manifest has each alternative as its own entry, so strip down
		// to the first before looking up — otherwise the literal "mě/mne" misses
		// the manifest and falls back to Web Speech saying "mě slash mne".
		const prep = (form.prep || '').split('/')[0];
		const bare = (form.bare || '').split('/')[0];
		return prep || bare || '';
	}

	function lookupParadigmNotes(paradigmId: string, word: WordEntry): Record<string, string> | null {
		if (word.irregular) return null;
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
					m.question.drillType === result.question.drillType &&
					(m.question.adjective?.lemma ?? null) === (result.question.adjective?.lemma ?? null)
			);
			if (!isReserved) {
				mistakes = [...mistakes, result];
			}

			// Persist mistake to localStorage for review later
			const lemma =
				result.question.wordCategory === 'adjective' && result.question.adjective
					? result.question.adjective.lemma
					: result.question.wordCategory === 'pronoun' && result.question.pronoun
						? result.question.pronoun.lemma
						: result.question.word.lemma;
			const translation =
				result.question.wordCategory === 'adjective' && result.question.adjective
					? result.question.adjective.translation
					: result.question.wordCategory === 'pronoun' && result.question.pronoun
						? result.question.pronoun.translation
						: result.question.word.translation;
			addMistake({
				lemma,
				translation,
				targetCase: result.question.case,
				targetNumber: result.question.number,
				userAnswer: result.userAnswer,
				correctAnswer: result.question.correctAnswer,
				drillType: result.question.drillType,
				sentence:
					result.question.drillType !== 'form_production'
						? result.question.template?.template
						: undefined
			});
		}
	}

	const TOTAL_MILESTONES = [10, 25, 50, 100];

	function addToast(
		message: string,
		emoji: string,
		options?: { icon?: Component; iconColor?: string; onClick?: () => void }
	): void {
		const id = toastIdCounter++;
		toasts = [
			...toasts,
			{
				id,
				message,
				emoji,
				icon: options?.icon,
				iconColor: options?.iconColor,
				onClick: options?.onClick
			}
		];
	}

	function removeToast(id: number): void {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function checkMilestones(result: DrillResult): void {
		const candidates: {
			message: string;
			icon: Component;
			iconColor: string;
			priority: number;
		}[] = [];

		// Streak milestones (only toast for 10+)
		if (result.correct && streak >= 10 && [10, 25, 50].includes(streak)) {
			const key = `streak_${streak}`;
			if (!celebratedMilestones.has(key)) {
				celebratedMilestones = new Set([...celebratedMilestones, key]);
				candidates.push({
					message: `${streak} in a row!`,
					icon: streak >= 25 ? Trophy : Flame,
					iconColor: streak >= 25 ? 'text-amber-500' : 'text-orange-500',
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
							icon: milestone >= 50 ? Star : Target,
							iconColor: milestone >= 50 ? 'text-amber-500' : 'text-blue-500',
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
							icon: Brain,
							iconColor: 'text-violet-500',
							priority: 5
						});
					}
				}
			}
		}

		// Pick the most impressive milestone
		if (candidates.length > 0) {
			candidates.sort((a, b) => b.priority - a.priority);
			addToast(candidates[0].message, '', {
				icon: candidates[0].icon,
				iconColor: candidates[0].iconColor
			});
		}

		// Check achievement badges
		checkAchievementBadges(result.correct);
	}

	function checkAchievementBadges(wasCorrect: boolean): void {
		recordPracticeDay();
		const badgeContext: BadgeCheckContext = {
			wasCorrect,
			streak,
			sessionQuestionCount: sessionCorrect + sessionWrong,
			now: new Date()
		};
		const newBadges = checkAndAwardBadges(badgeContext);
		for (const badge of newBadges) {
			addToast(`${badge.name} — Achievement unlocked!`, '', {
				icon: BADGE_ICONS[badge.id],
				iconColor: BADGE_COLORS[badge.id] ?? 'text-amber-500',
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() is used inside the template literal
				onClick: () => goto(`${resolve('/profile')}?tab=achievements`)
			});
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
			recordSessionActivity(false, question?.case);
			recordAssignmentProgress(false, question?.case, question?.number);
			checkAssignmentMatchToast();
			posthog.capture('question_answered', {
				correct: false,
				drillType: question?.drillType,
				case: question?.case,
				level: currentLevel,
				skipped: true
			});
			streak = 0;
			if (question.wordCategory === 'adjective') {
				paradigmNotes = null;
			} else if (question.wordCategory === 'pronoun' && question.pronoun) {
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
						m.question.drillType === lastResult!.question.drillType &&
						(m.question.adjective?.lemma ?? null) ===
							(lastResult!.question.adjective?.lemma ?? null)
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
		recordSessionActivity(result.correct, result.question.case);
		if (!result.correct && assignmentId) {
			const q = result.question;
			const lemma =
				q.wordCategory === 'adjective' && q.adjective
					? q.adjective.lemma
					: q.wordCategory === 'pronoun' && q.pronoun
						? q.pronoun.lemma
						: q.word.lemma;
			let sentence: string | undefined;
			let prompt: string | undefined;
			if (
				q.template &&
				q.template.id !== '_form_production' &&
				q.template.id !== '_pronoun_form_production' &&
				q.template.id !== '_adj_form_production'
			) {
				const form = q.word.forms[q.number][CASE_INDEX[q.case]];
				const voiced = applyPrepositionVoicing(q.template.template, form);
				if (q.drillType === 'case_identification') {
					sentence = voiced.replace('___', `[${form}]`);
					prompt = `Identify the case: ${sentence}`;
				} else if (q.drillType === 'sentence_fill_in') {
					sentence = voiced.replace('___', form);
					prompt = `Fill in [${lemma}]: ${voiced}`;
				} else {
					sentence = voiced.replace('___', form);
				}
			}
			if (!prompt) {
				prompt = `Decline "${lemma}" \u2192 ${CASE_LABELS[q.case]} ${q.number === 'sg' ? 'Sg' : 'Pl'}`;
			}
			collectAssignmentMistake(
				lemma,
				q.correctAnswer,
				result.userAnswer,
				q.case,
				q.number,
				sentence,
				q.drillType,
				prompt
			);
		}
		recordAssignmentProgress(result.correct, result.question.case, result.question.number);
		updateLeaderboardAfterAnswer(result.correct);
		checkAssignmentMatchToast();
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
		if (question.wordCategory === 'adjective') {
			paradigmNotes = null;
		} else if (question.wordCategory === 'pronoun' && question.pronoun) {
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
		const adjectiveOk =
			result.adjectiveCorrect === null ||
			result.adjectiveCorrect === undefined ||
			result.adjectiveCorrect;
		const allCorrect =
			result.paradigmCorrect &&
			(result.caseCorrect === null || result.caseCorrect) &&
			result.formCorrect &&
			adjectiveOk;

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
			// Persist multi-step mistake for review later
			addMistake({
				lemma: result.question.word.lemma,
				translation: result.question.word.translation,
				targetCase: result.question.case,
				targetNumber: result.question.number,
				userAnswer: result.userForm,
				correctAnswer: result.question.correctForm,
				drillType: 'multi_step',
				sentence: result.question.template?.template,
				userParadigm: result.userParadigm,
				correctParadigm: result.question.correctParadigm
			});
		}

		if (chapterSelection) recordChapterResult(chapterSelection, allCorrect);
		recordSessionActivity(allCorrect, result.question.case);
		if (!allCorrect && assignmentId) {
			let msSentence: string | undefined;
			let msPrompt: string | undefined;
			if (result.question.template) {
				const form = result.question.correctForm;
				const voiced = applyPrepositionVoicing(result.question.template.template, form);
				msSentence = voiced.replace('___', `[${form}]`);
				msPrompt = `Full analysis [${result.question.word.lemma}]: ${voiced}`;
			}
			const msMistake: AssignmentMistake = {
				word: result.question.word.lemma,
				expectedForm: result.question.correctForm,
				givenAnswer: result.userForm,
				case: result.question.case,
				number: result.question.number,
				drillType: 'multi_step',
				correctParadigm: result.question.correctParadigm,
				userParadigm: result.userParadigm,
				correctCase: result.question.correctCase,
				userCase: result.userCase,
				paradigmCorrect: result.paradigmCorrect,
				caseCorrect: result.caseCorrect,
				formCorrect: result.formCorrect,
				adjectiveCorrect: result.adjectiveCorrect,
				correctAdjectiveForm: result.question.correctAdjectiveForm,
				userAdjectiveForm: result.userAdjectiveForm,
				...(msSentence ? { sentence: msSentence } : {}),
				...(msPrompt ? { prompt: msPrompt } : {})
			};
			assignmentMistakes = [...assignmentMistakes, msMistake].slice(-20);
		}
		recordAssignmentProgress(allCorrect, result.question.case, result.question.number);
		updateLeaderboardAfterAnswer(allCorrect);
		checkAssignmentMatchToast();
		posthog.capture('question_answered', {
			correct: allCorrect,
			drillType: 'multi_step',
			case: result.question.case,
			level: currentLevel,
			paradigmCorrect: result.paradigmCorrect,
			caseCorrect: result.caseCorrect,
			formCorrect: result.formCorrect,
			adjectiveCorrect: result.adjectiveCorrect
		});
		if (sessionCount === 10) {
			posthog.capture('ten_questions_completed', { level: currentLevel });
		}

		checkAchievementBadges(allCorrect);

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
		wordMode?: WordMode;
	}): void {
		drillSettings = { ...drillSettings, selectedCases: ALL_CASES, ...settings };
		saveSettingsToStorage(drillSettings);
		generateNextQuestion();
	}

	function handleCaseSelect(selected: Case | 'all'): void {
		if (assignmentInfo) {
			showExitAssignmentConfirm = true;
			return;
		}
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
		params.delete('mode');

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
		// Match what's shown in parens in the UI so audio and visual align.
		// For case_identification nouns, parens show the nominative in the
		// drill's number (e.g. "plody" for plural). For everything else we
		// show the dictionary lemma.
		if (q.wordCategory === 'pronoun') return q.pronoun?.lemma ?? '';
		if (q.wordCategory === 'adjective' && q.adjective) return q.adjective.lemma;
		if (q.drillType === 'case_identification') return q.word.forms[q.number][0];
		return q.word.lemma;
	}

	function autoPlayPrompt(q: DrillQuestion): void {
		if (!ttsAvailable || !autoplayAudio || !hasInteracted) return;
		// All drill types now surface the lemma visually, so autoplay never
		// spoils the question. Pronoun sentence_fill_in is the one exception
		// (the lemma isn't prominently displayed there), so we still skip it.
		if (q.drillType === 'sentence_fill_in' && q.wordCategory === 'pronoun') return;
		speak(questionPromptText(q));
	}

	function autoPlayAnswer(q: DrillQuestion): void {
		if (!ttsAvailable || !autoplayAudio || !hasInteracted) return;
		if (q.drillType === 'case_identification') {
			const form =
				q.wordCategory === 'pronoun'
					? getPronounFormForTTS(q)
					: q.word.forms[q.number][CASE_INDEX[q.case]];
			speak(form);
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
			const target = e.target;
			if (
				target instanceof HTMLElement &&
				!target.closest('[aria-haspopup="listbox"], [role="listbox"]')
			) {
				chapterPickerOpen = false;
			}
		}
	}}
/>

<svelte:head>
	<title>Czech Declension Practice & Noun Case Trainer — Skloňuj</title>
	<meta
		name="description"
		content="Interactive Czech declension drills synced to Krok za krokem & trusted by Ivy League professors. Master 7 cases, 12 paradigms & adjective-noun agreement."
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
		content="Interactive Czech declension drills synced to Krok za krokem & trusted by Ivy League professors. Master 7 cases, 12 paradigms & adjective-noun agreement."
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
		content="Interactive Czech declension drills synced to Krok za krokem & trusted by Ivy League professors. Master 7 cases, 12 paradigms & adjective-noun agreement."
	/>
	<meta name="twitter:image" content="https://sklonuj.com/og.png" />
	<script type="application/ld+json">
		{
			"@context": "https://schema.org",
			"@type": "WebApplication",
			"name": "Skloňuj",
			"url": "https://sklonuj.com",
			"description": "Interactive Czech declension drills synced to Krok za krokem and trusted by Ivy League professors. Master all 7 cases, 12 paradigms, and adjective-noun agreement with adaptive exercises.",
			"applicationCategory": "EducationalApplication",
			"operatingSystem": "Any",
			"offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
			"inLanguage": ["en", "cs"],
			"audience": { "@type": "EducationalAudience", "educationalRole": "student" }
		}
	</script>
</svelte:head>

<div class="flex flex-col">
	<NavBar {user} onSignIn={() => (authModalOpen = true)} isHomePage={true} />

	<main class="mx-auto w-full max-w-[867px] flex-1 px-3 py-4 sm:px-4 sm:py-8">
		<!-- Assignment error banner -->
		{#if assignmentError}
			<div
				class="mb-4 flex items-center justify-between rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
			>
				<span>{assignmentError}</span>
				<button
					type="button"
					onclick={() => (assignmentError = null)}
					class="ml-2 cursor-pointer text-red-500 hover:text-red-700"
				>
					&times;
				</button>
			</div>
		{/if}

		<!-- Student assignments panel -->
		{#if showAssignmentsPanel}
			<div
				class="mb-4 rounded-2xl border bg-card-bg {assignmentInfo
					? 'border-emphasis/40 ring-1 ring-emphasis/20'
					: 'border-card-stroke'}"
			>
				{#if assignmentInfo}
					{@const pct = Math.min(
						100,
						Math.round(
							(assignmentInfo.attempted / Math.max(1, assignmentInfo.targetQuestions)) * 100
						)
					)}
					{@const activeStudentAssignment = studentAssignments.find((a) => a.id === assignmentId)}
					{@const activeDueUrgency = activeStudentAssignment
						? getDueDateUrgency(activeStudentAssignment.dueDate, assignmentInfo.completedAt)
						: null}
					<div class="flex items-center gap-3 px-4 py-3">
						<button
							type="button"
							onclick={() => (assignmentsPanelExpanded = !assignmentsPanelExpanded)}
							class="flex min-w-0 flex-1 items-center gap-3"
							aria-expanded={assignmentsPanelExpanded}
						>
							<ListChecks class="size-4 shrink-0 text-emphasis" aria-hidden="true" />
							<div class="min-w-0 flex-1 text-left">
								<div class="flex flex-wrap items-center gap-2">
									<span class="truncate text-sm font-semibold text-text-default">
										{assignmentInfo.title}
									</span>
									{#if assignmentInfo.completedAt}
										<span
											class="shrink-0 rounded-full bg-positive-background px-1.5 py-0.5 text-[10px] font-medium text-positive-stroke"
										>
											Completed
										</span>
									{:else}
										<span
											class="shrink-0 rounded-full bg-emphasis/10 px-1.5 py-0.5 text-[10px] font-medium text-emphasis"
										>
											In progress
										</span>
									{/if}
									{#if activeDueUrgency && activeDueUrgency.urgency !== 'done'}
										<span
											class="shrink-0 text-[10px] font-semibold {activeDueUrgency.urgency ===
											'overdue'
												? 'text-negative-stroke'
												: activeDueUrgency.urgency === 'soon'
													? 'text-orange-500'
													: 'text-text-subtitle'}"
										>
											{activeDueUrgency.label}
										</span>
									{/if}
								</div>
								<div class="mt-1 flex items-center gap-2">
									<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-shaded-background">
										<div
											class="h-full rounded-full {assignmentInfo.completedAt
												? 'bg-positive-stroke'
												: 'bg-emphasis'} transition-all"
											style="width: {pct}%"
										></div>
									</div>
									<span class="shrink-0 text-xs tabular-nums text-text-subtitle">
										{Math.min(
											assignmentInfo.attempted,
											assignmentInfo.targetQuestions
										)}/{assignmentInfo.targetQuestions}
									</span>
								</div>
								<p class="mt-0.5 text-[10px] text-text-subtitle">
									Cases, drill types & settings are set by this assignment.
								</p>
							</div>
							<ChevronDown
								class="size-4 shrink-0 text-text-subtitle transition-transform duration-200 {assignmentsPanelExpanded
									? 'rotate-180'
									: ''}"
								aria-hidden="true"
							/>
						</button>
						<button
							type="button"
							onclick={() => exitAssignmentMode()}
							class="shrink-0 rounded-lg border border-card-stroke px-2.5 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							Exit
						</button>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (assignmentsPanelExpanded = !assignmentsPanelExpanded)}
						class="flex w-full items-center justify-between gap-3 px-4 py-3"
						aria-expanded={assignmentsPanelExpanded}
					>
						<div class="flex items-center gap-2">
							<ListChecks class="size-4 text-emphasis" aria-hidden="true" />
							<span class="text-sm font-semibold text-text-default">Your Assignments</span>
							{#if pendingAssignments.length > 0}
								<span
									class="flex size-[18px] items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold leading-none text-white"
								>
									{pendingAssignments.length > 9 ? '9+' : pendingAssignments.length}
								</span>
							{/if}
						</div>
						<ChevronDown
							class="size-4 shrink-0 text-text-subtitle transition-transform duration-200 {assignmentsPanelExpanded
								? 'rotate-180'
								: ''}"
							aria-hidden="true"
						/>
					</button>
				{/if}
				{#if assignmentsPanelExpanded}
					<div transition:slide={{ duration: 200 }} class="flex flex-col gap-2 px-4 pb-3">
						{#each pendingAssignments as assignment (assignment.id)}
							{@const urgency = getDueDateUrgency(assignment.dueDate, assignment.completedAt)}
							{@const progressPct =
								assignment.targetQuestions > 0
									? Math.min(
											100,
											Math.round((assignment.attempted / assignment.targetQuestions) * 100)
										)
									: 0}
							{@const isCompleted = assignment.completedAt !== null}
							{@const isActive = assignmentId === assignment.id}
							<div
								class="rounded-xl border px-3 py-2.5 transition-colors {isActive
									? 'border-emphasis bg-emphasis/5 ring-1 ring-emphasis/20'
									: urgency.urgency === 'overdue'
										? 'border-negative-stroke bg-negative-background'
										: 'border-card-stroke bg-shaded-background/50'}"
							>
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-1.5">
											<span class="truncate text-sm font-medium text-text-default">
												{assignment.title}
											</span>
										</div>
										<div class="mt-0.5 flex items-center gap-2 text-xs text-text-subtitle">
											<span
												class="truncate rounded-full border px-2 py-0.5 {urgency.urgency ===
												'overdue'
													? 'border-negative-stroke/30 bg-negative-stroke/15'
													: 'border-card-stroke bg-card-bg'}">{assignment.className}</span
											>
											<span
												class="shrink-0 font-medium {urgency.urgency === 'overdue'
													? 'text-negative-stroke'
													: urgency.urgency === 'soon'
														? 'text-orange-500'
														: urgency.urgency === 'done'
															? 'text-positive-stroke'
															: 'text-text-subtitle'}"
											>
												{urgency.label}
											</span>
											{#if isActive}
												<span
													class="shrink-0 rounded-full bg-emphasis px-1.5 py-0.5 text-xs font-medium text-text-inverted"
												>
													Practicing
												</span>
											{/if}
										</div>
									</div>
									<div class="shrink-0">
										{#if isActive}
											<button
												type="button"
												onclick={() => exitAssignmentMode()}
												class="rounded-lg border border-card-stroke px-2.5 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
											>
												Exit
											</button>
										{:else if isCompleted}
											<span
												class="inline-flex items-center gap-1 rounded-lg bg-positive-background px-2.5 py-1.5 text-xs font-medium text-positive-stroke"
											>
												Completed
											</span>
										{:else if assignment.attempted > 0}
											<button
												type="button"
												onclick={() => startAssignment(assignment)}
												class="rounded-lg bg-emphasis px-2.5 py-1.5 text-xs font-medium text-text-inverted transition-opacity hover:opacity-90"
											>
												Continue
											</button>
										{:else}
											<button
												type="button"
												onclick={() => startAssignment(assignment)}
												class="rounded-lg bg-emphasis px-2.5 py-1.5 text-xs font-medium text-text-inverted transition-opacity hover:opacity-90"
											>
												Start
											</button>
										{/if}
									</div>
								</div>
								{#if !isCompleted}
									<div class="mt-2 flex items-center gap-2">
										<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-card-bg">
											<div
												class="h-full rounded-full bg-emphasis transition-all"
												style="width: {progressPct}%"
											></div>
										</div>
										<span class="text-xs tabular-nums text-text-subtitle">
											{Math.min(
												assignment.attempted,
												assignment.targetQuestions
											)}/{assignment.targetQuestions}
										</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if assignmentLoading}
			<div class="mb-4 rounded-2xl border border-card-stroke bg-card-bg p-4 text-center">
				<span class="text-sm text-text-subtitle">Loading assignment...</span>
			</div>
		{/if}

		<!-- Mode selector + Level (level only in Free Practice) -->
		<div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3" data-tour="mode-selector">
			<ChapterSelector selectedBook={chapterBook} onModeChange={handleModeChange} />
			{#if chapterBook === null}
				<div class="flex items-center gap-2">
					<span class="text-xs font-semibold uppercase tracking-[0.15em] text-darker-subtitle"
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

		<!-- Global leaderboard banner -->
		{#if showGlobalLeaderboard}
			<div class="mb-3">
				<LeaderboardBanner
					mode="global"
					leaderboard={mergedGlobalLeaderboard}
					totalStudents={globalLeaderboardTotal}
					pointsDelta={globalLeaderboardPointsDelta}
					currentUserId={user?.id ?? ANON_USER_ID}
					showOnLeaderboard={globalShowOnLeaderboard}
					onToggleVisibility={handleGlobalLeaderboardToggle}
					isAnonymous={user === null}
					onSignUp={() => {
						stashAnonSession();
						authModalOpen = true;
					}}
				/>
			</div>
		{/if}

		<!-- Toolbar: filter cases / chapter stepper (KzK) + mistakes + mute + settings -->
		<div class="relative z-30 mb-2 grid min-h-[44px] grid-cols-[1fr_auto_1fr] items-center gap-3">
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
								<ChevronLeft class="h-4 w-4" aria-hidden="true" />
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
									<ChevronDown
										class="h-3.5 w-3.5 shrink-0 text-text-subtitle transition-transform duration-200 {chapterPickerOpen
											? 'rotate-180'
											: ''}"
										aria-hidden="true"
									/>
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
								<ChevronRight class="size-4" aria-hidden="true" />
							</button>
						</div>
					{/if}
				{/if}
				{#if chapterBook === null && selectedCase === 'all'}
					<button
						onclick={() => {
							if (assignmentInfo) {
								showExitAssignmentConfirm = true;
								return;
							}
							caseFilterExpanded = !caseFilterExpanded;
							if (caseFilterExpanded) settingsExpanded = false;
						}}
						class="inline-flex min-h-[44px] items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-darker-subtitle transition-colors hover:text-text-default"
					>
						Filter cases
						{#if enabledCases.length < ALL_CASES.length}
							<span class="text-emphasis">({enabledCases.length}/{ALL_CASES.length})</span>
						{/if}
						<ChevronDown
							class="h-3 w-3 transition-transform duration-200 {caseFilterExpanded
								? 'rotate-180'
								: ''}"
							aria-hidden="true"
						/>
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
						class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors
							{practicingMistakes
							? 'border-negative-stroke bg-negative-background text-negative-stroke'
							: 'border-negative-stroke/30 bg-card-bg text-negative-stroke hover:border-negative-stroke hover:bg-negative-background'}"
					>
						<RefreshCcw class="size-3.5" aria-hidden="true" />
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
						class="flex size-11 items-center justify-center rounded-full text-darker-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
						aria-label="Toggle audio autoplay"
					>
						{#if autoplayAudio}
							<Volume2 class="size-4" aria-hidden="true" />
						{:else}
							<VolumeX class="size-4" aria-hidden="true" />
						{/if}
					</button>
				{/if}
				<button
					type="button"
					onclick={() => {
						if (assignmentInfo) {
							showExitAssignmentConfirm = true;
							return;
						}
						settingsExpanded = !settingsExpanded;
						if (settingsExpanded) caseFilterExpanded = false;
					}}
					class="flex size-11 items-center justify-center rounded-full text-darker-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
					aria-label="Exercise settings"
					data-tour="settings"
				>
					<Settings class="size-4" aria-hidden="true" />
				</button>
			</div>
		</div>

		<!-- Expandable case filter (inline, pushes content down) -->
		{#if chapterBook === null && caseFilterExpanded && !assignmentInfo}
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
		{#if settingsExpanded && !assignmentInfo}
			<div
				transition:slide={{ duration: 200 }}
				class="flex flex-wrap items-start gap-x-4 gap-y-3 rounded-2xl border border-card-stroke bg-card-bg px-3 py-3 sm:gap-x-6 sm:px-5 sm:py-4"
			>
				<DrillSettings_
					selectedDrillTypes={drillSettings.selectedDrillTypes}
					numberMode={effectiveNumberMode}
					contentMode={drillSettings.contentMode ?? 'nouns'}
					wordMode={drillSettings.wordMode ?? 'nouns'}
					{pronounsUnlocked}
					{adjectivesUnlocked}
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
							Save progress across devices &middot; smart weak-spot drilling &middot; track accuracy
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
						<X class="size-4" aria-hidden="true" />
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
					selectedCases={assignmentInfo ? effectiveEnabledCases : ALL_CASES}
					{paradigmNotes}
					onWordClick={handleWordClick}
					{streak}
					soundEnabled={autoplayAudio}
				/>
			{/if}
		</div>

		<!-- Session stats -->
		{#if sessionCount > 0}
			<div class="mt-6 text-center text-xs text-darker-subtitle">
				{Math.round($displayTotal)} completed &middot; {Math.round($displayPct)}% accuracy
			</div>
		{/if}

		<!-- Milestone toasts -->
		{#each toasts as toast, i (toast.id)}
			<MilestoneToast
				message={toast.message}
				emoji={toast.emoji}
				icon={toast.icon}
				iconColor={toast.iconColor}
				index={i}
				onClick={toast.onClick}
				onDismiss={() => removeToast(toast.id)}
			/>
		{/each}

		<!-- SEO description (always server-rendered for indexing) -->
		<p class="mx-auto mt-10 max-w-lg text-center text-xs leading-relaxed text-darker-subtitle/70">
			Practice Czech noun declension across all 7 cases. Skloňuj offers interactive drills that
			adapt to your level, from A1 beginner to B2 intermediate, with smart tracking that focuses on
			the paradigms and patterns you get wrong most. Follow along with Krok za krokem textbook
			chapters or practice freely.
		</p>
	</main>

	<!-- Reference sidebar with attached handle -->
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
			<NotebookText class="size-5" aria-hidden="true" />
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
</div>

{#if showOnboarding}
	<GuidedTour steps={practiceOnboardingSteps} onComplete={dismissOnboarding} />
{/if}

<!-- Assignment applied confirmation toast -->
{#if appliedToastName}
	<div
		class="fixed left-0 right-0 top-28 z-40 flex items-center justify-center px-3 sm:top-32"
		role="status"
		in:fly={{ y: -20, duration: 250 }}
		out:fade={{ duration: 200 }}
	>
		<div class="rounded-xl bg-emphasis px-5 py-2.5 shadow-lg">
			<p class="text-sm font-medium text-text-inverted">
				{appliedToastReview ? 'Now reviewing mistakes for' : 'Now practicing'}
				<span class="font-semibold">{appliedToastName}</span>
			</p>
		</div>
	</div>
{/if}

<!-- Assignment match suggestion toast -->
{#if assignmentToastMatch && !appliedToastName}
	<div
		class="fixed left-0 right-0 top-28 z-50 flex items-center justify-center px-3 sm:top-32"
		role="alert"
		in:fly={{ y: -20, duration: 300 }}
		out:fly={{ y: -20, duration: 200 }}
	>
		<div
			class="w-full max-w-sm rounded-xl border-2 border-orange-400 bg-card-bg p-4 shadow-xl dark:border-orange-500"
		>
			<p class="text-sm font-medium text-text-default">You have an assignment that matches!</p>
			<p class="mt-1 text-sm text-text-default">
				Switch to <span class="font-semibold">{assignmentToastMatch.title}</span> to track your progress?
			</p>
			<div class="mt-3 flex items-center gap-2">
				<button
					type="button"
					onclick={applyAssignmentFromToast}
					class="rounded-lg bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
				>
					Yes, switch
				</button>
				<button
					type="button"
					onclick={dismissAssignmentToast}
					class="rounded-lg border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
				>
					No thanks
				</button>
			</div>
		</div>
	</div>
{/if}

<AuthModal
	open={authModalOpen}
	onClose={() => (authModalOpen = false)}
	initialMode={authModalInitialMode}
/>

{#if showExitAssignmentConfirm && assignmentInfo}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
		>
			<h2 class="text-lg font-semibold text-text-default">Exit {assignmentInfo.title}?</h2>
			<p class="mt-2 text-sm text-text-subtitle">
				Changing settings will exit assignment mode. Your progress is saved.
			</p>
			<div class="mt-5 flex gap-3">
				<button
					type="button"
					onclick={() => {
						showExitAssignmentConfirm = false;
						exitAssignmentMode();
						drillSettings = loadSettingsFromStorage();
						settingsExpanded = true;
					}}
					class="flex-1 cursor-pointer rounded-xl border border-card-stroke px-4 py-2.5 text-sm font-medium text-text-subtitle transition-colors hover:text-text-default"
				>
					Exit
				</button>
				<button
					type="button"
					onclick={() => (showExitAssignmentConfirm = false)}
					class="flex-1 cursor-pointer rounded-xl bg-emphasis px-4 py-2.5 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
				>
					Stay
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showCompletionModal && assignmentInfo}
	{@const accuracyPct =
		assignmentInfo.attempted > 0
			? Math.round((assignmentInfo.correct / assignmentInfo.attempted) * 100)
			: 0}

	<Confetti />
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
		transition:fade={{ duration: 200 }}
	>
		<div
			class="completion-modal-enter relative mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
		>
			<button
				type="button"
				onclick={() => {
					showCompletionModal = false;
					mistakesExpanded = false;
				}}
				class="absolute right-3 top-3 flex size-8 cursor-pointer items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
				aria-label="Close"
			>
				<X class="size-4" aria-hidden="true" />
			</button>
			<div class="mb-4 text-center">
				<div
					class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full {accuracyPct >=
					70
						? 'bg-positive-background'
						: 'bg-warning-background'}"
				>
					{#if accuracyPct >= 90}
						<Star class="size-7 text-positive-stroke" fill="currentColor" aria-hidden="true" />
					{:else if accuracyPct >= 70}
						<BadgeCheck class="size-7 text-positive-stroke" aria-hidden="true" />
					{:else}
						<ArrowUpCircle class="size-7 text-warning-text" aria-hidden="true" />
					{/if}
				</div>
				<h2 class="text-lg font-semibold text-text-default">
					{accuracyPct >= 90 ? 'Excellent Work!' : 'Assignment Complete!'}
				</h2>
				<p class="mt-2 text-sm text-text-subtitle">
					You finished <span class="font-medium text-text-default">{assignmentInfo.title}</span>
				</p>
				<p class="mt-1 text-xs text-text-subtitle">
					{accuracyPct >= 90
						? 'Outstanding accuracy — keep it up!'
						: accuracyPct >= 70
							? 'Great job — solid performance!'
							: 'Good effort — review your weak cases to improve!'}
				</p>
			</div>
			<div class="mb-4 grid grid-cols-2 gap-3">
				<div class="rounded-xl bg-shaded-background p-3 text-center">
					<p class="text-2xl font-bold text-emphasis">{accuracyPct}%</p>
					<p class="text-xs text-text-subtitle">Accuracy</p>
				</div>
				<div class="rounded-xl bg-shaded-background p-3 text-center">
					<p class="text-2xl font-bold text-text-default">
						{assignmentInfo.correct}/{assignmentInfo.targetQuestions}
					</p>
					<p class="text-xs text-text-subtitle">Correct</p>
				</div>
			</div>
			{#if assignmentMistakes.length > 0}
				{@const displayMistakes = assignmentMistakes.slice(0, 5)}
				{@const hasMore = assignmentMistakes.length > 5}
				<div class="mb-4">
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-lg bg-shaded-background px-3 py-2 text-sm text-text-subtitle transition-colors hover:bg-shaded-background/80"
						onclick={() => (mistakesExpanded = !mistakesExpanded)}
					>
						<span>You missed {assignmentMistakes.length}</span>
						<ChevronDown
							class="size-4 transition-transform {mistakesExpanded ? 'rotate-180' : ''}"
							aria-hidden="true"
						/>
					</button>
					{#if mistakesExpanded}
						<div class="mt-2 space-y-1.5">
							{#each displayMistakes as mistake (mistake.word + mistake.expectedForm + mistake.case)}
								{@const isMultiStep = mistake.drillType === 'multi_step'}
								<div
									class="rounded-lg border border-card-stroke bg-shaded-background/50 px-3 py-2 text-xs"
								>
									{#if mistake.prompt}
										<p class="mb-1.5 text-[15px] font-medium text-text-default">{mistake.prompt}</p>
									{:else if mistake.sentence}
										<p class="mb-1 text-text-subtitle italic">{mistake.sentence}</p>
									{/if}
									{#if isMultiStep}
										{#if !mistake.prompt}
											<p class="font-medium text-text-default">
												{mistake.word} &rarr;
												<span class="text-positive-stroke">{mistake.expectedForm}</span>
											</p>
										{/if}
										<div class="mt-1 space-y-0.5">
											{#if mistake.paradigmCorrect === false}
												<p>
													<span class="text-text-subtitle">Paradigm: you said</span>
													<span class="text-negative-stroke">{mistake.userParadigm}</span>
													<span class="text-text-subtitle">· correct:</span>
													<span class="text-positive-stroke">{mistake.correctParadigm}</span>
												</p>
											{/if}
											{#if mistake.caseCorrect === false}
												<p>
													<span class="text-text-subtitle">Case: you said</span>
													<span class="text-negative-stroke">{mistake.userCase ?? '—'}</span>
													<span class="text-text-subtitle">· correct:</span>
													<span class="text-positive-stroke">{mistake.correctCase ?? ''}</span>
												</p>
											{/if}
											{#if mistake.formCorrect === false}
												<p>
													<span class="text-text-subtitle">Form: you said</span>
													<span class="text-negative-stroke">{mistake.givenAnswer}</span>
													<span class="text-text-subtitle">· correct:</span>
													<span class="text-positive-stroke">{mistake.expectedForm}</span>
												</p>
											{/if}
										</div>
									{:else if mistake.prompt}
										<p class="text-text-subtitle">
											correct: <span class="text-positive-stroke">{mistake.expectedForm}</span>
											· your answer: <span class="text-negative-stroke">{mistake.givenAnswer}</span>
										</p>
									{:else}
										<div class="flex items-baseline justify-between gap-2">
											<span class="font-medium text-text-default"
												>{mistake.word} &rarr; {mistake.expectedForm}</span
											>
											<span class="shrink-0 text-text-subtitle"
												>{mistake.case} {mistake.number}</span
											>
										</div>
										<p class="mt-0.5 text-text-subtitle">
											your answer: <span class="text-negative-stroke">{mistake.givenAnswer}</span>
										</p>
									{/if}
								</div>
							{/each}
							{#if hasMore}
								<a
									href={resolve(`/classes/${assignmentInfo.classId}/assignments/${assignmentId}`)}
									class="block pt-1 text-center text-xs text-emphasis hover:underline"
								>
									See all {assignmentMistakes.length} on assignment page
								</a>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
			<button
				type="button"
				onclick={() => {
					// Preserve current assignment drill settings so the user keeps
					// practicing with the same filters after exiting assignment mode
					const preservedSettings = { ...drillSettings };
					const preservedCases = [...enabledCases];

					showCompletionModal = false;
					mistakesExpanded = false;
					// Suppress the "matches your settings" toast for this assignment
					if (assignmentId) dismissedAssignmentToasts.add(assignmentId);
					assignmentToastMatch = null;
					assignmentId = null;
					assignmentInfo = null;
					// Clean URL
					const cleanUrl = new URL(page.url);
					cleanUrl.searchParams.delete('assignment');
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- using constructed URL path
					replaceState(cleanUrl.pathname + cleanUrl.search, {});
					// Retain assignment filters instead of restoring from localStorage
					drillSettings = preservedSettings;
					enabledCases = preservedCases;
					generateNextQuestion();
				}}
				class="block w-full cursor-pointer rounded-xl bg-emphasis px-4 py-2.5 text-center text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
			>
				Done
			</button>
			<button
				type="button"
				onclick={() => {
					const aId = assignmentId;
					showCompletionModal = false;
					suppressCompletionModal = true;
					mistakesExpanded = false;
					if (aId) {
						dismissedAssignmentToasts.add(aId);
					}
					assignmentToastMatch = null;
					// Clear URL FIRST to prevent the URL $effect from re-fetching and
					// showing the completion modal again for a completed assignment
					const cleanUrl = new URL(page.url);
					cleanUrl.searchParams.delete('assignment');
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- using constructed URL path
					replaceState(cleanUrl.pathname + cleanUrl.search, {});
					assignmentId = null;
					assignmentInfo = null;
					assignmentMistakes = [];
					if (aId) {
						void activateAssignmentMistakeReview(aId);
					}
				}}
				class="mt-2 block w-full cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-center text-sm text-text-subtitle transition-colors hover:text-text-default"
			>
				Review Mistakes
			</button>
		</div>
	</div>
{/if}

<style>
	.completion-modal-enter {
		animation: modal-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
	}

	@keyframes modal-pop {
		0% {
			opacity: 0;
			transform: scale(0.8) translateY(10px);
		}
		100% {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
</style>
