<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { buildHeatmapWeeks } from '$lib/utils/dates';
	import {
		getAllBadges,
		recomputeProgressBasedBadges,
		type BadgeWithStatus
	} from '$lib/engine/achievements';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import { mistakeRecords, clearMistakes, type MistakeRecord } from '$lib/engine/mistakes';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import type { Case } from '$lib/types';
	import { ALL_CASES, CASE_LABELS, isCase } from '$lib/types';
	import { progress as progressStore } from '$lib/engine/progress';
	import { onMount } from 'svelte';
	import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
	import Pencil from '@lucide/svelte/icons/pencil';

	import { BADGE_ICONS, BADGE_COLORS } from '$lib/data/badge-icons';

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	interface ScoreEntry {
		attempts: number;
		correct: number;
	}

	interface ProfileData {
		display_name: string | null;
		created_at: string;
	}

	interface ProgressData {
		level: string;
		case_scores: Record<string, ScoreEntry>;
		paradigm_scores: Record<string, ScoreEntry>;
	}

	interface SessionData {
		session_date: string;
		questions_attempted: number;
		questions_correct: number;
		case_scores: Record<string, { attempted: number; correct: number }> | null;
	}

	let user = $derived(page.data.user);
	let loadError = $derived.by<string | null>(() => {
		const val: unknown = page.data.loadError;
		return typeof val === 'string' ? val : null;
	});

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	function isProfileData(v: unknown): v is ProfileData {
		if (!isRecord(v)) return false;
		return (
			(typeof v.display_name === 'string' || v.display_name === null) &&
			typeof v.created_at === 'string'
		);
	}

	function isProgressData(v: unknown): v is ProgressData {
		if (!isRecord(v)) return false;
		return typeof v.level === 'string' && isRecord(v.case_scores) && isRecord(v.paradigm_scores);
	}

	function isSessionArray(v: unknown): v is SessionData[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) &&
				typeof item.session_date === 'string' &&
				typeof item.questions_attempted === 'number' &&
				typeof item.questions_correct === 'number' &&
				(item.case_scores === null || item.case_scores === undefined || isRecord(item.case_scores))
		);
	}

	let serverProfile = $derived.by<ProfileData | null>(() => {
		const raw: unknown = page.data.profile ?? null;
		return isProfileData(raw) ? raw : null;
	});
	let serverProgress = $derived.by<ProgressData | null>(() => {
		const raw: unknown = page.data.progress ?? null;
		return isProgressData(raw) ? raw : null;
	});
	let serverSessions = $derived.by<SessionData[]>(() => {
		const raw: unknown = page.data.sessions ?? [];
		return isSessionArray(raw) ? raw : [];
	});

	// Server load data is always available on first render. A new user may have no profile
	// row and no error — both null — but that is still a valid loaded state. We check that
	// the server load has populated the page data by looking for the 'profile' key.
	let loaded = $derived('profile' in page.data);

	const emptyScores: Record<string, ScoreEntry> = {};
	let caseScores = $derived(
		serverProgress?.case_scores ?? (user ? emptyScores : $progressStore.caseScores)
	);
	let paradigmScores = $derived(
		serverProgress?.paradigm_scores ?? (user ? emptyScores : $progressStore.paradigmScores)
	);

	let breakdownTab = $state<'case' | 'paradigm' | 'pronoun'>('case');
	let accuracyCaseFilter = $state<'all' | Case>('all');

	type ProfileTab = 'progress' | 'mistakes' | 'achievements';
	const VALID_TABS: ProfileTab[] = ['progress', 'mistakes', 'achievements'];
	const tabParam = page.url.searchParams.get('tab');
	let profileTab = $state<ProfileTab>(
		VALID_TABS.includes(tabParam as ProfileTab) ? (tabParam as ProfileTab) : 'progress'
	);
	const PROFILE_TAB_ORDER: ProfileTab[] = ['progress', 'mistakes', 'achievements'];

	function focusProfileTab(tab: ProfileTab): void {
		const el = document.getElementById(`profile-tab-${tab}`);
		if (el instanceof HTMLElement) el.focus();
	}

	function handleProfileTablistKeydown(e: KeyboardEvent): void {
		const currentIndex = PROFILE_TAB_ORDER.indexOf(profileTab);
		if (currentIndex === -1) return;
		let nextIndex = currentIndex;
		if (e.key === 'ArrowRight') {
			nextIndex = (currentIndex + 1) % PROFILE_TAB_ORDER.length;
		} else if (e.key === 'ArrowLeft') {
			nextIndex = (currentIndex - 1 + PROFILE_TAB_ORDER.length) % PROFILE_TAB_ORDER.length;
		} else if (e.key === 'Home') {
			nextIndex = 0;
		} else if (e.key === 'End') {
			nextIndex = PROFILE_TAB_ORDER.length - 1;
		} else {
			return;
		}
		e.preventDefault();
		const nextTab = PROFILE_TAB_ORDER[nextIndex];
		profileTab = nextTab;
		focusProfileTab(nextTab);
	}

	let hasPronounScores = $derived(
		Object.keys(paradigmScores).some((k) => k.startsWith('pronoun_'))
	);

	let activePronounLemmas = $derived.by(() => {
		const lemmas: Record<string, true> = {};
		for (const key of Object.keys(paradigmScores)) {
			if (key.startsWith('pronoun_')) {
				// key format: pronoun_LEMMA_case_number
				const parts = key.split('_');
				if (parts.length >= 4) {
					lemmas[parts[1]] = true;
				}
			}
		}
		return PRONOUN_ORDER.filter((l) => l in lemmas);
	});

	const CASE_META: Array<{ key: Case; label: string; abbrev: string; hex: string }> = [
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
		stavení: 'vowel -í ending'
	};

	const PARADIGM_GROUPS: Array<{ label: string; paradigms: string[] }> = [
		{ label: 'Masculine', paradigms: ['pán', 'muž', 'předseda', 'soudce', 'hrad', 'stroj'] },
		{ label: 'Feminine', paradigms: ['žena', 'růže', 'píseň', 'kost'] },
		{ label: 'Neuter', paradigms: ['město', 'moře', 'kuře', 'stavení'] }
	];

	const PRONOUN_TRANSLATIONS: Record<string, string> = {
		já: 'I',
		ty: 'you (sg)',
		on: 'he',
		ona: 'she',
		ono: 'it',
		my: 'we',
		vy: 'you (pl/formal)',
		oni: 'they',
		se: 'oneself (reflexive)'
	};

	const PRONOUN_ORDER = ['já', 'ty', 'on', 'ona', 'ono', 'my', 'vy', 'oni', 'se'];

	// Display name editing
	let editingName = $state(false);
	let nameInput = $state('');
	let savingName = $state(false);

	// Reset progress
	let confirmingReset = $state(false);
	let resettingProgress = $state(false);
	let resetError = $state<string | null>(null);

	// Delete account
	let confirmingDelete = $state(false);
	let deletingAccount = $state(false);

	let displayName = $derived(serverProfile?.display_name ?? '');

	function openNameModal() {
		nameInput = displayName;
		editingName = true;
	}

	function closeNameModal() {
		editingName = false;
	}

	let memberSince = $derived.by(() => {
		const created = String(serverProfile?.created_at ?? '');
		if (!created) return '';
		return new Date(created).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	});

	let totalAttempts = $derived.by(() => {
		let attempts = 0;
		for (const score of Object.values(caseScores)) {
			attempts += score.attempts;
		}
		return attempts;
	});
	let daysPracticed = $derived(serverSessions.length);

	// Weakest area: find the paradigm+case combination with lowest accuracy (min 5 attempts)
	let userDisplayLabel = $derived(displayName || user?.email?.split('@')[0] || 'User');

	const AVATAR_COLORS = [
		'var(--color-case-gen)',
		'var(--color-case-dat)',
		'var(--color-case-acc)',
		'var(--color-case-voc)',
		'var(--color-case-loc)',
		'var(--color-case-ins)'
	];
	let avatarInitial = $derived((displayName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase());
	let avatarLoadError = $state(false);
	let avatarColor = $derived.by(() => {
		if (!user?.id) return AVATAR_COLORS[0];
		let hash = 0;
		for (let i = 0; i < user.id.length; i++) {
			hash = (hash * 31 + user.id.charCodeAt(i)) | 0;
		}
		return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
	});
	let avatarUrl = $derived.by(() => {
		const url = user?.user_metadata?.avatar_url;
		return typeof url === 'string' && url.startsWith('http') ? url : null;
	});

	// Combine sg+pl for each case
	function getCaseTotals(caseKey: string): { attempts: number; correct: number } {
		const sg = caseScores[`${caseKey}_sg`] ?? { attempts: 0, correct: 0 };
		const pl = caseScores[`${caseKey}_pl`] ?? { attempts: 0, correct: 0 };
		return {
			attempts: sg.attempts + pl.attempts,
			correct: sg.correct + pl.correct
		};
	}

	// Get paradigm scores for a specific case+number
	function getParadigmCaseNumberScore(
		paradigm: string,
		caseKey: string,
		num: string
	): { attempts: number; correct: number } {
		return paradigmScores[`${paradigm}_${caseKey}_${num}`] ?? { attempts: 0, correct: 0 };
	}

	// Aggregate paradigm scores
	function getParadigmTotals(paradigm: string): { attempts: number; correct: number } {
		let attempts = 0;
		let correct = 0;
		for (const [key, score] of Object.entries(paradigmScores)) {
			if (key.startsWith(paradigm + '_')) {
				attempts += score.attempts;
				correct += score.correct;
			}
		}
		return { attempts, correct };
	}

	// Activity heatmap data
	let heatmapData = $derived.by(() => {
		const sessionMap: Record<string, number> = {};
		for (const s of serverSessions) {
			sessionMap[s.session_date] = (sessionMap[s.session_date] ?? 0) + s.questions_attempted;
		}
		return sessionMap;
	});

	let heatmapMaxQuestions = $derived.by(() => {
		let max = 0;
		for (const key of Object.keys(heatmapData)) {
			if (heatmapData[key] > max) max = heatmapData[key];
		}
		return max || 1;
	});

	let heatmapWeeks = $derived.by(() => buildHeatmapWeeks(heatmapData));

	let heatmapMonthLabels = $derived.by(() => {
		const labels: Array<{ label: string; weekIndex: number }> = [];
		let lastMonth = -1;

		for (let i = 0; i < heatmapWeeks.length; i++) {
			const week = heatmapWeeks[i];
			if (week.length === 0) continue;
			const firstDay = new Date(week[0].date + 'T00:00:00');
			const month = firstDay.getMonth();
			if (month !== lastMonth) {
				labels.push({
					label: firstDay.toLocaleDateString('en-US', { month: 'short' }),
					weekIndex: i
				});
				lastMonth = month;
			}
		}

		return labels;
	});

	// Daily accuracy for the progress-over-time chart
	interface DailyAccuracy {
		date: string;
		accuracy: number;
	}

	let accChartColor = $derived.by(() => {
		if (accuracyCaseFilter === 'all') return 'var(--color-emphasis)';
		const meta = CASE_META.find((c) => c.key === accuracyCaseFilter);
		return meta?.hex ?? 'var(--color-emphasis)';
	});

	let hasEnoughOverallData = $derived(
		serverSessions.filter((s) => s.questions_attempted > 0).length >= 2
	);

	let dailyAccuracy = $derived.by<DailyAccuracy[]>(() => {
		const filter = accuracyCaseFilter;
		const points: DailyAccuracy[] = [];
		for (const s of serverSessions) {
			if (filter === 'all') {
				if (s.questions_attempted > 0) {
					points.push({
						date: s.session_date,
						accuracy: Math.round((s.questions_correct / s.questions_attempted) * 100)
					});
				}
			} else {
				const caseData = s.case_scores?.[filter];
				if (caseData && caseData.attempted > 0) {
					points.push({
						date: s.session_date,
						accuracy: Math.round((caseData.correct / caseData.attempted) * 100)
					});
				}
			}
		}
		// Sort by date ascending
		points.sort((a, b) => a.date.localeCompare(b.date));
		return points;
	});

	// Chart dimensions for accuracy-over-time SVG
	const ACC_CHART_WIDTH = 700;
	const ACC_CHART_HEIGHT = 240;
	const ACC_PAD_LEFT = 44;
	const ACC_PAD_RIGHT = 16;
	const ACC_PAD_TOP = 12;
	const ACC_PAD_BOTTOM = 36;
	const ACC_PLOT_WIDTH = ACC_CHART_WIDTH - ACC_PAD_LEFT - ACC_PAD_RIGHT;
	const ACC_PLOT_HEIGHT = ACC_CHART_HEIGHT - ACC_PAD_TOP - ACC_PAD_BOTTOM;
	const ACC_Y_TICKS = [0, 25, 50, 75, 100];

	function accXScale(index: number, total: number): number {
		if (total <= 1) return ACC_PAD_LEFT + ACC_PLOT_WIDTH / 2;
		return ACC_PAD_LEFT + (index / (total - 1)) * ACC_PLOT_WIDTH;
	}

	function accYScale(value: number): number {
		return ACC_PAD_TOP + ACC_PLOT_HEIGHT - (value / 100) * ACC_PLOT_HEIGHT;
	}

	let accPolylinePoints = $derived.by(() => {
		return dailyAccuracy
			.map((p, i) => `${accXScale(i, dailyAccuracy.length)},${accYScale(p.accuracy)}`)
			.join(' ');
	});

	let accXLabels = $derived.by(() => {
		const pts = dailyAccuracy;
		if (pts.length <= 6) return pts.map((p, i) => ({ index: i, label: formatAccDate(p.date) }));
		const step = Math.ceil(pts.length / 6);
		const labels: Array<{ index: number; label: string }> = [];
		for (let i = 0; i < pts.length; i++) {
			if (i % step === 0 || i === pts.length - 1) {
				labels.push({ index: i, label: formatAccDate(pts[i].date) });
			}
		}
		return labels;
	});

	function formatAccDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	let hoveredAccPoint = $state<{
		x: number;
		y: number;
		date: string;
		accuracy: number;
	} | null>(null);
	let accChartContainerWidth = $state(0);

	function handleAccPointHover(event: MouseEvent, date: string, accuracy: number): void {
		const target = event.currentTarget;
		if (target instanceof SVGElement) {
			const svg = target.closest('svg');
			if (svg) {
				const rect = svg.getBoundingClientRect();
				hoveredAccPoint = {
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
					date,
					accuracy
				};
			}
		}
	}

	function clearAccHover(): void {
		hoveredAccPoint = null;
	}

	function attemptLabel(n: number): string {
		return `${n} attempt${n === 1 ? '' : 's'}`;
	}

	function accuracyColor(pct: number): string {
		if (pct >= 80) return '#22c55e';
		if (pct >= 60) return '#eab308';
		if (pct >= 40) return '#f97316';
		return '#ef4444';
	}

	// Alias for use in paradigm heatmap cells (same logic as accuracyColor)
	const cellColor = accuracyColor;

	function heatmapColor(count: number): string {
		if (count === 0) return 'var(--color-shaded-background)';
		const ratio = count / heatmapMaxQuestions;
		if (ratio <= 0.25) return 'var(--color-heatmap-1, #0e4429)';
		if (ratio <= 0.5) return 'var(--color-heatmap-2, #006d32)';
		if (ratio <= 0.75) return 'var(--color-heatmap-3, #26a641)';
		return 'var(--color-heatmap-4, #39d353)';
	}

	// Tooltip for case accuracy cards
	let hoveredCaseCard = $state<{
		key: string;
		label: string;
		x: number;
		y: number;
	} | null>(null);

	let hoveredCaseInfo = $derived.by(() => {
		if (!hoveredCaseCard) return null;
		let sg: { attempts: number; correct: number };
		let pl: { attempts: number; correct: number };
		if (hoveredCaseCard.key === '_overall') {
			// Aggregate Sg/Pl across all cases
			sg = { attempts: 0, correct: 0 };
			pl = { attempts: 0, correct: 0 };
			for (const cm of CASE_META) {
				const s = caseScores[`${cm.key}_sg`] ?? { attempts: 0, correct: 0 };
				const p = caseScores[`${cm.key}_pl`] ?? { attempts: 0, correct: 0 };
				sg.attempts += s.attempts;
				sg.correct += s.correct;
				pl.attempts += p.attempts;
				pl.correct += p.correct;
			}
		} else {
			sg = caseScores[`${hoveredCaseCard.key}_sg`] ?? { attempts: 0, correct: 0 };
			pl = caseScores[`${hoveredCaseCard.key}_pl`] ?? { attempts: 0, correct: 0 };
		}
		const sgPct = sg.attempts > 0 ? Math.round((sg.correct / sg.attempts) * 100) : null;
		const plPct = pl.attempts > 0 ? Math.round((pl.correct / pl.attempts) * 100) : null;
		return { sg, pl, sgPct, plPct, label: hoveredCaseCard.label };
	});

	function handleCaseCardEnter(e: MouseEvent, key: string, label: string): void {
		const target = e.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const rect = target.getBoundingClientRect();
		hoveredCaseCard = { key, label, x: rect.left + rect.width / 2, y: rect.top };
	}

	function handleCaseCardLeave(): void {
		hoveredCaseCard = null;
	}

	// Tooltip for paradigm heatmap cells
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

	let hoveredCellScore = $derived.by(() => {
		if (!hoveredCell) return null;
		const score = getParadigmCaseNumberScore(
			hoveredCell.paradigm,
			hoveredCell.caseKey,
			hoveredCell.num
		);
		const pct = score.attempts > 0 ? Math.round((score.correct / score.attempts) * 100) : -1;
		const caseMeta = CASE_META.find((c) => c.key === hoveredCell!.caseKey);
		return {
			label: `${caseMeta?.abbrev ?? hoveredCell!.caseKey} ${hoveredCell!.num}`,
			pct,
			attempts: score.attempts
		};
	});

	// Mistakes review
	let storedMistakes = $derived($mistakeRecords);
	let mistakeFilterCase = $state<Case | 'all'>('all');
	let confirmingClearMistakes = $state(false);

	let filteredMistakes = $derived(
		mistakeFilterCase === 'all'
			? storedMistakes
			: storedMistakes.filter((m) => m.targetCase === mistakeFilterCase)
	);

	interface MistakeGroup {
		caseKey: Case;
		label: string;
		mistakes: MistakeRecord[];
	}

	let groupedMistakes = $derived.by<MistakeGroup[]>(() => {
		const groupRecord: Partial<Record<Case, MistakeRecord[]>> = {};
		for (const m of filteredMistakes) {
			const existing = groupRecord[m.targetCase];
			if (existing) {
				existing.push(m);
			} else {
				groupRecord[m.targetCase] = [m];
			}
		}
		const result: MistakeGroup[] = [];
		for (const caseKey of Object.keys(groupRecord)) {
			if (!isCase(caseKey)) continue;
			const c: Case = caseKey;
			const groupMistakes = groupRecord[c];
			if (groupMistakes) {
				result.push({
					caseKey: c,
					label: CASE_LABELS[c],
					mistakes: groupMistakes
				});
			}
		}
		// Sort by case order
		const caseOrder: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
		result.sort((a, b) => caseOrder.indexOf(a.caseKey) - caseOrder.indexOf(b.caseKey));
		return result;
	});

	function formatRelativeTime(isoTimestamp: string): string {
		const now = Date.now();
		const then = new Date(isoTimestamp).getTime();
		const diffMs = now - then;
		const diffMin = Math.floor(diffMs / 60000);
		const diffHr = Math.floor(diffMs / 3600000);
		const diffDay = Math.floor(diffMs / 86400000);

		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffHr < 24) return `${diffHr}h ago`;
		if (diffDay < 7) return `${diffDay}d ago`;
		if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
		return `${Math.floor(diffDay / 30)}mo ago`;
	}

	let mistakeCaseCounts = $derived.by<Array<{ key: Case | 'all'; label: string; count: number }>>(
		() => {
			const counts: Record<string, number> = {};
			for (const m of storedMistakes) {
				counts[m.targetCase] = (counts[m.targetCase] ?? 0) + 1;
			}
			const result: Array<{ key: Case | 'all'; label: string; count: number }> = [
				{ key: 'all', label: 'All', count: storedMistakes.length }
			];
			const caseOrder: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
			for (const c of caseOrder) {
				if (counts[c]) {
					result.push({ key: c, label: CASE_LABELS[c], count: counts[c] });
				}
			}
			return result;
		}
	);

	// Achievement badges
	let badges = $state<BadgeWithStatus[]>([]);
	let earnedBadgeCount = $derived(badges.filter((b) => b.earned).length);

	$effect(() => {
		if (typeof window !== 'undefined') {
			// Re-evaluate context-free badges from the current progress store
			// (which may have been loaded from Supabase) so badges aren't lost
			// when localStorage is empty on a new device/browser.
			const supabase = user ? getSupabaseBrowserClient() : undefined;
			recomputeProgressBasedBadges(supabase);
			badges = getAllBadges();
		}
	});

	function formatBadgeDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Parse a YYYY-MM-DD heatmap key as a local-timezone date for display.
	function formatHeatmapDay(dateKey: string): string {
		const d = new Date(dateKey + 'T00:00:00');
		return d.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	let hoveredHeatmapDay = $state<{
		date: string;
		count: number;
		x: number;
		y: number;
	} | null>(null);

	function handleHeatmapDayEnter(e: MouseEvent, date: string, count: number): void {
		const target = e.currentTarget;
		if (!(target instanceof HTMLElement)) return;
		const rect = target.getBoundingClientRect();
		hoveredHeatmapDay = { date, count, x: rect.left + rect.width / 2, y: rect.top };
	}

	function handleHeatmapDayLeave(): void {
		hoveredHeatmapDay = null;
	}

	// Refresh server data whenever the profile page mounts so freshly-synced
	// practice sessions (e.g. from a few seconds ago on the practice page) show
	// up in the heatmap, and newly earned badges / progress are visible.
	onMount(() => {
		if (user) {
			void invalidateAll();
		}
	});
</script>

<svelte:head>
	<title>Profile - Skloňuj</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen flex-col bg-page-background">
	<NavBar {user} onSignIn={() => goto(resolve('/auth'))} />

	<main class="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
		{#if user && !loaded}
			<div class="flex flex-col items-center justify-center py-24">
				<svg
					class="mb-3 size-8 animate-spin text-emphasis"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
					></path>
				</svg>
				<p class="text-sm text-text-subtitle">Loading profile...</p>
			</div>
		{:else}
			{#if loadError}
				<div
					class="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
					role="alert"
				>
					<p class="font-medium">Some data could not be loaded</p>
					<p class="mt-1 text-xs opacity-80">{loadError}</p>
				</div>
			{/if}

			<!-- 1. User info -->
			<section class="mb-8">
				{#if user}
					<div class="flex items-center gap-3">
						{#if avatarUrl && !avatarLoadError}
							<img
								src={avatarUrl}
								alt=""
								class="size-12 shrink-0 rounded-full object-cover"
								onerror={() => (avatarLoadError = true)}
							/>
						{:else}
							<span
								class="flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
								style="background-color: {avatarColor}"
							>
								{avatarInitial}
							</span>
						{/if}
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<h1 class="truncate text-lg font-semibold text-text-default sm:text-xl">
									{userDisplayLabel}
								</h1>
								<button
									type="button"
									onclick={openNameModal}
									class="flex size-7 items-center justify-center rounded-md text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
									aria-label="Edit display name"
								>
									<Pencil class="size-3.5" aria-hidden="true" />
								</button>
							</div>
							{#if user.email}
								<p class="text-sm text-text-subtitle">{user.email}</p>
							{/if}
							<p class="text-sm text-text-subtitle">Member since {memberSince}</p>
						</div>
					</div>
					<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-subtitle">
						<span
							><span class="font-semibold text-text-default">{totalAttempts}</span> questions completed</span
						>
						{#if daysPracticed > 0}
							<span
								><span class="font-semibold text-text-default">{daysPracticed}</span>
								{daysPracticed === 1 ? 'day' : 'days'} practiced</span
							>
						{:else}
							<span
								><span class="font-semibold text-text-default"
									>{earnedBadgeCount}/{badges.length}</span
								> badges</span
							>
						{/if}
					</div>
				{:else}
					<h1 class="text-lg font-semibold text-text-default sm:text-xl">Your Progress</h1>
					<p class="mt-1 text-sm text-text-subtitle">
						Your stats are saved locally on this device.
						<a
							href={resolve('/auth')}
							class="font-medium text-emphasis underline underline-offset-2"
						>
							Sign in
						</a> to sync across devices.
					</p>
					<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-subtitle">
						<span
							><span class="font-semibold text-text-default">{totalAttempts}</span> questions completed</span
						>
						{#if daysPracticed > 0}
							<span
								><span class="font-semibold text-text-default">{daysPracticed}</span>
								{daysPracticed === 1 ? 'day' : 'days'} practiced</span
							>
						{:else}
							<span
								><span class="font-semibold text-text-default"
									>{earnedBadgeCount}/{badges.length}</span
								> badges</span
							>
						{/if}
					</div>
				{/if}
			</section>

			<!-- Tabs -->
			<div
				class="mb-6 flex items-end justify-between border-b border-card-stroke"
				role="tablist"
				aria-label="Profile views"
				tabindex={-1}
				onkeydown={handleProfileTablistKeydown}
			>
				<div class="flex">
					<button
						type="button"
						role="tab"
						id="profile-tab-progress"
						aria-selected={profileTab === 'progress'}
						aria-controls="profile-panel-progress"
						tabindex={profileTab === 'progress' ? 0 : -1}
						onclick={() => (profileTab = 'progress')}
						class="cursor-pointer border-b-2 px-4 pb-2 text-sm font-medium transition-colors {profileTab ===
						'progress'
							? 'border-emphasis text-text-default'
							: 'border-transparent text-text-subtitle hover:border-text-subtitle hover:text-text-default'}"
					>
						Progress
					</button>
					<button
						type="button"
						role="tab"
						id="profile-tab-mistakes"
						aria-selected={profileTab === 'mistakes'}
						aria-controls="profile-panel-mistakes"
						tabindex={profileTab === 'mistakes' ? 0 : -1}
						onclick={() => (profileTab = 'mistakes')}
						class="cursor-pointer border-b-2 px-4 pb-2 text-sm font-medium transition-colors {profileTab ===
						'mistakes'
							? 'border-emphasis text-text-default'
							: 'border-transparent text-text-subtitle hover:border-text-subtitle hover:text-text-default'}"
					>
						Recent Mistakes{storedMistakes.length > 0 ? ` (${storedMistakes.length})` : ''}
					</button>
					<button
						type="button"
						role="tab"
						id="profile-tab-achievements"
						aria-selected={profileTab === 'achievements'}
						aria-controls="profile-panel-achievements"
						tabindex={profileTab === 'achievements' ? 0 : -1}
						onclick={() => (profileTab = 'achievements')}
						class="cursor-pointer border-b-2 px-4 pb-2 text-sm font-medium transition-colors {profileTab ===
						'achievements'
							? 'border-emphasis text-text-default'
							: 'border-transparent text-text-subtitle hover:border-text-subtitle hover:text-text-default'}"
					>
						Achievements ({earnedBadgeCount}/{badges.length})
					</button>
				</div>
			</div>

			<!-- Progress Tab (combined Overview + Mastery) -->
			{#if profileTab === 'progress'}
				<div
					role="tabpanel"
					id="profile-panel-progress"
					aria-labelledby="profile-tab-progress"
					tabindex={0}
				>
					{#if totalAttempts === 0 && serverSessions.length === 0}
						<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
							<p class="text-sm text-text-subtitle">No activity yet.</p>
							<p class="mt-1 text-sm text-text-subtitle">
								Start practicing to see your focus areas and activity here.
							</p>
						</div>
					{/if}

					<!-- Activity heatmap -->
					{#if serverSessions.length > 0}
						<section class="mb-6 overflow-hidden">
							<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-text-subtitle">
								Activity
							</h2>
							<div class="-mx-4 overflow-x-auto px-4">
								<div class="min-w-0 rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
									<!-- Month labels -->
									<div class="mb-1 flex" style="padding-left: 28px;">
										{#each heatmapMonthLabels as ml (ml.weekIndex)}
											<span
												class="text-xs text-text-subtitle"
												style="position: relative; left: {ml.weekIndex *
													13}px; width: 0; white-space: nowrap;"
											>
												{ml.label}
											</span>
										{/each}
									</div>
									<!-- Grid -->
									<div class="flex items-start gap-0.5">
										<!-- Day labels -->
										<div class="mr-1 flex flex-col gap-0.5" style="min-width: 22px;">
											<span class="h-3 text-xs leading-3 text-text-subtitle"></span>
											<span class="h-3 text-xs leading-3 text-text-subtitle">Mon</span>
											<span class="h-3 text-xs leading-3 text-text-subtitle"></span>
											<span class="h-3 text-xs leading-3 text-text-subtitle">Wed</span>
											<span class="h-3 text-xs leading-3 text-text-subtitle"></span>
											<span class="h-3 text-xs leading-3 text-text-subtitle">Fri</span>
											<span class="h-3 text-xs leading-3 text-text-subtitle"></span>
										</div>
										<!-- Weeks -->
										{#each heatmapWeeks as week, weekIdx (weekIdx)}
											<div class="flex flex-col gap-0.5">
												{#each week as day (day.date)}
													<div
														role="img"
														class="h-[11px] w-[11px] rounded-[2px]"
														style="background-color: {heatmapColor(day.count)};"
														aria-label="{formatHeatmapDay(day.date)}{day.count > 0
															? ` · ${day.count} question${day.count === 1 ? '' : 's'}`
															: ' · no practice'}"
														onmouseenter={(e) => handleHeatmapDayEnter(e, day.date, day.count)}
														onmouseleave={handleHeatmapDayLeave}
													></div>
												{/each}
											</div>
										{/each}
									</div>
								</div>
							</div>
						</section>

						{#if hoveredHeatmapDay}
							<div
								class="pointer-events-none fixed z-50 rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs shadow-md"
								style="left: {hoveredHeatmapDay.x}px; top: {hoveredHeatmapDay.y -
									8}px; transform: translate(-50%, -100%);"
							>
								<p class="font-medium text-text-default">
									{formatHeatmapDay(hoveredHeatmapDay.date)}
								</p>
								{#if hoveredHeatmapDay.count > 0}
									<p class="text-text-subtitle">
										{hoveredHeatmapDay.count} question{hoveredHeatmapDay.count === 1 ? '' : 's'}
									</p>
								{:else}
									<p class="text-text-subtitle">No practice</p>
								{/if}
							</div>
						{/if}
					{/if}

					<!-- 4. Case & Paradigm breakdown with tabs -->
					<section class="mb-8">
						<div class="mb-4 flex items-center gap-2 sm:gap-4">
							<button
								type="button"
								class="rounded-lg px-2 py-1.5 text-sm font-semibold uppercase tracking-wide transition-colors {breakdownTab ===
								'case'
									? 'text-text-default'
									: 'text-text-subtitle hover:text-text-default'}"
								onclick={() => (breakdownTab = 'case')}
							>
								By Case
							</button>
							<button
								type="button"
								class="rounded-lg px-2 py-1.5 text-sm font-semibold uppercase tracking-wide transition-colors {breakdownTab ===
								'paradigm'
									? 'text-text-default'
									: 'text-text-subtitle hover:text-text-default'}"
								onclick={() => (breakdownTab = 'paradigm')}
							>
								By Paradigm
							</button>
							{#if hasPronounScores}
								<button
									type="button"
									class="rounded-lg px-2 py-1.5 text-sm font-semibold uppercase tracking-wide transition-colors {breakdownTab ===
									'pronoun'
										? 'text-text-default'
										: 'text-text-subtitle hover:text-text-default'}"
									onclick={() => (breakdownTab = 'pronoun')}
								>
									Pronouns
								</button>
							{/if}
							<!-- Tab indicator -->
							<div class="flex-1"></div>
						</div>

						<div class="breakdown-content">
							{#if breakdownTab === 'case'}
								<!-- By Case view: compact accuracy grid -->
								{@const overallTotals = CASE_META.reduce(
									(acc, cm) => {
										const t = getCaseTotals(cm.key);
										return {
											attempts: acc.attempts + t.attempts,
											correct: acc.correct + t.correct
										};
									},
									{ attempts: 0, correct: 0 }
								)}
								{@const overallPct =
									overallTotals.attempts > 0
										? Math.round((overallTotals.correct / overallTotals.attempts) * 100)
										: null}
								<div class="grid grid-cols-4 gap-2 sm:grid-cols-8">
									<button
										type="button"
										onclick={() => (accuracyCaseFilter = 'all')}
										onmouseenter={(e: MouseEvent) => handleCaseCardEnter(e, '_overall', 'Overall')}
										onmouseleave={handleCaseCardLeave}
										class="flex cursor-pointer flex-col justify-center rounded-xl p-3 text-center transition-shadow hover:shadow-[inset_0_0_0_2px_currentColor] sm:mr-2 {overallPct !==
										null
											? overallPct >= 70
												? 'bg-positive-background text-positive-stroke'
												: overallPct >= 40
													? 'bg-warning-background text-warning-text'
													: 'bg-negative-background text-negative-stroke'
											: 'bg-card-bg text-text-subtitle'}"
										style="box-shadow: {accuracyCaseFilter === 'all'
											? 'inset 0 0 0 2.5px currentColor'
											: ''};"
									>
										<p class="text-xs font-bold uppercase tracking-wide">Avg</p>
										<p class="text-xl font-extrabold">
											{overallPct !== null ? `${overallPct}%` : '--'}
										</p>
									</button>
									{#each CASE_META as caseMeta (caseMeta.key)}
										{@const totals = getCaseTotals(caseMeta.key)}
										{@const pct =
											totals.attempts > 0
												? Math.round((totals.correct / totals.attempts) * 100)
												: null}
										{@const isSelected = accuracyCaseFilter === caseMeta.key}
										<button
											type="button"
											onclick={() => (accuracyCaseFilter = isSelected ? 'all' : caseMeta.key)}
											onmouseenter={(e: MouseEvent) =>
												handleCaseCardEnter(e, caseMeta.key, caseMeta.label)}
											onmouseleave={handleCaseCardLeave}
											class="cursor-pointer rounded-xl p-3 text-center transition-shadow hover:shadow-[inset_0_0_0_2px_currentColor] {pct !==
											null
												? pct >= 70
													? 'bg-positive-background text-positive-stroke'
													: pct >= 40
														? 'bg-warning-background text-warning-text'
														: 'bg-negative-background text-negative-stroke'
												: 'bg-card-bg text-text-subtitle'}"
											style="box-shadow: {isSelected ? 'inset 0 0 0 2.5px currentColor' : ''};"
										>
											<p class="text-xs font-medium uppercase">
												{caseMeta.abbrev}
											</p>
											<p class="text-lg font-bold">
												{pct !== null ? `${pct}%` : '--'}
											</p>
											{#if totals.attempts > 0}
												<p class="text-[10px] opacity-70">
													{totals.correct}/{totals.attempts}
												</p>
											{/if}
										</button>
									{/each}
								</div>
							{:else if breakdownTab === 'paradigm'}
								<!-- By Paradigm view: grouped by gender -->
								<div class="flex flex-col gap-4">
									{#if Object.keys(paradigmScores).filter((k) => !k.startsWith('pronoun_')).length === 0}
										<p class="py-8 text-center text-sm text-text-subtitle">
											No paradigm practice data yet.
										</p>
									{:else}
										{#each PARADIGM_GROUPS as group (group.label)}
											{@const groupParadigms = group.paradigms}
											<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
												<div class="mb-3 flex flex-wrap items-baseline justify-between gap-1">
													<p
														class="text-xs font-semibold uppercase tracking-wide text-text-subtitle"
													>
														{group.label}
													</p>
												</div>
												<div class="overflow-x-auto pb-3">
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
														<!-- Divider between paradigms -->
														{#if pi > 0}
															<div class="my-1.5 border-t border-card-stroke"></div>
														{/if}
														<!-- Wrapper: label spans both Sg+Pl rows -->
														<div class="flex items-center">
															<!-- Left label: name + description, spanning both rows -->
															<div class="w-28 shrink-0 pr-2">
																<p class="text-xs font-medium leading-tight text-text-default">
																	{paradigm}
																</p>
																<p class="text-xs leading-tight text-text-subtitle">
																	{PARADIGM_DESC[paradigm] ?? ''}
																</p>
															</div>
															<!-- Sg + Pl rows stacked -->
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
																				class="paradigm-cell h-5 w-6 rounded-[3px]"
																				style="background-color: {pct >= 0
																					? cellColor(pct)
																					: 'var(--color-shaded-background)'}; opacity: {pct >= 0
																					? 0.85
																					: 1};"
																				role="gridcell"
																				tabindex="0"
																				aria-label="{paradigm} {cm.label} singular: {pct >= 0
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
																				class="paradigm-cell h-5 w-6 rounded-[3px]"
																				style="background-color: {pct >= 0
																					? cellColor(pct)
																					: 'var(--color-shaded-background)'}; opacity: {pct >= 0
																					? 0.85
																					: 1};"
																				role="gridcell"
																				tabindex="0"
																				aria-label="{paradigm} {cm.label} plural: {pct >= 0
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

										<!-- Legend -->
										<div class="flex items-center justify-center gap-3 text-xs text-text-subtitle">
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
									{/if}
								</div>
							{:else if breakdownTab === 'pronoun'}
								<!-- By Pronoun view: heatmap grid cards -->
								<div class="flex flex-col gap-4">
									{#if activePronounLemmas.length === 0}
										<p class="py-8 text-center text-sm text-text-subtitle">
											No pronoun practice data yet.
										</p>
									{:else}
										{#each activePronounLemmas as lemma (lemma)}
											{@const pronounParadigm = `pronoun_${lemma}`}
											{@const totals = getParadigmTotals(pronounParadigm)}
											{@const totalPct =
												totals.attempts > 0
													? Math.round((totals.correct / totals.attempts) * 100)
													: 0}
											<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
												<div class="mb-3 flex flex-wrap items-baseline justify-between gap-1">
													<div class="min-w-0">
														<span class="text-sm font-semibold text-text-default">{lemma}</span>
														<span class="ml-1 text-xs text-text-subtitle sm:ml-2"
															>{PRONOUN_TRANSLATIONS[lemma] ?? ''}</span
														>
													</div>
													<span class="text-xs text-text-subtitle">
														{#if totals.attempts > 0}
															{totalPct}% ({totals.attempts})
														{:else}
															No data
														{/if}
													</span>
												</div>

												<!-- Mini heatmap: 7 cases x 2 rows (sg, pl) -->
												<div class="overflow-x-auto pb-3">
													<!-- Case header labels -->
													<div class="mb-1 flex items-center">
														<div class="w-7 shrink-0"></div>
														{#each CASE_META as cm (cm.key)}
															<div
																class="shrink-0 text-center text-xs text-text-subtitle"
																style="width: 32px;"
															>
																{cm.abbrev}
															</div>
														{/each}
													</div>
													<!-- Sg row -->
													<div class="mb-0.5 flex items-center">
														<div class="w-7 shrink-0 text-right text-xs text-text-subtitle">Sg</div>
														{#each CASE_META as cm (cm.key)}
															{@const score = getParadigmCaseNumberScore(
																pronounParadigm,
																cm.key,
																'sg'
															)}
															{@const pct =
																score.attempts > 0
																	? Math.round((score.correct / score.attempts) * 100)
																	: -1}
															<div class="flex shrink-0 justify-center" style="width: 32px;">
																<div
																	class="paradigm-cell h-5 w-6 rounded-[3px]"
																	style="background-color: {pct >= 0
																		? cellColor(pct)
																		: 'var(--color-shaded-background)'}; opacity: {pct >= 0
																		? 0.85
																		: 1};"
																	role="gridcell"
																	tabindex="0"
																	aria-label="{cm.label} singular: {pct >= 0
																		? `${pct}% accuracy, ${attemptLabel(score.attempts)}`
																		: 'no data'}"
																	onmouseenter={(e: MouseEvent) =>
																		handleCellEnter(e, pronounParadigm, cm.key, 'sg')}
																	onmouseleave={handleCellLeave}
																	onfocus={(e: FocusEvent) =>
																		handleCellEnter(e, pronounParadigm, cm.key, 'sg')}
																	onblur={handleCellLeave}
																></div>
															</div>
														{/each}
													</div>
													<!-- Pl row -->
													<div class="flex items-center">
														<div class="w-7 shrink-0 text-right text-xs text-text-subtitle">Pl</div>
														{#each CASE_META as cm (cm.key)}
															{@const score = getParadigmCaseNumberScore(
																pronounParadigm,
																cm.key,
																'pl'
															)}
															{@const pct =
																score.attempts > 0
																	? Math.round((score.correct / score.attempts) * 100)
																	: -1}
															<div class="flex shrink-0 justify-center" style="width: 32px;">
																<div
																	class="paradigm-cell h-5 w-6 rounded-[3px]"
																	style="background-color: {pct >= 0
																		? cellColor(pct)
																		: 'var(--color-shaded-background)'}; opacity: {pct >= 0
																		? 0.85
																		: 1};"
																	role="gridcell"
																	tabindex="0"
																	aria-label="{cm.label} plural: {pct >= 0
																		? `${pct}% accuracy, ${attemptLabel(score.attempts)}`
																		: 'no data'}"
																	onmouseenter={(e: MouseEvent) =>
																		handleCellEnter(e, pronounParadigm, cm.key, 'pl')}
																	onmouseleave={handleCellLeave}
																	onfocus={(e: FocusEvent) =>
																		handleCellEnter(e, pronounParadigm, cm.key, 'pl')}
																	onblur={handleCellLeave}
																></div>
															</div>
														{/each}
													</div>
												</div>
											</div>
										{/each}

										<!-- Legend -->
										<div class="flex items-center justify-center gap-3 text-xs text-text-subtitle">
											<div class="flex items-center gap-1">
												<div
													class="h-3 w-3 rounded-[2px]"
													style="background-color: var(--color-shaded-background);"
												></div>
												No data
											</div>
											<div class="flex items-center gap-1">
												<div
													class="h-3 w-3 rounded-[2px]"
													style="background-color: #ef4444; opacity: 0.85;"
												></div>
												&lt;40%
											</div>
											<div class="flex items-center gap-1">
												<div
													class="h-3 w-3 rounded-[2px]"
													style="background-color: #f97316; opacity: 0.85;"
												></div>
												40-59%
											</div>
											<div class="flex items-center gap-1">
												<div
													class="h-3 w-3 rounded-[2px]"
													style="background-color: #eab308; opacity: 0.85;"
												></div>
												60-79%
											</div>
											<div class="flex items-center gap-1">
												<div
													class="h-3 w-3 rounded-[2px]"
													style="background-color: #22c55e; opacity: 0.85;"
												></div>
												80%+
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</section>

					<!-- Accuracy Over Time chart -->
					{#if hasEnoughOverallData}
						<section class="mb-8">
							<div class="mb-4 flex items-center justify-between">
								<h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtitle">
									Accuracy Over Time
								</h2>
								<select
									bind:value={accuracyCaseFilter}
									class="rounded-lg border border-card-stroke bg-card-bg px-3 py-1.5 text-xs text-text-default"
								>
									<option value="all">Overall</option>
									{#each ALL_CASES as c (c)}
										<option value={c}>{CASE_LABELS[c]}</option>
									{/each}
								</select>
							</div>
							{#if dailyAccuracy.length < 2}
								<div class="rounded-xl border border-card-stroke bg-card-bg p-8 text-center">
									<p class="text-sm text-text-subtitle">
										Not enough {accuracyCaseFilter === 'all'
											? 'overall'
											: CASE_LABELS[accuracyCaseFilter].toLowerCase()} data yet.
									</p>
									<p class="mt-1 text-sm text-text-subtitle">
										Practice more {accuracyCaseFilter === 'all'
											? ''
											: CASE_LABELS[accuracyCaseFilter].toLowerCase() + ' '} questions to see your accuracy
										trend.
									</p>
								</div>
							{:else}
								<div
									class="relative rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4"
									bind:clientWidth={accChartContainerWidth}
								>
									<div class="w-full overflow-x-auto">
										<svg
											viewBox="0 0 {ACC_CHART_WIDTH} {ACC_CHART_HEIGHT}"
											class="w-full"
											style="min-width: 360px"
											role="img"
											aria-label="Daily accuracy over time chart"
										>
											<!-- Grid lines and Y-axis labels -->
											{#each ACC_Y_TICKS as tick (tick)}
												<line
													x1={ACC_PAD_LEFT}
													y1={accYScale(tick)}
													x2={ACC_CHART_WIDTH - ACC_PAD_RIGHT}
													y2={accYScale(tick)}
													stroke="var(--color-card-stroke)"
													stroke-width="1"
													stroke-dasharray={tick === 0 ? 'none' : '4 2'}
												/>
												<text
													x={ACC_PAD_LEFT - 8}
													y={accYScale(tick) + 4}
													text-anchor="end"
													fill="var(--color-text-subtitle)"
													font-size="11"
												>
													{tick}%
												</text>
											{/each}

											<!-- X-axis date labels -->
											{#each accXLabels as xl (xl.index)}
												<text
													x={accXScale(xl.index, dailyAccuracy.length)}
													y={ACC_CHART_HEIGHT - 8}
													text-anchor="middle"
													fill="var(--color-text-subtitle)"
													font-size="10"
												>
													{xl.label}
												</text>
											{/each}

											<!-- Accuracy line -->
											<polyline
												points={accPolylinePoints}
												fill="none"
												stroke={accChartColor}
												stroke-width="2"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>

											<!-- Data points -->
											{#each dailyAccuracy as point, i (point.date)}
												<circle
													cx={accXScale(i, dailyAccuracy.length)}
													cy={accYScale(point.accuracy)}
													r="5"
													fill={accChartColor}
													stroke="var(--color-card-bg)"
													stroke-width="2"
													pointer-events="none"
												/>
												<!-- Invisible hit-slop circle for hover -->
												<circle
													cx={accXScale(i, dailyAccuracy.length)}
													cy={accYScale(point.accuracy)}
													r="20"
													fill="transparent"
													role="img"
													aria-label="{formatAccDate(point.date)}: {point.accuracy}% accuracy"
													onmouseenter={(e) => handleAccPointHover(e, point.date, point.accuracy)}
													onmouseleave={clearAccHover}
												/>
											{/each}
										</svg>
									</div>
									<!-- Tooltip (outside overflow container so it isn't clipped) -->
									{#if hoveredAccPoint}
										<div
											class="pointer-events-none absolute z-10 rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs shadow-md"
											style="{hoveredAccPoint.x > accChartContainerWidth - 140
												? `right: ${accChartContainerWidth - hoveredAccPoint.x + 12}px`
												: `left: ${hoveredAccPoint.x + 12}px`}; top: {Math.max(
												4,
												hoveredAccPoint.y - 40
											)}px"
										>
											<p class="font-medium text-text-default">
												{formatAccDate(hoveredAccPoint.date)}
											</p>
											<p class="text-text-subtitle">{hoveredAccPoint.accuracy}% accuracy</p>
										</div>
									{/if}
								</div>
							{/if}
						</section>
					{/if}
				</div>
			{/if}

			<!-- Mistakes Tab -->
			{#if profileTab === 'mistakes'}
				<div
					role="tabpanel"
					id="profile-panel-mistakes"
					aria-labelledby="profile-tab-mistakes"
					tabindex={0}
				>
					{#if storedMistakes.length === 0}
						<div class="mb-8 rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
							<p class="text-sm text-text-subtitle">No mistakes recorded.</p>
							<p class="mt-1 text-sm text-text-subtitle">Nice work — keep it up!</p>
						</div>
					{/if}
					<!-- 5. Review Mistakes -->
					{#if storedMistakes.length > 0}
						<section class="mb-8">
							<div class="mb-4 flex items-center justify-between">
								<h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtitle">
									Recent Mistakes ({storedMistakes.length})
								</h2>
								<div class="flex items-center gap-2">
									<a
										href="{resolve('/')}?mode=review"
										class="inline-flex items-center gap-2 rounded-full border border-negative-stroke/30 bg-card-bg px-4 py-1.5 text-sm font-medium text-negative-stroke transition-colors hover:border-negative-stroke hover:bg-negative-background"
									>
										<RefreshCcw class="size-4" aria-hidden="true" />
										Review {storedMistakes.length}
										{storedMistakes.length === 1 ? 'mistake' : 'mistakes'}
									</a>
									<button
										type="button"
										onclick={() => (confirmingClearMistakes = true)}
										class="rounded-lg px-2 py-1.5 text-xs text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
									>
										Clear all
									</button>
								</div>
							</div>

							<!-- Case filter pills -->
							{#if mistakeCaseCounts.length > 2}
								<div class="mb-3 flex flex-wrap gap-1.5">
									{#each mistakeCaseCounts as { key, label, count } (key)}
										<button
											type="button"
											onclick={() => (mistakeFilterCase = key)}
											class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors
									{mistakeFilterCase === key
												? 'border-emphasis bg-emphasis text-text-inverted'
												: 'border-card-stroke bg-card-bg text-text-subtitle hover:border-emphasis/40 hover:text-text-default'}"
										>
											{label}
											<span class="ml-0.5 opacity-70">{count}</span>
										</button>
									{/each}
								</div>
							{/if}

							<!-- Grouped mistakes list -->
							<div class="space-y-4">
								{#each groupedMistakes as group (group.caseKey)}
									<div>
										<div class="mb-2 flex items-center gap-2">
											<span
												class="inline-block size-2.5 rounded-full"
												style="background-color: {CASE_META.find((c) => c.key === group.caseKey)
													?.hex ?? '#888'}"
											></span>
											<h3 class="text-xs font-semibold text-text-default">
												{group.label}
											</h3>
											<span class="text-xs text-text-subtitle">({group.mistakes.length})</span>
										</div>
										<div class="space-y-2">
											{#each group.mistakes.slice(0, 5) as mistake (mistake.timestamp + mistake.lemma)}
												{@const isCaseId = mistake.drillType === 'case_identification'}
												{@const caseLabel = CASE_LABELS[mistake.targetCase]}
												{@const isMultiStep = mistake.drillType === 'multi_step'}
												{@const isSentenceFillIn = mistake.drillType === 'sentence_fill_in'}
												{@const hasParadigmError =
													isMultiStep &&
													!!mistake.correctParadigm &&
													!!mistake.userParadigm &&
													mistake.userParadigm !== mistake.correctParadigm}
												{@const hasFormError =
													isMultiStep && mistake.userAnswer !== mistake.correctAnswer}
												{@const hasAnyError = !isMultiStep || hasParadigmError || hasFormError}

												{#if hasAnyError}
													{#if isMultiStep}
														{#if hasParadigmError}
															<div
																class="rounded-lg border border-card-stroke bg-card-bg px-3 py-2.5"
															>
																<div class="flex items-start justify-between gap-2">
																	<p class="mb-1 text-sm font-medium text-text-default">
																		Identify paradigm of "{mistake.lemma}"
																	</p>
																	<span class="shrink-0 text-xs text-text-subtitle">
																		{formatRelativeTime(mistake.timestamp)}
																	</span>
																</div>
																<p class="text-xs text-text-subtitle">
																	correct:
																	<span class="text-positive-stroke">{mistake.correctParadigm}</span
																	>
																	· your answer:
																	<span class="text-negative-stroke">{mistake.userParadigm}</span>
																</p>
															</div>
														{/if}
														{#if hasFormError}
															<div
																class="rounded-lg border border-card-stroke bg-card-bg px-3 py-2.5"
															>
																<div class="flex items-start justify-between gap-2">
																	<p class="mb-1 text-sm font-medium text-text-default">
																		Decline "{mistake.lemma}" &rarr; {caseLabel}
																		{mistake.targetNumber === 'sg' ? 'Sg' : 'Pl'}
																	</p>
																	<span class="shrink-0 text-xs text-text-subtitle">
																		{formatRelativeTime(mistake.timestamp)}
																	</span>
																</div>
																<p class="text-xs text-text-subtitle">
																	correct:
																	<span class="text-positive-stroke">{mistake.correctAnswer}</span>
																	· your answer:
																	{#if mistake.userAnswer}
																		<span class="text-negative-stroke">{mistake.userAnswer}</span>
																	{:else}
																		<span class="italic text-text-subtitle">skipped</span>
																	{/if}
																</p>
															</div>
														{/if}
													{:else}
														<div
															class="rounded-lg border border-card-stroke bg-card-bg px-3 py-2.5"
														>
															<div class="flex items-start justify-between gap-2">
																<p class="mb-1 text-sm font-medium text-text-default">
																	{#if isCaseId}
																		Identify the case of "{mistake.lemma}"{#if mistake.sentence}
																			in:{/if}
																	{:else if isSentenceFillIn}
																		Fill in "{mistake.lemma}"
																	{:else if mistake.drillType === 'form_production'}
																		Decline "{mistake.lemma}" &rarr; {caseLabel}
																		{mistake.targetNumber === 'sg' ? 'Sg' : 'Pl'}
																	{:else}
																		Decline "{mistake.lemma}" &rarr; {caseLabel}
																		{mistake.targetNumber === 'sg' ? 'Sg' : 'Pl'}
																	{/if}
																</p>
																<span class="shrink-0 text-xs text-text-subtitle">
																	{formatRelativeTime(mistake.timestamp)}
																</span>
															</div>
															{#if mistake.sentence && mistake.drillType !== 'form_production'}
																<p class="mb-1 text-xs text-text-subtitle">
																	{isCaseId
																		? mistake.sentence.replace('___', `[${mistake.lemma}]`)
																		: isSentenceFillIn
																			? mistake.sentence.replace('___', '______')
																			: mistake.sentence}
																</p>
															{/if}
															<p class="text-xs text-text-subtitle">
																correct:
																<span class="text-positive-stroke"
																	>{isCaseId && isCase(mistake.correctAnswer)
																		? CASE_LABELS[mistake.correctAnswer]
																		: mistake.correctAnswer}</span
																>{#if isSentenceFillIn}<span class="text-text-subtitle"
																		>&nbsp;({caseLabel}
																		{mistake.targetNumber === 'sg' ? 'sg' : 'pl'})</span
																	>{/if}
																· your answer:
																{#if mistake.userAnswer}
																	<span class="text-negative-stroke"
																		>{isCaseId && isCase(mistake.userAnswer)
																			? CASE_LABELS[mistake.userAnswer]
																			: mistake.userAnswer}</span
																	>
																{:else}
																	<span class="italic text-text-subtitle">skipped</span>
																{/if}
															</p>
														</div>
													{/if}
												{/if}
											{/each}
											{#if group.mistakes.length > 5}
												<p class="pt-1 text-center text-xs text-text-subtitle">
													showing 5 of {group.mistakes.length}
												</p>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/if}

					<!-- Clear mistakes confirmation modal -->
					{#if confirmingClearMistakes}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
							onclick={(e) => {
								if (e.target === e.currentTarget) confirmingClearMistakes = false;
							}}
							onkeydown={(e) => {
								if (e.key === 'Escape') confirmingClearMistakes = false;
							}}
						>
							<div
								role="dialog"
								aria-modal="true"
								aria-label="Confirm clear mistakes"
								class="mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-lg"
							>
								<h2 class="mb-2 text-base font-semibold text-text-default">Clear all mistakes?</h2>
								<p class="mb-4 text-sm text-text-subtitle">
									This will remove all {storedMistakes.length} stored mistake records. This cannot be
									undone.
								</p>
								<div class="flex justify-end gap-2">
									<button
										type="button"
										onclick={() => (confirmingClearMistakes = false)}
										class="rounded-lg px-4 py-2 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
									>
										Cancel
									</button>
									<button
										type="button"
										onclick={() => {
											clearMistakes();
											confirmingClearMistakes = false;
										}}
										class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-red-700"
									>
										Clear mistakes
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Achievements Tab -->
			{#if profileTab === 'achievements'}
				<div
					role="tabpanel"
					id="profile-panel-achievements"
					aria-labelledby="profile-tab-achievements"
					tabindex={0}
				>
					<!-- 6. Achievements -->
					<section class="mb-8">
						<div class="mb-4 flex items-center justify-between">
							<h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtitle">
								Achievements
							</h2>
							<span class="text-xs font-medium text-text-subtitle">
								{earnedBadgeCount}/{badges.length} earned
							</span>
						</div>

						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
							{#each badges as badge (badge.id)}
								{@const BadgeIcon = BADGE_ICONS[badge.id]}
								{@const progress = !badge.earned && badge.getProgress ? badge.getProgress() : null}
								{@const progressPct =
									progress && progress.target > 0
										? Math.min(100, Math.round((progress.current / progress.target) * 100))
										: 0}
								<div
									class="flex flex-col rounded-xl border border-card-stroke p-3 transition-colors {badge.earned
										? 'bg-card-bg'
										: 'bg-shaded-background opacity-50'}"
								>
									<div
										class="mb-1.5 {badge.earned
											? (BADGE_COLORS[badge.id] ?? 'text-emphasis')
											: 'text-text-subtitle'}"
									>
										{#if BadgeIcon}
											<BadgeIcon class="size-6" aria-hidden="true" />
										{:else}
											<span class="text-2xl">{badge.icon}</span>
										{/if}
									</div>
									<p
										class="text-sm font-semibold {badge.earned
											? 'text-text-default'
											: 'text-text-subtitle'}"
									>
										{badge.name}
									</p>
									<p class="mt-0.5 text-xs text-text-subtitle">{badge.description}</p>
									<div class="mt-auto pt-2">
										{#if badge.earned && badge.earnedAt}
											<p class="text-[10px] font-medium text-positive-stroke">
												Earned {formatBadgeDate(badge.earnedAt)}
											</p>
										{:else if progress}
											<div>
												<div
													class="h-1 overflow-hidden rounded-full bg-card-stroke"
													role="progressbar"
													aria-valuenow={progressPct}
													aria-valuemin="0"
													aria-valuemax="100"
													aria-label="{badge.name} progress"
												>
													<div
														class="h-full rounded-full bg-emphasis transition-all"
														style="width: {progressPct}%"
													></div>
												</div>
												<p class="mt-1 text-[10px] text-text-subtitle">
													{progress.current} / {progress.target}
												</p>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</section>
				</div>
			{/if}

			<!-- 6. Danger zone (signed-in users only) -->
			{#if user}
				<section class="mb-8">
					<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-text-subtitle">
						Danger zone
					</h2>
					<div
						class="flex flex-col gap-3 rounded-xl border border-red-300 bg-card-bg p-4 dark:border-red-800"
					>
						<div class="flex items-center justify-between gap-4">
							<div>
								<p class="text-sm font-medium text-text-default">Reset progress</p>
								<p class="text-xs text-text-subtitle">
									Clear all your practice history and scores. This cannot be undone.
								</p>
							</div>
							<button
								type="button"
								onclick={() => (confirmingReset = true)}
								class="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
							>
								Reset
							</button>
						</div>
						<div class="border-t border-red-200 dark:border-red-800"></div>
						<div class="flex items-center justify-between gap-4">
							<div>
								<p class="text-sm font-medium text-text-default">Delete account</p>
								<p class="text-xs text-text-subtitle">
									Permanently delete your account and all associated data. This cannot be undone.
								</p>
							</div>
							<button
								type="button"
								onclick={() => (confirmingDelete = true)}
								class="shrink-0 rounded-lg border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 dark:border-red-700"
							>
								Delete
							</button>
						</div>
					</div>
				</section>
			{/if}
		{/if}
	</main>
</div>

<!-- Case card hover tooltip -->
{#if hoveredCaseCard && hoveredCaseInfo}
	<div
		class="pointer-events-none fixed z-50 rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs shadow-lg"
		style="left: {hoveredCaseCard.x}px; top: {hoveredCaseCard.y -
			8}px; transform: translate(-50%, -100%);"
	>
		<p class="mb-1 font-medium text-text-default">{hoveredCaseInfo.label}</p>
		<div class="flex gap-3">
			<div>
				<span class="text-text-subtitle">Sg</span>
				{#if hoveredCaseInfo.sgPct !== null}
					<span class="ml-1 font-semibold" style="color: {accuracyColor(hoveredCaseInfo.sgPct)}"
						>{hoveredCaseInfo.sgPct}%</span
					>
					<span class="text-text-subtitle">({hoveredCaseInfo.sg.attempts})</span>
				{:else}
					<span class="ml-1 text-text-subtitle">--</span>
				{/if}
			</div>
			<div>
				<span class="text-text-subtitle">Pl</span>
				{#if hoveredCaseInfo.plPct !== null}
					<span class="ml-1 font-semibold" style="color: {accuracyColor(hoveredCaseInfo.plPct)}"
						>{hoveredCaseInfo.plPct}%</span
					>
					<span class="text-text-subtitle">({hoveredCaseInfo.pl.attempts})</span>
				{:else}
					<span class="ml-1 text-text-subtitle">--</span>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Paradigm heatmap tooltip -->
{#if hoveredCell && hoveredCellScore}
	<div
		class="pointer-events-none fixed z-50 rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs shadow-lg"
		style="left: {hoveredCell.x}px; top: {hoveredCell.y - 8}px; transform: translate(-50%, -100%);"
	>
		<p class="font-medium text-text-default">{hoveredCellScore.label}</p>
		{#if hoveredCellScore.pct >= 0}
			<p style="color: {cellColor(hoveredCellScore.pct)}">
				{hoveredCellScore.pct}% ({attemptLabel(hoveredCellScore.attempts)})
			</p>
		{:else}
			<p class="text-text-subtitle">No data</p>
		{/if}
	</div>
{/if}

<!-- Edit name modal (signed-in only) -->
{#if editingName && user}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeNameModal();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeNameModal();
		}}
	>
		<div role="dialog" aria-modal="true" aria-label="Edit display name">
			<form
				method="POST"
				action="?/updateName"
				use:enhance={() => {
					savingName = true;
					return async ({ update }) => {
						await update();
						savingName = false;
						editingName = false;
					};
				}}
				class="mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-lg"
			>
				<h2 class="mb-4 text-base font-semibold text-text-default">Edit display name</h2>
				<input
					type="text"
					name="display_name"
					bind:value={nameInput}
					disabled={savingName}
					placeholder="Your name"
					class="w-full rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-base text-text-default outline-none transition-colors focus:border-emphasis"
					use:focusOnMount
				/>
				<div class="mt-4 flex justify-end gap-2">
					<button
						type="button"
						onclick={closeNameModal}
						class="rounded-lg px-4 py-2 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={savingName}
						class="rounded-lg bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{savingName ? 'Saving...' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Reset progress confirmation modal -->
{#if confirmingReset}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
		onclick={(e) => {
			if (e.target === e.currentTarget) confirmingReset = false;
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') confirmingReset = false;
		}}
	>
		<div role="dialog" aria-modal="true" aria-label="Confirm reset progress">
			<form
				method="POST"
				action="?/resetProgress"
				use:enhance={() => {
					resettingProgress = true;
					resetError = null;
					return async ({ result }) => {
						if (result.type === 'success') {
							await invalidateAll();
							confirmingReset = false;
						} else if (result.type === 'failure') {
							const data = result.data;
							resetError =
								isRecord(data) && typeof data.message === 'string'
									? data.message
									: 'Failed to reset progress';
						}
						resettingProgress = false;
					};
				}}
				class="mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-lg"
			>
				<h2 class="mb-2 text-base font-semibold text-text-default">Reset all progress?</h2>
				<p class="mb-4 text-sm text-text-subtitle">
					This will permanently delete all your practice history, scores, and streaks. This action
					cannot be undone.
				</p>
				{#if resetError}
					<p class="mb-3 text-sm text-red-600 dark:text-red-400">{resetError}</p>
				{/if}
				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (confirmingReset = false)}
						class="rounded-lg px-4 py-2 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={resettingProgress}
						class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-red-700 disabled:opacity-50"
					>
						{resettingProgress ? 'Resetting...' : 'Reset progress'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete account confirmation modal -->
{#if confirmingDelete}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
		onclick={(e) => {
			if (e.target === e.currentTarget) confirmingDelete = false;
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') confirmingDelete = false;
		}}
	>
		<div role="dialog" aria-modal="true" aria-label="Confirm delete account">
			<form
				method="POST"
				action="?/deleteAccount"
				use:enhance={() => {
					deletingAccount = true;
					return async ({ update }) => {
						await update();
					};
				}}
				class="mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-lg"
			>
				<h2 class="mb-2 text-base font-semibold text-red-600 dark:text-red-400">Delete account?</h2>
				<p class="mb-4 text-sm text-text-subtitle">
					This will permanently delete your account and all associated data, including your profile,
					progress, practice history, and settings. This action cannot be undone.
				</p>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (confirmingDelete = false)}
						class="rounded-lg px-4 py-2 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={deletingAccount}
						class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-red-700 disabled:opacity-50"
					>
						{deletingAccount ? 'Deleting...' : 'Delete account'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	@keyframes detail-slide-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.case-detail-panel {
		animation: detail-slide-in 200ms ease-out;
	}

	.breakdown-content {
		animation: detail-slide-in 150ms ease-out;
	}

	.paradigm-cell {
		transition: transform 100ms ease-out;
	}

	.paradigm-cell:hover,
	.paradigm-cell:focus {
		transform: scale(1.2);
		box-shadow: 0 0 0 2px var(--color-emphasis);
	}
</style>
