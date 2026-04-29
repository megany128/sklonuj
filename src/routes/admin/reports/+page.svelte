<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { REPORT_STATUSES, type ReportRow, type ReportStatus, type ReportCategory } from './types';

	let { data }: { data: PageData } = $props();

	const STATUS_OPTIONS: ReadonlyArray<{ value: ReportStatus | 'all'; label: string }> = [
		{ value: 'open', label: 'Open' },
		{ value: 'in_progress', label: 'In progress' },
		{ value: 'resolved', label: 'Resolved' },
		{ value: 'dismissed', label: 'Dismissed' },
		{ value: 'all', label: 'All' }
	];

	const CATEGORY_OPTIONS: ReadonlyArray<{ value: ReportCategory | 'all'; label: string }> = [
		{ value: 'all', label: 'All categories' },
		{ value: 'wrong_answer', label: 'Wrong answer' },
		{ value: 'bad_sentence', label: 'Bad sentence' },
		{ value: 'bad_explanation', label: 'Bad explanation' },
		{ value: 'other', label: 'Other' }
	];

	const STATUS_LABELS: Record<ReportStatus, string> = {
		open: 'Open',
		in_progress: 'In progress',
		resolved: 'Resolved',
		dismissed: 'Dismissed'
	};

	const STATUS_BADGE: Record<ReportStatus, string> = {
		open: 'bg-warning-background text-warning-text',
		in_progress: 'bg-brand-100 text-brand-700',
		resolved: 'bg-positive-background text-positive-stroke',
		dismissed: 'bg-shaded-background text-darker-subtitle'
	};

	const CATEGORY_LABEL: Record<ReportCategory, string> = {
		wrong_answer: 'Wrong answer',
		bad_sentence: 'Bad sentence',
		bad_explanation: 'Bad explanation',
		other: 'Other'
	};

	// eslint-disable-next-line svelte/prefer-writable-derived -- $derived.writable not available in this Svelte version
	let lemmaInput: string = $state('');
	let expandedId = $state<string | null>(null);
	let pendingId = $state<string | null>(null);

	// Sync the input from URL state on mount + whenever the URL-driven filter
	// changes (e.g. after Apply or clear).
	$effect(() => {
		lemmaInput = data.filters.lemma;
	});

	function toggleExpand(id: string): void {
		expandedId = expandedId === id ? null : id;
	}

	function buildQuery(overrides: Partial<Record<'status' | 'category' | 'lemma', string>>): string {
		const status = overrides.status ?? data.filters.status;
		const category = overrides.category ?? data.filters.category;
		const lemma = overrides.lemma ?? data.filters.lemma;
		const parts: string[] = [];
		if (status !== 'open') parts.push(`status=${encodeURIComponent(status)}`);
		if (category !== 'all') parts.push(`category=${encodeURIComponent(category)}`);
		if (lemma) parts.push(`lemma=${encodeURIComponent(lemma)}`);
		const qs = parts.join('&');
		return qs ? `?${qs}` : '';
	}

	async function navigateWithFilters(
		overrides: Partial<Record<'status' | 'category' | 'lemma', string>>,
		options: { keepFocus?: boolean } = {}
	): Promise<void> {
		const url = `${resolve('/admin/reports')}${buildQuery(overrides)}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() is called above
		await goto(url, options);
	}

	async function applyLemmaFilter(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await navigateWithFilters({ lemma: lemmaInput.trim() }, { keepFocus: true });
	}

	async function updateReport(
		id: string,
		patch: { status?: ReportStatus; admin_note?: string }
	): Promise<void> {
		pendingId = id;
		try {
			const res = await fetch(`/api/admin/reports/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				console.error('Failed to update report:', body);
				alert(`Failed to update report: ${body.error ?? res.statusText}`);
				return;
			}
			await invalidateAll();
		} catch (err) {
			console.error('Failed to update report:', err);
			alert('Network error while updating report.');
		} finally {
			pendingId = null;
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString();
	}

	function truncate(value: string | null, max: number): string {
		if (!value) return '—';
		return value.length > max ? value.slice(0, max) + '…' : value;
	}

	function reportContextString(report: ReportRow): string {
		try {
			return JSON.stringify(report.context, null, 2);
		} catch {
			return String(report.context);
		}
	}

	let summary = $derived(data.summary);
</script>

<svelte:head>
	<title>Admin · Reports</title>
</svelte:head>

<section class="mb-6 flex flex-wrap items-center gap-3">
	{#each STATUS_OPTIONS as opt (opt.value)}
		{@const active = data.filters.status === opt.value}
		{@const count = opt.value === 'all' ? summary.total : (summary.byStatus[opt.value] ?? 0)}
		<button
			type="button"
			onclick={() => navigateWithFilters({ status: opt.value })}
			class="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors {active
				? 'border-text-default bg-text-default text-text-inverted'
				: 'border-card-stroke text-darker-subtitle hover:bg-shaded-background'}"
		>
			{opt.label} <span class="opacity-70">({count})</span>
		</button>
	{/each}
</section>

<section class="mb-4 flex flex-wrap items-center gap-3">
	<select
		class="rounded-md border border-card-stroke bg-card-bg px-2 py-1.5 text-sm"
		value={data.filters.category}
		onchange={(e) => navigateWithFilters({ category: e.currentTarget.value })}
	>
		{#each CATEGORY_OPTIONS as opt (opt.value)}
			<option value={opt.value}>{opt.label}</option>
		{/each}
	</select>

	<form class="flex items-center gap-2" onsubmit={applyLemmaFilter}>
		<input
			type="text"
			bind:value={lemmaInput}
			placeholder="Filter by lemma…"
			class="rounded-md border border-card-stroke bg-card-bg px-2 py-1.5 text-sm"
		/>
		<button
			type="submit"
			class="rounded-md bg-text-default px-3 py-1.5 text-sm font-medium text-text-inverted"
		>
			Apply
		</button>
		{#if data.filters.lemma}
			<button
				type="button"
				class="text-sm text-darker-subtitle underline"
				onclick={() => {
					lemmaInput = '';
					void navigateWithFilters({ lemma: '' });
				}}
			>
				clear
			</button>
		{/if}
	</form>
</section>

{#if data.reports.length === 0}
	<p class="rounded-md border border-card-stroke bg-card-bg p-6 text-center text-darker-subtitle">
		No reports match the current filters.
	</p>
{:else}
	<div class="overflow-hidden rounded-md border border-card-stroke bg-card-bg">
		<table class="w-full text-sm">
			<thead class="bg-shaded-background text-left text-xs uppercase text-darker-subtitle">
				<tr>
					<th class="px-3 py-2">Created</th>
					<th class="px-3 py-2">Status</th>
					<th class="px-3 py-2">Category</th>
					<th class="px-3 py-2">Lemma · case · num</th>
					<th class="px-3 py-2">Sentence / expected → user</th>
					<th class="px-3 py-2"></th>
				</tr>
			</thead>
			<tbody>
				{#each data.reports as report (report.id)}
					{@const expanded = expandedId === report.id}
					{@const pending = pendingId === report.id}
					<tr class="border-t border-card-stroke align-top">
						<td class="whitespace-nowrap px-3 py-3 text-xs text-darker-subtitle">
							{formatDate(report.created_at)}
						</td>
						<td class="px-3 py-3">
							<span
								class="inline-block rounded-full px-2 py-0.5 text-xs font-medium {STATUS_BADGE[
									report.status
								]}"
							>
								{STATUS_LABELS[report.status]}
							</span>
						</td>
						<td class="px-3 py-3 text-xs">{CATEGORY_LABEL[report.category]}</td>
						<td class="px-3 py-3">
							<div class="font-medium">{report.lemma ?? '—'}</div>
							<div class="text-xs text-darker-subtitle">
								{[report.case_name, report.number_form, report.drill_type]
									.filter(Boolean)
									.join(' · ') || '—'}
							</div>
						</td>
						<td class="px-3 py-3">
							{#if report.sentence}
								<div class="italic">"{truncate(report.sentence, 80)}"</div>
							{/if}
							<div class="text-xs">
								<span class="text-positive-stroke">{report.expected_answer ?? '—'}</span>
								<span class="text-darker-subtitle"> → </span>
								<span class="text-negative-stroke">{report.user_answer ?? '—'}</span>
							</div>
							{#if report.comment}
								<div class="mt-1 text-xs text-darker-subtitle">
									💬 {truncate(report.comment, 100)}
								</div>
							{/if}
						</td>
						<td class="whitespace-nowrap px-3 py-3 text-right">
							<button
								type="button"
								class="text-xs font-medium text-darker-subtitle hover:text-text-default"
								onclick={() => toggleExpand(report.id)}
							>
								{expanded ? 'Hide' : 'Details'}
							</button>
						</td>
					</tr>
					{#if expanded}
						<tr class="border-t border-card-stroke bg-shaded-background">
							<td colspan="6" class="px-3 py-4">
								<div class="grid gap-4 md:grid-cols-2">
									<div>
										<h3 class="mb-1 text-xs font-semibold uppercase text-darker-subtitle">
											Full report
										</h3>
										<dl class="space-y-1 text-xs">
											<div class="flex gap-2">
												<dt class="w-32 shrink-0 text-darker-subtitle">User ID</dt>
												<dd class="font-mono">{report.user_id ?? '—'}</dd>
											</div>
											<div class="flex gap-2">
												<dt class="w-32 shrink-0 text-darker-subtitle">Page</dt>
												<dd class="break-all">{report.page_url ?? '—'}</dd>
											</div>
											<div class="flex gap-2">
												<dt class="w-32 shrink-0 text-darker-subtitle">Comment</dt>
												<dd class="whitespace-pre-wrap">{report.comment ?? '—'}</dd>
											</div>
											<div class="flex gap-2">
												<dt class="w-32 shrink-0 text-darker-subtitle">Sentence</dt>
												<dd class="whitespace-pre-wrap">{report.sentence ?? '—'}</dd>
											</div>
											<div class="flex gap-2">
												<dt class="w-32 shrink-0 text-darker-subtitle">Explanation</dt>
												<dd class="whitespace-pre-wrap">{report.explanation ?? '—'}</dd>
											</div>
											<div class="flex gap-2">
												<dt class="w-32 shrink-0 text-darker-subtitle">User agent</dt>
												<dd class="break-all">{report.user_agent ?? '—'}</dd>
											</div>
										</dl>
										{#if report.context}
											<details class="mt-3">
												<summary class="cursor-pointer text-xs text-darker-subtitle">
													Context JSON
												</summary>
												<pre
													class="mt-1 overflow-x-auto rounded bg-card-bg p-2 text-xs">{reportContextString(
														report
													)}</pre>
											</details>
										{/if}
									</div>
									<div>
										<h3 class="mb-1 text-xs font-semibold uppercase text-darker-subtitle">
											Triage
										</h3>
										<label class="text-xs">
											<span class="mb-1 block text-darker-subtitle">Admin note</span>
											<textarea
												class="w-full rounded-md border border-card-stroke bg-card-bg p-2 text-sm"
												rows="3"
												value={report.admin_note ?? ''}
												onblur={(e) => {
													const value = e.currentTarget.value.trim();
													if (value !== (report.admin_note ?? '')) {
														void updateReport(report.id, {
															admin_note: value
														});
													}
												}}
												disabled={pending}
											></textarea>
										</label>
										<div class="mt-3 flex flex-wrap gap-2">
											{#each REPORT_STATUSES as status (status)}
												{@const active = report.status === status}
												<button
													type="button"
													class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors {active
														? 'border-text-default bg-text-default text-text-inverted'
														: 'border-card-stroke text-darker-subtitle hover:bg-card-bg'}"
													onclick={() => updateReport(report.id, { status })}
													disabled={pending || active}
												>
													{STATUS_LABELS[status]}
												</button>
											{/each}
										</div>
										{#if report.resolved_at}
											<p class="mt-2 text-xs text-darker-subtitle">
												Last resolved {formatDate(report.resolved_at)}
											</p>
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
{/if}

{#if data.reports.length === 200}
	<p class="mt-3 text-center text-xs text-darker-subtitle">
		Showing the most recent 200 reports — narrow the filters to see older ones.
	</p>
{/if}
