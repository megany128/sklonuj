<script lang="ts">
	import { resolve } from '$app/paths';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/stores';
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
	}

	interface StudentClass {
		classId: string;
		joinedAt: string;
		classInfo: ClassRow;
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

	let user = $derived($page.data.user);
	let archivedClasses = $derived.by(() => {
		const val: unknown = $page.data.archivedClasses;
		return isClassRowArray(val) ? val : [];
	});
	let archivedExpanded = $state(false);
	let teacherClasses = $derived.by(() => {
		const val: unknown = $page.data.teacherClasses;
		return isTeacherClassArray(val) ? val : [];
	});
	let studentClasses = $derived.by(() => {
		const val: unknown = $page.data.studentClasses;
		return isStudentClassArray(val) ? val : [];
	});
	let studentAssignments = $derived.by(() => {
		const val: unknown = $page.data.studentAssignments;
		return isAssignmentArray(val) ? val : [];
	});
	let studentProgress = $derived.by(() => {
		const val: unknown = $page.data.studentProgress;
		return isProgressArray(val) ? val : [];
	});

	let isTeacher = $derived(teacherClasses.length > 0);
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

	// Clipboard feedback
	let copiedClassId = $state<string | null>(null);

	$effect(() => {
		const joined = $page.url.searchParams.get('joined');
		if (joined) {
			joinedClassName = joined;
			showWelcomeModal = true;
			// Clean the URL param without navigation
			const cleanUrl = new URL($page.url);
			cleanUrl.searchParams.delete('joined');
			const cleanPath = cleanUrl.search
				? resolve('/classes') + cleanUrl.search
				: resolve('/classes');
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- cleanPath uses resolve('/classes')
			replaceState(cleanPath, {});
		}
	});

	function dismissWelcomeModal() {
		showWelcomeModal = false;
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

	function getDueDateColor(dueDate: string | null): 'green' | 'yellow' | 'red' | 'none' {
		if (!dueDate) return 'none';
		const now = new Date();
		const due = new Date(dueDate);
		const diffMs = due.getTime() - now.getTime();
		const diffDays = diffMs / (1000 * 60 * 60 * 24);
		if (diffDays < 0) return 'red';
		if (diffDays <= 2) return 'yellow';
		return 'green';
	}

	function formatDueDate(dueDate: string): string {
		const due = new Date(dueDate);
		const now = new Date();
		const diffMs = due.getTime() - now.getTime();
		const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
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

<NavBar user={$page.data.user} />

<div class="mx-auto max-w-3xl px-4 py-8">
	{#if !user}
		<!-- Signed-out view -->
		<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
			<h1 class="mb-2 text-xl font-semibold text-text-default">Classes</h1>
			<p class="mb-4 text-sm text-text-subtitle">
				Sign in to create or join classes for structured Czech declension practice.
			</p>
			<a
				href={resolve('/auth')}
				class="inline-block rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted"
			>
				Sign in
			</a>
		</div>
	{:else}
		<!-- Action buttons always visible for logged-in users -->
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-xl font-semibold text-text-default">Classes</h1>
			<div class="flex items-center gap-2">
				<a
					href={resolve('/classes/join')}
					class="rounded-full border border-card-stroke px-3 py-1.5 text-xs font-medium text-text-subtitle transition-colors hover:border-emphasis hover:text-text-default"
				>
					Join Class
				</a>
				<a
					href={resolve('/classes/new')}
					class="rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted"
				>
					Create Class
				</a>
			</div>
		</div>

		{#if isTeacher}
			<!-- Teacher classes section -->
			<section class="mb-8">
				<h2 class="mb-3 text-lg font-semibold text-text-default">Your Classes</h2>

				{#if teacherClasses.length === 0}
					<div class="rounded-2xl border border-card-stroke bg-card-bg p-8 text-center">
						<p class="mb-2 text-sm text-text-subtitle">Create your first class to get started.</p>
						<a
							href={resolve('/classes/new')}
							class="inline-block rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted"
						>
							Create Class
						</a>
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
										</p>
										{#if cls.assignmentCount > 0}
											<p class="mt-1 text-xs text-text-subtitle">
												{cls.assignmentCount}
												{cls.assignmentCount === 1 ? 'assignment' : 'assignments'}
											</p>
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
														? 'bg-green-100 text-green-700'
														: status === 'in-progress'
															? 'bg-yellow-100 text-yellow-700'
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
														? 'text-red-600'
														: dueDateColor === 'yellow'
															? 'text-yellow-600'
															: dueDateColor === 'green'
																? 'text-green-600'
																: 'text-text-subtitle'}"
												>
													{formatDueDate(assignment.dueDate)}
												</p>
											{/if}
										</div>
										<a
											href={resolve(`/classes/${singleClass.classId}/assignments/${assignment.id}`)}
											class="shrink-0 rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted"
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
							<a
								href={resolve(`/classes/${enrollment.classInfo.id}`)}
								class="block rounded-2xl border border-card-stroke bg-card-bg p-4 transition-colors hover:border-emphasis"
							>
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
					Get started by creating a class or joining one with a class code.
				</p>
			</div>
		{/if}
	{/if}
</div>

<!-- Welcome modal after joining a class -->
{#if showWelcomeModal && joinedClassName}
	<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
		<div
			class="mx-4 w-full max-w-sm rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl"
		>
			<div class="mb-4 text-center">
				<div class="mb-3 text-4xl">🎉</div>
				<h2 class="text-lg font-semibold text-text-default">
					Welcome to {joinedClassName}!
				</h2>
				<p class="mt-2 text-sm text-text-subtitle">
					You've successfully joined the class. Your teacher will assign exercises for you to
					practice — check back here to see new assignments.
				</p>
			</div>
			<button
				type="button"
				onclick={dismissWelcomeModal}
				class="w-full cursor-pointer rounded-xl bg-emphasis px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90"
			>
				Got it!
			</button>
		</div>
	</div>
{/if}
