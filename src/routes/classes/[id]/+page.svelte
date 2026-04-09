<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Archive from '@lucide/svelte/icons/archive';
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import X from '@lucide/svelte/icons/x';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { SvelteMap } from 'svelte/reactivity';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import ProgressChart from '$lib/components/ui/ProgressChart.svelte';
	import LeaderboardBanner from '$lib/components/ui/LeaderboardBanner.svelte';
	import { CASE_LABELS, DRILL_TYPE_LABELS, ALL_DRILL_TYPES } from '$lib/types';
	import type { Case, DrillType } from '$lib/types';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import GuidedTour from '$lib/components/ui/GuidedTour.svelte';

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

	interface StudentRow {
		studentId: string;
		displayName: string | null;
		email: string | null;
		joinedAt: string;
		overallAccuracy: number | null;
		totalAttempts: number;
		assignmentStatuses: AssignmentStatus[];
		caseScores: CaseAccuracy[];
	}

	interface AssignmentRow {
		id: string;
		title: string;
		description: string | null;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: string;
		contentMode: string;
		targetQuestions: number;
		dueDate: string | null;
		createdAt: string;
		completedCount: number;
		totalStudents: number;
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
				item.caseScores.every((c: unknown) => isCaseAccuracy(c))
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

	function isDrillTypeKey(v: string): v is DrillType {
		return v in DRILL_TYPE_LABELS;
	}

	let classData = $derived.by(() => {
		const val: unknown = page.data.classData;
		return isClassData(val) ? val : null;
	});

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

	interface StudentStats {
		overallAccuracy: number | null;
		totalAttempts: number;
		caseScores: CaseAccuracy[];
		assignmentsCompleted: number;
		assignmentsTotal: number;
	}

	function isStudentStats(v: unknown): v is StudentStats {
		if (!isRecord(v)) return false;
		return (
			(v.overallAccuracy === null || typeof v.overallAccuracy === 'number') &&
			typeof v.totalAttempts === 'number' &&
			Array.isArray(v.caseScores) &&
			typeof v.assignmentsCompleted === 'number' &&
			typeof v.assignmentsTotal === 'number'
		);
	}

	let studentStats = $derived.by(() => {
		const val: unknown = page.data.studentStats;
		return isStudentStats(val) ? val : null;
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

	// Leaderboard state
	interface LeaderboardEntry {
		rank: number;
		userId: string;
		displayName: string;
		firstName: string;
		score: number;
		questionsAnswered: number;
		correctAnswers: number;
	}

	let leaderboardData = $state<LeaderboardEntry[]>([]);
	let leaderboardSentToday = $state<string[]>([]);

	let showLeaderboard = $derived(
		role === 'student' && classData?.leaderboard_enabled === true && leaderboardData.length > 1
	);

	function fetchLeaderboardData(classId: string): void {
		fetch(`/api/leaderboard?classId=${classId}`)
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
					leaderboardData = entries;
				}
				if (Array.isArray(data.sentToday)) {
					leaderboardSentToday = data.sentToday.filter(
						(v: unknown): v is string => typeof v === 'string'
					);
				}
			})
			.catch(() => {
				// silently fail
			});
	}

	function handleLeaderboardReactionSent(toUserId: string): void {
		leaderboardSentToday = [...leaderboardSentToday, toUserId];
	}

	// Fetch leaderboard on mount for students
	$effect(() => {
		if (role === 'student' && classData?.leaderboard_enabled && classData.id) {
			fetchLeaderboardData(classData.id);
		}
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

	function studentAssignmentStatusLabel(status: AssignmentStatus): {
		label: string;
		colorClass: string;
	} {
		if (status.completed) {
			return { label: 'Completed', colorClass: 'bg-positive-background text-positive-stroke' };
		}
		if (status.attempted > 0) {
			return { label: 'In Progress', colorClass: 'bg-warning-background text-warning-text' };
		}
		return {
			label: 'Not Started',
			colorClass: 'bg-shaded-background text-text-subtitle'
		};
	}

	function studentAssignmentButtonLabel(status: AssignmentStatus): string {
		if (status.completed) return 'Review';
		if (status.attempted > 0) return 'Continue';
		return 'Start Practice';
	}

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

				if (assignmentFilter === 'active') {
					return !isPastDue;
				}
				if (assignmentFilter === 'overdue') {
					return isPastDue;
				}
				if (assignmentFilter === 'completed') {
					if (role === 'teacher') {
						return a.totalStudents > 0 && a.completedCount >= a.totalStudents;
					}
					return studentCompletionMap.get(a.id) === true;
				}
				return true;
			});
		}

		return result;
	});

	let visibleAssignments = $derived.by(() => {
		if (showAllAssignments) return filteredAssignments;
		return filteredAssignments.slice(0, ASSIGNMENT_PAGE_SIZE);
	});

	let hasMoreAssignments = $derived(filteredAssignments.length > ASSIGNMENT_PAGE_SIZE);

	let expandedStudents = $state(new Set<string>());
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
	let confirmingRemoveStudentId = $state<string | null>(null);
	let confirmingLeave = $state(false);
	let confirmingRegenerate = $state(false);
	let regenerateSuccess = $state(false);
	let removeSuccessMessage = $state<string | null>(null);
	let removeSuccessTimer: ReturnType<typeof setTimeout> | null = null;

	type ActiveTab = 'overall' | 'students' | 'assignments';
	let activeTab = $state<ActiveTab>('overall');
	const TAB_ORDER: ActiveTab[] = ['overall', 'students', 'assignments'];

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

	let inviteModalEl = $state<HTMLDivElement | null>(null);
	let assignmentModalEl = $state<HTMLDivElement | null>(null);
	let inviteOpenerEl: HTMLElement | null = null;
	let assignmentOpenerEl: HTMLElement | null = null;
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
			text: 'Switch between the Overall summary, your Students roster, and Assignments using these tabs. The counts update automatically.'
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
	let assignmentSubmitting = $state(false);
	let assignmentError = $state<string | null>(null);
	let assignmentValidationError = $state<string | null>(null);

	function openInviteModal(e?: MouseEvent) {
		inviteError = null;
		inviteSuccess = null;
		inviteSubmitting = false;
		const target = e?.currentTarget;
		inviteOpenerEl = target instanceof HTMLElement ? target : null;
		showInviteModal = true;
	}

	function openCreateAssignmentModal(e?: MouseEvent) {
		assignmentError = null;
		assignmentValidationError = null;
		assignmentSubmitting = false;
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
		if (cases.length === 0) {
			event.preventDefault();
			assignmentValidationError = 'Please select at least one case.';
			return;
		}
		if (drillTypes.length === 0) {
			event.preventDefault();
			assignmentValidationError = 'Please select at least one drill type.';
			return;
		}
		assignmentValidationError = null;
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

	function formatDueDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const isPast = date < now;
		const formatted = date.toLocaleDateString('en-US', {
			timeZone: 'UTC',
			month: 'short',
			day: 'numeric',
			year: date.getUTCFullYear() !== now.getUTCFullYear() ? 'numeric' : undefined
		});
		return isPast ? `Overdue (${formatted})` : `Due ${formatted}`;
	}

	function studentDisplayName(student: StudentRow): string {
		if (student.displayName) return student.displayName;
		if (student.email) return student.email;
		return 'Anonymous';
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

<NavBar user={page.data.user} />

{#if classData}
	<div class="mx-auto max-w-4xl px-4 py-8">
		<!-- Back link -->
		<a
			href={resolve('/classes')}
			class="mb-4 inline-flex items-center gap-1 text-sm text-text-subtitle transition-colors hover:text-text-default"
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
							<a
								href={resolve(`/classes/${classData.id}/edit`)}
								class="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
								title="Edit class"
							>
								<Pencil class="h-4 w-4" aria-hidden="true" />
							</a>
						{/if}
					</div>
					<p class="mt-1 text-sm text-text-subtitle">
						<span
							class="inline-block rounded-full bg-shaded-background px-2 py-0.5 text-xs font-medium text-text-subtitle"
						>
							Level {classData.level}
						</span>
						<span class="mx-1">&middot;</span>
						{students.length}
						{students.length === 1 ? 'student' : 'students'}
					</p>
					{#if classData.description}
						<p class="mt-1 text-sm text-text-subtitle">{classData.description}</p>
					{/if}

					<!-- Class code pill + regenerate -->
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
						{#if role === 'teacher' && !classData.archived}
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
				</div>

				<!-- Right: archive/unarchive icon button -->
				{#if role === 'teacher'}
					<div class="relative shrink-0">
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
							: 'border-transparent text-text-subtitle hover:border-text-subtitle hover:text-text-default'}"
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
							: 'border-transparent text-text-subtitle hover:border-text-subtitle hover:text-text-default'}"
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
							: 'border-transparent text-text-subtitle hover:border-text-subtitle hover:text-text-default'}"
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
									class="cursor-pointer rounded-lg border border-card-stroke px-2.5 py-1 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
								>
									Export Progress (CSV)
								</button>
								<p class="text-[10px] text-text-subtitle">Includes student names and emails.</p>
							</div>
						{:else if activeTab === 'students'}
							<button
								type="button"
								onclick={openInviteModal}
								data-tour="teacher-invite"
								class="cursor-pointer rounded-lg bg-emphasis px-2.5 py-1 text-xs font-medium text-text-inverted transition-opacity hover:opacity-90"
							>
								Invite
							</button>
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
								<div
									class="rounded-xl border border-card-stroke p-3 text-center {avgClassAccuracy !==
									null
										? caseAccuracyColor(avgClassAccuracy)
										: 'bg-card-bg text-text-subtitle'}"
								>
									<p class="text-xs font-medium uppercase">Avg</p>
									<p class="text-lg font-bold">
										{avgClassAccuracy !== null ? `${Math.round(avgClassAccuracy)}%` : '--'}
									</p>
								</div>
								{#each classCaseAccuracy as caseItem (caseItem.case)}
									{@const label = isCaseKey(caseItem.case)
										? CASE_LABELS[caseItem.case]
										: caseItem.case}
									<div
										class="rounded-xl border border-card-stroke p-3 text-center {caseItem.accuracy !==
										null
											? caseAccuracyColor(caseItem.accuracy)
											: 'bg-card-bg text-text-subtitle'}"
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
									</div>
								{/each}
							</div>
						</div>

						<!-- Progress Over Time -->
						<div class="mb-6">
							<ProgressChart
								snapshots={progressSnapshots}
								students={chartStudents}
								mode="teacher"
							/>
						</div>
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
												<tr
													class="cursor-pointer border-b border-card-stroke transition-colors last:border-b-0 hover:bg-shaded-background/50"
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
														{studentDisplayName(student)}
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
														<td class="px-2 py-3">
															{#if confirmingRemoveStudentId === student.studentId}
																<form
																	method="POST"
																	action="?/removeStudent"
																	use:enhance={() => {
																		return async ({ result, update }) => {
																			if (result.type === 'success') {
																				const name = studentDisplayName(student);
																				removeSuccessMessage = `${name} has been removed from the class.`;
																				if (removeSuccessTimer) clearTimeout(removeSuccessTimer);
																				removeSuccessTimer = setTimeout(() => {
																					removeSuccessMessage = null;
																				}, 3000);
																			}
																			confirmingRemoveStudentId = null;
																			await update();
																		};
																	}}
																>
																	<input type="hidden" name="studentId" value={student.studentId} />
																	<button
																		type="submit"
																		class="cursor-pointer text-xs text-red-600 hover:underline"
																		onclick={(e) => e.stopPropagation()}
																	>
																		Confirm
																	</button>
																</form>
															{:else}
																<button
																	type="button"
																	class="cursor-pointer text-xs text-text-subtitle hover:text-red-500"
																	onclick={(e) => {
																		e.stopPropagation();
																		confirmingRemoveStudentId = student.studentId;
																	}}
																>
																	Remove
																</button>
															{/if}
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
																		<div class="space-y-2">
																			{#each student.assignmentStatuses as status (status.assignmentId)}
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
										class="cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors {assignmentFilter ===
										item.value
											? 'bg-emphasis text-text-inverted'
											: 'bg-shaded-background text-text-subtitle hover:text-text-default'}"
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
									<a
										href={resolve(`/classes/${classData.id}/assignments/${assignment.id}`)}
										class="block rounded-2xl border border-card-stroke bg-card-bg p-4 transition-colors hover:border-emphasis"
									>
										<div class="flex items-start justify-between">
											<div>
												<h3 class="font-semibold text-text-default">
													{assignment.title}
												</h3>
												{#if assignment.description}
													<p class="mt-0.5 text-sm text-text-subtitle">
														{assignment.description}
													</p>
												{/if}
												<div class="mt-2 flex flex-wrap gap-1">
													{#each assignment.selectedCases as c (c)}
														{#if isCaseKey(c)}
															<span
																class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
															>
																{CASE_LABELS[c]}
															</span>
														{/if}
													{/each}
													{#each assignment.selectedDrillTypes as dt (dt)}
														{#if isDrillTypeKey(dt)}
															<span
																class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
															>
																{DRILL_TYPE_LABELS[dt]}
															</span>
														{/if}
													{/each}
												</div>
											</div>
											<div class="flex flex-col items-end gap-1">
												{#if assignment.dueDate}
													<span
														class="text-xs {new Date(assignment.dueDate) < new Date()
															? 'text-negative-stroke'
															: 'text-text-subtitle'}"
													>
														{formatDueDate(assignment.dueDate)}
													</span>
												{/if}
												<span class="text-xs text-text-subtitle">
													{assignment.completedCount}/{assignment.totalStudents} completed
												</span>
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
										class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
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

		<!-- ==================== STUDENT VIEW (no tabs) ==================== -->
		{#if role === 'student'}
			<!-- Student Stats Dashboard -->
			{#if studentStats}
				<div class="mb-6 grid grid-cols-3 gap-3">
					<div class="rounded-xl border border-card-stroke bg-card-bg p-3 text-center">
						<p class="text-2xl font-bold text-text-default">
							{studentStats.totalAttempts}
						</p>
						<p class="text-xs text-text-subtitle">Questions Attempted</p>
					</div>
					<div class="rounded-xl border border-card-stroke bg-card-bg p-3 text-center">
						<p class="text-2xl font-bold text-text-default">
							{studentStats.overallAccuracy !== null
								? `${Math.round(studentStats.overallAccuracy)}%`
								: '--'}
						</p>
						<p class="text-xs text-text-subtitle">Overall Accuracy</p>
					</div>
					<div class="rounded-xl border border-card-stroke bg-card-bg p-3 text-center">
						<p class="text-2xl font-bold text-text-default">
							{studentStats.assignmentsCompleted}/{studentStats.assignmentsTotal}
						</p>
						<p class="text-xs text-text-subtitle">Assignments Completed</p>
					</div>
				</div>

				{#if studentStats.caseScores.length > 0}
					<div class="mb-6">
						<h2 class="mb-3 text-lg font-semibold text-text-default">Your Case Accuracy</h2>
						<div class="grid grid-cols-7 gap-2">
							{#each ALL_CASES as c (c)}
								{@const score = findCaseScore(studentStats.caseScores, c)}
								<div
									class="rounded-xl border border-card-stroke p-3 text-center {score
										? caseAccuracyColor(score.accuracy)
										: 'bg-card-bg text-text-subtitle'}"
								>
									<p class="text-xs font-medium uppercase">
										{CASE_LABELS[c].slice(0, 3)}
									</p>
									<p class="text-lg font-bold">
										{score ? `${Math.round(score.accuracy)}%` : '--'}
									</p>
									{#if score && score.attempts > 0}
										<p class="text-[10px] opacity-70">
											{score.correct}/{score.attempts}
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}

			<!-- Leaderboard -->
			{#if showLeaderboard && classData}
				<div class="mb-6">
					<LeaderboardBanner
						leaderboard={leaderboardData}
						{currentUserId}
						classId={classData.id}
						sentToday={leaderboardSentToday}
						onReactionSent={handleLeaderboardReactionSent}
					/>
				</div>
			{/if}

			<!-- Progress Over Time -->
			{#if progressSnapshots.length > 0}
				<div class="mb-6">
					<ProgressChart snapshots={progressSnapshots} students={chartStudents} mode="student" />
				</div>
			{/if}

			<!-- Assignments -->
			<div class="mb-6">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-text-default">
						Assignments ({assignments.length})
					</h2>
				</div>

				{#if assignments.length === 0}
					<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 text-center">
						<p class="text-sm text-text-subtitle">No assignments yet.</p>
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
									class="cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors {assignmentFilter ===
									item.value
										? 'bg-emphasis text-text-inverted'
										: 'bg-shaded-background text-text-subtitle hover:text-text-default'}"
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
								<a
									href={resolve(`/classes/${classData.id}/assignments/${assignment.id}`)}
									class="block rounded-2xl border border-card-stroke bg-card-bg p-4 transition-colors hover:border-emphasis"
								>
									<div class="flex items-start justify-between">
										<div>
											<h3 class="font-semibold text-text-default">
												{assignment.title}
											</h3>
											{#if assignment.description}
												<p class="mt-0.5 text-sm text-text-subtitle">
													{assignment.description}
												</p>
											{/if}
											<div class="mt-2 flex flex-wrap gap-1">
												{#each assignment.selectedCases as c (c)}
													{#if isCaseKey(c)}
														<span
															class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
														>
															{CASE_LABELS[c]}
														</span>
													{/if}
												{/each}
												{#each assignment.selectedDrillTypes as dt (dt)}
													{#if isDrillTypeKey(dt)}
														<span
															class="rounded-full bg-shaded-background px-2 py-0.5 text-xs text-text-subtitle"
														>
															{DRILL_TYPE_LABELS[dt]}
														</span>
													{/if}
												{/each}
											</div>
										</div>
										<div class="flex flex-col items-end gap-1">
											{#if assignment.dueDate}
												<span
													class="text-xs {new Date(assignment.dueDate) < new Date()
														? 'text-negative-stroke'
														: 'text-text-subtitle'}"
												>
													{formatDueDate(assignment.dueDate)}
												</span>
											{/if}
											{#if true}
												{@const progress = studentAssignmentProgressMap.get(assignment.id)}
												{@const status = progress ?? {
													assignmentId: assignment.id,
													assignmentTitle: assignment.title,
													attempted: 0,
													target: assignment.targetQuestions,
													correct: 0,
													completed: false
												}}
												{@const statusInfo = studentAssignmentStatusLabel(status)}
												{@const progressPct =
													status.target > 0
														? Math.min(100, Math.round((status.attempted / status.target) * 100))
														: 0}
												{@const accuracyPct =
													status.attempted > 0
														? Math.round((status.correct / status.attempted) * 100)
														: null}
												<span
													class="rounded-full px-2 py-0.5 text-xs font-medium {statusInfo.colorClass}"
												>
													{statusInfo.label}
												</span>
												<span class="text-xs text-text-subtitle">
													{status.attempted}/{status.target} questions
												</span>
												{#if accuracyPct !== null}
													<span class="text-xs text-text-subtitle">
														{accuracyPct}% accuracy
													</span>
												{/if}
												<div
													class="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-shaded-background"
												>
													<div
														class="h-full rounded-full {status.completed
															? 'bg-positive-stroke'
															: 'bg-emphasis'}"
														style="width: {progressPct}%"
													></div>
												</div>
												<span
													class="mt-1 rounded-xl bg-emphasis px-3 py-1 text-xs font-medium text-text-inverted transition-opacity hover:opacity-90"
												>
													{studentAssignmentButtonLabel(status)}
												</span>
											{/if}
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
									class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
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
				{#if confirmingLeave}
					<div class="flex items-center gap-2">
						<span class="text-sm text-text-subtitle"
							>Are you sure you want to leave this class?</span
						>
						<form method="POST" action="?/leaveClass" use:enhance>
							<button
								type="submit"
								class="cursor-pointer rounded-xl border border-negative-stroke px-4 py-2 text-sm font-medium text-negative-stroke transition-colors hover:bg-negative-background"
							>
								Yes, Leave
							</button>
						</form>
						<button
							type="button"
							onclick={() => (confirmingLeave = false)}
							class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
						>
							Cancel
						</button>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (confirmingLeave = true)}
						class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-negative-stroke hover:text-negative-stroke"
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

				{#if assignmentError || assignmentValidationError}
					<div
						class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-3 text-sm text-negative-stroke"
					>
						{assignmentError ?? assignmentValidationError}
					</div>
				{/if}

				<form
					method="POST"
					action={resolve(`/classes/${classData.id}/assignments/new`)}
					onsubmit={validateAssignmentForm}
					use:enhance={() => {
						assignmentSubmitting = true;
						return async ({ result }) => {
							assignmentSubmitting = false;
							if (result.type === 'redirect') {
								showCreateAssignmentModal = false;
								assignmentOpenerEl = null;
								// eslint-disable-next-line svelte/no-navigation-without-resolve -- result.location is server-side resolved URL
								goto(result.location);
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

						<!-- Content Mode -->
						<div>
							<p class="mb-2 text-sm font-medium text-text-default">Content</p>
							<div class="flex flex-wrap gap-2">
								{#each [['both', 'Both'], ['nouns', 'Nouns Only'], ['pronouns', 'Pronouns Only']] as [value, label] (value)}
									<label
										class="flex cursor-pointer items-center gap-1.5 rounded-full border border-card-stroke px-3 py-1.5 text-xs has-[:checked]:border-emphasis has-[:checked]:bg-emphasis has-[:checked]:text-text-inverted"
									>
										<input
											type="radio"
											name="content_mode"
											{value}
											checked={value === 'both'}
											class="sr-only"
										/>
										{label}
									</label>
								{/each}
							</div>
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

						<!-- Min Accuracy -->
						<div>
							<label
								for="modal-min-accuracy"
								class="mb-1 block text-sm font-medium text-text-default"
							>
								Min Accuracy (%) <span class="text-text-subtitle">(optional)</span>
							</label>
							<input
								type="number"
								id="modal-min-accuracy"
								name="min_accuracy"
								min={0}
								max={100}
								placeholder="e.g. 70"
								class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
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
								class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
							/>
						</div>
					</div>

					<button
						type="submit"
						disabled={assignmentSubmitting}
						class="mt-6 w-full cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{assignmentSubmitting ? 'Creating...' : 'Create Assignment'}
					</button>
				</form>
			</div>
		</div>
	{/if}

	{#if showTeacherTour}
		<GuidedTour steps={teacherTourSteps} onComplete={dismissTeacherTour} />
	{/if}
{/if}
