<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import {
		REVIEW_STATUSES,
		REVIEW_FILTER_VALUES,
		TEMPLATE_TYPE_FILTERS,
		REVIEW_STATUS_LABELS,
		REVIEW_STATUS_BADGE,
		type ReviewFilter,
		type ReviewStatus,
		type TemplateRowVm,
		type TemplateType
	} from './types';

	let { data }: { data: PageData } = $props();

	const TYPE_LABELS: Record<(typeof TEMPLATE_TYPE_FILTERS)[number], string> = {
		all: 'All types',
		sentence: 'Sentences',
		adjective: 'Adjectives',
		pronoun: 'Pronouns'
	};

	const REVIEW_FILTER_LABELS: Record<ReviewFilter, string> = {
		all: 'All',
		unreviewed_by_me: 'Unreviewed (me)',
		reviewed_by_me: 'Reviewed (me)',
		flagged_by_anyone: 'Flagged',
		no_candidates: 'No candidates'
	};

	const TYPE_BADGE: Record<TemplateType, string> = {
		sentence: 'bg-brand-100 text-brand-700',
		adjective: 'bg-warning-background text-warning-text',
		pronoun: 'bg-positive-background text-positive-stroke'
	};

	const CASES = ['all', 'nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'] as const;
	const DIFFICULTIES = ['all', 'A1', 'A2', 'B1', 'B2'] as const;

	let pendingId = $state<string | null>(null);

	function buildQuery(
		overrides: Partial<{ type: string; case: string; difficulty: string; review: string }>
	): string {
		const type = overrides.type ?? data.filters.type;
		const case_ = overrides.case ?? data.filters.case;
		const difficulty = overrides.difficulty ?? data.filters.difficulty;
		const review = overrides.review ?? data.filters.review;
		const parts: string[] = [];
		if (type !== 'all') parts.push(`type=${encodeURIComponent(type)}`);
		if (case_ !== 'all') parts.push(`case=${encodeURIComponent(case_)}`);
		if (difficulty !== 'all') parts.push(`difficulty=${encodeURIComponent(difficulty)}`);
		if (review !== 'unreviewed_by_me') parts.push(`review=${encodeURIComponent(review)}`);
		const qs = parts.join('&');
		return qs ? `?${qs}` : '';
	}

	async function navigateWithFilters(
		overrides: Partial<{ type: string; case: string; difficulty: string; review: string }>
	): Promise<void> {
		const url = `${resolve('/admin/audit/templates')}${buildQuery(overrides)}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolve() is called above
		await goto(url);
	}

	async function saveReview(
		row: TemplateRowVm,
		patch: { status: ReviewStatus | null; note?: string | null }
	): Promise<void> {
		const key = rowKey(row);
		pendingId = key;
		try {
			const res = await fetch('/api/admin/template-reviews', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					template_id: row.template.id,
					template_type: row.template.type,
					status: patch.status,
					note: patch.note ?? row.myReview?.note ?? null
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				console.error('Failed to save review:', body);
				alert(`Failed to save: ${body.error ?? res.statusText}`);
				return;
			}
			await invalidateAll();
		} catch (err) {
			console.error('Failed to save review:', err);
			alert('Network error while saving review.');
		} finally {
			pendingId = null;
		}
	}

	function rowKey(row: TemplateRowVm): string {
		return `${row.template.type}:${row.template.id}`;
	}

	function templateMeta(row: TemplateRowVm): string {
		const t = row.template;
		const parts: string[] = [t.requiredCase, t.number, t.difficulty];
		if (t.lemmaCategory) parts.push(t.lemmaCategory);
		if (t.semanticTags && t.semanticTags.length > 0) parts.push(`tags=${t.semanticTags.join(',')}`);
		if (t.requiredGender) parts.push(`gender=${t.requiredGender}`);
		if (t.requiredAnimate !== undefined) parts.push(`animate=${t.requiredAnimate}`);
		if (t.formContext) parts.push(`form=${t.formContext}`);
		if (t.requiredPronoun) parts.push(`pronoun=${t.requiredPronoun}`);
		return parts.join(' · ');
	}

	function noteValue(row: TemplateRowVm): string {
		return row.myReview?.note ?? '';
	}
</script>

<svelte:head>
	<title>Admin · Template review</title>
</svelte:head>

<section class="mb-4 grid gap-3 text-sm md:grid-cols-5">
	<div class="rounded-md border border-card-stroke bg-card-bg p-3">
		<div class="text-xs uppercase text-darker-subtitle">Total</div>
		<div class="text-lg font-semibold">{data.totals.all}</div>
	</div>
	<div class="rounded-md border border-card-stroke bg-card-bg p-3">
		<div class="text-xs uppercase text-darker-subtitle">Shown</div>
		<div class="text-lg font-semibold">{data.totals.shown}</div>
	</div>
	<div class="rounded-md border border-card-stroke bg-card-bg p-3">
		<div class="text-xs uppercase text-darker-subtitle">Unreviewed (me)</div>
		<div class="text-lg font-semibold">{data.totals.unreviewedByMe}</div>
	</div>
	<div class="rounded-md border border-card-stroke bg-card-bg p-3">
		<div class="text-xs uppercase text-darker-subtitle">Flagged</div>
		<div class="text-lg font-semibold">{data.totals.flaggedByAnyone}</div>
	</div>
	<div class="rounded-md border border-card-stroke bg-card-bg p-3">
		<div class="text-xs uppercase text-darker-subtitle">No candidates</div>
		<div class="text-lg font-semibold">{data.totals.noCandidates}</div>
	</div>
</section>

<section class="mb-4 flex flex-wrap items-center gap-2">
	<select
		class="rounded-md border border-card-stroke bg-card-bg px-2 py-1.5 text-sm"
		value={data.filters.type}
		onchange={(e) => navigateWithFilters({ type: e.currentTarget.value })}
	>
		{#each TEMPLATE_TYPE_FILTERS as t (t)}
			<option value={t}>{TYPE_LABELS[t]}</option>
		{/each}
	</select>

	<select
		class="rounded-md border border-card-stroke bg-card-bg px-2 py-1.5 text-sm"
		value={data.filters.case}
		onchange={(e) => navigateWithFilters({ case: e.currentTarget.value })}
	>
		{#each CASES as c (c)}
			<option value={c}>{c === 'all' ? 'All cases' : c}</option>
		{/each}
	</select>

	<select
		class="rounded-md border border-card-stroke bg-card-bg px-2 py-1.5 text-sm"
		value={data.filters.difficulty}
		onchange={(e) => navigateWithFilters({ difficulty: e.currentTarget.value })}
	>
		{#each DIFFICULTIES as d (d)}
			<option value={d}>{d === 'all' ? 'All levels' : d}</option>
		{/each}
	</select>

	<div class="ml-auto flex flex-wrap gap-1">
		{#each REVIEW_FILTER_VALUES as f (f)}
			{@const active = data.filters.review === f}
			<button
				type="button"
				onclick={() => navigateWithFilters({ review: f })}
				class="rounded-full border px-3 py-1 text-xs font-medium transition-colors {active
					? 'border-text-default bg-text-default text-text-inverted'
					: 'border-card-stroke text-darker-subtitle hover:bg-shaded-background'}"
			>
				{REVIEW_FILTER_LABELS[f]}
			</button>
		{/each}
	</div>
</section>

{#if data.rows.length === 0}
	<p class="rounded-md border border-card-stroke bg-card-bg p-6 text-center text-darker-subtitle">
		No templates match the current filters.
	</p>
{:else}
	<div class="space-y-3">
		{#each data.rows as row (rowKey(row))}
			{@const t = row.template}
			{@const pending = pendingId === rowKey(row)}
			<article class="rounded-md border border-card-stroke bg-card-bg p-4">
				<header class="mb-2 flex flex-wrap items-center gap-2">
					<span
						class="inline-block rounded-full px-2 py-0.5 text-xs font-medium {TYPE_BADGE[t.type]}"
					>
						{t.type}
					</span>
					<span class="font-mono text-xs text-darker-subtitle">{t.id}</span>
					{#if row.myReview}
						<span
							class="ml-auto inline-block rounded-full px-2 py-0.5 text-xs font-medium {REVIEW_STATUS_BADGE[
								row.myReview.status
							]}"
						>
							{REVIEW_STATUS_LABELS[row.myReview.status]}
						</span>
					{/if}
					{#if t.candidateCount === 0}
						<span
							class="inline-block rounded-full bg-negative-background px-2 py-0.5 text-xs font-medium text-negative-stroke"
						>
							No matching lemmas
						</span>
					{/if}
				</header>

				<div class="mb-2 text-base">
					<span class="text-darker-subtitle">Template:</span>
					<code
						class="rounded bg-shaded-background px-1.5 py-0.5 font-mono text-sm text-text-default"
					>
						{t.template}
					</code>
				</div>

				<div class="mb-2 text-xs text-darker-subtitle">{templateMeta(row)}</div>

				{#if t.trigger}
					<div class="mb-2 text-xs">
						<span class="text-darker-subtitle">Trigger:</span>
						<code class="font-mono">{t.trigger}</code>
					</div>
				{/if}

				{#if t.examples.length > 0}
					<div class="mb-2">
						<div class="text-xs text-darker-subtitle">
							Examples ({t.candidateCount} total candidates):
						</div>
						<ul class="ml-4 list-disc text-sm">
							{#each t.examples as ex (ex.lemma)}
								<li>
									<span class="text-darker-subtitle">{ex.lemma} →</span>
									"{ex.filled}"
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<details class="mb-3">
					<summary class="cursor-pointer text-xs text-darker-subtitle">Why</summary>
					<p class="mt-1 text-sm">{t.why}</p>
				</details>

				<div class="flex flex-wrap items-start gap-2 border-t border-card-stroke pt-3">
					<div class="flex flex-wrap gap-1">
						{#each REVIEW_STATUSES as status (status)}
							{@const active = row.myReview?.status === status}
							<button
								type="button"
								class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors {active
									? 'border-text-default bg-text-default text-text-inverted'
									: 'border-card-stroke text-darker-subtitle hover:bg-shaded-background'}"
								onclick={() => saveReview(row, { status: active ? null : status })}
								disabled={pending}
							>
								{REVIEW_STATUS_LABELS[status]}
							</button>
						{/each}
					</div>
					<input
						type="text"
						placeholder={row.myReview ? 'Note (optional)…' : 'Set a status first to add a note'}
						value={noteValue(row)}
						disabled={!row.myReview || pending}
						onblur={(e) => {
							if (!row.myReview) return;
							const newNote = e.currentTarget.value.trim();
							const oldNote = row.myReview.note ?? '';
							if (newNote === oldNote) return;
							void saveReview(row, {
								status: row.myReview.status,
								note: newNote === '' ? null : newNote
							});
						}}
						class="flex-1 min-w-[200px] rounded-md border border-card-stroke bg-card-bg px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
					/>
				</div>

				{#if row.otherReviews.length > 0}
					<div class="mt-3 border-t border-card-stroke pt-2 text-xs text-darker-subtitle">
						<div class="mb-1 font-semibold uppercase">Other reviewers</div>
						<ul class="space-y-1">
							{#each row.otherReviews as other (other.reviewerId)}
								<li>
									<span class="font-medium text-text-default">
										{other.reviewerName ?? 'Unknown'}
									</span>
									—
									<span
										class="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium {REVIEW_STATUS_BADGE[
											other.status
										]}"
									>
										{REVIEW_STATUS_LABELS[other.status]}
									</span>
									{#if other.note}<span class="italic"> · "{other.note}"</span>{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</article>
		{/each}
	</div>
{/if}
