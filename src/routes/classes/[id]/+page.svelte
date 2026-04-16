<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Archive from '@lucide/svelte/icons/archive';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import X from '@lucide/svelte/icons/x';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { SvelteMap } from 'svelte/reactivity';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import ProgressChart from '$lib/components/ui/ProgressChart.svelte';
	import {
		CASE_LABELS,
		DRILL_TYPE_LABELS,
		ALL_DRILL_TYPES,
		ALL_ADJECTIVE_GENDER_KEYS
	} from '$lib/types';
	import type { Case, AdjectiveGenderKey } from '$lib/types';
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import GuidedTour from '$lib/components/ui/GuidedTour.svelte';
	import TeacherFeedback from '$lib/components/ui/TeacherFeedback.svelte';

	const ALL_CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	interface ClassData {
		id: string;
		teacher_id: string;
		name: string;
		description: string | null;
		class_code: string;
		level: string;
		archived: boolean;
		leaderboard_enabled: boolean;
		struggling_threshold: number;
		created_at: string;
	}

	interface AssignmentStatus {
		assignmentId: string;
		assignmentTitle: string;
		attempted: number;
		target: number;
		correct: number;
		completed: boolean;
	}

	interface CaseAccuracy {
		case: string;
		attempts: number;
		correct: number;
		accuracy: number;
	}

	interface MistakeEntry {
		word: string;
		expectedForm: string;
		givenAnswer: string;
		case: string;
		number: string;
		sentence?: string;
		drillType?: string;
		prompt?: string;
		correctParadigm?: string;
		userParadigm?: string;
		correctCase?: string;
		userCase?: string | null;
		paradigmCorrect?: boolean;
		caseCorrect?: boolean | null;
		formCorrect?: boolean;
	}

	interface StudentRow {
		studentId: string;
		displayName: string | null;
		email: string | null;
		joinedAt: string;
		overallAccuracy: number | null;
		totalAttempts: number;
		assignmentStatuses: AssignmentStatus[];
		caseScores: CaseAccuracy[];
		recentMistakes: MistakeEntry[];
	}

	interface AssignmentRow {
		id: string;
		title: string;
		description: string | null;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: string;
		contentMode: string;
		includeAdjectives?: boolean;
		targetQuestions: number;
		dueDate: string | null;
		createdAt: string;
		completedCount: number;
		totalStudents: number;
		avgAccuracy: number | null;
		totalAttempted: number;
	}

	function isClassData(v: unknown): v is ClassData {
		if (!isRecord(v)) return false;
		return typeof v.id === 'string' && typeof v.name === 'string';
	}

	function isAssignmentStatus(v: unknown): v is AssignmentStatus {
		if (!isRecord(v)) return false;
		return (
			typeof v.assignmentId === 'string' &&
			typeof v.assignmentTitle === 'string' &&
			typeof v.attempted === 'number' &&
			typeof v.target === 'number' &&
			typeof v.correct === 'number' &&
			typeof v.completed === 'boolean'
		);
	}

	function isCaseAccuracy(v: unknown): v is CaseAccuracy {
		if (!isRecord(v)) return false;
		return (
			typeof v.case === 'string' &&
			typeof v.attempts === 'number' &&
			typeof v.correct === 'number' &&
			typeof v.accuracy === 'number'
		);
	}

	function isMistakeEntry(v: unknown): v is MistakeEntry {
		return (
			isRecord(v) &&
			typeof v.word === 'string' &&
			typeof v.expectedForm === 'string' &&
			typeof v.givenAnswer === 'string' &&
			typeof v.case === 'string' &&
			typeof v.number === 'string'
		);
	}

	function isStudentArray(v: unknown): v is StudentRow[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) &&
				typeof item.studentId === 'string' &&
				typeof item.joinedAt === 'string' &&
				(item.overallAccuracy === null || typeof item.overallAccuracy === 'number') &&
				typeof item.totalAttempts === 'number' &&
				Array.isArray(item.assignmentStatuses) &&
				item.assignmentStatuses.every((s: unknown) => isAssignmentStatus(s)) &&
				Array.isArray(item.caseScores) &&
				item.caseScores.every((c: unknown) => isCaseAccuracy(c)) &&
				Array.isArray(item.recentMistakes) &&
				item.recentMistakes.every((m: unknown) => isMistakeEntry(m))
		);
	}

	function isAssignmentArray(v: unknown): v is AssignmentRow[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) => isRecord(item) && typeof item.id === 'string' && typeof item.title === 'string'
		);
	}

	function isCaseKey(v: string): v is Case {
		return v in CASE_LABELS;
	}

	let classData = $derived.by(() => {
		const val: unknown = page.data.classData;
		return isClassData(val) ? val : null;
	});

	let strugglingThreshold = $derived(classData?.struggling_threshold ?? 50);

	// Local override for freshly regenerated code so the header pill updates
	// immediately without waiting for a full reload.
	let overriddenClassCode = $state<string | null>(null);

	// Prefer the locally overridden code (set after a successful regenerate)
	// so the UI updates immediately; falls back to the server-loaded value.
	let displayedClassCode = $derived(overriddenClassCode ?? classData?.class_code ?? '');

	// When the server-loaded class code catches up with (or changes past) the
	// locally overridden value, clear the override to re-sync with server state.
	$effect(() => {
		const serverCode = classData?.class_code;
		if (overriddenClassCode !== null && serverCode === overriddenClassCode) {
			overriddenClassCode = null;
		}
	});

	let role = $derived.by(() => {
		const val: unknown = page.data.role;
		return val === 'teacher' || val === 'student' ? val : 'student';
	});

	let students = $derived.by(() => {
		const val: unknown = page.data.students;
		return isStudentArray(val) ? val : [];
	});

	let assignments = $derived.by(() => {
		const val: unknown = page.data.assignments;
		return isAssignmentArray(val) ? val : [];
	});

	interface ProgressSnapshot {
		studentId: string;
		snapshotDate: string;
		overallAccuracy: number | null;
		totalQuestions: number;
		nomAccuracy: number | null;
		genAccuracy: number | null;
		datAccuracy: number | null;
		accAccuracy: number | null;
		vocAccuracy: number | null;
		locAccuracy: number | null;
		insAccuracy: number | null;
	}

	function isProgressSnapshot(v: unknown): v is ProgressSnapshot {
		if (!isRecord(v)) return false;
		return (
			typeof v.studentId === 'string' &&
			typeof v.snapshotDate === 'string' &&
			(v.overallAccuracy === null || typeof v.overallAccuracy === 'number') &&
			typeof v.totalQuestions === 'number'
		);
	}

	let progressSnapshots = $derived.by(() => {
		const val: unknown = page.data.progressSnapshots;
		if (!Array.isArray(val)) return [];
		return val.filter(isProgressSnapshot);
	});

	let chartStudents = $derived.by(() => {
		return students.map((s) => ({
			id: s.studentId,
			name: studentDisplayName(s)
		}));
	});

	// Class-aggregated paradigm scores (teacher only)
	interface ScoreEntry {
		attempts: number;
		correct: number;
	}
	function isScoreEntry(v: unknown): v is ScoreEntry {
		return isRecord(v) && typeof v.attempts === 'number' && typeof v.correct === 'number';
	}
	let classParadigmScores = $derived.by(() => {
		const val: unknown = page.data.classParadigmScores;
		const result: Record<string, ScoreEntry> = {};
		if (!isRecord(val)) return result;
		for (const [key, entry] of Object.entries(val)) {
			if (isScoreEntry(entry)) {
				result[key] = entry;
			}
		}
		return result;
	});
	let hasParadigmData = $derived(Object.keys(classParadigmScores).length > 0);

	// Per-cell student breakdown (teacher only)
	interface StudentBreakdownEntry {
		struggling: string[];
		ok: string[];
		strong: string[];
	}
	function isStringArray(v: unknown): v is string[] {
		return Array.isArray(v) && v.every((x) => typeof x === 'string');
	}
	function isBreakdownEntry(v: unknown): v is StudentBreakdownEntry {
		return (
			isRecord(v) && isStringArray(v.struggling) && isStringArray(v.ok) && isStringArray(v.strong)
		);
	}
	let paradigmStudentBreakdown = $derived.by(() => {
		const val: unknown = page.data.paradigmStudentBreakdown;
		const result: Record<string, StudentBreakdownEntry> = {};
		if (!isRecord(val)) return result;
		for (const [key, entry] of Object.entries(val)) {
			if (isBreakdownEntry(entry)) {
				result[key] = entry;
			}
		}
		return result;
	});

	// Paradigm heatmap constants
	const CASE_META: Array<{ key: string; label: string; abbrev: string; hex: string }> = [
		{ key: 'nom', label: 'Nominative', abbrev: 'Nom', hex: '#8f7e86' },
		{ key: 'gen', label: 'Genitive', abbrev: 'Gen', hex: '#5d8cdc' },
		{ key: 'dat', label: 'Dative', abbrev: 'Dat', hex: '#e89a02' },
		{ key: 'acc', label: 'Accusative', abbrev: 'Acc', hex: '#14b160' },
		{ key: 'voc', label: 'Vocative', abbrev: 'Voc', hex: '#a777e0' },
		{ key: 'loc', label: 'Locative', abbrev: 'Loc', hex: '#da5e5e' },
		{ key: 'ins', label: 'Instrumental', abbrev: 'Ins', hex: '#e34994' }
	];

	const PARADIGM_DESC: Record<string, string> = {
		pán: 'hard consonant ending',
		muž: 'soft consonant ending',
		předseda: 'vowel -a ending',
		soudce: 'vowel -e ending',
		hrad: 'hard consonant ending',
		stroj: 'soft consonant ending',
		žena: 'vowel -a ending',
		růže: 'vowel -e ending',
		píseň: 'soft consonant ending',
		kost: 'hard consonant ending',
		město: 'vowel -o ending',
		moře: 'vowel -e ending',
		kuře: 'vowel -e/-ě ending',
		stavení: 'vowel -í ending',
		pronoun_já: 'I',
		pronoun_ty: 'you (sg.)',
		pronoun_on: 'he',
		pronoun_ona: 'she',
		pronoun_ono: 'it',
		pronoun_my: 'we',
		pronoun_vy: 'you (pl.)',
		pronoun_oni: 'they',
		pronoun_se: 'self'
	};

	const PARADIGM_GROUPS: Array<{ label: string; paradigms: string[] }> = [
		{ label: 'Masculine', paradigms: ['pán', 'muž', 'předseda', 'soudce', 'hrad', 'stroj'] },
		{ label: 'Feminine', paradigms: ['žena', 'růže', 'píseň', 'kost'] },
		{ label: 'Neuter', paradigms: ['město', 'moře', 'kuře', 'stavení'] },
		{
			label: 'Pronouns',
			paradigms: [
				'pronoun_já',
				'pronoun_ty',
				'pronoun_on',
				'pronoun_ona',
				'pronoun_ono',
				'pronoun_my',
				'pronoun_vy',
				'pronoun_oni',
				'pronoun_se'
			]
		}
	];

	function paradigmDisplayName(key: string): string {
		if (key.startsWith('pronoun_')) return key.slice('pronoun_'.length);
		return key;
	}

	function getParadigmCaseNumberScore(paradigm: string, caseKey: string, num: string): ScoreEntry {
		return classParadigmScores[`${paradigm}_${caseKey}_${num}`] ?? { attempts: 0, correct: 0 };
	}

	const ADJ_GROUPS: Array<{ label: string; suffix: string; description: string }> = [
		{ label: 'Hard (-ý)', suffix: 'ý', description: 'mladý pattern' },
		{ label: 'Soft (-í)', suffix: 'í', description: 'jarní pattern' }
	];

	let activeClassAdjectiveLemmas = $derived.by(() => {
		const lemmas: string[] = [];
		for (const key of Object.keys(classParadigmScores)) {
			if (key.startsWith('adj_')) {
				// key format: adj_{lemma}_{genderKey}_{case}_{number}
				// genderKey may contain underscores (e.g. m_anim, m_inanim)
				// lemma is always the second segment (parts[1])
				const parts = key.split('_');
				if (parts.length >= 5 && !lemmas.includes(parts[1])) {
					lemmas.push(parts[1]);
				}
			}
		}
		return lemmas;
	});

	let hasAdjectiveData = $derived(activeClassAdjectiveLemmas.length > 0);
	let classAdjGenderFilter = $state<AdjectiveGenderKey | 'all'>('all');

	const CLASS_ADJ_GENDER_FILTER_OPTIONS: Array<{
		value: AdjectiveGenderKey | 'all';
		label: string;
	}> = [
		{ value: 'all', label: 'All' },
		{ value: 'm_anim', label: 'M. anim' },
		{ value: 'm_inanim', label: 'M. inanim' },
		{ value: 'f', label: 'Fem' },
		{ value: 'n', label: 'Neut' }
	];

	function getAdjGroupClassScore(
		lemmas: string[],
		caseKey: string,
		num: string,
		genderFilter: AdjectiveGenderKey | 'all' = 'all'
	): ScoreEntry {
		let attempts = 0;
		let correct = 0;
		const genders = genderFilter === 'all' ? ALL_ADJECTIVE_GENDER_KEYS : [genderFilter];
		for (const lemma of lemmas) {
			for (const genderKey of genders) {
				const entry = classParadigmScores[`adj_${lemma}_${genderKey}_${caseKey}_${num}`];
				if (entry) {
					attempts += entry.attempts;
					correct += entry.correct;
				}
			}
		}
		return { attempts, correct };
	}

	function accuracyColor(pct: number): string {
		if (pct >= 80) return '#22c55e';
		if (pct >= 60) return '#eab308';
		if (pct >= 40) return '#f97316';
		return '#ef4444';
	}

	function cellTextColor(pct: number): string {
		if (pct >= 60) return '#000';
		return '#fff';
	}

	function attemptLabel(n: number): string {
		return `${n} attempt${n === 1 ? '' : 's'}`;
	}

	// Heatmap tooltip state
	let hoveredCell = $state<{
		paradigm: string;
		caseKey: string;
		num: string;
		x: number;
		y: number;
	} | null>(null);

	function handleCellEnter(
		e: MouseEvent | FocusEvent,
		paradigm: string,
		caseKey: string,
		num: string
	): void {
		const target = e.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const rect = target.getBoundingClientRect();
		hoveredCell = {
			paradigm,
			caseKey,
			num,
			x: rect.left + rect.width / 2,
			y: rect.top
		};
	}

	function handleCellLeave(): void {
		hoveredCell = null;
	}

	function truncateNames(names: string[], max: number): { shown: string[]; extra: number } {
		if (names.length <= max) return { shown: names, extra: 0 };
		return { shown: names.slice(0, max), extra: names.length - max };
	}

	let hoveredCellScore = $derived.by(() => {
		if (!hoveredCell) return null;
		let score: ScoreEntry;
		if (hoveredCell.paradigm.startsWith('adjgroup_')) {
			const suffix = hoveredCell.paradigm.slice('adjgroup_'.length);
			const matchingLemmas = activeClassAdjectiveLemmas.filter((l) => l.endsWith(suffix));
			score = getAdjGroupClassScore(
				matchingLemmas,
				hoveredCell.caseKey,
				hoveredCell.num,
				classAdjGenderFilter
			);
		} else {
			score = getParadigmCaseNumberScore(
				hoveredCell.paradigm,
				hoveredCell.caseKey,
				hoveredCell.num
			);
		}
		const pct = score.attempts > 0 ? Math.round((score.correct / score.attempts) * 100) : -1;
		const caseMeta = CASE_META.find((c) => c.key === hoveredCell!.caseKey);
		const breakdownKey = `${hoveredCell!.paradigm}_${hoveredCell!.caseKey}_${hoveredCell!.num}`;
		const breakdown = paradigmStudentBreakdown[breakdownKey] ?? null;
		return {
			label: `${caseMeta?.abbrev ?? hoveredCell!.caseKey} ${hoveredCell!.num}`,
			pct,
			attempts: score.attempts,
			breakdown
		};
	});

	// Class-level stats
	let avgClassAccuracy = $derived.by(() => {
		const withProgress = students.filter((s) => s.overallAccuracy !== null);
		if (withProgress.length === 0) return null;
		const sum = withProgress.reduce((acc, s) => acc + (s.overallAccuracy ?? 0), 0);
		return sum / withProgress.length;
	});

	let hasProgressData = $derived(students.some((s) => s.totalAttempts > 0));

	// Search and sort state
	let searchQuery = $state('');
	type SortColumn = 'name' | 'accuracy' | 'practiced';
	type SortDirection = 'asc' | 'desc';
	let sortColumn = $state<SortColumn>('name');
	let sortDirection = $state<SortDirection>('asc');

	function toggleSort(column: SortColumn) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDirection = column === 'name' ? 'asc' : 'desc';
		}
	}

	function sortIndicator(column: SortColumn): string {
		if (sortColumn !== column) return '';
		return sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
	}

	// Defense-in-depth: only consider students currently in the roster when rendering
	// assignment progress. The server scopes `students` to class_memberships, but if a
	// ghost row ever slips through without a valid join timestamp we skip it here.
	let rosterStudents = $derived(
		students.filter((s) => typeof s.joinedAt === 'string' && s.joinedAt.length > 0)
	);

	let filteredStudents = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		let result = rosterStudents;
		if (query) {
			result = result.filter((s) => {
				const name = (s.displayName ?? '').toLowerCase();
				const email = (s.email ?? '').toLowerCase();
				return name.includes(query) || email.includes(query);
			});
		}
		return result.toSorted((a, b) => {
			switch (sortColumn) {
				case 'name': {
					const nameA = studentDisplayName(a).toLowerCase();
					const nameB = studentDisplayName(b).toLowerCase();
					return sortDirection === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
				}
				case 'accuracy': {
					const accA = a.overallAccuracy ?? -1;
					const accB = b.overallAccuracy ?? -1;
					return sortDirection === 'asc' ? accA - accB : accB - accA;
				}
				case 'practiced': {
					return sortDirection === 'asc'
						? a.totalAttempts - b.totalAttempts
						: b.totalAttempts - a.totalAttempts;
				}
			}
		});
	});

	// Class-level case accuracy breakdown
	let classCaseAccuracy = $derived.by(() => {
		const caseData: Record<string, { attempts: number; correct: number }> = {};
		for (const c of ALL_CASES) {
			caseData[c] = { attempts: 0, correct: 0 };
		}
		for (const student of rosterStudents) {
			for (const score of student.caseScores) {
				const existing = caseData[score.case];
				if (existing) {
					existing.attempts += score.attempts;
					existing.correct += score.correct;
				}
			}
		}
		return ALL_CASES.map((c) => {
			const data = caseData[c] ?? { attempts: 0, correct: 0 };
			return {
				case: c,
				attempts: data.attempts,
				correct: data.correct,
				accuracy: data.attempts > 0 ? (data.correct / data.attempts) * 100 : null
			};
		});
	});

	// Per-case student breakdown for tooltips
	let caseStudentBreakdown = $derived.by(() => {
		const breakdown: Record<string, { struggling: string[]; ok: string[]; strong: string[] }> = {};
		for (const c of ALL_CASES) {
			breakdown[c] = { struggling: [], ok: [], strong: [] };
		}
		for (const student of rosterStudents) {
			const name = student.displayName ?? 'Anonymous';
			for (const score of student.caseScores) {
				const bucket = breakdown[score.case];
				if (!bucket || score.attempts === 0) continue;
				const pct = (score.correct / score.attempts) * 100;
				if (pct < strugglingThreshold) bucket.struggling.push(name);
				else if (pct < 80) bucket.ok.push(name);
				else bucket.strong.push(name);
			}
		}
		return breakdown;
	});

	// Overall student breakdown for avg box tooltip
	let overallStudentBreakdown = $derived.by(() => {
		const bd: { struggling: string[]; ok: string[]; strong: string[] } = {
			struggling: [],
			ok: [],
			strong: []
		};
		for (const student of rosterStudents) {
			if (student.overallAccuracy === null || student.totalAttempts === 0) continue;
			const name = student.displayName ?? 'Anonymous';
			if (student.overallAccuracy < strugglingThreshold) bd.struggling.push(name);
			else if (student.overallAccuracy < 80) bd.ok.push(name);
			else bd.strong.push(name);
		}
		return bd;
	});

	let hoveredCaseBox = $state<string | null>(null);
	let caseBoxTooltipPos = $state<{ x: number; y: number } | null>(null);

	function handleCaseBoxEnter(event: MouseEvent, caseKey: string): void {
		hoveredCaseBox = caseKey;
		const target = event.currentTarget;
		if (target instanceof HTMLElement) {
			const rect = target.getBoundingClientRect();
			caseBoxTooltipPos = { x: rect.left + rect.width / 2, y: rect.top };
		}
	}

	function handleCaseBoxLeave(): void {
		hoveredCaseBox = null;
		caseBoxTooltipPos = null;
	}

	// Assignment filtering state
	type AssignmentFilter = 'all' | 'active' | 'overdue' | 'completed';
	const ASSIGNMENT_FILTER_OPTIONS: { value: AssignmentFilter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'active', label: 'Active' },
		{ value: 'overdue', label: 'Overdue' },
		{ value: 'completed', label: 'Completed' }
	];
	let assignmentFilter = $state<AssignmentFilter>('all');
	let assignmentSearch = $state('');
	let showAllAssignments = $state(false);
	const ASSIGNMENT_PAGE_SIZE = 10;

	let currentUserId = $derived.by(() => {
		const user: unknown = page.data.user;
		if (isRecord(user) && typeof user.id === 'string') return user.id;
		return '';
	});

	// Student's assignment completion map for filtering
	let studentCompletionMap = $derived.by(() => {
		const map = new SvelteMap<string, boolean>();
		if (role !== 'student') return map;

		// Find current student in the students array
		const currentStudent = students.find((s) => s.studentId === currentUserId);
		if (currentStudent) {
			for (const status of currentStudent.assignmentStatuses) {
				map.set(status.assignmentId, status.completed);
			}
		}
		return map;
	});

	// Student's per-assignment progress map (for the student view)
	let studentAssignmentProgressMap = $derived.by(() => {
		const map = new SvelteMap<string, AssignmentStatus>();
		if (role !== 'student') return map;

		const currentStudent = students.find((s) => s.studentId === currentUserId);
		if (currentStudent) {
			for (const status of currentStudent.assignmentStatuses) {
				map.set(status.assignmentId, status);
			}
		}
		return map;
	});

	let filteredAssignments = $derived.by(() => {
		const query = assignmentSearch.toLowerCase().trim();
		const now = new Date();

		let result = assignments;

		// Apply search filter
		if (query) {
			result = result.filter((a) => a.title.toLowerCase().includes(query));
		}

		// Apply status filter
		if (assignmentFilter !== 'all') {
			result = result.filter((a) => {
				const dueDate = a.dueDate ? new Date(a.dueDate) : null;
				const isPastDue = dueDate !== null && dueDate < now;
				const isCompleted =
					role === 'teacher'
						? a.totalStudents > 0 && a.completedCount >= a.totalStudents
						: studentCompletionMap.get(a.id) === true;

				if (assignmentFilter === 'active') {
					return !isPastDue && !isCompleted;
				}
				if (assignmentFilter === 'overdue') {
					return isPastDue && !isCompleted;
				}
				if (assignmentFilter === 'completed') {
					return isCompleted;
				}
				return true;
			});
		}

		// Completed assignments at the bottom, then sorted by creation date (newest first).
		result = [...result].sort((a, b) => {
			const aDone =
				role === 'teacher'
					? a.totalStudents > 0 && a.completedCount >= a.totalStudents
					: studentCompletionMap.get(a.id) === true;
			const bDone =
				role === 'teacher'
					? b.totalStudents > 0 && b.completedCount >= b.totalStudents
					: studentCompletionMap.get(b.id) === true;
			if (aDone !== bDone) return aDone ? 1 : -1;
			const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
			const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
			return bCreated - aCreated;
		});

		return result;
	});

	let visibleAssignments = $derived.by(() => {
		if (showAllAssignments) return filteredAssignments;
		return filteredAssignments.slice(0, ASSIGNMENT_PAGE_SIZE);
	});

	let hasMoreAssignments = $derived(filteredAssignments.length > ASSIGNMENT_PAGE_SIZE);

	let chartMetric = $state<'overall' | Case>('overall');
	let expandedStudents = $state(new Set<string>());
	let showCompletedAssignments = $state(new Set<string>());
	function toggleCompletedAssignments(studentId: string) {
		if (showCompletedAssignments.has(studentId)) {
			showCompletedAssignments = new Set(
				[...showCompletedAssignments].filter((s) => s !== studentId)
			);
		} else {
			showCompletedAssignments = new Set([...showCompletedAssignments, studentId]);
		}
	}
	function toggleStudent(id: string) {
		if (expandedStudents.has(id)) {
			expandedStudents = new Set([...expandedStudents].filter((s) => s !== id));
		} else {
			expandedStudents = new Set([...expandedStudents, id]);
		}
	}

	let codeCopied = $state(false);
	let modalCodeCopied = $state(false);
	let confirmingArchive = $state(false);
	let confirmingDelete = $state(false);
	let confirmingRemoveStudentId = $state<string | null>(null);
	let confirmingLeave = $state(false);
	let leaveError = $state<string | null>(null);
	let leaveSubmitting = $state(false);
	let confirmingRegenerate = $state(false);
	let regenerateSuccess = $state(false);
	let removeSuccessMessage = $state<string | null>(null);
	let removeSuccessTimer: ReturnType<typeof setTimeout> | null = null;

	type ActiveTab = 'overall' | 'students' | 'assignments';
	const TAB_ORDER: ActiveTab[] = ['overall', 'students', 'assignments'];
	function isActiveTab(v: string | null): v is ActiveTab {
		return v !== null && TAB_ORDER.includes(v as ActiveTab);
	}
	const initialTab = page.url.searchParams.get('tab');
	let activeTab = $state<ActiveTab>(isActiveTab(initialTab) ? initialTab : 'overall');

	function focusTab(tab: ActiveTab): void {
		const el = document.getElementById(`tab-${tab}`);
		if (el instanceof HTMLElement) el.focus();
	}

	function handleTablistKeydown(e: KeyboardEvent): void {
		const currentIndex = TAB_ORDER.indexOf(activeTab);
		if (currentIndex === -1) return;
		let nextIndex = currentIndex;
		if (e.key === 'ArrowRight') {
			nextIndex = (currentIndex + 1) % TAB_ORDER.length;
		} else if (e.key === 'ArrowLeft') {
			nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
		} else if (e.key === 'Home') {
			nextIndex = 0;
		} else if (e.key === 'End') {
			nextIndex = TAB_ORDER.length - 1;
		} else {
			return;
		}
		e.preventDefault();
		const nextTab = TAB_ORDER[nextIndex];
		activeTab = nextTab;
		focusTab(nextTab);
	}

	let showInviteModal = $state(false);
	let showCreateAssignmentModal = $state(false);
	let showEditClassModal = $state(false);

	let inviteModalEl = $state<HTMLDivElement | null>(null);
	let assignmentModalEl = $state<HTMLDivElement | null>(null);
	let editClassModalEl = $state<HTMLDivElement | null>(null);
	let inviteOpenerEl: HTMLElement | null = null;
	let assignmentOpenerEl: HTMLElement | null = null;
	let editClassOpenerEl: HTMLElement | null = null;
	let regenerateTriggerEl = $state<HTMLButtonElement | null>(null);

	function getFocusableElements(container: HTMLElement): HTMLElement[] {
		const selectors =
			'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
		return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(
			(el) => !el.hasAttribute('disabled') && el.tabIndex !== -1
		);
	}

	function makeModalKeydown(
		container: () => HTMLDivElement | null,
		close: () => void
	): (e: KeyboardEvent) => void {
		return (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				close();
				return;
			}
			if (e.key !== 'Tab') return;
			const el = container();
			if (!el) return;
			const focusables = getFocusableElements(el);
			if (focusables.length === 0) {
				e.preventDefault();
				return;
			}
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			const active = document.activeElement;
			if (e.shiftKey) {
				if (active === first || !el.contains(active)) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (active === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};
	}

	const inviteModalKeydown = makeModalKeydown(
		() => inviteModalEl,
		() => closeInviteModal()
	);
	const assignmentModalKeydown = makeModalKeydown(
		() => assignmentModalEl,
		() => closeAssignmentModal()
	);
	const editClassModalKeydown = makeModalKeydown(
		() => editClassModalEl,
		() => closeEditClassModal()
	);

	function closeInviteModal(): void {
		showInviteModal = false;
		if (inviteOpenerEl) {
			inviteOpenerEl.focus();
			inviteOpenerEl = null;
		}
	}

	function closeAssignmentModal(): void {
		showCreateAssignmentModal = false;
		if (assignmentOpenerEl) {
			assignmentOpenerEl.focus();
			assignmentOpenerEl = null;
		}
	}

	function closeEditClassModal(): void {
		showEditClassModal = false;
		if (editClassOpenerEl) {
			editClassOpenerEl.focus();
			editClassOpenerEl = null;
		}
	}

	$effect(() => {
		if (!showInviteModal) return;
		const el = inviteModalEl;
		if (!el) return;
		const focusables = getFocusableElements(el);
		if (focusables.length > 0) {
			focusables[0].focus();
		} else {
			el.focus();
		}
	});

	$effect(() => {
		if (!showCreateAssignmentModal) return;
		const el = assignmentModalEl;
		if (!el) return;
		const focusables = getFocusableElements(el);
		if (focusables.length > 0) {
			focusables[0].focus();
		} else {
			el.focus();
		}
	});

	$effect(() => {
		if (!showEditClassModal) return;
		const el = editClassModalEl;
		if (!el) return;
		const focusables = getFocusableElements(el);
		if (focusables.length > 0) {
			focusables[0].focus();
		} else {
			el.focus();
		}
	});

	$effect(() => {
		if (!confirmingRegenerate) return;
		const onPointerDown = (e: PointerEvent): void => {
			const target = e.target;
			if (!(target instanceof Node)) return;
			if (regenerateTriggerEl && regenerateTriggerEl.contains(target)) return;
			const popover = document.getElementById('regenerate-popover');
			if (popover && popover.contains(target)) return;
			confirmingRegenerate = false;
		};
		const onKeydown = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				confirmingRegenerate = false;
			}
		};
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeydown);
		};
	});

	$effect(() => {
		if (!confirmingDelete && !confirmingArchive) return;
		const onPointerDown = (e: PointerEvent): void => {
			const target = e.target;
			if (!(target instanceof Element)) return;
			const archivePopover = document.getElementById('archive-popover');
			const deletePopover = document.getElementById('delete-popover');
			if (archivePopover && archivePopover.contains(target)) return;
			if (deletePopover && deletePopover.contains(target)) return;
			confirmingDelete = false;
			confirmingArchive = false;
		};
		const onKeydown = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') {
				confirmingDelete = false;
				confirmingArchive = false;
			}
		};
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeydown);
		};
	});

	let showTeacherTour = $state(false);

	const teacherTourSteps = [
		{
			target: null,
			title: 'Your class is ready!',
			text: 'Here\u2019s a quick tour of your teacher dashboard. You can manage students, create assignments, and track progress all from this page.'
		},
		{
			target: 'teacher-code',
			text: 'Share this class code with your students so they can join. Click to copy it to your clipboard.'
		},
		{
			target: 'teacher-tabs',
			text: 'Switch between the Overall summary, your Students roster, and Assignments using these tabs.'
		},
		{
			target: 'teacher-accuracy',
			text: 'Track how your class is performing across all 7 Czech cases at a glance.',
			setup: () => {
				activeTab = 'overall';
			}
		},
		{
			target: 'teacher-roster',
			text: 'See all your students here. Click any row to expand their individual case accuracy and assignment progress.',
			setup: () => {
				activeTab = 'students';
			}
		},
		{
			target: 'teacher-invite',
			text: 'Invite students by sharing the class code or sending email invitations directly.',
			setup: () => {
				activeTab = 'students';
			}
		}
	];

	function dismissTeacherTour() {
		showTeacherTour = false;
		try {
			localStorage.setItem('sklonuj_teacher_toured', '1');
		} catch {
			// ignore
		}
	}

	onMount(() => {
		const url = new URL(window.location.href);
		if (url.searchParams.get('tour') === '1' && role === 'teacher') {
			if (localStorage.getItem('sklonuj_teacher_toured') !== '1') {
				showTeacherTour = true;
				// Clean up URL
				url.searchParams.delete('tour');
				window.history.replaceState({}, '', url.toString());
			}
		}
	});

	// Invite modal state
	let inviteSubmitting = $state(false);
	let inviteError = $state<string | null>(null);
	let inviteSuccess = $state<string | null>(null);

	// Create assignment modal state
	let modalDueDateValue = $state('');
	let assignmentSubmitting = $state(false);
	let assignmentError = $state<string | null>(null);
	let casesError = $state<string | null>(null);
	let drillTypesError = $state<string | null>(null);

	// Multi-select content toggles for quick-create
	let quickNounsSelected = $state(true);
	let quickPronounsSelected = $state(true);
	let quickAdjectivesSelected = $state(false);

	let quickDerivedContentMode = $derived(
		quickNounsSelected && quickPronounsSelected ? 'both' : quickNounsSelected ? 'nouns' : 'pronouns'
	);
	let quickDerivedIncludeAdjectives = $derived(quickAdjectivesSelected);

	function toggleQuickContent(type: 'nouns' | 'pronouns' | 'adjectives') {
		const total =
			(quickNounsSelected ? 1 : 0) +
			(quickPronounsSelected ? 1 : 0) +
			(quickAdjectivesSelected ? 1 : 0);
		if (type === 'nouns') {
			if (quickNounsSelected && total <= 1) return;
			// Prevent leaving only adjectives selected (no nouns or pronouns)
			if (quickNounsSelected && !quickPronounsSelected) return;
			quickNounsSelected = !quickNounsSelected;
		} else if (type === 'pronouns') {
			if (quickPronounsSelected && total <= 1) return;
			// Prevent leaving only adjectives selected (no nouns or pronouns)
			if (quickPronounsSelected && !quickNounsSelected) return;
			quickPronounsSelected = !quickPronounsSelected;
		} else {
			if (quickAdjectivesSelected && total <= 1) return;
			quickAdjectivesSelected = !quickAdjectivesSelected;
		}
	}

	// Edit class modal state
	let editClassSubmitting = $state(false);
	let editClassError = $state<string | null>(null);

	function openEditClassModal(e?: MouseEvent) {
		editClassError = null;
		editClassSubmitting = false;
		const target = e?.currentTarget;
		editClassOpenerEl = target instanceof HTMLElement ? target : null;
		showEditClassModal = true;
	}

	function openInviteModal(e?: MouseEvent) {
		inviteError = null;
		inviteSuccess = null;
		inviteSubmitting = false;
		const target = e?.currentTarget;
		inviteOpenerEl = target instanceof HTMLElement ? target : null;
		showInviteModal = true;
	}

	function exportStudentsCsv(): void {
		if (!classData) return;
		const headers = [
			'Name',
			'Email',
			'Overall Accuracy',
			'Total Attempts',
			'Assignments Completed'
		];
		// Add per-assignment columns
		const assignmentTitles = assignments.map((a) => a.title);
		const allHeaders = [...headers, ...assignmentTitles.map((t) => `${t} (accuracy)`)];

		const rows = students.map((s) => {
			const name = s.displayName ?? 'Anonymous';
			const email = s.email ?? '';
			const acc = s.overallAccuracy !== null ? `${Math.round(s.overallAccuracy)}%` : '';
			const completedCount = s.assignmentStatuses.filter((a) => a.completed).length;
			const perAssignment = assignments.map((a) => {
				const status = s.assignmentStatuses.find((st) => st.assignmentId === a.id);
				if (!status || status.attempted === 0) return '';
				return `${Math.round((status.correct / status.attempted) * 100)}%`;
			});
			return [name, email, acc, String(s.totalAttempts), String(completedCount), ...perAssignment];
		});

		const escapeCsv = (val: string) =>
			val.includes(',') || val.includes('"') || val.includes('\n')
				? `"${val.replace(/"/g, '""')}"`
				: val;
		const csv = [
			allHeaders.map(escapeCsv).join(','),
			...rows.map((r) => r.map(escapeCsv).join(','))
		].join('\n');

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${classData.name.replace(/[^a-zA-Z0-9]/g, '_')}_progress.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function openCreateAssignmentModal(e?: MouseEvent) {
		assignmentError = null;
		casesError = null;
		drillTypesError = null;
		assignmentSubmitting = false;
		modalDueDateValue = '';
		const target = e?.currentTarget;
		assignmentOpenerEl = target instanceof HTMLElement ? target : null;
		showCreateAssignmentModal = true;
	}

	function validateAssignmentForm(event: SubmitEvent) {
		const form = event.target;
		if (!(form instanceof HTMLFormElement)) return;
		const formData = new FormData(form);
		const cases = formData.getAll('selected_cases');
		const drillTypes = formData.getAll('selected_drill_types');
		casesError = cases.length === 0 ? 'Please select at least one case.' : null;
		drillTypesError = drillTypes.length === 0 ? 'Please select at least one drill type.' : null;
		assignmentError = null;
		if (casesError || drillTypesError) {
			event.preventDefault();
		}
	}

	function toggleAllCheckboxes(e: MouseEvent, name: string): void {
		const target = e.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const modal = target.closest('[data-modal]');
		if (!modal) return;
		const boxes = modal.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
		const allChecked = Array.from(boxes).every((b) => b.checked);
		boxes.forEach((b) => (b.checked = !allChecked));
	}

	function copyCode() {
		if (!displayedClassCode) return;
		navigator.clipboard.writeText(displayedClassCode);
		codeCopied = true;
		setTimeout(() => {
			codeCopied = false;
		}, 2000);
	}

	function copyCodeFromModal() {
		if (!displayedClassCode) return;
		navigator.clipboard.writeText(displayedClassCode);
		modalCodeCopied = true;
		setTimeout(() => {
			modalCodeCopied = false;
		}, 2000);
	}

	type DueUrgency = 'overdue' | 'soon' | 'later';

	/** Format a time suffix like " at 3:00 PM" if the timestamp isn't midnight UTC. */
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

	function getDueInfo(
		dateStr: string | null,
		completed: boolean
	): { urgency: DueUrgency | null; label: string; pillClass: string } | null {
		if (dateStr === null) return null;
		const date = new Date(dateStr);
		const now = new Date();
		const formatted = date.toLocaleDateString('en-US', {
			timeZone: 'UTC',
			month: 'short',
			day: 'numeric',
			year: date.getUTCFullYear() !== now.getUTCFullYear() ? 'numeric' : undefined
		});
		const timeSuffix = formatTimeSuffix(date);

		// If completed, just show a muted "Due <date>" without urgency styling.
		if (completed) {
			return {
				urgency: null,
				label: `Due ${formatted}`,
				pillClass: 'bg-shaded-background text-text-subtitle'
			};
		}

		const msPerDay = 24 * 60 * 60 * 1000;
		const dueDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
		const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
		const daysDiff = Math.round((dueDay - today) / msPerDay);

		if (daysDiff < 0) {
			return {
				urgency: 'overdue',
				label: `Overdue · ${formatted}`,
				pillClass: 'bg-negative-background text-negative-stroke'
			};
		}
		if (daysDiff === 0 && date.getTime() < now.getTime()) {
			return {
				urgency: 'overdue',
				label: `Overdue${timeSuffix}`,
				pillClass: 'bg-negative-background text-negative-stroke'
			};
		}
		let relative: string;
		if (daysDiff === 0) relative = `Due today${timeSuffix}`;
		else if (daysDiff === 1) relative = `Due tomorrow${timeSuffix}`;
		else if (daysDiff <= 6) relative = `Due in ${daysDiff} days`;
		else relative = `Due ${formatted}`;

		if (daysDiff <= 3) {
			return {
				urgency: 'soon',
				label: relative,
				pillClass: 'bg-orange-500 text-white'
			};
		}
		return {
			urgency: 'later',
			label: relative,
			pillClass: 'bg-shaded-background text-text-subtitle'
		};
	}

	function studentDisplayName(student: StudentRow): string {
		if (student.displayName) return student.displayName;
		if (student.email) return student.email;
		return 'Anonymous';
	}

	function caseLabelFromKey(key: string): string {
		if (isCaseKey(key)) return CASE_LABELS[key];
		return key;
	}

	function numberLabel(n: string): string {
		if (n === 'sg') return 'Singular';
		if (n === 'pl') return 'Plural';
		return n;
	}

	function sentenceWithBrackets(sentence: string, form: string, lemma: string): string {
		return sentence.replace(form, `[${lemma}]`);
	}

	function sentenceWithBlank(sentence: string, form: string): string {
		return sentence.replace(form, '______');
	}

	function formatAccuracy(accuracy: number | null): string {
		if (accuracy === null) return 'No data';
		return `${Math.round(accuracy)}%`;
	}

	/** Get accuracy color class based on percentage */
	function caseAccuracyColor(accuracy: number): string {
		if (accuracy > 70) return 'bg-positive-background text-positive-stroke';
		if (accuracy >= 40) return 'bg-warning-background text-warning-text';
		return 'bg-negative-background text-negative-stroke';
	}

	/** Look up a case score from array */
	function findCaseScore(scores: CaseAccuracy[], caseKey: string): CaseAccuracy | undefined {
		return scores.find((s) => s.case === caseKey);
	}

	/** CSV export */
	function exportCsv() {
		if (!classData) return;

		const caseHeaders = ['Nom %', 'Gen %', 'Dat %', 'Acc %', 'Voc %', 'Loc %', 'Ins %'];
		const headers = [
			'Student Name',
			'Email',
			'Assignment Title',
			'Questions Attempted',
			'Questions Correct',
			'Accuracy %',
			'Status',
			'Due Date',
			...caseHeaders
		];

		const rows: string[][] = [];
		for (const student of students) {
			const name = studentDisplayName(student);
			const email = student.email ?? '';

			// Build per-case accuracy values for this student
			const caseValues = ALL_CASES.map((c) => {
				const score = findCaseScore(student.caseScores, c);
				return score && score.attempts > 0 ? Math.round(score.accuracy).toString() : '';
			});

			if (student.assignmentStatuses.length === 0) {
				rows.push([name, email, '', '0', '0', '', 'No assignments', '', ...caseValues]);
			} else {
				for (let i = 0; i < student.assignmentStatuses.length; i++) {
					const status = student.assignmentStatuses[i];
					const accuracyPct =
						status.attempted > 0
							? Math.round((status.correct / status.attempted) * 100).toString()
							: '';
					const statusLabel = status.completed
						? 'Completed'
						: status.attempted > 0
							? 'In Progress'
							: 'Not Started';
					// Find matching assignment for due date
					const matchingAssignment = assignments.find((a) => a.id === status.assignmentId);
					const dueDate = matchingAssignment?.dueDate
						? new Date(matchingAssignment.dueDate).toLocaleDateString('en-US', { timeZone: 'UTC' })
						: '';
					// Only include case data on the first row per student to avoid repetition
					rows.push([
						name,
						email,
						status.assignmentTitle,
						status.attempted.toString(),
						status.correct.toString(),
						accuracyPct,
						statusLabel,
						dueDate,
						...(i === 0 ? caseValues : ALL_CASES.map(() => ''))
					]);
				}
			}
		}

		const escapeCsvField = (field: string): string => {
			if (field.includes(',') || field.includes('"') || field.includes('\n')) {
				return `"${field.replace(/"/g, '""')}"`;
			}
			return field;
		};

		const csvContent = [headers, ...rows]
			.map((row) => row.map(escapeCsvField).join(','))
			.join('\n');

		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${classData.name.replace(/[^a-zA-Z0-9]/g, '_')}_progress.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>{classData?.name ?? 'Class'} - Skloňuj</title>
</svelte:head>

<NavBar user={page.data.user} onSignIn={() => goto(resolve('/auth'))} />

{#if classData}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<!-- Back link (use ?list to bypass single-class auto-redirect) -->
		<a
			href="{resolve('/classes')}?list"
			class="mb-4 inline-flex items-center gap-1 text-sm text-darker-subtitle transition-colors hover:text-text-default"
		>
			&larr; Back to Classes
		</a>

		<!-- Archived banner -->
		{#if classData.archived && role === 'teacher'}
			<div
				class="mb-4 rounded-xl border border-card-stroke bg-warning-background px-4 py-3 text-sm text-warning-text"
			>
				This class has been archived. Students can no longer access it.
			</div>
		{/if}

		<!-- Success / Error messages -->
		{#if removeSuccessMessage}
			<div
				class="mb-4 rounded-xl border border-positive-stroke/30 bg-positive-background px-4 py-3 text-sm text-positive-stroke"
			>
				{removeSuccessMessage}
			</div>
		{/if}

		<!-- Header card -->
		<div class="relative mb-6 rounded-2xl border border-card-stroke bg-card-bg p-5">
			<div class="flex items-start justify-between gap-3">
				<!-- Left: name + edit + meta -->
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<h1 class="truncate text-xl font-semibold text-text-default">{classData.name}</h1>
						{#if role === 'teacher' && !classData.archived}
							<button
								type="button"
								onclick={openEditClassModal}
								class="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full p-1.5 text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
								title="Edit class"
								aria-label="Edit class"
							>
								<Pencil class="h-4 w-4" aria-hidden="true" />
							</button>
						{/if}
					</div>
					<p class="mt-1 text-sm text-text-subtitle">
						<span
							class="inline-block rounded-full bg-shaded-background px-2 py-0.5 text-xs font-medium text-text-subtitle"
						>
							Level {classData.level}
						</span>
						{#if role === 'teacher'}
							<span class="mx-1">&middot;</span>
							{students.length}
							{students.length === 1 ? 'student' : 'students'}
						{/if}
					</p>
					{#if classData.description}
						<p class="mt-1 text-sm text-text-subtitle">{classData.description}</p>
					{/if}

					<!-- Class code pill + regenerate (teacher only) -->
					{#if role === 'teacher'}
						<div class="mt-3 flex flex-wrap items-center gap-2">
							<button
								type="button"
								onclick={copyCode}
								title="Click to copy"
								data-tour="teacher-code"
								class="cursor-pointer rounded-full border px-3 py-1.5 font-mono text-xs transition-colors {codeCopied
									? 'border-positive-stroke text-positive-stroke'
									: 'border-card-stroke text-text-subtitle hover:border-emphasis hover:text-text-default'}"
							>
								{codeCopied ? 'Copied!' : displayedClassCode}
							</button>
							{#if !classData.archived}
								<div class="relative">
									{#if confirmingRegenerate}
										<div
											id="regenerate-popover"
											class="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-card-stroke bg-card-bg p-3 shadow-lg"
										>
											<p class="mb-2 text-xs text-text-subtitle">
												Regenerate the class code? Students will need the new code to join.
											</p>
											<div class="flex items-center gap-2">
												<form
													method="POST"
													action="?/regenerateCode"
													use:enhance={() => {
														return async ({ result, update }) => {
															confirmingRegenerate = false;
															if (result.type === 'success') {
																regenerateSuccess = true;
																if (
																	isRecord(result.data) &&
																	typeof result.data.classCode === 'string'
																) {
																	overriddenClassCode = result.data.classCode;
																}
																setTimeout(() => {
																	regenerateSuccess = false;
																}, 2000);
															}
															await update();
														};
													}}
												>
													<button
														type="submit"
														class="cursor-pointer rounded-lg border border-negative-stroke px-2.5 py-1 text-xs font-medium text-negative-stroke transition-colors hover:bg-negative-background"
													>
														Regenerate
													</button>
												</form>
												<button
													type="button"
													onclick={() => (confirmingRegenerate = false)}
													class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
												>
													Cancel
												</button>
											</div>
										</div>
									{/if}
									<button
										type="button"
										title={regenerateSuccess ? 'Class code updated' : 'Regenerate class code'}
										aria-label="Regenerate class code"
										bind:this={regenerateTriggerEl}
										onclick={() => (confirmingRegenerate = !confirmingRegenerate)}
										class="inline-flex cursor-pointer items-center justify-center rounded-lg border p-1.5 transition-colors {regenerateSuccess
											? 'border-positive-stroke text-positive-stroke'
											: 'border-card-stroke text-text-subtitle hover:border-emphasis hover:text-text-default'}"
									>
										{#if regenerateSuccess}
											<!-- Check icon -->
											<Check class="size-3.5" aria-hidden="true" />
										{:else}
											<!-- Refresh icon -->
											<RefreshCw class="size-3.5" aria-hidden="true" />
										{/if}
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Right: archive/unarchive + delete icon buttons -->
				{#if role === 'teacher'}
					<div id="archive-popover" class="relative shrink-0">
						{#if classData.archived}
							<form method="POST" action="?/unarchive" use:enhance>
								<button
									type="submit"
									title="Unarchive class"
									class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-card-stroke p-2 text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
								>
									<!-- Unarchive -->
									<ArchiveRestore class="h-4 w-4" aria-hidden="true" />
								</button>
							</form>
						{:else if !classData.archived}
							{#if confirmingArchive}
								<div
									class="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-card-stroke bg-card-bg p-3 shadow-lg"
								>
									<p class="mb-2 text-xs text-text-subtitle">Archive this class?</p>
									<div class="flex items-center gap-2">
										<form method="POST" action="?/archive" use:enhance>
											<button
												type="submit"
												class="cursor-pointer rounded-lg border border-negative-stroke px-2.5 py-1 text-xs font-medium text-negative-stroke transition-colors hover:bg-negative-background"
											>
												Yes, archive
											</button>
										</form>
										<button
											type="button"
											onclick={() => (confirmingArchive = false)}
											class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
										>
											Cancel
										</button>
									</div>
								</div>
							{/if}
							<button
								type="button"
								title="Archive class"
								onclick={() => (confirmingArchive = !confirmingArchive)}
								class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-card-stroke p-2 text-text-subtitle transition-colors hover:border-negative-stroke hover:text-negative-stroke"
							>
								<!-- Archive box icon -->
								<Archive class="h-4 w-4" aria-hidden="true" />
							</button>
						{/if}
					</div>
					<div id="delete-popover" class="relative shrink-0">
						{#if confirmingDelete}
							<div
								class="absolute right-0 top-full z-10 mt-1 w-56 rounded-xl border border-card-stroke bg-card-bg p-3 shadow-lg"
							>
								<p class="mb-2 text-xs text-text-subtitle">
									Delete this class? All assignments and progress data will be permanently deleted.
									This cannot be undone.
								</p>
								<div class="flex items-center gap-2">
									<form method="POST" action="?/deleteClass" use:enhance>
										<button
											type="submit"
											class="cursor-pointer rounded-lg border border-negative-stroke px-2.5 py-1 text-xs font-medium text-negative-stroke transition-colors hover:bg-negative-background"
										>
											Yes, delete
										</button>
									</form>
									<button
										type="button"
										onclick={() => (confirmingDelete = false)}
										class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
									>
										Cancel
									</button>
								</div>
							</div>
						{/if}
						<button
							type="button"
							title="Delete class"
							onclick={() => (confirmingDelete = !confirmingDelete)}
							class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-card-stroke p-2 text-text-subtitle transition-colors hover:border-negative-stroke hover:text-negative-stroke"
						>
							<Trash2 class="h-4 w-4" aria-hidden="true" />
						</button>
					</div>
				{/if}
			</div>
		</div>

		<!-- ==================== TEACHER VIEW (with tabs) ==================== -->
		{#if role === 'teacher'}
			<!-- Tabs + actions -->
			<div
				class="mb-6 flex items-end justify-between border-b border-card-stroke"
				data-tour="teacher-tabs"
			>
				<div
					class="flex"
					role="tablist"
					aria-label="Class views"
					tabindex={-1}
					onkeydown={handleTablistKeydown}
				>
					<button
						type="button"
						role="tab"
						id="tab-overall"
						aria-selected={activeTab === 'overall'}
						aria-controls="panel-overall"
						tabindex={activeTab === 'overall' ? 0 : -1}
						onclick={() => (activeTab = 'overall')}
						class="cursor-pointer border-b-2 px-4 pb-2 text-sm font-medium transition-colors {activeTab ===
						'overall'
							? 'border-emphasis text-text-default'
							: 'border-transparent text-darker-subtitle hover:border-text-subtitle hover:text-text-default'}"
					>
						Overall
					</button>
					<button
						type="button"
						role="tab"
						id="tab-students"
						aria-selected={activeTab === 'students'}
						aria-controls="panel-students"
						tabindex={activeTab === 'students' ? 0 : -1}
						onclick={() => (activeTab = 'students')}
						class="cursor-pointer border-b-2 px-4 pb-2 text-sm font-medium transition-colors {activeTab ===
						'students'
							? 'border-emphasis text-text-default'
							: 'border-transparent text-darker-subtitle hover:border-text-subtitle hover:text-text-default'}"
					>
						Students ({students.length})
					</button>
					<button
						type="button"
						role="tab"
						id="tab-assignments"
						aria-selected={activeTab === 'assignments'}
						aria-controls="panel-assignments"
						tabindex={activeTab === 'assignments' ? 0 : -1}
						onclick={() => (activeTab = 'assignments')}
						class="cursor-pointer border-b-2 px-4 pb-2 text-sm font-medium transition-colors {activeTab ===
						'assignments'
							? 'border-emphasis text-text-default'
							: 'border-transparent text-darker-subtitle hover:border-text-subtitle hover:text-text-default'}"
					>
						Assignments ({assignments.length})
					</button>
				</div>
				{#if !classData.archived}
					<div class="flex min-h-[56px] items-end justify-end gap-2 pb-2 sm:min-w-[180px]">
						{#if activeTab === 'overall'}
							<div class="flex flex-col items-end gap-1">
								<button
									type="button"
									onclick={exportCsv}
									title="Download class progress as a CSV file"
									class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-darker-subtitle transition-colors hover:border-emphasis hover:text-text-default"
								>
									Export Progress (CSV)
								</button>
							</div>
						{:else if activeTab === 'students'}
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={exportStudentsCsv}
									title="Download class progress as a CSV file"
									class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-darker-subtitle transition-colors hover:border-emphasis hover:text-text-default"
								>
									Export Progress (CSV)
								</button>
								<button
									type="button"
									onclick={openInviteModal}
									data-tour="teacher-invite"
									class="cursor-pointer rounded-lg bg-emphasis px-2.5 py-1 text-xs font-medium text-text-inverted transition-opacity hover:opacity-90"
								>
									Invite
								</button>
							</div>
						{:else if activeTab === 'assignments'}
							<button
								type="button"
								onclick={openCreateAssignmentModal}
								class="cursor-pointer rounded-lg bg-emphasis px-2.5 py-1 text-xs font-medium text-text-inverted transition-opacity hover:opacity-90"
							>
								+ New
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Overall Tab -->
			{#if activeTab === 'overall'}
				<div role="tabpanel" id="panel-overall" aria-labelledby="tab-overall" tabindex={0}>
					{#if students.length === 0}
						<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
							<p class="text-sm text-text-subtitle">No students have joined this class yet.</p>
							<p class="mt-1 text-sm text-text-subtitle">
								Share the class code <span class="font-mono font-semibold"
									>{displayedClassCode}</span
								> to get started.
							</p>
							{#if !classData.archived}
								<button
									type="button"
									onclick={openInviteModal}
									class="mt-4 cursor-pointer rounded-xl bg-emphasis px-5 py-2 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
								>
									Invite students
								</button>
							{/if}
						</div>
					{:else if students.length > 0 && hasProgressData}
						<!-- Class Case Accuracy -->
						<div class="mb-6">
							<h2 class="mb-3 text-lg font-semibold text-text-default">Class Accuracy</h2>
							<div class="grid grid-cols-4 gap-2 sm:grid-cols-8">
								<button
									type="button"
									onclick={() => (chartMetric = 'overall')}
									class="flex flex-col justify-center rounded-xl p-3 text-center transition-shadow hover:shadow-[inset_0_0_0_2px_currentColor] sm:mr-2 {avgClassAccuracy !==
									null
										? caseAccuracyColor(avgClassAccuracy)
										: 'bg-card-bg text-text-subtitle'}"
									style="box-shadow: {chartMetric === 'overall'
										? 'inset 0 0 0 2.5px currentColor'
										: ''};"
									onmouseenter={(e) => handleCaseBoxEnter(e, 'overall')}
									onmouseleave={handleCaseBoxLeave}
								>
									<p class="text-xs font-bold uppercase tracking-wide">Avg</p>
									<p class="text-xl font-extrabold">
										{avgClassAccuracy !== null ? `${Math.round(avgClassAccuracy)}%` : '--'}
									</p>
								</button>
								{#each classCaseAccuracy as caseItem (caseItem.case)}
									{@const label = isCaseKey(caseItem.case)
										? CASE_LABELS[caseItem.case]
										: caseItem.case}
									{@const isSelected = chartMetric === caseItem.case}
									<button
										type="button"
										onclick={() =>
											(chartMetric = isCaseKey(caseItem.case) ? caseItem.case : 'overall')}
										class="rounded-xl p-3 text-center transition-shadow hover:shadow-[inset_0_0_0_2px_currentColor] {caseItem.accuracy !==
										null
											? caseAccuracyColor(caseItem.accuracy)
											: 'bg-card-bg text-text-subtitle'}"
										style="box-shadow: {isSelected ? 'inset 0 0 0 2.5px currentColor' : ''};"
										onmouseenter={(e) => handleCaseBoxEnter(e, caseItem.case)}
										onmouseleave={handleCaseBoxLeave}
									>
										<p class="text-xs font-medium uppercase">{label.slice(0, 3)}</p>
										<p class="text-lg font-bold">
											{caseItem.accuracy !== null ? `${Math.round(caseItem.accuracy)}%` : '--'}
										</p>
										{#if caseItem.attempts > 0}
											<p class="text-[10px] opacity-70">
												{caseItem.correct}/{caseItem.attempts}
											</p>
										{/if}
									</button>
								{/each}
							</div>
						</div>

						<!-- Progress Over Time -->
						<div class="mb-6">
							<ProgressChart
								snapshots={progressSnapshots}
								students={chartStudents}
								mode="teacher"
								bind:selectedMetric={chartMetric}
							/>
						</div>

						<!-- Paradigm Accuracy Heatmap (teacher only) -->
						{#if role === 'teacher' && hasParadigmData}
							<div class="mb-6">
								<h2 class="mb-3 text-lg font-semibold text-text-default">Paradigm Accuracy</h2>
								<div class="flex flex-col gap-4">
									{#each PARADIGM_GROUPS.filter((g) => g.label !== 'Pronouns') as group (group.label)}
										{@const groupParadigms = group.paradigms}
										<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
											<p
												class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-subtitle"
											>
												{group.label}
											</p>
											<div class="overflow-x-auto pb-2">
												<!-- Case header labels -->
												<div class="mb-1 flex items-center">
													<div class="w-28 shrink-0"></div>
													<div class="w-5 shrink-0"></div>
													{#each CASE_META as cm (cm.key)}
														<div
															class="shrink-0 text-center text-xs text-text-subtitle"
															style="width: 32px;"
														>
															{cm.abbrev}
														</div>
													{/each}
												</div>
												<!-- Paradigm rows -->
												{#each groupParadigms as paradigm, pi (paradigm)}
													{#if pi > 0}
														<div class="my-1.5 border-t border-card-stroke"></div>
													{/if}
													<div class="flex items-center">
														<div class="w-28 shrink-0 pr-2">
															<p class="text-xs font-medium leading-tight text-text-default">
																{paradigmDisplayName(paradigm)}
															</p>
															<p class="text-xs leading-tight text-text-subtitle">
																{PARADIGM_DESC[paradigm] ?? ''}
															</p>
														</div>
														<div class="flex flex-col gap-0.5">
															<!-- Sg row -->
															<div class="flex items-center">
																<div class="w-5 shrink-0 text-right text-xs text-text-subtitle">
																	Sg
																</div>
																{#each CASE_META as cm (cm.key)}
																	{@const score = getParadigmCaseNumberScore(
																		paradigm,
																		cm.key,
																		'sg'
																	)}
																	{@const pct =
																		score.attempts > 0
																			? Math.round((score.correct / score.attempts) * 100)
																			: -1}
																	<div class="flex shrink-0 justify-center" style="width: 32px;">
																		<div
																			class="h-5 w-6 rounded-[3px]"
																			style="background-color: {pct >= 0
																				? accuracyColor(pct)
																				: 'var(--color-shaded-background)'}; opacity: {pct >= 0
																				? 0.85
																				: 1};"
																			role="gridcell"
																			tabindex="0"
																			aria-label="{paradigmDisplayName(
																				paradigm
																			)} {cm.label} singular: {pct >= 0
																				? `${pct}% accuracy, ${attemptLabel(score.attempts)}`
																				: 'no data'}"
																			onmouseenter={(e: MouseEvent) =>
																				handleCellEnter(e, paradigm, cm.key, 'sg')}
																			onmouseleave={handleCellLeave}
																			onfocus={(e: FocusEvent) =>
																				handleCellEnter(e, paradigm, cm.key, 'sg')}
																			onblur={handleCellLeave}
																		></div>
																	</div>
																{/each}
															</div>
															<!-- Pl row -->
															<div class="flex items-center">
																<div class="w-5 shrink-0 text-right text-xs text-text-subtitle">
																	Pl
																</div>
																{#each CASE_META as cm (cm.key)}
																	{@const score = getParadigmCaseNumberScore(
																		paradigm,
																		cm.key,
																		'pl'
																	)}
																	{@const pct =
																		score.attempts > 0
																			? Math.round((score.correct / score.attempts) * 100)
																			: -1}
																	<div class="flex shrink-0 justify-center" style="width: 32px;">
																		<div
																			class="h-5 w-6 rounded-[3px]"
																			style="background-color: {pct >= 0
																				? accuracyColor(pct)
																				: 'var(--color-shaded-background)'}; opacity: {pct >= 0
																				? 0.85
																				: 1};"
																			role="gridcell"
																			tabindex="0"
																			aria-label="{paradigmDisplayName(
																				paradigm
																			)} {cm.label} plural: {pct >= 0
																				? `${pct}% accuracy, ${attemptLabel(score.attempts)}`
																				: 'no data'}"
																			onmouseenter={(e: MouseEvent) =>
																				handleCellEnter(e, paradigm, cm.key, 'pl')}
																			onmouseleave={handleCellLeave}
																			onfocus={(e: FocusEvent) =>
																				handleCellEnter(e, paradigm, cm.key, 'pl')}
																			onblur={handleCellLeave}
																		></div>
																	</div>
																{/each}
															</div>
														</div>
													</div>
												{/each}
											</div>
										</div>
									{/each}
								</div>

								<h2 class="mb-3 mt-6 text-lg font-semibold text-text-default">Pronoun Accuracy</h2>
								<div class="flex flex-col gap-4">
									{#each PARADIGM_GROUPS.filter((g) => g.label === 'Pronouns') as group (group.label)}
										{@const groupParadigms = group.paradigms}
										<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
											<div class="overflow-x-auto pb-2">
												<div class="mb-1 flex items-center">
													<div class="w-28 shrink-0"></div>
													<div class="w-5 shrink-0"></div>
													{#each CASE_META as cm (cm.key)}
														<div class="flex w-16 shrink-0 flex-col items-center">
															<span class="text-[10px] font-semibold uppercase text-text-subtitle"
																>{cm.abbrev}</span
															>
														</div>
													{/each}
												</div>
												{#each groupParadigms as paradigm (paradigm)}
													{@const hasAnyData = CASE_META.some(
														(cm) =>
															(classParadigmScores[`${paradigm}_${cm.key}_sg`]?.attempts ?? 0) >
																0 ||
															(classParadigmScores[`${paradigm}_${cm.key}_pl`]?.attempts ?? 0) > 0
													)}
													{#if hasAnyData}
														<div class="flex items-center">
															<div
																class="w-28 shrink-0 truncate pr-2 text-xs font-medium text-text-default"
																title={PARADIGM_DESC[paradigm] ?? paradigm}
															>
																{paradigmDisplayName(paradigm)}
															</div>
															<div class="w-5 shrink-0"></div>
															{#each CASE_META as cm (cm.key)}
																{@const sgScore = classParadigmScores[`${paradigm}_${cm.key}_sg`]}
																{@const plScore = classParadigmScores[`${paradigm}_${cm.key}_pl`]}
																{@const totalAttempts =
																	(sgScore?.attempts ?? 0) + (plScore?.attempts ?? 0)}
																{@const totalCorrect =
																	(sgScore?.correct ?? 0) + (plScore?.correct ?? 0)}
																{@const pct =
																	totalAttempts > 0
																		? Math.round((totalCorrect / totalAttempts) * 100)
																		: -1}
																<div class="flex w-16 shrink-0 justify-center p-0.5">
																	<div
																		class="flex h-6 w-12 cursor-default items-center justify-center rounded-[4px] text-[10px] font-semibold"
																		style="background-color: {pct >= 0
																			? accuracyColor(pct)
																			: 'var(--color-shaded-background)'}; color: {pct >= 0
																			? cellTextColor(pct)
																			: 'var(--color-text-subtitle)'};"
																		aria-label="{paradigmDisplayName(paradigm)} {cm.label}: {pct >=
																		0
																			? `${pct}% accuracy`
																			: 'no data'}"
																		role="gridcell"
																		tabindex="0"
																		onmouseenter={(e: MouseEvent) =>
																			handleCellEnter(e, paradigm, cm.key, 'sg')}
																		onmouseleave={handleCellLeave}
																		onfocus={(e: FocusEvent) =>
																			handleCellEnter(e, paradigm, cm.key, 'sg')}
																		onblur={handleCellLeave}
																	>
																		{pct >= 0 ? `${pct}%` : '–'}
																	</div>
																</div>
															{/each}
														</div>
													{/if}
												{/each}
											</div>
										</div>
									{/each}
								</div>

								{#if hasAdjectiveData}
									<div class="mb-3 mt-6 flex items-center justify-between">
										<h2 class="text-lg font-semibold text-text-default">Adjective Accuracy</h2>
										<div class="flex items-center gap-1">
											{#each CLASS_ADJ_GENDER_FILTER_OPTIONS as opt (opt.value)}
												<button
													class="rounded-md px-2 py-1 text-xs transition-colors {classAdjGenderFilter ===
													opt.value
														? 'bg-accent-blue text-white'
														: 'bg-shaded-background text-text-subtitle hover:text-text-default'}"
													onclick={() => (classAdjGenderFilter = opt.value)}
												>
													{opt.label}
												</button>
											{/each}
										</div>
									</div>
									<div class="flex flex-col gap-4">
										<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
											<div class="overflow-x-auto pb-2">
												<div class="mb-1 flex items-center">
													<div class="w-28 shrink-0"></div>
													<div class="w-5 shrink-0"></div>
													{#each CASE_META as cm (cm.key)}
														<div
															class="shrink-0 text-center text-xs text-text-subtitle"
															style="width: 32px;"
														>
															{cm.abbrev}
														</div>
													{/each}
												</div>
												{#each ADJ_GROUPS as group, gi (group.suffix)}
													{@const matchingLemmas = activeClassAdjectiveLemmas.filter((l) =>
														l.endsWith(group.suffix)
													)}
													{@const hasAnyData = CASE_META.some(
														(cm) =>
															getAdjGroupClassScore(
																matchingLemmas,
																cm.key,
																'sg',
																classAdjGenderFilter
															).attempts > 0 ||
															getAdjGroupClassScore(
																matchingLemmas,
																cm.key,
																'pl',
																classAdjGenderFilter
															).attempts > 0
													)}
													{#if hasAnyData}
														{#if gi > 0}
															<div class="my-1.5 border-t border-card-stroke"></div>
														{/if}
														<div class="flex items-center">
															<div class="w-28 shrink-0 pr-2">
																<p class="text-xs font-medium leading-tight text-text-default">
																	{group.label}
																</p>
																<p class="text-xs leading-tight text-text-subtitle">
																	{group.description}
																</p>
															</div>
															<div class="flex flex-col gap-0.5">
																<!-- Sg row -->
																<div class="flex items-center">
																	<div class="w-5 shrink-0 text-right text-xs text-text-subtitle">
																		Sg
																	</div>
																	{#each CASE_META as cm (cm.key)}
																		{@const score = getAdjGroupClassScore(
																			matchingLemmas,
																			cm.key,
																			'sg',
																			classAdjGenderFilter
																		)}
																		{@const pct =
																			score.attempts > 0
																				? Math.round((score.correct / score.attempts) * 100)
																				: -1}
																		<div class="flex shrink-0 justify-center" style="width: 32px;">
																			<div
																				class="h-5 w-6 rounded-[3px]"
																				style="background-color: {pct >= 0
																					? accuracyColor(pct)
																					: 'var(--color-shaded-background)'}; opacity: {pct >= 0
																					? 0.85
																					: 1};"
																				role="gridcell"
																				tabindex="0"
																				aria-label="{group.label} {cm.label} singular: {pct >= 0
																					? `${pct}% accuracy, ${attemptLabel(score.attempts)}`
																					: 'no data'}"
																				onmouseenter={(e: MouseEvent) =>
																					handleCellEnter(
																						e,
																						`adjgroup_${group.suffix}`,
																						cm.key,
																						'sg'
																					)}
																				onmouseleave={handleCellLeave}
																				onfocus={(e: FocusEvent) =>
																					handleCellEnter(
																						e,
																						`adjgroup_${group.suffix}`,
																						cm.key,
																						'sg'
																					)}
																				onblur={handleCellLeave}
																			></div>
																		</div>
																	{/each}
																</div>
																<!-- Pl row -->
																<div class="flex items-center">
																	<div class="w-5 shrink-0 text-right text-xs text-text-subtitle">
																		Pl
																	</div>
																	{#each CASE_META as cm (cm.key)}
																		{@const score = getAdjGroupClassScore(
																			matchingLemmas,
																			cm.key,
																			'pl',
																			classAdjGenderFilter
																		)}
																		{@const pct =
																			score.attempts > 0
																				? Math.round((score.correct / score.attempts) * 100)
																				: -1}
																		<div class="flex shrink-0 justify-center" style="width: 32px;">
																			<div
																				class="h-5 w-6 rounded-[3px]"
																				style="background-color: {pct >= 0
																					? accuracyColor(pct)
																					: 'var(--color-shaded-background)'}; opacity: {pct >= 0
																					? 0.85
																					: 1};"
																				role="gridcell"
																				tabindex="0"
																				aria-label="{group.label} {cm.label} plural: {pct >= 0
																					? `${pct}% accuracy, ${attemptLabel(score.attempts)}`
																					: 'no data'}"
																				onmouseenter={(e: MouseEvent) =>
																					handleCellEnter(
																						e,
																						`adjgroup_${group.suffix}`,
																						cm.key,
																						'pl'
																					)}
																				onmouseleave={handleCellLeave}
																				onfocus={(e: FocusEvent) =>
																					handleCellEnter(
																						e,
																						`adjgroup_${group.suffix}`,
																						cm.key,
																						'pl'
																					)}
																				onblur={handleCellLeave}
																			></div>
																		</div>
																	{/each}
																</div>
															</div>
														</div>
													{/if}
												{/each}
											</div>
										</div>
									</div>
								{/if}

								<!-- Legend -->
								<div
									class="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs text-darker-subtitle"
								>
									<div class="flex items-center gap-1">
										<div
											class="h-3 w-3 rounded-[2px]"
											style="background-color: var(--color-shaded-background);"
										></div>
										No data
									</div>
									<div class="flex items-center gap-1">
										<div class="h-3 w-3 rounded-[2px]" style="background-color: #ef4444;"></div>
										&lt;40%
									</div>
									<div class="flex items-center gap-1">
										<div class="h-3 w-3 rounded-[2px]" style="background-color: #f97316;"></div>
										40–59%
									</div>
									<div class="flex items-center gap-1">
										<div class="h-3 w-3 rounded-[2px]" style="background-color: #eab308;"></div>
										60–79%
									</div>
									<div class="flex items-center gap-1">
										<div class="h-3 w-3 rounded-[2px]" style="background-color: #22c55e;"></div>
										≥80%
									</div>
								</div>
							</div>
						{/if}
					{:else if students.length > 0 && !hasProgressData}
						<!-- Empty progress state -->
						<div
							class="mb-6 rounded-2xl border border-card-stroke bg-card-bg p-8 text-center"
							data-tour="teacher-accuracy"
						>
							<ChartPie class="mx-auto mb-3 size-10 text-text-subtitle" aria-hidden="true" />
							<h2 class="mb-1 text-base font-semibold text-text-default">No progress data yet</h2>
							<p class="text-sm text-text-subtitle">
								Once your students start practicing, accuracy stats and progress charts will appear
								here.
							</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Students Tab -->
			{#if activeTab === 'students'}
				<div role="tabpanel" id="panel-students" aria-labelledby="tab-students" tabindex={0}>
					<!-- Student roster -->
					<div class="mb-6" data-tour="teacher-roster">
						{#if students.length === 0}
							<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
								<p class="text-sm text-text-subtitle">No students have joined this class yet.</p>
								<p class="mt-1 text-sm text-text-subtitle">
									Share the class code <span class="font-mono font-semibold"
										>{displayedClassCode}</span
									> to get started.
								</p>
								{#if !classData.archived}
									<button
										type="button"
										onclick={openInviteModal}
										class="mt-4 cursor-pointer rounded-xl bg-emphasis px-5 py-2 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
									>
										Invite students
									</button>
								{/if}
							</div>
						{:else}
							<!-- Search input -->
							<div class="mb-3">
								<input
									type="text"
									placeholder="Search by name or email..."
									bind:value={searchQuery}
									class="w-full rounded-xl border border-card-stroke bg-card-bg px-4 py-2 text-sm text-text-default placeholder:text-text-subtitle outline-none transition-colors focus:border-emphasis"
								/>
							</div>
							<div class="overflow-hidden rounded-2xl border border-card-stroke bg-card-bg">
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead>
											<tr class="border-b border-card-stroke bg-shaded-background">
												<th class="w-8 px-2 py-3"></th>
												<th class="px-4 py-3 text-left font-medium text-text-subtitle">
													<button
														type="button"
														class="cursor-pointer hover:text-text-default"
														onclick={() => toggleSort('name')}
													>
														Name{sortIndicator('name')}
													</button>
												</th>
												<th class="px-4 py-3 text-left font-medium text-text-subtitle">Joined</th>
												<th class="px-4 py-3 text-left font-medium text-text-subtitle">
													<button
														type="button"
														class="cursor-pointer hover:text-text-default"
														onclick={() => toggleSort('accuracy')}
													>
														Accuracy{sortIndicator('accuracy')}
													</button>
												</th>
												<th class="px-4 py-3 text-left font-medium text-text-subtitle">
													<button
														type="button"
														class="cursor-pointer hover:text-text-default"
														onclick={() => toggleSort('practiced')}
													>
														Practiced{sortIndicator('practiced')}
													</button>
												</th>
												{#if !classData.archived}
													<th class="w-16 px-2 py-3"></th>
												{/if}
											</tr>
										</thead>
										<tbody>
											{#each filteredStudents as student (student.studentId)}
												{@const isStruggling =
													student.overallAccuracy !== null &&
													student.overallAccuracy < strugglingThreshold &&
													student.totalAttempts > 0}
												<tr
													class="cursor-pointer border-b transition-colors last:border-b-0 {isStruggling
														? 'border-negative-stroke/40 bg-negative-background/50 hover:bg-negative-background/70'
														: 'border-card-stroke hover:bg-shaded-background/50'}"
													role="button"
													tabindex={0}
													aria-expanded={expandedStudents.has(student.studentId)}
													onclick={() => toggleStudent(student.studentId)}
													onkeydown={(e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															e.preventDefault();
															toggleStudent(student.studentId);
														}
													}}
												>
													<td class="px-2 py-3 text-center text-text-subtitle">
														<span
															class="inline-block transition-transform {expandedStudents.has(
																student.studentId
															)
																? 'rotate-90'
																: ''}"
														>
															&#9654;
														</span>
													</td>
													<td class="px-4 py-3 text-text-default">
														<span class="inline-flex items-center gap-2">
															{studentDisplayName(student)}
															{#if student.overallAccuracy !== null && student.overallAccuracy < strugglingThreshold && student.totalAttempts > 0}
																<span
																	class="shrink-0 rounded-full bg-negative-background px-2 py-0.5 text-[10px] font-semibold text-negative-stroke"
																>
																	Struggling
																</span>
															{/if}
														</span>
													</td>
													<td class="px-4 py-3 text-text-subtitle">
														{new Date(student.joinedAt).toLocaleDateString()}
													</td>
													<td class="px-4 py-3 text-text-subtitle">
														{formatAccuracy(student.overallAccuracy)}
													</td>
													<td class="px-4 py-3 text-text-subtitle">
														{student.totalAttempts}
													</td>
													{#if !classData.archived}
														<td class="relative px-2 py-3">
															{#if confirmingRemoveStudentId === student.studentId}
																<div
																	class="absolute right-0 top-full z-10 mt-1 w-52 rounded-xl border border-card-stroke bg-card-bg p-3 shadow-lg"
																>
																	<p class="mb-2 text-xs text-text-subtitle">
																		Remove {studentDisplayName(student)} from class?
																	</p>
																	<div class="flex items-center gap-2">
																		<form
																			method="POST"
																			action="?/removeStudent"
																			use:enhance={() => {
																				return async ({ result, update }) => {
																					if (result.type === 'success') {
																						const name = studentDisplayName(student);
																						removeSuccessMessage = `${name} has been removed from the class.`;
																						if (removeSuccessTimer)
																							clearTimeout(removeSuccessTimer);
																						removeSuccessTimer = setTimeout(() => {
																							removeSuccessMessage = null;
																						}, 3000);
																					}
																					confirmingRemoveStudentId = null;
																					await update();
																				};
																			}}
																		>
																			<input
																				type="hidden"
																				name="studentId"
																				value={student.studentId}
																			/>
																			<button
																				type="submit"
																				class="cursor-pointer rounded-lg border border-negative-stroke px-2.5 py-1 text-xs font-medium text-negative-stroke transition-colors hover:bg-negative-background"
																				onclick={(e) => e.stopPropagation()}
																			>
																				Yes, remove
																			</button>
																		</form>
																		<button
																			type="button"
																			onclick={(e) => {
																				e.stopPropagation();
																				confirmingRemoveStudentId = null;
																			}}
																			class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
																		>
																			Cancel
																		</button>
																	</div>
																</div>
															{/if}
															<button
																type="button"
																class="cursor-pointer text-xs text-text-subtitle hover:text-red-500"
																onclick={(e) => {
																	e.stopPropagation();
																	confirmingRemoveStudentId =
																		confirmingRemoveStudentId === student.studentId
																			? null
																			: student.studentId;
																}}
															>
																Remove
															</button>
														</td>
													{/if}
												</tr>
												{#if expandedStudents.has(student.studentId)}
													<tr class="border-b border-card-stroke last:border-b-0">
														<td
															colspan={classData.archived ? 5 : 6}
															class="bg-shaded-background px-4 py-4"
														>
															<div class="space-y-4">
																<!-- Per-case accuracy breakdown -->
																<div>
																	<h4
																		class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtitle"
																	>
																		Case Accuracy
																	</h4>
																	<div class="grid grid-cols-7 gap-1.5">
																		{#each ALL_CASES as c (c)}
																			{@const score = findCaseScore(student.caseScores, c)}
																			<div
																				class="rounded-lg p-2 text-center {score
																					? caseAccuracyColor(score.accuracy)
																					: 'bg-shaded-background text-text-subtitle'}"
																			>
																				<p class="text-[10px] font-medium uppercase">
																					{CASE_LABELS[c].slice(0, 3)}
																				</p>
																				<p class="text-sm font-bold">
																					{score ? `${Math.round(score.accuracy)}%` : '--'}
																				</p>
																				{#if score}
																					<p class="text-[9px] opacity-70">
																						{score.correct}/{score.attempts}
																					</p>
																				{/if}
																			</div>
																		{/each}
																	</div>
																</div>

																<!-- Recent Mistakes -->
																{#if student.recentMistakes.length > 0}
																	<div>
																		<h4
																			class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtitle"
																		>
																			Recent Mistakes
																		</h4>
																		<div class="space-y-2">
																			{#each student.recentMistakes as mistake (mistake.word + mistake.expectedForm + mistake.givenAnswer + mistake.case)}
																				{@const isCaseId = isCaseKey(mistake.expectedForm)}
																				{@const isMultiStep = mistake.drillType === 'multi_step'}
																				{@const isSentenceFillIn =
																					mistake.drillType === 'sentence_fill_in'}
																				{@const hasParadigmError =
																					isMultiStep &&
																					mistake.paradigmCorrect === false &&
																					!!mistake.userParadigm &&
																					!!mistake.correctParadigm}
																				{@const hasFormError =
																					isMultiStep && mistake.formCorrect === false}
																				{#if isMultiStep}
																					{#if hasParadigmError}
																						<div
																							class="rounded-lg border border-card-stroke bg-card-bg px-3 py-2.5"
																						>
																							<p class="mb-1 text-sm font-medium text-text-default">
																								Identify paradigm of "{mistake.word}"
																							</p>
																							<p class="text-xs text-text-subtitle">
																								correct:
																								<span class="text-positive-stroke"
																									>{mistake.correctParadigm}</span
																								>
																								&middot; their answer:
																								<span class="text-negative-stroke"
																									>{mistake.userParadigm}</span
																								>
																							</p>
																						</div>
																					{/if}
																					{#if hasFormError}
																						<div
																							class="rounded-lg border border-card-stroke bg-card-bg px-3 py-2.5"
																						>
																							<p class="mb-1 text-sm font-medium text-text-default">
																								Decline "{mistake.word}" &rarr; {caseLabelFromKey(
																									mistake.case
																								)}
																								{mistake.number === 'sg' ? 'Sg' : 'Pl'}
																							</p>
																							<p class="text-xs text-text-subtitle">
																								correct:
																								<span class="text-positive-stroke"
																									>{mistake.expectedForm}</span
																								>
																								&middot; their answer:
																								<span class="text-negative-stroke"
																									>{mistake.givenAnswer}</span
																								>
																							</p>
																						</div>
																					{/if}
																				{:else}
																					<div
																						class="rounded-lg border border-card-stroke bg-card-bg px-3 py-2.5"
																					>
																						{#if mistake.drillType === 'case_identification'}
																							<p class="mb-1 text-sm font-medium text-text-default">
																								Identify the case of "{mistake.word}" {#if mistake.sentence}
																									in:{/if}
																							</p>
																							{#if mistake.sentence}
																								<p class="mb-1 text-xs italic text-text-subtitle">
																									{sentenceWithBrackets(
																										mistake.sentence,
																										mistake.expectedForm,
																										mistake.word
																									)}
																								</p>
																							{/if}
																						{:else if isSentenceFillIn}
																							<p class="mb-1 text-sm font-medium text-text-default">
																								Fill in "{mistake.word}"
																							</p>
																							{#if mistake.sentence}
																								<p class="mb-1 text-xs italic text-text-subtitle">
																									{sentenceWithBlank(
																										mistake.sentence,
																										mistake.expectedForm
																									)}
																								</p>
																							{/if}
																						{:else if mistake.drillType === 'form_production'}
																							<p class="mb-1 text-sm font-medium text-text-default">
																								Decline "{mistake.word}" &rarr; {caseLabelFromKey(
																									mistake.case
																								)}
																								{mistake.number === 'sg' ? 'Sg' : 'Pl'}
																							</p>
																						{:else}
																							<p class="mb-1 text-sm font-medium text-text-default">
																								"{mistake.word}" &mdash;
																								{caseLabelFromKey(mistake.case)}
																								{mistake.number === 'sg' ? 'Sg' : 'Pl'}
																							</p>
																							{#if mistake.sentence}
																								<p class="mb-1 text-xs italic text-text-subtitle">
																									{mistake.sentence}
																								</p>
																							{/if}
																						{/if}
																						<p class="text-xs text-text-subtitle">
																							correct:
																							<span class="text-positive-stroke"
																								>{isCaseId
																									? caseLabelFromKey(mistake.expectedForm)
																									: mistake.expectedForm}</span
																							>{#if isSentenceFillIn}&nbsp;<span
																									class="text-text-subtitle"
																									>{caseLabelFromKey(mistake.case)}
																									{numberLabel(mistake.number)})</span
																								>{/if}
																							&middot; their answer:
																							<span class="text-negative-stroke"
																								>{isCaseId
																									? caseLabelFromKey(mistake.givenAnswer)
																									: mistake.givenAnswer}</span
																							>
																							{#if !isSentenceFillIn}({caseLabelFromKey(
																									mistake.case
																								)}
																								{numberLabel(mistake.number)}){/if}
																						</p>
																					</div>
																				{/if}
																			{/each}
																		</div>
																	</div>
																{/if}

																<!-- Assignment progress -->
																<div>
																	<h4
																		class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtitle"
																	>
																		Assignment Progress
																	</h4>
																	{#if student.assignmentStatuses.length === 0}
																		<p class="text-sm text-text-subtitle">No assignments yet.</p>
																	{:else}
																		{@const activeStatuses = student.assignmentStatuses.filter(
																			(s) => !s.completed
																		)}
																		{@const completedStatuses = student.assignmentStatuses.filter(
																			(s) => s.completed
																		)}
																		{@const showingCompleted = showCompletedAssignments.has(
																			student.studentId
																		)}
																		{@const visibleStatuses = showingCompleted
																			? student.assignmentStatuses
																			: activeStatuses}
																		{#if visibleStatuses.length > 0}
																			<div class="space-y-2">
																				{#each visibleStatuses as status (status.assignmentId)}
																					<div class="rounded-lg bg-card-bg p-3">
																						<div class="flex items-center justify-between">
																							<span class="text-sm font-medium text-text-default">
																								{status.assignmentTitle}
																							</span>
																							<span
																								class="rounded-full px-2 py-0.5 text-xs font-medium {status.completed
																									? 'bg-positive-stroke/20 text-positive-stroke'
																									: 'bg-shaded-background text-text-subtitle'}"
																							>
																								{status.completed ? 'Completed' : 'In Progress'}
																							</span>
																						</div>
																						<div
																							class="mt-2 flex items-center gap-3 text-xs text-text-subtitle"
																						>
																							<span>
																								{Math.min(
																									status.attempted,
																									status.target
																								)}/{status.target} questions
																							</span>
																							<span>
																								{status.attempted > 0
																									? `${Math.round((status.correct / status.attempted) * 100)}% correct`
																									: 'Not started'}
																							</span>
																						</div>
																						<div
																							class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-shaded-background"
																						>
																							<div
																								class="h-full rounded-full {status.completed
																									? 'bg-positive-stroke'
																									: 'bg-emphasis'}"
																								style="width: {Math.min(
																									100,
																									(status.attempted / Math.max(1, status.target)) *
																										100
																								)}%"
																							></div>
																						</div>
																					</div>
																				{/each}
																			</div>
																		{:else}
																			<p class="text-sm text-text-subtitle">
																				All assignments completed!
																			</p>
																		{/if}
																		{#if completedStatuses.length > 0}
																			<button
																				type="button"
																				class="mt-2 cursor-pointer text-xs text-text-subtitle transition-colors hover:text-text-default"
																				onclick={(e) => {
																					e.stopPropagation();
																					toggleCompletedAssignments(student.studentId);
																				}}
																			>
																				{showingCompleted
																					? 'Hide completed'
																					: `Show ${completedStatuses.length} completed`}
																			</button>
																		{/if}
																	{/if}
																</div>
															</div>
														</td>
													</tr>
												{/if}
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Assignments Tab -->
			{#if activeTab === 'assignments'}
				<div role="tabpanel" id="panel-assignments" aria-labelledby="tab-assignments" tabindex={0}>
					{#if assignments.length === 0}
						<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
							<p class="text-sm text-text-subtitle">No assignments yet.</p>
							{#if !classData.archived}
								<button
									type="button"
									onclick={openCreateAssignmentModal}
									class="mt-2 cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
								>
									Create First Assignment
								</button>
							{/if}
						</div>
					{:else}
						<!-- Filter bar + search -->
						<div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
							<div class="flex flex-wrap gap-1">
								{#each ASSIGNMENT_FILTER_OPTIONS as item (item.value)}
									<button
										type="button"
										onclick={() => {
											assignmentFilter = item.value;
											showAllAssignments = false;
										}}
										class="cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors {assignmentFilter ===
										item.value
											? 'border-emphasis bg-emphasis text-text-inverted'
											: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-emphasis hover:text-text-default'}"
									>
										{item.label}
									</button>
								{/each}
							</div>
							<input
								type="text"
								placeholder="Search assignments..."
								bind:value={assignmentSearch}
								class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-1.5 text-sm text-text-default placeholder:text-text-subtitle outline-none transition-colors focus:border-emphasis sm:ml-auto sm:w-48"
							/>
						</div>

						{#if filteredAssignments.length === 0}
							<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
								<p class="text-sm text-text-subtitle">No assignments match the current filters.</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each visibleAssignments as assignment (assignment.id)}
									{@const allDone =
										assignment.totalStudents > 0 &&
										assignment.completedCount >= assignment.totalStudents}
									{@const dueInfo = getDueInfo(assignment.dueDate, allDone)}
									{@const completionPct =
										assignment.totalStudents > 0
											? Math.round((assignment.completedCount / assignment.totalStudents) * 100)
											: 0}
									<a
										href={resolve(`/classes/${classData.id}/assignments/${assignment.id}`)}
										class="block rounded-2xl border p-4 transition-colors {allDone
											? 'border-card-stroke bg-card-bg opacity-60 hover:opacity-100'
											: dueInfo?.urgency === 'overdue'
												? 'border-negative-stroke bg-negative-background hover:opacity-90'
												: 'border-card-stroke bg-card-bg hover:border-emphasis'}"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex-1">
												<div class="flex flex-wrap items-center gap-2">
													<h3 class="font-semibold text-text-default">
														{assignment.title}
													</h3>
													{#if allDone}
														<span
															class="shrink-0 rounded-full bg-positive-background px-2 py-0.5 text-[11px] font-semibold text-positive-stroke"
														>
															All completed
														</span>
													{:else if dueInfo}
														<span
															class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold {dueInfo.pillClass}"
														>
															{dueInfo.label}
														</span>
													{/if}
												</div>
												{#if assignment.description}
													<p class="mt-0.5 text-sm text-text-subtitle">
														{assignment.description}
													</p>
												{/if}
												<div class="mt-2 flex flex-wrap gap-1">
													{#each assignment.selectedCases as c (c)}
														{#if isCaseKey(c)}
															<span
																class="rounded-full px-2 py-0.5 text-xs {dueInfo?.urgency ===
																'overdue'
																	? 'bg-negative-stroke/15 text-negative-stroke'
																	: 'bg-shaded-background text-text-subtitle'}"
															>
																{CASE_LABELS[c]}
															</span>
														{/if}
													{/each}
												</div>
												<div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
													<div class="flex items-center gap-2">
														<div
															class="h-1.5 w-20 overflow-hidden rounded-full {dueInfo?.urgency ===
															'overdue'
																? 'bg-negative-stroke/20'
																: 'bg-card-stroke/40'}"
														>
															<div
																class="h-full rounded-full transition-all {allDone
																	? 'bg-positive-stroke'
																	: dueInfo?.urgency === 'overdue'
																		? 'bg-negative-stroke'
																		: 'bg-emphasis'}"
																style="width: {completionPct}%"
															></div>
														</div>
														<span class="text-xs tabular-nums text-text-subtitle">
															{assignment.completedCount}/{assignment.totalStudents} completed
														</span>
													</div>
													{#if assignment.avgAccuracy !== null}
														<span class="text-xs text-text-subtitle">
															<span class="font-medium text-text-default"
																>{assignment.avgAccuracy}%</span
															> avg accuracy
														</span>
													{/if}
													<span class="text-xs text-text-subtitle">
														{assignment.targetQuestions} questions
													</span>
												</div>
											</div>
										</div>
									</a>
								{/each}
							</div>

							{#if hasMoreAssignments && !showAllAssignments}
								<div class="mt-3 text-center">
									<button
										type="button"
										onclick={() => (showAllAssignments = true)}
										class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-darker-subtitle transition-colors hover:border-emphasis hover:text-text-default"
									>
										Show all {filteredAssignments.length} assignments
									</button>
								</div>
							{/if}
						{/if}
					{/if}
				</div>
			{/if}
		{/if}

		<!-- ==================== STUDENT VIEW ==================== -->
		{#if role === 'student'}
			<!-- Assignments -->
			<div class="mb-6">
				<div class="mb-3 flex items-center gap-2">
					<h2 class="text-lg font-semibold text-text-default">Assignments</h2>
					<span class="rounded-full bg-emphasis/15 px-2 py-0.5 text-xs font-semibold text-emphasis">
						{assignments.length}
					</span>
				</div>
				{#if assignments.length === 0}
					<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
						<p class="text-sm text-text-subtitle">
							No assignments yet. They'll appear here when your teacher creates them.
						</p>
					</div>
				{:else}
					<!-- Filter bar -->
					<div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
						<div class="flex flex-wrap gap-1">
							{#each ASSIGNMENT_FILTER_OPTIONS as item (item.value)}
								<button
									type="button"
									onclick={() => {
										assignmentFilter = item.value;
										showAllAssignments = false;
									}}
									class="cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors {assignmentFilter ===
									item.value
										? 'border-emphasis bg-emphasis text-text-inverted'
										: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-emphasis hover:text-text-default'}"
								>
									{item.label}
								</button>
							{/each}
						</div>
						<input
							type="text"
							placeholder="Search assignments..."
							bind:value={assignmentSearch}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-1.5 text-sm text-text-default placeholder:text-text-subtitle outline-none transition-colors focus:border-emphasis sm:ml-auto sm:w-48"
						/>
					</div>

					{#if filteredAssignments.length === 0}
						<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
							<p class="text-sm text-text-subtitle">No assignments match the current filters.</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each visibleAssignments as assignment (assignment.id)}
								{@const studentStatus = studentAssignmentProgressMap.get(assignment.id)}
								{@const isDone = studentStatus?.completed === true}
								{@const dueInfo = getDueInfo(assignment.dueDate, isDone)}
								{@const status = studentStatus ?? {
									assignmentId: assignment.id,
									assignmentTitle: assignment.title,
									attempted: 0,
									target: assignment.targetQuestions,
									correct: 0,
									completed: false
								}}
								{@const progressPct =
									status.target > 0
										? Math.min(100, Math.round((status.attempted / status.target) * 100))
										: 0}
								<div
									role="button"
									tabindex={0}
									onclick={() =>
										goto(resolve(`/classes/${classData.id}/assignments/${assignment.id}`))}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											goto(resolve(`/classes/${classData.id}/assignments/${assignment.id}`));
										}
									}}
									class="flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors sm:p-4 {isDone
										? 'border-card-stroke bg-card-bg opacity-60 hover:opacity-100'
										: dueInfo?.urgency === 'overdue'
											? 'border-negative-stroke bg-negative-background hover:opacity-90'
											: dueInfo?.urgency === 'soon'
												? 'border-orange-400/60 bg-orange-50 hover:opacity-90 dark:bg-orange-950/30'
												: 'border-card-stroke bg-card-bg hover:border-emphasis/40'}"
								>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2">
											<h3 class="text-sm font-semibold text-text-default">
												{assignment.title}
											</h3>
											{#if dueInfo}
												<span
													class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold {dueInfo.pillClass}"
												>
													{dueInfo.label}
												</span>
											{/if}
										</div>
										{#if assignment.description}
											<p class="mt-0.5 text-xs text-text-subtitle">
												{assignment.description}
											</p>
										{/if}
									</div>
									<div class="flex shrink-0 items-center gap-3">
										<div class="flex flex-col items-end gap-0.5">
											<span class="text-xs font-medium tabular-nums text-text-default">
												{Math.min(status.attempted, status.target)}/{status.target}
											</span>
											<div
												class="h-1.5 w-16 overflow-hidden rounded-full {dueInfo?.urgency ===
												'overdue'
													? 'bg-negative-stroke/20'
													: 'bg-card-stroke/40'}"
											>
												<div
													class="h-full rounded-full {isDone
														? 'bg-positive-stroke'
														: dueInfo?.urgency === 'overdue'
															? 'bg-negative-stroke'
															: 'bg-emphasis'}"
													style="width: {progressPct}%"
												></div>
											</div>
										</div>
										{#if !isDone}
											<a
												href="{resolve('/')}?assignment={assignment.id}"
												onclick={(e) => e.stopPropagation()}
												onkeydown={(e) => e.stopPropagation()}
												class="rounded-lg bg-emphasis px-3 py-1 text-xs font-semibold text-text-inverted transition-opacity hover:opacity-90"
											>
												Practice
											</a>
										{/if}
									</div>
								</div>
							{/each}
						</div>

						{#if hasMoreAssignments && !showAllAssignments}
							<div class="mt-3 text-center">
								<button
									type="button"
									onclick={() => (showAllAssignments = true)}
									class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-darker-subtitle transition-colors hover:border-emphasis hover:text-text-default"
								>
									Show all {filteredAssignments.length} assignments
								</button>
							</div>
						{/if}
					{/if}
				{/if}
			</div>

			<!-- Leave Class -->
			<div class="mb-6">
				{#if leaveError}
					<div
						class="mb-3 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-3 text-sm text-negative-stroke"
					>
						{leaveError}
					</div>
				{/if}
				{#if confirmingLeave}
					<div class="flex items-center gap-2">
						<span class="text-sm text-darker-subtitle"
							>Are you sure you want to leave this class?</span
						>
						<form
							method="POST"
							action="?/leaveClass"
							use:enhance={() => {
								leaveSubmitting = true;
								leaveError = null;
								return async ({ result }) => {
									leaveSubmitting = false;
									if (result.type === 'redirect') {
										// eslint-disable-next-line svelte/no-navigation-without-resolve -- result.location is server-side resolved URL
										goto(result.location);
									} else if (result.type === 'failure') {
										const data: unknown = result.data;
										if (isRecord(data) && typeof data.message === 'string') {
											leaveError = data.message;
										} else {
											leaveError = 'Failed to leave class.';
										}
										confirmingLeave = false;
									}
								};
							}}
						>
							<button
								type="submit"
								disabled={leaveSubmitting}
								class="cursor-pointer rounded-xl border border-negative-stroke px-4 py-2 text-sm font-medium text-negative-stroke transition-colors hover:bg-negative-background disabled:opacity-50"
							>
								{leaveSubmitting ? 'Leaving...' : 'Yes, leave'}
							</button>
						</form>
						<button
							type="button"
							onclick={() => (confirmingLeave = false)}
							class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-darker-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							Cancel
						</button>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (confirmingLeave = true)}
						class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-darker-subtitle transition-colors hover:border-negative-stroke hover:text-negative-stroke"
					>
						Leave Class
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Invite Students Modal -->
	{#if showInviteModal && classData}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				class="absolute inset-0 bg-black/50"
				onclick={closeInviteModal}
				role="presentation"
			></div>
			<div
				bind:this={inviteModalEl}
				role="dialog"
				aria-modal="true"
				aria-labelledby="invite-modal-heading"
				tabindex={-1}
				onkeydown={inviteModalKeydown}
				class="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
			>
				<!-- Close button -->
				<button
					type="button"
					aria-label="Close"
					onclick={closeInviteModal}
					class="absolute right-4 top-4 cursor-pointer text-text-subtitle transition-colors hover:text-text-default"
				>
					<X class="h-5 w-5" aria-hidden="true" />
				</button>

				<h2 id="invite-modal-heading" class="mb-4 text-xl font-semibold text-text-default">
					Invite Students
				</h2>

				<!-- Class code -->
				<div class="mb-6 rounded-xl bg-shaded-background p-4">
					<p class="mb-2 text-sm text-text-subtitle">Share this class code with students:</p>
					<div class="flex items-center gap-2">
						<span class="font-mono text-2xl font-bold tracking-widest text-text-default">
							{displayedClassCode}
						</span>
						<button
							type="button"
							onclick={copyCodeFromModal}
							class="cursor-pointer rounded-xl border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							{modalCodeCopied ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>

				<!-- Email invite form -->
				<h3 class="mb-2 text-sm font-semibold text-text-default">Or invite by email</h3>

				{#if inviteError}
					<div
						class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-3 text-sm text-negative-stroke"
					>
						{inviteError}
					</div>
				{/if}

				{#if inviteSuccess}
					<div
						class="mb-4 rounded-xl border border-positive-stroke/30 bg-positive-background px-4 py-3 text-sm text-positive-stroke"
					>
						{inviteSuccess}
					</div>
				{/if}

				<form
					method="POST"
					action={resolve(`/classes/${classData.id}/invite`)}
					use:enhance={() => {
						inviteSubmitting = true;
						return async ({ result }) => {
							inviteSubmitting = false;
							if (result.type === 'success') {
								const data: unknown = result.data;
								if (isRecord(data) && typeof data.message === 'string') {
									inviteSuccess = data.message;
								} else {
									inviteSuccess = 'Invitations sent successfully.';
								}
								inviteError = null;
							} else if (result.type === 'failure') {
								const data: unknown = result.data;
								if (isRecord(data) && typeof data.message === 'string') {
									inviteError = data.message;
								} else {
									inviteError = 'Failed to send invitations.';
								}
								inviteSuccess = null;
							}
						};
					}}
				>
					<div class="flex flex-col gap-2">
						<textarea
							name="emails"
							required
							placeholder="student1@example.com, student2@example.com"
							rows={3}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						></textarea>
						<p class="text-xs text-text-subtitle">
							Separate multiple emails with commas or newlines.
						</p>
						<button
							type="submit"
							disabled={inviteSubmitting}
							class="cursor-pointer self-end rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{inviteSubmitting ? 'Sending...' : 'Send Invites'}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Create Assignment Modal -->
	{#if showCreateAssignmentModal && classData}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				class="absolute inset-0 bg-black/50"
				onclick={closeAssignmentModal}
				role="presentation"
			></div>
			<div
				bind:this={assignmentModalEl}
				role="dialog"
				aria-modal="true"
				aria-labelledby="assignment-modal-heading"
				tabindex={-1}
				onkeydown={assignmentModalKeydown}
				class="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
				data-modal
			>
				<!-- Close button -->
				<button
					type="button"
					aria-label="Close"
					onclick={closeAssignmentModal}
					class="absolute right-4 top-4 cursor-pointer text-text-subtitle transition-colors hover:text-text-default"
				>
					<X class="h-5 w-5" aria-hidden="true" />
				</button>

				<h2 id="assignment-modal-heading" class="mb-4 text-xl font-semibold text-text-default">
					Create Assignment
				</h2>

				<form
					method="POST"
					action={resolve(`/classes/${classData.id}/assignments/new`)}
					onsubmit={validateAssignmentForm}
					use:enhance={() => {
						assignmentSubmitting = true;
						return async ({ result }) => {
							assignmentSubmitting = false;
							if (result.type === 'redirect' || result.type === 'success') {
								// Stay on the class page and refresh data so the new assignment
								// appears in the list without navigating to it.
								showCreateAssignmentModal = false;
								assignmentOpenerEl = null;
								await invalidateAll();
							} else if (result.type === 'failure') {
								const data: unknown = result.data;
								if (isRecord(data) && typeof data.message === 'string') {
									assignmentError = data.message;
								} else {
									assignmentError = 'Failed to create assignment.';
								}
							}
						};
					}}
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<!-- Title -->
						<div class="sm:col-span-2">
							<label for="modal-title" class="mb-1 block text-sm font-medium text-text-default">
								Title
							</label>
							<input
								type="text"
								id="modal-title"
								name="title"
								required
								maxlength={200}
								placeholder="e.g. Week 3 - Dative Practice"
								class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
							/>
						</div>

						<!-- Description -->
						<div class="sm:col-span-2">
							<label
								for="modal-description"
								class="mb-1 block text-sm font-medium text-text-default"
							>
								Description <span class="text-text-subtitle">(optional)</span>
							</label>
							<textarea
								id="modal-description"
								name="description"
								maxlength={1000}
								rows={3}
								placeholder="Instructions or notes for students..."
								class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
							></textarea>
						</div>

						<!-- Cases -->
						<div class="sm:col-span-2">
							<div class="mb-2 flex items-center justify-between">
								<p class="text-sm font-medium text-text-default">Cases</p>
								<button
									type="button"
									onclick={(e: MouseEvent) => toggleAllCheckboxes(e, 'selected_cases')}
									class="cursor-pointer text-xs font-medium text-emphasis hover:underline"
								>
									Toggle All
								</button>
							</div>
							<div class="flex flex-wrap gap-2">
								{#each ALL_CASES as c (c)}
									<label
										class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
									>
										<input type="checkbox" name="selected_cases" value={c} class="sr-only" />
										{CASE_LABELS[c]}
									</label>
								{/each}
							</div>
							{#if casesError}
								<div
									class="mt-2 rounded-lg border border-negative-stroke/30 bg-negative-background px-3 py-2 text-xs text-negative-stroke"
								>
									{casesError}
								</div>
							{/if}
						</div>

						<!-- Drill Types -->
						<div class="sm:col-span-2">
							<div class="mb-2 flex items-center justify-between">
								<p class="text-sm font-medium text-text-default">Drill Types</p>
								<button
									type="button"
									onclick={(e: MouseEvent) => toggleAllCheckboxes(e, 'selected_drill_types')}
									class="cursor-pointer text-xs font-medium text-emphasis hover:underline"
								>
									Toggle All
								</button>
							</div>
							<div class="flex flex-wrap gap-2">
								{#each ALL_DRILL_TYPES as dt (dt)}
									<label
										class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
									>
										<input type="checkbox" name="selected_drill_types" value={dt} class="sr-only" />
										{DRILL_TYPE_LABELS[dt]}
									</label>
								{/each}
							</div>
							{#if drillTypesError}
								<div
									class="mt-2 rounded-lg border border-negative-stroke/30 bg-negative-background px-3 py-2 text-xs text-negative-stroke"
								>
									{drillTypesError}
								</div>
							{/if}
						</div>

						<!-- Number Mode -->
						<div>
							<p class="mb-2 text-sm font-medium text-text-default">Number</p>
							<div class="flex flex-wrap gap-2">
								{#each [['both', 'Both'], ['sg', 'Singular Only'], ['pl', 'Plural Only']] as [value, label] (value)}
									<label
										class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
									>
										<input
											type="radio"
											name="number_mode"
											{value}
											checked={value === 'both'}
											class="sr-only"
										/>
										{label}
									</label>
								{/each}
							</div>
						</div>

						<!-- Content -->
						<div>
							<p class="mb-2 text-sm font-medium text-text-default">Content</p>
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									class="rounded-full border px-3 py-1.5 text-xs {quickNounsSelected
										? 'border-emphasis bg-emphasis text-text-inverted'
										: 'border-card-stroke text-text-default'}"
									onclick={() => toggleQuickContent('nouns')}
								>
									Nouns
								</button>
								<button
									type="button"
									class="rounded-full border px-3 py-1.5 text-xs {quickPronounsSelected
										? 'border-emphasis bg-emphasis text-text-inverted'
										: 'border-card-stroke text-text-default'}"
									onclick={() => toggleQuickContent('pronouns')}
								>
									Pronouns
								</button>
								<button
									type="button"
									class="rounded-full border px-3 py-1.5 text-xs {quickAdjectivesSelected
										? 'border-emphasis bg-emphasis text-text-inverted'
										: 'border-card-stroke text-text-default'}"
									onclick={() => toggleQuickContent('adjectives')}
								>
									Adjectives
								</button>
							</div>
							<input type="hidden" name="content_mode" value={quickDerivedContentMode} />
							<input
								type="hidden"
								name="include_adjectives"
								value={quickDerivedIncludeAdjectives ? 'true' : 'false'}
							/>
						</div>

						<!-- Target Questions -->
						<div>
							<label
								for="modal-target-questions"
								class="mb-1 block text-sm font-medium text-text-default"
							>
								Target Questions
							</label>
							<input
								type="number"
								id="modal-target-questions"
								name="target_questions"
								value="20"
								min={1}
								max={200}
								class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
							/>
						</div>

						<!-- Due Date -->
						<div class="sm:col-span-2">
							<label for="modal-due-date" class="mb-1 block text-sm font-medium text-text-default">
								Due Date <span class="text-text-subtitle">(optional)</span>
							</label>
							<input
								type="datetime-local"
								id="modal-due-date"
								name="due_date"
								bind:value={modalDueDateValue}
								class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
							/>
							{#if modalDueDateValue && new Date(modalDueDateValue) < new Date()}
								<p class="mt-1 text-xs text-warning-text">
									This due date is in the past. Students may see it as overdue.
								</p>
							{/if}
						</div>
					</div>

					{#if assignmentError && !casesError && !drillTypesError}
						<div
							class="mt-4 rounded-lg border border-negative-stroke/30 bg-negative-background px-3 py-2 text-sm text-negative-stroke"
						>
							{assignmentError}
						</div>
					{/if}

					<button
						type="submit"
						disabled={assignmentSubmitting}
						class="mt-4 w-full cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{assignmentSubmitting ? 'Creating...' : 'Create Assignment'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- Edit Class Modal -->
	{#if showEditClassModal && classData}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<div
				class="absolute inset-0 bg-black/50"
				onclick={closeEditClassModal}
				role="presentation"
			></div>
			<div
				bind:this={editClassModalEl}
				role="dialog"
				aria-modal="true"
				aria-labelledby="edit-class-modal-heading"
				tabindex={-1}
				onkeydown={editClassModalKeydown}
				class="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
			>
				<button
					type="button"
					aria-label="Close"
					onclick={closeEditClassModal}
					class="absolute right-4 top-4 cursor-pointer text-text-subtitle transition-colors hover:text-text-default"
				>
					<X class="h-5 w-5" aria-hidden="true" />
				</button>

				<h2 id="edit-class-modal-heading" class="mb-4 text-xl font-semibold text-text-default">
					Edit Class
				</h2>

				{#if editClassError}
					<div
						class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-3 text-sm text-negative-stroke"
					>
						{editClassError}
					</div>
				{/if}

				<form
					method="POST"
					action={resolve(`/classes/${classData.id}/edit`)}
					use:enhance={() => {
						editClassSubmitting = true;
						editClassError = null;
						return async ({ result }) => {
							editClassSubmitting = false;
							if (result.type === 'redirect') {
								showEditClassModal = false;
								editClassOpenerEl = null;
								await invalidateAll();
							} else if (result.type === 'success') {
								showEditClassModal = false;
								editClassOpenerEl = null;
								await invalidateAll();
							} else if (result.type === 'failure') {
								const data: unknown = result.data;
								if (isRecord(data) && typeof data.message === 'string') {
									editClassError = data.message;
								} else {
									editClassError = 'Failed to update class.';
								}
							}
						};
					}}
				>
					<div class="mb-4">
						<label for="edit-name" class="mb-1 block text-sm font-medium text-text-default">
							Class Name
						</label>
						<input
							type="text"
							id="edit-name"
							name="name"
							value={classData.name}
							required
							maxlength={100}
							placeholder="e.g. Czech A1 - Monday Group"
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						/>
					</div>

					<div class="mb-4">
						<label for="edit-description" class="mb-1 block text-sm font-medium text-text-default">
							Description <span class="font-normal text-text-subtitle">(optional)</span>
						</label>
						<textarea
							id="edit-description"
							name="description"
							value={classData.description ?? ''}
							maxlength={500}
							rows={2}
							placeholder="e.g., Monday/Wednesday 10:00, Room 204"
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
						></textarea>
					</div>

					<div class="mb-4">
						<label for="edit-level" class="mb-1 block text-sm font-medium text-text-default">
							Level
						</label>
						<select
							id="edit-level"
							name="level"
							value={classData.level}
							class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
						>
							<option value="A1">A1 - Beginner</option>
							<option value="A2">A2 - Elementary</option>
							<option value="B1">B1 - Intermediate</option>
							<option value="B2">B2 - Upper Intermediate</option>
						</select>
					</div>

					<div class="mb-4">
						<label
							for="edit-struggling-threshold"
							class="mb-1 block text-sm font-medium text-text-default"
						>
							Struggling threshold
						</label>
						<p class="mb-2 text-xs text-text-subtitle">
							Students below this accuracy are flagged as struggling
						</p>
						<div class="relative">
							<input
								type="number"
								id="edit-struggling-threshold"
								name="struggling_threshold"
								value={classData.struggling_threshold ?? 50}
								min={0}
								max={100}
								required
								class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 pr-8 text-sm text-text-default focus:border-emphasis focus:outline-none"
							/>
							<span
								class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-subtitle"
								>%</span
							>
						</div>
					</div>

					<div class="mb-6">
						<label
							for="edit-leaderboard-enabled"
							class="flex cursor-pointer items-center justify-between"
						>
							<div>
								<span class="block text-sm font-medium text-text-default"
									>Enable weekly leaderboard</span
								>
								<span class="text-xs text-text-subtitle"
									>Students can see their rank and cheer each other on</span
								>
							</div>
							<div class="relative">
								<input
									type="checkbox"
									id="edit-leaderboard-enabled"
									name="leaderboard_enabled"
									checked={classData.leaderboard_enabled}
									class="peer sr-only"
								/>
								<div
									class="h-6 w-11 rounded-full bg-darker-shaded-background transition-colors peer-checked:bg-emphasis"
								></div>
								<div
									class="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"
								></div>
							</div>
						</label>
					</div>

					<button
						type="submit"
						disabled={editClassSubmitting}
						class="w-full cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{editClassSubmitting ? 'Saving...' : 'Save Changes'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<TeacherFeedback context="Class Detail" />

	{#if showTeacherTour}
		<GuidedTour steps={teacherTourSteps} onComplete={dismissTeacherTour} />
	{/if}
{/if}

<!-- Paradigm heatmap tooltip -->
{#if hoveredCell && hoveredCellScore}
	{@const bd = hoveredCellScore.breakdown}
	<div
		class="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs shadow-lg"
		style="left: {hoveredCell.x}px; top: {hoveredCell.y - 8}px; transform: translate(-50%, -100%);"
	>
		<p class="font-medium text-text-default">{hoveredCellScore.label}</p>
		{#if hoveredCellScore.pct >= 0}
			<p style="color: {accuracyColor(hoveredCellScore.pct)}">
				{hoveredCellScore.pct}% ({attemptLabel(hoveredCellScore.attempts)})
			</p>
			{#if bd}
				{#if bd.struggling.length > 0}
					{@const t = truncateNames(bd.struggling, 5)}
					<p class="mt-1">
						<span class="font-medium" style="color: #ef4444">Struggling:</span>
						<span class="text-text-default"
							>{t.shown.join(', ')}{t.extra > 0 ? ` +${t.extra} more` : ''}</span
						>
					</p>
				{/if}
				{#if bd.ok.length > 0}
					{@const t = truncateNames(bd.ok, 5)}
					<p class="mt-1">
						<span class="font-medium" style="color: #f59e0b">Needs work:</span>
						<span class="text-text-default"
							>{t.shown.join(', ')}{t.extra > 0 ? ` +${t.extra} more` : ''}</span
						>
					</p>
				{/if}
				{#if bd.strong.length > 0}
					{@const t = truncateNames(bd.strong, 5)}
					<p class="mt-1">
						<span class="font-medium" style="color: #22c55e">Strong:</span>
						<span class="text-text-default"
							>{t.shown.join(', ')}{t.extra > 0 ? ` +${t.extra} more` : ''}</span
						>
					</p>
				{/if}
			{/if}
		{:else}
			<p class="text-text-subtitle">No data</p>
		{/if}
	</div>
{/if}

<!-- Case accuracy box tooltip -->
{#if hoveredCaseBox && caseBoxTooltipPos}
	{@const bd =
		hoveredCaseBox === 'overall' ? overallStudentBreakdown : caseStudentBreakdown[hoveredCaseBox]}
	{#if bd && (bd.struggling.length > 0 || bd.ok.length > 0 || bd.strong.length > 0)}
		<div
			class="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs shadow-lg"
			style="left: {caseBoxTooltipPos.x}px; top: {caseBoxTooltipPos.y -
				8}px; transform: translate(-50%, -100%);"
		>
			<p class="mb-1 font-medium text-text-default">
				{hoveredCaseBox === 'overall'
					? 'Overall Accuracy'
					: isCaseKey(hoveredCaseBox)
						? CASE_LABELS[hoveredCaseBox]
						: hoveredCaseBox}
			</p>
			{#if bd.struggling.length > 0}
				<p class="mt-1">
					<span class="font-medium" style="color: #ef4444">Struggling:</span>
					<span class="text-text-default">{bd.struggling.join(', ')}</span>
				</p>
			{/if}
			{#if bd.ok.length > 0}
				<p class="mt-1">
					<span class="font-medium" style="color: #f59e0b">Needs work:</span>
					<span class="text-text-default">{bd.ok.join(', ')}</span>
				</p>
			{/if}
			{#if bd.strong.length > 0}
				<p class="mt-1">
					<span class="font-medium" style="color: #22c55e">Strong:</span>
					<span class="text-text-default">{bd.strong.join(', ')}</span>
				</p>
			{/if}
		</div>
	{/if}
{/if}
