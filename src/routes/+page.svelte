<script lang="ts">
	import { resolve } from '$app/paths';
	import { slide } from 'svelte/transition';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
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
	import { DIFFICULTY_META } from '$lib/constants';
	import {
		loadWordBank,
		loadTemplates,
		generateFormProduction,
		generateCaseIdentification,
		generateSentenceDrill,
		getCandidates,
		checkAnswer,
		weightedRandom,
		hasValidForm,
		applyPrepositionVoicing
	} from '$lib/engine/drill';
	import {
		progress,
		recordResult,
		setLevel,
		getAllCaseStrengths,
		getCombinedCaseStrength,
		pickWeightedCase
	} from '$lib/engine/progress';
	import {
		speak,
		isTTSAvailable,
		warmUpVoices,
		playCorrectSound,
		playStreakSound
	} from '$lib/audio';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import paradigmsData from '$lib/data/paradigms.json';
	import curriculumData from '$lib/data/curriculum.json';

	import CasePillBar from '$lib/components/CasePillBar.svelte';
	import DrillSettings_ from '$lib/components/DrillSettings.svelte';
	import DrillCard from '$lib/components/DrillCard.svelte';
	import ReferenceSidebar from '$lib/components/ReferenceSidebar.svelte';
	import DeclensionTable from '$lib/components/DeclensionTable.svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import MilestoneToast from '$lib/components/ui/MilestoneToast.svelte';
	import AuthModal from '$lib/components/ui/AuthModal.svelte';

	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	let user = $derived($page.data.user);

	// Debounced sync to Supabase
	let syncTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleSyncToSupabase(): void {
		if (!user) return;
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = setTimeout(() => {
			const current = get(progress);
			const supabase = getSupabaseBrowserClient();
			supabase
				.from('user_progress')
				.update({
					level: current.level,
					case_scores: current.caseScores,
					paradigm_scores: current.paradigmScores,
					last_session: current.lastSession,
					updated_at: new Date().toISOString()
				})
				.eq('user_id', user!.id)
				.then(() => {});
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
			const supabase = getSupabaseBrowserClient();
			supabase
				.from('practice_sessions')
				.upsert(
					{
						user_id: user!.id,
						session_date: getTodayDate(),
						questions_attempted: todayAttempted,
						questions_correct: todayCorrect,
						updated_at: new Date().toISOString()
					},
					{ onConflict: 'user_id,session_date' }
				)
				.then(() => {});
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
		const supabase = getSupabaseBrowserClient();
		supabase
			.from('practice_sessions')
			.select('questions_attempted, questions_correct')
			.eq('user_id', user.id)
			.eq('session_date', getTodayDate())
			.single()
			.then(
				({ data }: { data: { questions_attempted: number; questions_correct: number } | null }) => {
					if (data) {
						todayAttempted = data.questions_attempted;
						todayCorrect = data.questions_correct;
					}
				}
			);
	}

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
	let wordsLoading = $state(true);
	let ttsAvailable = $state(false);
	let autoplayAudio = $state(true);
	let hasInteracted = $state(false);
	let sessionCount = $state(0);
	let signupPromptDismissed = $state(false);
	let authModalOpen = $state(false);

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
	const prefersReducedMotion =
		typeof window !== 'undefined'
			? window.matchMedia('(prefers-reduced-motion: reduce)').matches
			: false;
	const tweenDuration = prefersReducedMotion ? 0 : 600;
	const displayTotal = tweened(0, { duration: tweenDuration, easing: cubicOut });
	const displayPct = tweened(0, { duration: tweenDuration, easing: cubicOut });

	// Update animated counters when stats change
	$effect(() => {
		const total = sessionCorrect + sessionWrong;
		displayTotal.set(total);
		displayPct.set(total > 0 ? Math.round((sessionCorrect / total) * 100) : 0);
	});

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

		// Generate first question immediately from local state
		generateNextQuestion();
		wordsLoading = false;

		// If user is logged in, load progress from Supabase in the background
		if (user) {
			loadTodaySession();
			const supabase = getSupabaseBrowserClient();
			supabase
				.from('user_progress')
				.select('*')
				.eq('user_id', user.id)
				.single()
				.then(
					({
						data
					}: {
						data: {
							level: string;
							case_scores: Record<string, { attempts: number; correct: number }>;
							paradigm_scores: Record<string, { attempts: number; correct: number }>;
							last_session: string;
						} | null;
					}) => {
						if (data) {
							progress.set({
								level: data.level as Difficulty,
								caseScores: data.case_scores ?? {},
								paradigmScores: data.paradigm_scores ?? {},
								lastSession: data.last_session ?? ''
							});
							// Regenerate with server-side progress for better weighted selection
							generateNextQuestion();
						}
					}
				);
		}

		return () => {
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
		if (selectedCase !== 'all' || enabledCases.length < 2) {
			allowed = allowed.filter((dt) => dt !== 'case_identification');
			if (allowed.length === 0) allowed = ['form_production'];
		}

		if (allowed.length === 1) return allowed[0];

		const activeCases = selectedCase === 'all' ? enabledCases : [selectedCase];

		// Check if sentence-based drills are viable
		if (allowed.includes('case_identification') || allowed.includes('sentence_fill_in')) {
			const templates = loadTemplates();
			const eligibleTemplates = templates.filter(
				(t) => activeCases.includes(t.requiredCase) && matchesNumberMode(t.number)
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

		// Templates are NOT filtered by difficulty — all templates are available at all levels.
		// Only word difficulty is controlled by the user's level.

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
			const validWords = eligibleWords.filter((w) => hasValidForm(w, case_, number_));
			if (validWords.length === 0) {
				question = null;
				return;
			}
			const word = weightedRandom(validWords, prog, case_, number_);
			question = generateFormProduction(word, case_, number_);
		} else {
			const templates = loadTemplates();
			const eligibleTemplates = templates.filter(
				(t) => activeCases.includes(t.requiredCase) && matchesNumberMode(t.number)
			);

			if (eligibleTemplates.length === 0) {
				const validWords = eligibleWords.filter((w) => hasValidForm(w, case_, number_));
				if (validWords.length === 0) {
					question = null;
					return;
				}
				const word = weightedRandom(validWords, prog, case_, number_);
				question = generateFormProduction(word, case_, number_);
			} else {
				const template = eligibleTemplates[Math.floor(Math.random() * eligibleTemplates.length)];
				const candidates = getCandidates(template, prog).filter((w) =>
					hasValidForm(w, template.requiredCase, template.number)
				);

				if (candidates.length === 0) {
					const validWords = eligibleWords.filter((w) => hasValidForm(w, case_, number_));
					if (validWords.length === 0) {
						question = null;
						return;
					}
					const word = weightedRandom(validWords, prog, case_, number_);
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
			scheduleSyncToSupabase();
			trackSessionStats(result);
			recordSessionActivity(false);
			streak = 0;
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
		const result = checkAnswer(question, answer, currentLevel);
		lastResult = result;
		recordResult(result);
		scheduleSyncToSupabase();
		trackSessionStats(result);
		recordSessionActivity(result.correct);

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
			paradigmNotes = lookupParadigmNotes(question.word.paradigm);
		}

		checkMilestones(result);

		autoPlayAnswer(question);
	}

	function handleLevelChange(level: Difficulty): void {
		setLevel(level);
		scheduleSyncToSupabase();
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
			// Read the text before and after the blank with a pause in between
			const form = q.word.forms[q.number][CASE_INDEX[q.case]];
			const voiced = applyPrepositionVoicing(q.template.template, form);
			const parts = voiced.split('___');
			return [parts[0].trim(), parts[1]?.trim()].filter(Boolean).join(', ');
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
			const form = q.word.forms[q.number][CASE_INDEX[q.case]];
			const voiced = applyPrepositionVoicing(q.template.template, form);
			speak(voiced.replace('___', form));
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
			if (authModalOpen) {
				authModalOpen = false;
			} else if (refSidebarOpen) {
				refSidebarOpen = false;
			}
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
		{user}
		onSignIn={() => (authModalOpen = true)}
	/>

	{#if activeView === 'exercise'}
		<main class="mx-auto w-full max-w-[867px] flex-1 px-3 py-4 sm:px-4 sm:py-8">
			<!-- Case selection pill bar -->
			<div class="mb-5">
				<CasePillBar {selectedCase} {caseStrengths} onSelect={handleCaseSelect} />
				{#if selectedCase === 'all'}
					<div class="mt-3 text-center">
						<button
							onclick={() => (caseFilterExpanded = !caseFilterExpanded)}
							class="inline-flex items-center gap-1 text-xs font-medium text-text-subtitle transition-colors hover:text-text-default"
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
					onclick={() => (settingsExpanded = !settingsExpanded)}
					class="flex size-11 items-center justify-center rounded-full text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
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
					class="mb-5 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-2xl border border-card-stroke bg-card-bg px-3 py-3 sm:gap-x-6 sm:px-5 sm:py-4"
				>
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-xs font-semibold uppercase tracking-[0.15em] text-text-subtitle"
							>Word Difficulty</span
						>
						<div class="inline-flex rounded-[16px] border border-card-stroke bg-card-bg p-1">
							{#each ['A1', 'A2', 'B1', 'B2'] as const as lvl (lvl)}
								<button
									onclick={() => handleLevelChange(lvl)}
									class="flex flex-col items-center rounded-[12px] px-2 py-1 transition-all sm:px-3
										{currentLevel === lvl
										? 'bg-shaded-background text-text-default'
										: 'text-text-subtitle hover:text-text-default'}"
								>
									<span class="text-xs font-normal">{lvl}</span>
									<span
										class="hidden text-[9px] leading-tight sm:inline {currentLevel === lvl
											? 'text-text-subtitle'
											: 'text-text-subtitle/50'}"
									>
										{DIFFICULTY_META[lvl].subtitle}
									</span>
								</button>
							{/each}
						</div>
					</div>
					<DrillSettings_
						selectedDrillTypes={drillSettings.selectedDrillTypes}
						numberMode={drillSettings.numberMode}
						onSettingsChange={handleSettingsChange}
						disableCaseIdentification={selectedCase !== 'all' || enabledCases.length < 2}
					/>
				</div>
			{/if}

			<!-- Drill area -->
			<div class="mx-auto max-w-[867px]">
				<DrillCard
					{question}
					loading={wordsLoading}
					result={lastResult}
					onSubmit={handleSubmit}
					onSpeak={ttsAvailable ? handleSpeak : null}
					selectedCases={ALL_CASES}
					{paradigmNotes}
					onWordClick={handleWordClick}
					{streak}
					soundEnabled={autoplayAudio}
				/>
			</div>

			<!-- Sign-up prompt for guests after 10 questions -->
			{#if !user && sessionCount >= 10 && !signupPromptDismissed}
				<div
					transition:slide={{ duration: 200 }}
					class="mx-auto mt-6 max-w-md rounded-2xl border border-card-stroke bg-card-bg p-5"
				>
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-sm font-semibold text-text-default">
								You're on a roll — don't lose it!
							</p>
							<ul class="mt-1.5 space-y-1 text-xs text-text-subtitle">
								<li>The algorithm learns your weak spots and drills them more</li>
								<li>Pick up exactly where you left off, on any device</li>
								<li>Track your accuracy for every case and paradigm</li>
							</ul>
						</div>
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
					<button
						type="button"
						onclick={() => (authModalOpen = true)}
						class="mt-3 inline-block rounded-xl bg-emphasis px-4 py-2 text-xs font-semibold text-text-inverted transition-opacity hover:opacity-90"
					>
						Create free account
					</button>
				</div>
			{/if}

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
					initialTab={refSidebarTab}
					onClose={() => (refSidebarOpen = false)}
				/>
			</aside>
		</div>
	{/if}

	<!-- Footer -->
	<footer class="pb-6 pt-4 text-center">
		<p class="text-xs text-text-subtitle">
			Skloňuj
			<span class="mx-1">&middot;</span>
			<a href={resolve('/contact')} class="underline underline-offset-2 hover:text-text-default"
				>Contact</a
			>
		</p>
	</footer>
</div>

<AuthModal open={authModalOpen} onClose={() => (authModalOpen = false)} />
