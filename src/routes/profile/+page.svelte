<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import { buildHeatmapWeeks } from '$lib/utils/dates';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	const supabase = getSupabaseBrowserClient();

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	let user = $derived($page.data.user);

	// Streamed data — resolve promises into state
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

		// Handle both direct values and promises (streamed)
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

	let paradigmsExpanded = $state(false);
	let expandedCase = $state<string | null>(null);

	const CASE_META: Array<{ key: string; label: string; hex: string }> = [
		{ key: 'nom', label: 'Nominative', hex: '#8f7e86' },
		{ key: 'gen', label: 'Genitive', hex: '#5d8cdc' },
		{ key: 'dat', label: 'Dative', hex: '#e89a02' },
		{ key: 'acc', label: 'Accusative', hex: '#14b160' },
		{ key: 'voc', label: 'Vocative', hex: '#a777e0' },
		{ key: 'loc', label: 'Locative', hex: '#da5e5e' },
		{ key: 'ins', label: 'Instrumental', hex: '#e34994' }
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
	let caseScores = $derived(
		(serverProgress?.case_scores as Record<string, { attempts: number; correct: number }>) ?? {}
	);
	let paradigmScores = $derived(
		(serverProgress?.paradigm_scores as Record<string, { attempts: number; correct: number }>) ?? {}
	);

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

	// Get paradigm scores for a specific case
	function getParadigmCaseScore(
		paradigm: string,
		caseKey: string
	): { attempts: number; correct: number } {
		const sg = paradigmScores[`${paradigm}_${caseKey}_sg`] ?? { attempts: 0, correct: 0 };
		const pl = paradigmScores[`${paradigm}_${caseKey}_pl`] ?? { attempts: 0, correct: 0 };
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
			const firstDay = new Date(week[0].date);
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

	function heatmapOpacity(count: number): number {
		if (count === 0) return 0;
		const ratio = count / heatmapMaxQuestions;
		if (ratio <= 0.25) return 0.2;
		if (ratio <= 0.5) return 0.4;
		if (ratio <= 0.75) return 0.7;
		return 1.0;
	}
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
					</div>
					<div class="h-8 w-20 animate-pulse rounded-lg bg-shaded-background"></div>
				</div>
				<div class="mt-1">
					<div class="h-4 w-40 animate-pulse rounded bg-shaded-background"></div>
				</div>
			</section>
			<section class="mb-8 grid grid-cols-3 gap-3">
				{#each [1, 2, 3] as _ (_)}
					<div class="rounded-xl border border-card-stroke bg-card-bg p-4">
						<div class="mb-1 h-8 w-12 animate-pulse rounded bg-shaded-background"></div>
						<div class="h-3 w-20 animate-pulse rounded bg-shaded-background"></div>
					</div>
				{/each}
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
			<!-- User info -->
			<section class="mb-8">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<h1 class="text-xl font-semibold text-text-default">{userDisplayLabel}</h1>
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

			<!-- Overall stats row -->
			<section class="mb-8 grid grid-cols-3 gap-3">
				<div class="rounded-xl border border-card-stroke bg-card-bg p-4">
					<p class="text-2xl font-semibold text-text-default">{totalAttempts}</p>
					<p class="text-xs text-text-subtitle">Total questions</p>
				</div>
				<div class="rounded-xl border border-card-stroke bg-card-bg p-4">
					<p class="text-2xl font-semibold text-text-default">{overallAccuracy}%</p>
					<p class="text-xs text-text-subtitle">Accuracy</p>
				</div>
				<div class="rounded-xl border border-card-stroke bg-card-bg p-4">
					<p class="text-2xl font-semibold text-text-default">{daysPracticed}</p>
					<p class="text-xs text-text-subtitle">Days practiced</p>
				</div>
			</section>

			<!-- Case accuracy breakdown -->
			<section class="mb-8">
				<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-text-subtitle">
					Case accuracy
				</h2>
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
							class="cursor-pointer flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors {isSelected
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
						<div class="h-1" style="background-color: {meta?.hex ?? 'var(--color-emphasis)'}"></div>
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
								<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtitle">
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
													<span class="text-xs font-semibold" style="color: {accuracyColor(psPct)}"
														>{psPct}%</span
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
			</section>

			<!-- Activity heatmap -->
			<section class="mb-8">
				<h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-text-subtitle">
					Activity
				</h2>
				<div class="overflow-x-auto rounded-xl border border-card-stroke bg-card-bg p-4">
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
			</section>

			<!-- Paradigm breakdown -->
			<section class="mb-8">
				<button
					type="button"
					class="mb-4 flex w-full items-center justify-between"
					onclick={() => (paradigmsExpanded = !paradigmsExpanded)}
				>
					<h2 class="text-sm font-semibold uppercase tracking-wide text-text-subtitle">
						Paradigm breakdown
					</h2>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="size-4 text-text-subtitle transition-transform {paradigmsExpanded
							? 'rotate-180'
							: ''}"
					>
						<path
							fill-rule="evenodd"
							d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>

				{#if paradigmsExpanded}
					<div class="flex flex-col gap-3">
						{#each PARADIGM_ORDER as paradigm (paradigm)}
							{@const totals = getParadigmTotals(paradigm)}
							{@const pct =
								totals.attempts > 0 ? Math.round((totals.correct / totals.attempts) * 100) : 0}
							{@const label = PARADIGM_NAMES[paradigm] ?? paradigm}
							<div class="rounded-xl border border-card-stroke bg-card-bg p-3">
								<div class="mb-1.5 flex items-baseline justify-between">
									<span class="text-sm font-medium text-text-default">{label}</span>
									<span class="text-xs text-text-subtitle">
										{#if totals.attempts > 0}
											{pct}% ({totals.attempts})
										{:else}
											--
										{/if}
									</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-shaded-background">
									{#if totals.attempts > 0}
										<div
											class="h-full rounded-full bg-emphasis transition-all"
											style="width: {pct}%;"
										></div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
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
				class="w-full rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default outline-none transition-colors focus:border-emphasis"
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

	button,
	button * {
		cursor: pointer !important;
	}

	.case-detail-panel {
		animation: detail-slide-in 200ms ease-out;
	}
</style>
