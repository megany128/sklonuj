<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import { buildHeatmapWeeks } from '$lib/utils/dates';
	import { DIFFICULTY_META } from '$lib/constants';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import type { Difficulty } from '$lib/types';

	const supabase = getSupabaseBrowserClient();

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	let user = $derived($page.data.user);

	// Streamed data -- resolve promises into state
	let serverProfile = $state<{ display_name: string | null; created_at: string } | null>(null);
	let serverProgress = $state<{
		level: string;
		case_scores: Record<string, { attempts: number; correct: number }>;
		paradigm_scores: Record<string, { attempts: number; correct: number }>;
	} | null>(null);
	let serverSessions = $state<
		Array<{
			session_date: string;
			questions_attempted: number;
			questions_correct: number;
		}>
	>([]);
	let dataLoaded = $state(false);

	$effect(() => {
		const profileData = $page.data.profile;
		const progressData = $page.data.progress;
		const sessionsData = $page.data.sessions;

		if (
			profileData instanceof Promise ||
			progressData instanceof Promise ||
			sessionsData instanceof Promise
		) {
			dataLoaded = false;
			Promise.all([
				profileData instanceof Promise ? profileData : Promise.resolve(profileData),
				progressData instanceof Promise ? progressData : Promise.resolve(progressData),
				sessionsData instanceof Promise ? sessionsData : Promise.resolve(sessionsData)
			]).then(([profile, progress, sessions]) => {
				serverProfile = profile;
				serverProgress = progress;
				serverSessions = sessions ?? [];
				dataLoaded = true;
			});
		} else {
			serverProfile = profileData;
			serverProgress = progressData;
			serverSessions = sessionsData ?? [];
			dataLoaded = true;
		}
	});

	let expandedCase = $state<string | null>(null);
	let breakdownTab = $state<'case' | 'paradigm'>('case');

	const CASE_META: Array<{ key: string; label: string; abbrev: string; hex: string }> = [
		{ key: 'nom', label: 'Nominative', abbrev: 'Nom', hex: '#8f7e86' },
		{ key: 'gen', label: 'Genitive', abbrev: 'Gen', hex: '#5d8cdc' },
		{ key: 'dat', label: 'Dative', abbrev: 'Dat', hex: '#e89a02' },
		{ key: 'acc', label: 'Accusative', abbrev: 'Acc', hex: '#14b160' },
		{ key: 'voc', label: 'Vocative', abbrev: 'Voc', hex: '#a777e0' },
		{ key: 'loc', label: 'Locative', abbrev: 'Loc', hex: '#da5e5e' },
		{ key: 'ins', label: 'Instrumental', abbrev: 'Ins', hex: '#e34994' }
	];

	const PARADIGM_NAMES: Record<string, string> = {
		hrad: 'Hard masc. inanimate',
		stroj: 'Soft masc. inanimate',
		pán: 'Hard masc. animate',
		muž: 'Soft masc. animate',
		předseda: 'Masc. -a ending',
		žena: 'Hard feminine',
		růže: 'Soft feminine',
		kost: 'Feminine -ost',
		město: 'Hard neuter',
		moře: 'Soft neuter',
		kuře: 'Neuter -e/-e',
		stavení: 'Neuter -í'
	};

	const PARADIGM_ORDER = [
		'hrad',
		'stroj',
		'pán',
		'muž',
		'předseda',
		'žena',
		'růže',
		'kost',
		'město',
		'moře',
		'kuře',
		'stavení'
	];

	// Dark mode
	let darkMode = $state(false);
	let darkModeInitialized = $state(false);

	$effect(() => {
		if (darkModeInitialized) return;
		darkModeInitialized = true;
		if (typeof window === 'undefined') return;
		const stored = localStorage.getItem('sklonuj_dark');
		if (stored !== null) {
			darkMode = stored === 'true';
		} else {
			darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
		document.documentElement.classList.toggle('dark', darkMode);
	});

	function toggleDarkMode(): void {
		darkMode = !darkMode;
		document.documentElement.classList.toggle('dark', darkMode);
		localStorage.setItem('sklonuj_dark', String(darkMode));
	}

	function handleSignOut() {
		supabase.auth.signOut().catch(() => {});
		document.cookie.split(';').forEach((c) => {
			const name = c.trim().split('=')[0];
			if (name.startsWith('sb-')) {
				document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
			}
		});
		window.location.href = '/';
	}

	// Display name editing
	let editingName = $state(false);
	let nameInput = $state('');
	let savingName = $state(false);

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

	let caseScores = $derived(serverProgress?.case_scores ?? {});
	let paradigmScores = $derived(serverProgress?.paradigm_scores ?? {});

	let userLevel = $derived((serverProgress?.level ?? 'A1') as Difficulty);
	let levelMeta = $derived(DIFFICULTY_META[userLevel]);

	let totalAttempts = $derived.by(() => {
		let attempts = 0;
		for (const score of Object.values(caseScores)) {
			attempts += score.attempts;
		}
		return attempts;
	});
	let totalCorrect = $derived.by(() => {
		let correct = 0;
		for (const score of Object.values(caseScores)) {
			correct += score.correct;
		}
		return correct;
	});
	let daysPracticed = $derived(serverSessions.length);

	let overallAccuracy = $derived(
		totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0
	);

	// Current streak: consecutive days practiced ending at today or yesterday
	let currentStreak = $derived.by(() => {
		if (serverSessions.length === 0) return 0;
		const sessionDates = new Set(serverSessions.map((s) => s.session_date));
		const todayStr = formatLocalDate(Date.now());

		// Use day offsets to avoid mutable Date instances
		let dayOffset = 0;
		if (!sessionDates.has(dateByOffset(todayStr, 0))) {
			dayOffset = -1;
			if (!sessionDates.has(dateByOffset(todayStr, -1))) {
				return 0;
			}
		}

		let streak = 0;
		while (sessionDates.has(dateByOffset(todayStr, dayOffset))) {
			streak++;
			dayOffset--;
		}
		return streak;
	});

	function formatLocalDate(ms: number): string {
		const d = new Date(ms);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${y}-${m}-${day}`;
	}

	/** Offset a YYYY-MM-DD string by N days (negative = past). */
	function dateByOffset(baseDate: string, days: number): string {
		const parts = baseDate.split('-');
		const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + days);
		return formatLocalDate(d.getTime());
	}

	// Weakest area: find the paradigm+case combination with lowest accuracy (min 5 attempts)
	let weakestArea = $derived.by<{
		paradigm: string;
		caseLabel: string;
		number: string;
		accuracy: number;
		attempts: number;
	} | null>(() => {
		if (totalAttempts < 20) return null;
		let worst: {
			paradigm: string;
			caseLabel: string;
			number: string;
			accuracy: number;
			attempts: number;
		} | null = null;
		for (const [key, score] of Object.entries(paradigmScores)) {
			if (score.attempts < 5) continue;
			const pct = Math.round((score.correct / score.attempts) * 100);
			if (worst === null || pct < worst.accuracy) {
				// Parse key: paradigm_case_number
				const parts = key.split('_');
				const num = parts[parts.length - 1];
				const caseKey = parts[parts.length - 2];
				const paradigm = parts.slice(0, parts.length - 2).join('_');
				const caseMeta = CASE_META.find((c) => c.key === caseKey);
				worst = {
					paradigm,
					caseLabel: caseMeta?.label ?? caseKey,
					number: num === 'sg' ? 'singular' : 'plural',
					accuracy: pct,
					attempts: score.attempts
				};
			}
		}
		return worst;
	});

	let userDisplayLabel = $derived(displayName || user?.email?.split('@')[0] || 'User');

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

	// Get paradigm scores for a specific case (sg+pl combined)
	function getParadigmCaseScore(
		paradigm: string,
		caseKey: string
	): { attempts: number; correct: number } {
		const sg = getParadigmCaseNumberScore(paradigm, caseKey, 'sg');
		const pl = getParadigmCaseNumberScore(paradigm, caseKey, 'pl');
		return { attempts: sg.attempts + pl.attempts, correct: sg.correct + pl.correct };
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

	function accuracyColor(pct: number): string {
		if (pct >= 80) return '#22c55e';
		if (pct >= 60) return '#eab308';
		if (pct >= 40) return '#f97316';
		return '#ef4444';
	}

	// Alias for use in paradigm heatmap cells (same logic as accuracyColor)
	const cellColor = accuracyColor;

	function heatmapOpacity(count: number): number {
		if (count === 0) return 0;
		const ratio = count / heatmapMaxQuestions;
		if (ratio <= 0.25) return 0.2;
		if (ratio <= 0.5) return 0.4;
		if (ratio <= 0.75) return 0.7;
		return 1.0;
	}

	// Tooltip for paradigm heatmap cells
	let hoveredCell = $state<{
		paradigm: string;
		caseKey: string;
		num: string;
		x: number;
		y: number;
	} | null>(null);

	function handleCellEnter(e: MouseEvent, paradigm: string, caseKey: string, num: string): void {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
</script>

<svelte:head>
	<title>Profile - Skloňuj</title>
</svelte:head>

<div class="flex min-h-screen flex-col bg-page-background">
	<NavBar
		{darkMode}
		onToggleDarkMode={toggleDarkMode}
		{user}
		onSignIn={() => goto(resolve('/'))}
		onNavigate={() => goto(resolve('/'))}
	/>

	<main class="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
		{#if !user}
			<div class="py-16 text-center">
				<p class="text-sm text-text-subtitle">Sign in to view your profile.</p>
				<a
					href={resolve('/')}
					class="mt-3 inline-block text-sm text-emphasis underline underline-offset-2"
				>
					Go to home
				</a>
			</div>
		{:else if !dataLoaded}
			<!-- Skeleton loading state -->
			<section class="mb-8">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<div class="h-7 w-32 animate-pulse rounded-lg bg-shaded-background"></div>
						<div class="h-5 w-12 animate-pulse rounded-md bg-shaded-background"></div>
					</div>
					<div class="h-8 w-20 animate-pulse rounded-lg bg-shaded-background"></div>
				</div>
				<div class="mt-1">
					<div class="h-4 w-40 animate-pulse rounded bg-shaded-background"></div>
				</div>
			</section>
			<section class="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
				{#each [1, 2, 3, 4] as _ (_)}
					<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
						<div class="mb-1 h-8 w-12 animate-pulse rounded bg-shaded-background"></div>
						<div class="h-3 w-16 animate-pulse rounded bg-shaded-background"></div>
					</div>
				{/each}
			</section>
			<section class="mb-8">
				<div class="h-28 animate-pulse rounded-xl border border-card-stroke bg-card-bg"></div>
			</section>
			<section class="mb-8">
				<div class="mb-4 h-4 w-28 animate-pulse rounded bg-shaded-background"></div>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
					{#each [1, 2, 3, 4, 5, 6, 7] as _ (_)}
						<div
							class="flex flex-col items-center gap-2 rounded-xl border border-card-stroke bg-card-bg p-4"
						>
							<div class="size-[72px] animate-pulse rounded-full bg-shaded-background"></div>
							<div class="h-3 w-16 animate-pulse rounded bg-shaded-background"></div>
						</div>
					{/each}
				</div>
			</section>
		{:else}
			<!-- 1. User info -->
			<section class="mb-8">
				<div class="flex items-center justify-between gap-2">
					<div class="flex min-w-0 flex-wrap items-center gap-2">
						<h1 class="truncate text-lg font-semibold text-text-default sm:text-xl">
							{userDisplayLabel}
						</h1>
						<button
							type="button"
							onclick={openNameModal}
							class="flex size-7 items-center justify-center rounded-md text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
							aria-label="Edit display name"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								class="size-3.5"
							>
								<path
									d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474Z"
								/>
								<path
									d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9A.75.75 0 0 1 14 9v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"
								/>
							</svg>
						</button>
						<!-- Level badge -->
						<span
							class="rounded-md bg-shaded-background px-2 py-0.5 text-xs font-semibold text-text-default"
						>
							{userLevel}
							<span class="font-normal text-text-subtitle">{levelMeta.subtitle}</span>
						</span>
					</div>
					<button
						type="button"
						onclick={handleSignOut}
						class="shrink-0 rounded-lg px-3 py-1.5 text-sm text-text-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
					>
						Sign out
					</button>
				</div>
				<div class="mt-1">
					<span class="text-sm text-text-subtitle">Member since {memberSince}</span>
				</div>
			</section>

			<!-- 2. Overall stats row (4 columns) -->
			<section class="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
				<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
					<p class="text-xl font-semibold text-text-default sm:text-2xl">{totalAttempts}</p>
					<p class="text-xs text-text-subtitle">Total questions</p>
				</div>
				<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
					<p class="text-xl font-semibold text-text-default sm:text-2xl">{overallAccuracy}%</p>
					<p class="text-xs text-text-subtitle">Accuracy</p>
				</div>
				<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
					<p class="text-xl font-semibold text-text-default sm:text-2xl">{daysPracticed}</p>
					<p class="text-xs text-text-subtitle">Days practiced</p>
				</div>
				<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
					<p class="text-xl font-semibold text-text-default sm:text-2xl">{currentStreak}</p>
					<p class="text-xs text-text-subtitle">Day streak</p>
				</div>
			</section>

			<!-- Weakest area callout -->
			{#if weakestArea}
				<section class="mb-6">
					<div
						class="flex items-start gap-3 rounded-xl border border-card-stroke bg-card-bg px-4 py-3"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="mt-0.5 size-4 shrink-0 text-warning-text"
						>
							<path
								fill-rule="evenodd"
								d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
								clip-rule="evenodd"
							/>
						</svg>
						<div class="min-w-0">
							<p class="text-xs font-semibold text-text-default">Focus area</p>
							<p class="text-xs text-text-subtitle">
								{weakestArea.caseLabel}
								{weakestArea.number} in
								<span class="font-medium text-text-default"
									>{PARADIGM_NAMES[weakestArea.paradigm] ?? weakestArea.paradigm}</span
								>
								paradigm ({weakestArea.accuracy}% accuracy, {weakestArea.attempts} attempts)
							</p>
						</div>
					</div>
				</section>
			{/if}

			<!-- 3. Activity heatmap -->
			<section class="mb-8 overflow-hidden">
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
										14}px; width: 0; white-space: nowrap;"
								>
									{ml.label}
								</span>
							{/each}
						</div>
						<!-- Grid -->
						<div class="flex items-start gap-0.5">
							<!-- Day labels -->
							<div class="mr-1 flex flex-col gap-0.5" style="min-width: 22px;">
								<span class="h-[11px] text-xs leading-[11px] text-text-subtitle"></span>
								<span class="h-[11px] text-xs leading-[11px] text-text-subtitle">Mon</span>
								<span class="h-[11px] text-xs leading-[11px] text-text-subtitle"></span>
								<span class="h-[11px] text-xs leading-[11px] text-text-subtitle">Wed</span>
								<span class="h-[11px] text-xs leading-[11px] text-text-subtitle"></span>
								<span class="h-[11px] text-xs leading-[11px] text-text-subtitle">Fri</span>
								<span class="h-[11px] text-xs leading-[11px] text-text-subtitle"></span>
							</div>
							<!-- Weeks -->
							{#each heatmapWeeks as week, weekIdx (weekIdx)}
								<div class="flex flex-col gap-0.5">
									{#each week as day (day.date)}
										<div
											class="h-[11px] w-[11px] rounded-[2px]"
											style="background-color: {day.count > 0
												? `color-mix(in srgb, var(--color-emphasis) ${heatmapOpacity(day.count) * 100}%, transparent)`
												: 'var(--color-shaded-background)'};"
											title="{day.date}: {day.count} questions"
										></div>
									{/each}
								</div>
							{/each}
						</div>
					</div>
				</div>
			</section>

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
					<!-- Tab indicator -->
					<div class="flex-1"></div>
				</div>

				<div class="breakdown-content">
					{#if breakdownTab === 'case'}
						<!-- By Case view: accuracy rings -->
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
							{#each CASE_META as caseMeta (caseMeta.key)}
								{@const totals = getCaseTotals(caseMeta.key)}
								{@const pct =
									totals.attempts > 0 ? Math.round((totals.correct / totals.attempts) * 100) : 0}
								{@const circumference = 2 * Math.PI * 28}
								{@const strokeOffset =
									totals.attempts > 0 ? circumference * (1 - pct / 100) : circumference}
								{@const ringColor =
									totals.attempts > 0 ? accuracyColor(pct) : 'var(--color-shaded-background)'}
								{@const isSelected = expandedCase === caseMeta.key}
								<button
									type="button"
									class="flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors {isSelected
										? 'border-emphasis/40 bg-card-bg'
										: 'border-card-stroke bg-card-bg hover:border-emphasis/20'}"
									onclick={() => (expandedCase = isSelected ? null : caseMeta.key)}
								>
									<svg width="72" height="72" viewBox="0 0 72 72" class="pointer-events-none">
										<circle
											cx="36"
											cy="36"
											r="28"
											fill="none"
											stroke="var(--color-shaded-background)"
											stroke-width="6"
										/>
										{#if totals.attempts > 0}
											<circle
												cx="36"
												cy="36"
												r="28"
												fill="none"
												stroke={ringColor}
												stroke-width="6"
												stroke-linecap="round"
												stroke-dasharray={circumference}
												stroke-dashoffset={strokeOffset}
												transform="rotate(-90 36 36)"
											/>
										{/if}
										<text
											x="36"
											y="36"
											text-anchor="middle"
											dominant-baseline="central"
											class="text-sm font-semibold"
											fill={totals.attempts > 0 ? ringColor : 'var(--color-text-subtitle)'}
										>
											{totals.attempts > 0 ? `${pct}%` : '--'}
										</text>
									</svg>
									<div class="pointer-events-none text-center">
										<p class="text-xs font-medium text-text-default">{caseMeta.label}</p>
										<p class="text-xs text-text-subtitle">
											{totals.attempts > 0 ? `${totals.attempts} attempts` : 'No data'}
										</p>
									</div>
								</button>
							{/each}
						</div>

						<!-- Detail panel below grid -->
						{#if expandedCase}
							{@const meta = CASE_META.find((c) => c.key === expandedCase)}
							{@const totals = getCaseTotals(expandedCase)}
							{@const sg = caseScores[`${expandedCase}_sg`] ?? { attempts: 0, correct: 0 }}
							{@const pl = caseScores[`${expandedCase}_pl`] ?? { attempts: 0, correct: 0 }}
							{@const sgPct = sg.attempts > 0 ? Math.round((sg.correct / sg.attempts) * 100) : 0}
							{@const plPct = pl.attempts > 0 ? Math.round((pl.correct / pl.attempts) * 100) : 0}
							<div
								class="case-detail-panel mt-3 overflow-hidden rounded-xl border border-card-stroke bg-card-bg"
							>
								<div
									class="h-1"
									style="background-color: {meta?.hex ?? 'var(--color-emphasis)'}"
								></div>
								<div class="p-4">
									<div class="mb-3 flex items-center justify-between">
										<h3 class="text-sm font-semibold text-text-default">{meta?.label}</h3>
										<button
											type="button"
											class="text-xs text-text-subtitle hover:text-text-default"
											onclick={() => (expandedCase = null)}
										>
											Close
										</button>
									</div>

									{#if totals.attempts > 0}
										<!-- Sg vs Pl -->
										<div class="mb-4 grid grid-cols-2 gap-3">
											<div class="rounded-lg bg-shaded-background p-3">
												<p class="text-xs text-text-subtitle">Singular</p>
												<p
													class="mt-0.5 text-xl font-semibold"
													style="color: {sg.attempts > 0
														? accuracyColor(sgPct)
														: 'var(--color-text-subtitle)'}"
												>
													{sg.attempts > 0 ? `${sgPct}%` : '--'}
												</p>
												<p class="text-xs text-text-subtitle">{sg.attempts} attempts</p>
											</div>
											<div class="rounded-lg bg-shaded-background p-3">
												<p class="text-xs text-text-subtitle">Plural</p>
												<p
													class="mt-0.5 text-xl font-semibold"
													style="color: {pl.attempts > 0
														? accuracyColor(plPct)
														: 'var(--color-text-subtitle)'}"
												>
													{pl.attempts > 0 ? `${plPct}%` : '--'}
												</p>
												<p class="text-xs text-text-subtitle">{pl.attempts} attempts</p>
											</div>
										</div>

										<!-- Per paradigm -->
										<p
											class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtitle"
										>
											By paradigm
										</p>
										<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
											{#each PARADIGM_ORDER as paradigm (paradigm)}
												{@const ps = getParadigmCaseScore(paradigm, expandedCase)}
												{#if ps.attempts > 0}
													{@const psPct = Math.round((ps.correct / ps.attempts) * 100)}
													<div
														class="flex items-center justify-between rounded-lg bg-shaded-background px-3 py-2"
													>
														<span class="text-xs text-text-default"
															>{PARADIGM_NAMES[paradigm] ?? paradigm}</span
														>
														<div class="flex items-center gap-2">
															<span class="text-xs text-text-subtitle">{ps.attempts} att.</span>
															<span
																class="text-xs font-semibold"
																style="color: {accuracyColor(psPct)}">{psPct}%</span
															>
														</div>
													</div>
												{/if}
											{/each}
										</div>
									{:else}
										<p class="text-sm text-text-subtitle">No practice data for this case yet.</p>
									{/if}
								</div>
							</div>
						{/if}
					{:else}
						<!-- By Paradigm view: heatmap grid cards -->
						<div class="flex flex-col gap-4">
							{#each PARADIGM_ORDER as paradigm (paradigm)}
								{@const totals = getParadigmTotals(paradigm)}
								{@const totalPct =
									totals.attempts > 0 ? Math.round((totals.correct / totals.attempts) * 100) : 0}
								<div class="rounded-xl border border-card-stroke bg-card-bg p-3 sm:p-4">
									<div class="mb-3 flex flex-wrap items-baseline justify-between gap-1">
										<div class="min-w-0">
											<span class="text-sm font-semibold text-text-default">{paradigm}</span>
											<span class="ml-1 text-xs text-text-subtitle sm:ml-2"
												>{PARADIGM_NAMES[paradigm] ?? ''}</span
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
									<div class="overflow-x-auto">
										<!-- Case header labels -->
										<div class="mb-1 flex items-center">
											<div class="w-7 shrink-0"></div>
											{#each CASE_META as cm (cm.key)}
												<div
													class="shrink-0 text-center text-[10px] text-text-subtitle"
													style="width: 32px;"
												>
													{cm.abbrev}
												</div>
											{/each}
										</div>
										<!-- Sg row -->
										<div class="mb-0.5 flex items-center">
											<div class="w-7 shrink-0 text-right text-[10px] text-text-subtitle">Sg</div>
											{#each CASE_META as cm (cm.key)}
												{@const score = getParadigmCaseNumberScore(paradigm, cm.key, 'sg')}
												{@const pct =
													score.attempts > 0
														? Math.round((score.correct / score.attempts) * 100)
														: -1}
												<div class="flex shrink-0 justify-center" style="width: 32px;">
													<!-- svelte-ignore a11y_no_static_element_interactions -->
													<div
														class="paradigm-cell h-5 w-6 rounded-[3px]"
														style="background-color: {pct >= 0
															? cellColor(pct)
															: 'var(--color-shaded-background)'}; opacity: {pct >= 0 ? 0.85 : 1};"
														onmouseenter={(e: MouseEvent) =>
															handleCellEnter(e, paradigm, cm.key, 'sg')}
														onmouseleave={handleCellLeave}
													></div>
												</div>
											{/each}
										</div>
										<!-- Pl row -->
										<div class="flex items-center">
											<div class="w-7 shrink-0 text-right text-[10px] text-text-subtitle">Pl</div>
											{#each CASE_META as cm (cm.key)}
												{@const score = getParadigmCaseNumberScore(paradigm, cm.key, 'pl')}
												{@const pct =
													score.attempts > 0
														? Math.round((score.correct / score.attempts) * 100)
														: -1}
												<div class="flex shrink-0 justify-center" style="width: 32px;">
													<!-- svelte-ignore a11y_no_static_element_interactions -->
													<div
														class="paradigm-cell h-5 w-6 rounded-[3px]"
														style="background-color: {pct >= 0
															? cellColor(pct)
															: 'var(--color-shaded-background)'}; opacity: {pct >= 0 ? 0.85 : 1};"
														onmouseenter={(e: MouseEvent) =>
															handleCellEnter(e, paradigm, cm.key, 'pl')}
														onmouseleave={handleCellLeave}
													></div>
												</div>
											{/each}
										</div>
									</div>
								</div>
							{/each}

							<!-- Legend -->
							<div class="flex items-center justify-center gap-3 text-[10px] text-text-subtitle">
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
						</div>
					{/if}
				</div>
			</section>

			<!-- Settings link -->
			<div class="mt-8 text-center">
				<a
					href={resolve('/settings')}
					class="text-sm text-text-subtitle underline underline-offset-2 hover:text-text-default"
				>
					Account settings
				</a>
			</div>
		{/if}
	</main>
</div>

<!-- Paradigm heatmap tooltip -->
{#if hoveredCell && hoveredCellScore}
	<div
		class="pointer-events-none fixed z-50 rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs shadow-lg"
		style="left: {hoveredCell.x}px; top: {hoveredCell.y - 8}px; transform: translate(-50%, -100%);"
	>
		<p class="font-medium text-text-default">{hoveredCellScore.label}</p>
		{#if hoveredCellScore.pct >= 0}
			<p style="color: {cellColor(hoveredCellScore.pct)}">
				{hoveredCellScore.pct}% ({hoveredCellScore.attempts} attempts)
			</p>
		{:else}
			<p class="text-text-subtitle">No data</p>
		{/if}
	</div>
{/if}

<!-- Edit name modal -->
{#if editingName}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeNameModal();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeNameModal();
		}}
		role="dialog"
		aria-modal="true"
		aria-label="Edit display name"
		tabindex="-1"
	>
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

	.paradigm-cell:hover {
		transform: scale(1.2);
	}
</style>
