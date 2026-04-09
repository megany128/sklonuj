<script lang="ts">
	import GraduationCap from '@lucide/svelte/icons/graduation-cap';
	import Info from '@lucide/svelte/icons/info';
	import BadgeCheck from '@lucide/svelte/icons/badge-check';
	import { resolve } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
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

	interface ClassSummary {
		classId: string;
		pendingCount: number;
		overdueCount: number;
		nextDueDate: string | null;
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

	function isClassSummaryArray(v: unknown): v is ClassSummary[] {
		if (!Array.isArray(v)) return false;
		return v.every(
			(item) =>
				isRecord(item) && typeof item.classId === 'string' && typeof item.pendingCount === 'number'
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

	let classSummaries = $derived.by(() => {
		const val: unknown = page.data.studentClassSummaries;
		return isClassSummaryArray(val) ? val : [];
	});

	let isTeacher = $derived(teacherClasses.length > 0 || archivedClasses.length > 0);
	let isStudent = $derived(studentClasses.length > 0);

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

	function formatDueDate(dueDate: string): string {
		const date = new Date(dueDate);
		const diffDays = calendarDayDiff(dueDate);
		const timeSuffix = formatTimeSuffix(date);
		if (diffDays < 0) {
			const abs = Math.abs(diffDays);
			return `Overdue by ${abs} day${abs === 1 ? '' : 's'}`;
		}
		if (diffDays === 0) return `Today${timeSuffix}`;
		if (diffDays === 1) return `Tomorrow${timeSuffix}`;
		if (diffDays <= 6) return `In ${diffDays} days`;
		return date.toLocaleDateString('en-US', {
			timeZone: 'UTC',
			month: 'short',
			day: 'numeric'
		});
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
			<GraduationCap class="mx-auto mb-3 size-10 text-text-subtitle" aria-hidden="true" />
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
												{summary.pendingCount} due
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
							<Info class="size-4" aria-hidden="true" />
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
					<BadgeCheck class="size-7 text-positive-stroke" aria-hidden="true" />
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
