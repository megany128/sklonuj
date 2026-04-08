<script lang="ts">
	import { resolve } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { SvelteMap } from 'svelte/reactivity';
	import NavBar from '$lib/components/ui/NavBar.svelte';

	interface ClassRow {
		id: string;
		name: string;
		class_code: string;
		level: string;
		archived: boolean;
		created_at: string;
	}

	interface TeacherClass extends ClassRow {
		studentCount: number;
		assignmentCount: number;
		avgAccuracy: number | null;
		studentsBelowThreshold: number;
	}

	interface StudentClass {
		classId: string;
		joinedAt: string;
		classInfo: ClassRow;
	}

	interface AssignmentRow {
		id: string;
		classId: string;
		title: string;
		description: string | null;
		selectedCases: string[];
		selectedDrillTypes: string[];
		numberMode: string;
		contentMode: string;
		targetQuestions: number;
		dueDate: string | null;
		createdAt: string;
	}

	interface ClassSummary {
		classId: string;
		pendingCount: number;
		overdueCount: number;
		nextDueDate: string | null;
	}

	interface AssignmentProgressRow {
		assignmentId: string;
		questionsAttempted: number;
		questionsCorrect: number;
		completedAt: string | null;
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function isTeacherClassArray(v: unknown): v is TeacherClass[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) &&
				typeof item.id === 'string' &&
				typeof item.name === 'string' &&
				typeof item.studentCount === 'number' &&
				typeof item.assignmentCount === 'number'
		);
	}

	function isStudentClassArray(v: unknown): v is StudentClass[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) && typeof item.classId === 'string' && typeof item.classInfo === 'object'
		);
	}

	function isAssignmentArray(v: unknown): v is AssignmentRow[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) &&
				typeof item.id === 'string' &&
				typeof item.title === 'string' &&
				typeof item.targetQuestions === 'number'
		);
	}

	function isClassSummaryArray(v: unknown): v is ClassSummary[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) && typeof item.classId === 'string' && typeof item.pendingCount === 'number'
		);
	}

	function isProgressArray(v: unknown): v is AssignmentProgressRow[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) &&
				typeof item.assignmentId === 'string' &&
				typeof item.questionsAttempted === 'number'
		);
	}

	function isClassRowArray(v: unknown): v is ClassRow[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string'
		);
	}

	let user = $derived(page.data.user);
	let archivedClasses = $derived.by(() => {
		const val: unknown = page.data.archivedClasses;
		return isClassRowArray(val) ? val : [];
	});
	let archivedExpanded = $state(false);
	let teacherClasses = $derived.by(() => {
		const val: unknown = page.data.teacherClasses;
		return isTeacherClassArray(val) ? val : [];
	});
	let studentClasses = $derived.by(() => {
		const val: unknown = page.data.studentClasses;
		return isStudentClassArray(val) ? val : [];
	});
	let studentAssignments = $derived.by(() => {
		const val: unknown = page.data.studentAssignments;
		return isAssignmentArray(val) ? val : [];
	});
	let studentProgress = $derived.by(() => {
		const val: unknown = page.data.studentProgress;
		return isProgressArray(val) ? val : [];
	});

	let classSummaries = $derived.by(() => {
		const val: unknown = page.data.studentClassSummaries;
		return isClassSummaryArray(val) ? val : [];
	});

	let isTeacher = $derived(teacherClasses.length > 0 || archivedClasses.length > 0);
	let isStudent = $derived(studentClasses.length > 0);

	// Build a progress map for quick lookups
	let progressMap = $derived.by(() => {
		const map = new SvelteMap<string, AssignmentProgressRow>();
		for (const p of studentProgress) {
			map.set(p.assignmentId, p);
		}
		return map;
	});

	// For single-class students, get the class info
	let singleClass = $derived(studentClasses.length === 1 ? studentClasses[0] : null);

	// Welcome modal for students who just joined via invite link
	let joinedClassName = $state<string | null>(null);
	let showWelcomeModal = $state(false);
	let needsDisplayName = $state(false);
	let displayNameInput = $state('');
	let savingName = $state(false);
	let nameError = $state<string | null>(null);

	// Clipboard feedback
	let copiedClassId = $state<string | null>(null);

	// Join class modal
	let showJoinModal = $state(false);
	let joinCode = $state('');
	let joinError = $state<string | null>(null);
	let joiningClass = $state(false);

	// Create class modal
	let showCreateModal = $state(false);
	let createName = $state('');
	let createDescription = $state('');
	let createLevel = $state('A1');
	let createError = $state<string | null>(null);
	let creatingClass = $state(false);

	function openJoinModal() {
		joinCode = '';
		joinError = null;
		showJoinModal = true;
	}

	function closeJoinModal() {
		showJoinModal = false;
		joinError = null;
	}

	function openCreateModal() {
		createName = '';
		createDescription = '';
		createLevel = 'A1';
		createError = null;
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
		createError = null;
	}

	function handleModalKeydown(e: KeyboardEvent, close: () => void) {
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	$effect(() => {
		const joined = page.url.searchParams.get('joined');
		if (!joined) return;

		// Avoid re-firing if the user navigated back/refreshed onto a stale URL
		// containing ?joined=... after already dismissing the welcome modal once.
		const sessionKey = `welcomeShown:${joined}`;
		let alreadyShown = false;
		try {
			alreadyShown = sessionStorage.getItem(sessionKey) === '1';
		} catch {
			// sessionStorage may be unavailable (private mode) — fall through and show
		}

		if (!alreadyShown) {
			joinedClassName = joined;
			needsDisplayName = page.url.searchParams.get('needsName') === 'true';
			showWelcomeModal = true;
			try {
				sessionStorage.setItem(sessionKey, '1');
			} catch {
				// ignore
			}
		}

		// Clean the URL params without navigation either way
		const cleanUrl = new URL(page.url);
		cleanUrl.searchParams.delete('joined');
		cleanUrl.searchParams.delete('needsName');
		const cleanPath = cleanUrl.search ? resolve('/classes') + cleanUrl.search : resolve('/classes');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- cleanPath uses resolve('/classes')
		replaceState(cleanPath, {});
	});

	function dismissWelcomeModal() {
		showWelcomeModal = false;
		needsDisplayName = false;
		nameError = null;
	}

	function getAssignmentStatus(
		assignment: AssignmentRow,
		progress: AssignmentProgressRow | undefined
	): 'completed' | 'in-progress' | 'not-started' {
		if (progress?.completedAt) return 'completed';
		if (progress && progress.questionsAttempted > 0) return 'in-progress';
		return 'not-started';
	}

	function getStatusLabel(status: 'completed' | 'in-progress' | 'not-started'): string {
		if (status === 'completed') return 'Completed';
		if (status === 'in-progress') return 'In Progress';
		return 'Not Started';
	}

	// Calendar-day diff between now and `dueDate`. Uses UTC-day math so the
	// result is stable across DST transitions and independent of the browser
	// timezone (source `due_date` is a UTC timestamptz).
	function calendarDayDiff(dueDate: string): number {
		const due = new Date(dueDate);
		if (Number.isNaN(due.getTime())) return 0;
		const MS_PER_DAY = 24 * 60 * 60 * 1000;
		const dueDayUTC = Math.floor(due.getTime() / MS_PER_DAY);
		const nowDayUTC = Math.floor(Date.now() / MS_PER_DAY);
		return dueDayUTC - nowDayUTC;
	}

	function getDueDateColor(dueDate: string | null): 'green' | 'yellow' | 'red' | 'none' {
		if (!dueDate) return 'none';
		const diffDays = calendarDayDiff(dueDate);
		if (diffDays < 0) return 'red';
		if (diffDays <= 2) return 'yellow';
		return 'green';
	}

	function formatDueDate(dueDate: string): string {
		const diffDays = calendarDayDiff(dueDate);
		if (diffDays < 0)
			return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`;
		if (diffDays === 0) return 'Due today';
		if (diffDays === 1) return 'Due tomorrow';
		return `Due in ${diffDays} days`;
	}

	async function copyClassCode(code: string, classId: string) {
		try {
			await navigator.clipboard.writeText(code);
			copiedClassId = classId;
			setTimeout(() => {
				copiedClassId = null;
			}, 2000);
		} catch {
			// Clipboard API may not be available
		}
	}
</script>

<svelte:head>
	<title>Classes - Skloňuj</title>
</svelte:head>

<NavBar user={page.data.user} />

<div class="mx-auto max-w-3xl px-4 py-8">
	{#if !user}
		<!-- Signed-out view -->
		<div class="mb-6">
			<h1 class="text-xl font-semibold text-text-default">Classes</h1>
		</div>
		<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="currentColor"
				class="mx-auto mb-3 size-10 text-text-subtitle"
			>
				<path
					d="M11.7 2.805a.75.75 0 0 1 .6 0A60.65 60.65 0 0 1 22.83 8.72a.75.75 0 0 1-.231 1.337 49.948 49.948 0 0 0-9.902 3.912l-.003.002-.34.18a.75.75 0 0 1-.707 0A50.88 50.88 0 0 0 7.5 12.173v-.224c0-.131.067-.248.172-.311a54.615 54.615 0 0 1 4.653-2.52.75.75 0 0 0-.65-1.352 56.123 56.123 0 0 0-4.78 2.589 1.858 1.858 0 0 0-.859 1.228 49.803 49.803 0 0 0-4.634-1.527.75.75 0 0 1-.231-1.337A60.653 60.653 0 0 1 11.7 2.805Z"
				/>
				<path
					d="M13.06 15.473a48.45 48.45 0 0 1 7.666-3.282c.134 1.414.22 2.843.255 4.284a.75.75 0 0 1-.46.711 47.87 47.87 0 0 0-8.105 4.342.75.75 0 0 1-.832 0 47.87 47.87 0 0 0-8.104-4.342.75.75 0 0 1-.461-.71c.035-1.442.121-2.87.255-4.286a48.4 48.4 0 0 1 9.786 3.283Zm-1.06 1.79a.75.75 0 0 0-.75.75v.282c0 .414.336.75.75.75h.01a.75.75 0 0 0 .75-.75v-.282a.75.75 0 0 0-.75-.75H12Z"
				/>
			</svg>
			<h2 class="mb-2 text-lg font-semibold text-text-default">
				Join a class to practice together
			</h2>
			<p class="mb-5 text-sm text-text-subtitle">
				Sign in to join a class with a class code from your teacher, or create your own class to
				assign structured Czech declension exercises.
			</p>
			<a
				href="{resolve('/auth')}?redirect=/classes"
				class="inline-block rounded-xl bg-emphasis px-5 py-2.5 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
			>
				Sign in to get started
			</a>
		</div>
	{:else}
		<!-- Action buttons always visible for logged-in users -->
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-xl font-semibold text-text-default">Classes</h1>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={openJoinModal}
					class="cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
				>
					Join Class
				</button>
				<button
					type="button"
					onclick={openCreateModal}
					class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
				>
					Create Class
				</button>
			</div>
		</div>

		{#if isTeacher}
			<!-- Teacher classes section -->
			<section class="mb-8">
				<h2 class="mb-3 text-lg font-semibold text-text-default">Your Classes</h2>

				{#if teacherClasses.length === 0}
					<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
						<p class="mb-2 text-sm text-text-subtitle">Create your first class to get started.</p>
						<button
							type="button"
							onclick={openCreateModal}
							class="inline-block cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
						>
							Create Class
						</button>
					</div>
				{:else}
					<div class="space-y-3">
						{#each teacherClasses as cls (cls.id)}
							<a
								href={resolve(`/classes/${cls.id}`)}
								class="block rounded-2xl border border-card-stroke bg-card-bg p-4 transition-colors hover:border-emphasis"
							>
								<div class="flex items-start justify-between">
									<div class="min-w-0 flex-1">
										<h2 class="font-semibold text-text-default">{cls.name}</h2>
										<p class="mt-1 text-sm text-text-subtitle">
											Level {cls.level} &middot; {cls.studentCount}
											{cls.studentCount === 1 ? 'student' : 'students'}
											{#if cls.assignmentCount > 0}
												&middot; {cls.assignmentCount}
												{cls.assignmentCount === 1 ? 'assignment' : 'assignments'}
											{/if}
										</p>
										{#if cls.studentCount > 0}
											<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
												{#if cls.avgAccuracy !== null}
													<span
														class="text-xs font-medium {cls.avgAccuracy >= 70
															? 'text-positive-stroke'
															: cls.avgAccuracy >= 50
																? 'text-warning-text'
																: 'text-negative-stroke'}"
													>
														{cls.avgAccuracy}% avg accuracy
													</span>
												{/if}
												{#if cls.studentsBelowThreshold > 0}
													<span class="text-xs font-medium text-negative-stroke">
														{cls.studentsBelowThreshold} below 50%
													</span>
												{/if}
											</div>
										{/if}
									</div>
									<button
										type="button"
										class="ml-3 shrink-0 cursor-pointer rounded-full border border-card-stroke px-2 py-0.5 font-mono text-xs text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											copyClassCode(cls.class_code, cls.id);
										}}
										title="Copy class code"
									>
										{copiedClassId === cls.id ? 'Copied!' : cls.class_code}
									</button>
								</div>
							</a>
						{/each}
					</div>
				{/if}

				{#if archivedClasses.length > 0}
					<div class="mt-6">
						<button
							type="button"
							class="flex w-full cursor-pointer items-center gap-2 text-sm font-medium text-text-subtitle transition-colors hover:text-text-default"
							onclick={() => (archivedExpanded = !archivedExpanded)}
						>
							<span class="inline-block transition-transform {archivedExpanded ? 'rotate-90' : ''}">
								&#9654;
							</span>
							Archived Classes ({archivedClasses.length})
						</button>
						{#if archivedExpanded}
							<div class="mt-3 space-y-3">
								{#each archivedClasses as cls (cls.id)}
									<a
										href={resolve(`/classes/${cls.id}`)}
										class="block rounded-2xl border border-card-stroke bg-card-bg p-4 opacity-70 transition-colors hover:border-emphasis hover:opacity-100"
									>
										<div class="min-w-0 flex-1">
											<h2 class="font-semibold text-text-default">{cls.name}</h2>
											<p class="mt-1 text-sm text-text-subtitle">
												Level {cls.level} &middot; Archived
											</p>
										</div>
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</section>
		{/if}

		{#if isStudent}
			<!-- Student enrolled classes section -->
			<section class="mb-8">
				<h2 class="mb-3 text-lg font-semibold text-text-default">Enrolled Classes</h2>

				{#if singleClass && !isTeacher}
					<!-- Single class without teacher role: show assignments inline -->
					<div class="mb-4">
						<p class="text-sm text-text-subtitle">
							{singleClass.classInfo.name} &middot; Level {singleClass.classInfo.level}
						</p>
					</div>

					{#if studentAssignments.length === 0}
						<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
							<p class="text-sm text-text-subtitle">
								No assignments yet — your teacher will add them soon.
							</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each studentAssignments as assignment (assignment.id)}
								{@const progress = progressMap.get(assignment.id)}
								{@const status = getAssignmentStatus(assignment, progress)}
								{@const attempted = progress?.questionsAttempted ?? 0}
								{@const target = assignment.targetQuestions}
								{@const progressPct = Math.min(100, Math.round((attempted / target) * 100))}
								{@const dueDateColor = getDueDateColor(assignment.dueDate)}

								<div class="rounded-2xl border border-card-stroke bg-card-bg p-4">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2">
												<h3 class="font-semibold text-text-default">{assignment.title}</h3>
												<span
													class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {status ===
													'completed'
														? 'bg-positive-background text-positive-stroke'
														: status === 'in-progress'
															? 'bg-warning-background text-warning-text'
															: 'bg-shaded-background text-text-subtitle'}"
												>
													{getStatusLabel(status)}
												</span>
											</div>
											{#if assignment.description}
												<p class="mt-1 line-clamp-2 text-sm text-text-subtitle">
													{assignment.description}
												</p>
											{/if}
											{#if assignment.dueDate}
												<p
													class="mt-1.5 text-xs font-medium {dueDateColor === 'red'
														? 'text-negative-stroke'
														: dueDateColor === 'yellow'
															? 'text-warning-text'
															: dueDateColor === 'green'
																? 'text-positive-stroke'
																: 'text-text-subtitle'}"
												>
													{formatDueDate(assignment.dueDate)}
												</p>
											{/if}
										</div>
										<a
											href={resolve(`/classes/${singleClass.classId}/assignments/${assignment.id}`)}
											class="shrink-0 rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
										>
											{#if status === 'not-started'}
												Start Practice
											{:else if status === 'in-progress'}
												Continue
											{:else}
												Review
											{/if}
										</a>
									</div>

									<!-- Progress bar -->
									<div class="mt-3">
										<div class="mb-1 flex items-center justify-between text-xs text-text-subtitle">
											<span>{Math.min(attempted, target)} / {target} questions</span>
											<span>{progressPct}%</span>
										</div>
										<div class="h-2 w-full overflow-hidden rounded-full bg-shaded-background">
											<div
												class="h-full rounded-full bg-positive-stroke transition-all"
												style="width: {progressPct}%"
											></div>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<!-- Multiple enrolled classes, or also a teacher -->
					<div class="space-y-3">
						{#each studentClasses as enrollment (enrollment.classId)}
							{@const summary = classSummaries.find((s) => s.classId === enrollment.classId)}
							<a
								href={resolve(`/classes/${enrollment.classInfo.id}`)}
								class="block rounded-2xl border border-card-stroke bg-card-bg p-4 transition-colors hover:border-emphasis"
							>
								<div class="flex items-start justify-between">
									<div>
										<h3 class="font-semibold text-text-default">
											{enrollment.classInfo.name}
										</h3>
										<p class="mt-1 text-sm text-text-subtitle">
											Level {enrollment.classInfo.level} &middot; Joined {new Date(
												enrollment.joinedAt
											).toLocaleDateString()}
										</p>
									</div>
									{#if summary && (summary.pendingCount > 0 || summary.overdueCount > 0)}
										<div class="flex shrink-0 items-center gap-2">
											{#if summary.overdueCount > 0}
												<span
													class="rounded-full bg-negative-background px-2 py-0.5 text-xs font-medium text-negative-stroke"
												>
													{summary.overdueCount} overdue
												</span>
											{/if}
											{#if summary.pendingCount > 0}
												<span
													class="rounded-full bg-warning-background px-2 py-0.5 text-xs font-medium text-warning-text"
												>
													{summary.pendingCount} pending
												</span>
											{/if}
										</div>
									{/if}
								</div>
								{#if summary?.nextDueDate}
									<p class="mt-1.5 text-xs text-text-subtitle">
										Next due: {formatDueDate(summary.nextDueDate)}
									</p>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{/if}

		{#if !isTeacher && !isStudent}
			<!-- No classes at all: onboarding view -->
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
				<p class="mb-4 text-sm text-text-subtitle">
					Get started by joining a class with a code from your teacher, or create your own.
				</p>
				<div class="flex items-center justify-center gap-3">
					<button
						type="button"
						onclick={openJoinModal}
						class="cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
					>
						Join a Class
					</button>
					<button
						type="button"
						onclick={openCreateModal}
						class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						Create Class
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Join class modal -->
{#if showJoinModal}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
		role="presentation"
		onclick={closeJoinModal}
		onkeydown={(e) => handleModalKeydown(e, closeJoinModal)}
	>
		<div
			class="mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="join-modal-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 id="join-modal-title" class="mb-2 text-lg font-semibold text-text-default">
				Join a Class
			</h2>
			<p class="mb-4 text-sm text-text-subtitle">
				Enter the 6-character class code provided by your teacher.
			</p>

			{#if joinError}
				<div
					class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-2 text-sm text-negative-stroke"
				>
					{joinError}
				</div>
			{/if}

			<form
				method="POST"
				action={resolve('/classes/join')}
				use:enhance={() => {
					joiningClass = true;
					joinError = null;
					return async ({ result, update }) => {
						joiningClass = false;
						if (result.type === 'failure') {
							const data: unknown = result.data;
							if (isRecord(data) && typeof data.message === 'string') {
								joinError = data.message;
							} else {
								joinError = 'Something went wrong.';
							}
						} else if (result.type === 'redirect') {
							showJoinModal = false;
							await update();
						} else {
							await update();
						}
					};
				}}
			>
				<div class="mb-4">
					<label for="join_code" class="mb-1 block text-sm font-medium text-text-default">
						Class Code
					</label>
					<input
						type="text"
						id="join_code"
						name="code"
						bind:value={joinCode}
						required
						maxlength={6}
						minlength={6}
						placeholder="e.g. ABC123"
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 font-mono text-sm uppercase tracking-widest text-text-default placeholder:tracking-normal placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					/>
				</div>
				<div class="flex items-center justify-end gap-2">
					<button
						type="button"
						onclick={closeJoinModal}
						class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={joiningClass}
						class="cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{joiningClass ? 'Joining...' : 'Join Class'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Create class modal -->
{#if showCreateModal}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
		role="presentation"
		onclick={closeCreateModal}
		onkeydown={(e) => handleModalKeydown(e, closeCreateModal)}
	>
		<div
			class="mx-4 w-full max-w-md rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="create-modal-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 id="create-modal-title" class="mb-4 text-lg font-semibold text-text-default">
				Create a New Class
			</h2>

			{#if createError}
				<div
					class="mb-4 rounded-xl border border-negative-stroke/30 bg-negative-background px-4 py-2 text-sm text-negative-stroke"
				>
					{createError}
				</div>
			{/if}

			<form
				method="POST"
				action={resolve('/classes/new')}
				use:enhance={() => {
					creatingClass = true;
					createError = null;
					return async ({ result, update }) => {
						creatingClass = false;
						if (result.type === 'failure') {
							const data: unknown = result.data;
							if (isRecord(data) && typeof data.message === 'string') {
								createError = data.message;
							} else {
								createError = 'Something went wrong.';
							}
						} else if (result.type === 'redirect') {
							showCreateModal = false;
							await update();
						} else {
							await update();
						}
					};
				}}
			>
				<div class="mb-4">
					<label for="create_name" class="mb-1 block text-sm font-medium text-text-default">
						Class Name
					</label>
					<input
						type="text"
						id="create_name"
						name="name"
						bind:value={createName}
						required
						maxlength={100}
						placeholder="e.g. Czech A1 - Monday Group"
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					/>
				</div>

				<div class="mb-4">
					<label for="create_description" class="mb-1 block text-sm font-medium text-text-default">
						Description <span class="font-normal text-text-subtitle">(optional)</span>
					</label>
					<textarea
						id="create_description"
						name="description"
						bind:value={createDescription}
						maxlength={500}
						rows={2}
						placeholder="e.g., Monday/Wednesday 10:00, Room 204"
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					></textarea>
				</div>

				<div class="mb-6">
					<label
						for="create_level"
						class="mb-1 flex items-center gap-1 text-sm font-medium text-text-default"
					>
						Level
						<span
							class="group relative inline-flex cursor-help items-center text-text-subtitle"
							tabindex="0"
							role="button"
							aria-label="Why we ask for level"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="currentColor"
								class="size-4"
								aria-hidden="true"
							>
								<path
									fill-rule="evenodd"
									d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
									clip-rule="evenodd"
								/>
							</svg>
							<span
								role="tooltip"
								class="pointer-events-none absolute left-1/2 top-full z-10 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs font-normal text-text-default opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
							>
								This will help us suggest assignments and vocabulary tailored to your students'
								Czech proficiency.
							</span>
						</span>
					</label>
					<select
						id="create_level"
						name="level"
						bind:value={createLevel}
						class="w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default focus:border-emphasis focus:outline-none"
					>
						<option value="A1">A1 - Beginner</option>
						<option value="A2">A2 - Elementary</option>
						<option value="B1">B1 - Intermediate</option>
						<option value="B2">B2 - Upper Intermediate</option>
					</select>
				</div>

				<div class="flex items-center justify-end gap-2">
					<button
						type="button"
						onclick={closeCreateModal}
						class="cursor-pointer rounded-xl border border-card-stroke px-4 py-2 text-sm font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={creatingClass}
						class="cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{creatingClass ? 'Creating...' : 'Create Class'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Welcome modal after joining a class -->
{#if showWelcomeModal && joinedClassName}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
		<div
			class="mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
		>
			<div class="mb-4 text-center">
				<div
					class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-positive-background"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="currentColor"
						class="size-7 text-positive-stroke"
					>
						<path
							fill-rule="evenodd"
							d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.497 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.306 4.491 4.491 0 0 1-1.307-3.498A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-text-default">
					Welcome to {joinedClassName}!
				</h2>
				<p class="mt-2 text-sm text-text-subtitle">
					You've successfully joined the class. Your teacher will assign exercises for you to
					practice — check back here to see new assignments.
				</p>
			</div>

			{#if needsDisplayName}
				<form
					method="POST"
					action="?/saveName"
					use:enhance={() => {
						savingName = true;
						nameError = null;
						return async ({ result, update }) => {
							savingName = false;
							if (result.type === 'success') {
								needsDisplayName = false;
								await update();
							} else if (result.type === 'failure') {
								const data: unknown = result.data;
								if (isRecord(data) && typeof data.message === 'string') {
									nameError = data.message;
								} else {
									nameError = 'Something went wrong.';
								}
							}
						};
					}}
					class="mb-4"
				>
					<label for="display_name" class="mb-1 block text-sm font-medium text-text-default">
						What should your teacher call you?
					</label>
					<input
						type="text"
						id="display_name"
						name="display_name"
						bind:value={displayNameInput}
						required
						maxlength={50}
						placeholder="Your name"
						class="mb-2 w-full rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
					/>
					{#if nameError}
						<p class="mb-2 text-xs text-negative-stroke">{nameError}</p>
					{/if}
					<button
						type="submit"
						disabled={savingName || displayNameInput.trim().length === 0}
						class="w-full cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{savingName ? 'Saving...' : 'Save Name'}
					</button>
				</form>
			{:else}
				<button
					type="button"
					onclick={dismissWelcomeModal}
					class="w-full cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
				>
					Got it!
				</button>
			{/if}
		</div>
	</div>
{/if}
