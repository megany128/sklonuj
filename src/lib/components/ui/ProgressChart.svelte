<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import type { Case } from '$lib/types';
	import { CASE_LABELS } from '$lib/types';

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

	interface StudentInfo {
		id: string;
		name: string;
	}

	interface Props {
		snapshots: ProgressSnapshot[];
		students: StudentInfo[];
		mode: 'teacher' | 'student';
	}

	const { snapshots, students, mode }: Props = $props();

	const ALL_CASES: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

	const CASE_COLORS: Record<Case, string> = {
		nom: 'var(--color-case-nom)',
		gen: 'var(--color-case-gen)',
		dat: 'var(--color-case-dat)',
		acc: 'var(--color-case-acc)',
		voc: 'var(--color-case-voc)',
		loc: 'var(--color-case-loc)',
		ins: 'var(--color-case-ins)'
	};

	// Generate distinct colors for students
	const STUDENT_COLORS = [
		'#5d8cdc',
		'#e89a02',
		'#14b160',
		'#a777e0',
		'#da5e5e',
		'#e34994',
		'#8f7e86',
		'#2dd4bf',
		'#f97316',
		'#6366f1'
	];

	type ViewMode = 'overall' | 'per-case';
	let viewMode = $state<ViewMode>('overall');
	let selectedCase = $state<Case>('nom');
	let disabledStudentIds = new SvelteSet<string>();
	let enabledStudentIds = $derived(
		new SvelteSet(students.filter((s) => !disabledStudentIds.has(s.id)).map((s) => s.id))
	);
	let hoveredPoint = $state<{
		x: number;
		y: number;
		date: string;
		label: string;
		value: number;
	} | null>(null);

	// Chart dimensions
	const CHART_WIDTH = 700;
	const CHART_HEIGHT = 300;
	const PADDING_LEFT = 48;
	const PADDING_RIGHT = 16;
	const PADDING_TOP = 16;
	const PADDING_BOTTOM = 40;
	const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
	const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

	function toggleStudent(id: string) {
		if (disabledStudentIds.has(id)) {
			disabledStudentIds.delete(id);
		} else {
			disabledStudentIds.add(id);
		}
	}

	function toggleAllStudents() {
		if (enabledStudentIds.size === students.length) {
			// Disable all
			for (const s of students) {
				disabledStudentIds.add(s.id);
			}
		} else {
			// Enable all
			disabledStudentIds.clear();
		}
	}

	// Get unique sorted dates from snapshots
	let dates = $derived.by(() => {
		const dateSet = new SvelteSet<string>();
		for (const s of snapshots) {
			dateSet.add(s.snapshotDate);
		}
		return [...dateSet].sort();
	});

	// Group snapshots by date
	let snapshotsByDate = $derived.by(() => {
		const map = new SvelteMap<string, ProgressSnapshot[]>();
		for (const s of snapshots) {
			let list = map.get(s.snapshotDate);
			if (!list) {
				list = [];
				map.set(s.snapshotDate, list);
			}
			list.push(s);
		}
		return map;
	});

	// Get case accuracy from a snapshot
	function getCaseAccuracy(snapshot: ProgressSnapshot, caseKey: Case): number | null {
		switch (caseKey) {
			case 'nom':
				return snapshot.nomAccuracy;
			case 'gen':
				return snapshot.genAccuracy;
			case 'dat':
				return snapshot.datAccuracy;
			case 'acc':
				return snapshot.accAccuracy;
			case 'voc':
				return snapshot.vocAccuracy;
			case 'loc':
				return snapshot.locAccuracy;
			case 'ins':
				return snapshot.insAccuracy;
		}
	}

	interface ChartLine {
		label: string;
		color: string;
		points: { date: string; value: number }[];
	}

	// Build chart lines based on view mode
	let chartLines = $derived.by((): ChartLine[] => {
		if (mode === 'teacher' && viewMode === 'overall') {
			// Show class average + individual student lines
			const lines: ChartLine[] = [];

			// Class average line
			const avgPoints: { date: string; value: number }[] = [];
			for (const date of dates) {
				const daySnapshots = snapshotsByDate.get(date) ?? [];
				const enabledSnapshots = daySnapshots.filter(
					(s) => enabledStudentIds.has(s.studentId) && s.overallAccuracy !== null
				);
				if (enabledSnapshots.length > 0) {
					const avg =
						enabledSnapshots.reduce((sum, s) => sum + (s.overallAccuracy ?? 0), 0) /
						enabledSnapshots.length;
					avgPoints.push({ date, value: avg });
				}
			}
			if (avgPoints.length > 0) {
				lines.push({ label: 'Class Average', color: 'var(--color-emphasis)', points: avgPoints });
			}

			// Individual student lines
			for (const student of students) {
				if (!enabledStudentIds.has(student.id)) continue;
				const studentSnapshots = snapshots.filter(
					(s) => s.studentId === student.id && s.overallAccuracy !== null
				);
				if (studentSnapshots.length === 0) continue;

				const colorIndex = students.indexOf(student) % STUDENT_COLORS.length;
				lines.push({
					label: student.name,
					color: STUDENT_COLORS[colorIndex],
					points: studentSnapshots.map((s) => ({
						date: s.snapshotDate,
						value: s.overallAccuracy ?? 0
					}))
				});
			}

			return lines;
		}

		if (mode === 'teacher' && viewMode === 'per-case') {
			// Show class average per-case accuracy for the selected case
			const points: { date: string; value: number }[] = [];
			for (const date of dates) {
				const daySnapshots = snapshotsByDate.get(date) ?? [];
				const enabledSnapshots = daySnapshots.filter((s) => {
					if (!enabledStudentIds.has(s.studentId)) return false;
					return getCaseAccuracy(s, selectedCase) !== null;
				});
				if (enabledSnapshots.length > 0) {
					const avg =
						enabledSnapshots.reduce((sum, s) => sum + (getCaseAccuracy(s, selectedCase) ?? 0), 0) /
						enabledSnapshots.length;
					points.push({ date, value: avg });
				}
			}

			const lines: ChartLine[] = [];
			if (points.length > 0) {
				lines.push({
					label: `${CASE_LABELS[selectedCase]} (avg)`,
					color: CASE_COLORS[selectedCase],
					points
				});
			}
			return lines;
		}

		if (mode === 'student' && viewMode === 'overall') {
			// Single student overall accuracy
			const studentSnapshots = snapshots.filter((s) => s.overallAccuracy !== null);
			if (studentSnapshots.length === 0) return [];
			return [
				{
					label: 'Your Accuracy',
					color: 'var(--color-emphasis)',
					points: studentSnapshots.map((s) => ({
						date: s.snapshotDate,
						value: s.overallAccuracy ?? 0
					}))
				}
			];
		}

		if (mode === 'student' && viewMode === 'per-case') {
			// Show all 7 cases for the student
			const lines: ChartLine[] = [];
			for (const caseKey of ALL_CASES) {
				const caseSnapshots = snapshots.filter((s) => getCaseAccuracy(s, caseKey) !== null);
				if (caseSnapshots.length === 0) continue;
				lines.push({
					label: CASE_LABELS[caseKey],
					color: CASE_COLORS[caseKey],
					points: caseSnapshots.map((s) => ({
						date: s.snapshotDate,
						value: getCaseAccuracy(s, caseKey) ?? 0
					}))
				});
			}
			return lines;
		}

		return [];
	});

	// Scale functions
	function xScale(date: string): number {
		if (dates.length <= 1) return PADDING_LEFT + PLOT_WIDTH / 2;
		const idx = dates.indexOf(date);
		return PADDING_LEFT + (idx / (dates.length - 1)) * PLOT_WIDTH;
	}

	function yScale(value: number): number {
		return PADDING_TOP + PLOT_HEIGHT - (value / 100) * PLOT_HEIGHT;
	}

	// Build SVG path for a line
	function linePath(points: { date: string; value: number }[]): string {
		if (points.length === 0) return '';
		const parts = points.map((p, i) => {
			const x = xScale(p.date);
			const y = yScale(p.value);
			return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
		});
		return parts.join(' ');
	}

	// Y-axis ticks
	const yTicks = [0, 25, 50, 75, 100];

	// X-axis labels (show at most 7 dates)
	let xLabels = $derived.by(() => {
		if (dates.length <= 7) return dates;
		const step = Math.ceil(dates.length / 7);
		return dates.filter((_, i) => i % step === 0 || i === dates.length - 1);
	});

	function formatDateLabel(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	let hasData = $derived(dates.length > 0 && chartLines.some((l) => l.points.length > 0));

	function handlePointHover(event: MouseEvent, date: string, label: string, value: number): void {
		const target = event.currentTarget;
		if (target instanceof SVGElement) {
			const svg = target.closest('svg');
			if (svg) {
				const rect = svg.getBoundingClientRect();
				hoveredPoint = {
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
					date,
					label,
					value
				};
			}
		}
	}

	function clearHover(): void {
		hoveredPoint = null;
	}
</script>

<div class="rounded-2xl border border-card-stroke bg-card-bg p-6">
	<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<h2 class="text-lg font-semibold text-text-default">Progress Over Time</h2>
		<div class="flex flex-wrap gap-1">
			<button
				type="button"
				onclick={() => (viewMode = 'overall')}
				class="rounded-full px-3 py-1 text-xs font-medium transition-colors {viewMode === 'overall'
					? 'bg-emphasis text-text-inverted'
					: 'bg-shaded-background text-text-subtitle hover:text-text-default'}"
			>
				Overall
			</button>
			<button
				type="button"
				onclick={() => (viewMode = 'per-case')}
				class="rounded-full px-3 py-1 text-xs font-medium transition-colors {viewMode === 'per-case'
					? 'bg-emphasis text-text-inverted'
					: 'bg-shaded-background text-text-subtitle hover:text-text-default'}"
			>
				Per Case
			</button>
		</div>
	</div>

	{#if viewMode === 'per-case' && mode === 'teacher'}
		<div class="mb-3 flex flex-wrap gap-1">
			{#each ALL_CASES as c (c)}
				<button
					type="button"
					onclick={() => (selectedCase = c)}
					class="rounded-full px-3 py-1 text-xs font-medium transition-colors {selectedCase === c
						? 'text-on-accent'
						: 'bg-shaded-background text-text-subtitle hover:text-text-default'}"
					style={selectedCase === c ? `background-color: ${CASE_COLORS[c]}` : ''}
				>
					{CASE_LABELS[c]}
				</button>
			{/each}
		</div>
	{/if}

	{#if mode === 'teacher' && students.length > 1}
		<div class="mb-3">
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={toggleAllStudents}
					class="text-xs font-medium text-text-subtitle hover:text-text-default"
				>
					{enabledStudentIds.size === students.length ? 'Deselect All' : 'Select All'}
				</button>
				{#each students as student, i (student.id)}
					<button
						type="button"
						onclick={() => toggleStudent(student.id)}
						class="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-opacity {enabledStudentIds.has(
							student.id
						)
							? 'opacity-100'
							: 'opacity-40'}"
					>
						<span
							class="inline-block h-2 w-2 rounded-full"
							style="background-color: {STUDENT_COLORS[i % STUDENT_COLORS.length]}"
						></span>
						{student.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if !hasData}
		<div class="py-12 text-center text-sm text-text-subtitle">
			No progress data available yet. Snapshots are recorded daily.
		</div>
	{:else}
		<div class="relative w-full overflow-x-auto">
			<svg
				viewBox="0 0 {CHART_WIDTH} {CHART_HEIGHT}"
				class="w-full"
				style="min-width: 400px"
				role="img"
				aria-label="Progress over time chart"
			>
				<!-- Grid lines and Y-axis labels -->
				{#each yTicks as tick (tick)}
					<line
						x1={PADDING_LEFT}
						y1={yScale(tick)}
						x2={CHART_WIDTH - PADDING_RIGHT}
						y2={yScale(tick)}
						stroke="var(--color-card-stroke)"
						stroke-width="1"
						stroke-dasharray={tick === 0 ? 'none' : '4 2'}
					/>
					<text
						x={PADDING_LEFT - 8}
						y={yScale(tick) + 4}
						text-anchor="end"
						fill="var(--color-text-subtitle)"
						font-size="11"
					>
						{tick}%
					</text>
				{/each}

				<!-- X-axis labels -->
				{#each xLabels as dateStr (dateStr)}
					<text
						x={xScale(dateStr)}
						y={CHART_HEIGHT - 8}
						text-anchor="middle"
						fill="var(--color-text-subtitle)"
						font-size="10"
					>
						{formatDateLabel(dateStr)}
					</text>
				{/each}

				<!-- Chart lines -->
				{#each chartLines as line (line.label)}
					{#if line.points.length > 1}
						<path
							d={linePath(line.points)}
							fill="none"
							stroke={line.color}
							stroke-width={line.label === 'Class Average' ? 2.5 : 1.5}
							stroke-linecap="round"
							stroke-linejoin="round"
							opacity={line.label === 'Class Average' ? 1 : 0.7}
						/>
					{/if}
					{#each line.points as point (point.date)}
						<circle
							cx={xScale(point.date)}
							cy={yScale(point.value)}
							r={line.label === 'Class Average' ? 4 : 3}
							fill={line.color}
							stroke="var(--color-card-bg)"
							stroke-width="1.5"
							opacity={line.label === 'Class Average' ? 1 : 0.8}
							role="img"
							aria-label="{line.label}: {Math.round(point.value)}% on {point.date}"
							onmouseenter={(e) => handlePointHover(e, point.date, line.label, point.value)}
							onmouseleave={clearHover}
						/>
					{/each}
				{/each}
			</svg>

			<!-- Tooltip -->
			{#if hoveredPoint}
				<div
					class="pointer-events-none absolute z-10 rounded-lg border border-card-stroke bg-card-bg px-3 py-2 text-xs shadow-md"
					style="left: {Math.min(hoveredPoint.x + 12, CHART_WIDTH - 120)}px; top: {hoveredPoint.y -
						40}px"
				>
					<p class="font-medium text-text-default">{hoveredPoint.label}</p>
					<p class="text-text-subtitle">
						{formatDateLabel(hoveredPoint.date)}: {Math.round(hoveredPoint.value)}%
					</p>
				</div>
			{/if}
		</div>

		{#if viewMode === 'per-case' && mode === 'student'}
			<div class="mt-3 flex flex-wrap justify-center gap-3">
				{#each ALL_CASES as c (c)}
					<div class="flex items-center gap-1 text-xs text-text-subtitle">
						<span
							class="inline-block h-2 w-2 rounded-full"
							style="background-color: {CASE_COLORS[c]}"
						></span>
						{CASE_LABELS[c]}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
