<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import {
		REVIEW_FILTER_VALUES,
		TEMPLATE_TYPE_FILTERS,
		REVIEW_STATUS_LABELS,
		REVIEW_STATUS_BADGE,
		type GroupVm,
		type ReviewFilter,
		type ReviewStatus,
		type TemplateRowVm,
		type TemplateType
	} from './types';

	/**
	 * UI shows two buttons: "OK" and "Flag". The DB schema still allows
	 * `wrong`, but new reviews from this UI only ever write `needs_fix`. Old
	 * `wrong` rows still display correctly (badge keeps its red colour) and
	 * the Flag button highlights as active for either flagged status.
	 */
	const UI_REVIEW_BUTTONS: ReadonlyArray<{ status: 'ok' | 'needs_fix'; label: string }> = [
		{ status: 'ok', label: 'OK' },
		{ status: 'needs_fix', label: 'Flag' }
	];

	function isButtonActive(myStatus: ReviewStatus | undefined, button: 'ok' | 'needs_fix'): boolean {
		if (!myStatus) return false;
		if (button === 'ok') return myStatus === 'ok';
		return myStatus === 'needs_fix' || myStatus === 'wrong';
	}

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
		no_candidates: 'No candidates',
		has_blocked_lemmas: 'Has blocked lemmas'
	};

	const TYPE_BADGE: Record<TemplateType, string> = {
		sentence: 'bg-brand-100 text-brand-700',
		adjective: 'bg-warning-background text-warning-text',
		pronoun: 'bg-positive-background text-positive-stroke'
	};

	const CASES = ['all', 'nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'] as const;
	const DIFFICULTIES = ['all', 'A1', 'A2', 'B1', 'B2'] as const;

	let pendingId = $state<string | null>(null);
	let pendingChipKey = $state<string | null>(null);
	let bulkPendingGroupKey = $state<string | null>(null);
	let pendingSubCategoryKey = $state<string | null>(null);

	function subCategoryKey(row: TemplateRowVm, subCategories: string[]): string {
		return `${rowKey(row)}::sc::${subCategories.join('|') || '__none__'}`;
	}

	function subCategoryLabel(subCategories: string[]): string {
		return subCategories.length === 0 ? 'no sub-tags' : subCategories.join(' + ');
	}

	/**
	 * Label shown on the left of an example row. Sub-tags when the lemma has
	 * narrowing categories, otherwise the matched primary category — so a
	 * lemma like `autorita` (only category is the template's filter `people`)
	 * still surfaces the bucket it landed in instead of an empty cell.
	 */
	function exampleCategoryLabel(row: TemplateRowVm, ex: { subCategories: string[] }): string {
		if (ex.subCategories.length > 0) return ex.subCategories.join(' + ');
		const t = row.template;
		return (
			t.lemmaCategory ??
			t.pronounCategory ??
			(t.adjectiveCategories && t.adjectiveCategories[0]) ??
			'(any)'
		);
	}

	/** Lemmas that share the example's sub-category bucket — for "flag category" actions. */
	function lemmasInSameBucket(row: TemplateRowVm, subCategories: string[]): string[] {
		const key = subCategories.join('|');
		const group = row.template.candidateGroups.find((g) => g.subCategories.join('|') === key);
		return group?.lemmas ?? [];
	}

	function chipKey(row: TemplateRowVm, lemma: string): string {
		return `${rowKey(row)}::${lemma}`;
	}

	function rowKey(row: TemplateRowVm): string {
		return `${row.template.type}:${row.template.id}`;
	}

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

	/**
	 * Compact "shape" pills shown in the card header — case/number/level plus
	 * any structural constraints (gender, animacy, form context, pinned
	 * pronoun). The semantic-category match lives in the group header, so we
	 * deliberately omit `lemmaCategory`/`semanticTags`/etc here to avoid noise.
	 */
	function shapePills(row: TemplateRowVm): string[] {
		const t = row.template;
		const pills: string[] = [t.requiredCase, t.number, t.difficulty];
		if (t.requiredGender) {
			let g = t.requiredGender as string;
			if (t.requiredAnimate === true) g = `${g} anim`;
			else if (t.requiredAnimate === false) g = `${g} inanim`;
			pills.push(g);
		}
		if (t.formContext && t.formContext !== 'either') pills.push(t.formContext);
		if (t.requiredPronoun) pills.push(`pronoun=${t.requiredPronoun}`);
		return pills;
	}

	/**
	 * Verbose category metadata for the disclosure block. Surfaces what the
	 * group key is built from so a reviewer can audit the bucket assignment.
	 */
	function detailMeta(row: TemplateRowVm): string[] {
		const t = row.template;
		const lines: string[] = [];
		if (t.lemmaCategory) lines.push(`lemmaCategory: ${t.lemmaCategory}`);
		if (t.semanticTags?.length) lines.push(`semanticTags: ${t.semanticTags.join(', ')}`);
		if (t.excludesCategories?.length)
			lines.push(`excludesCategories: ${t.excludesCategories.join(', ')}`);
		if (t.pronounCategory) lines.push(`pronounCategory: ${t.pronounCategory}`);
		if (t.adjectiveCategories?.length)
			lines.push(`adjectiveCategories: ${t.adjectiveCategories.join(', ')}`);
		if (t.trigger) lines.push(`trigger: ${t.trigger}`);
		return lines;
	}

	function noteValue(row: TemplateRowVm): string {
		return row.myReview?.note ?? '';
	}

	async function toggleBlock(row: TemplateRowVm, lemma: string): Promise<void> {
		const key = chipKey(row, lemma);
		pendingChipKey = key;
		const isMine = row.myBlockedLemmas.includes(lemma);
		try {
			// DELETE uses query params (safer through HTTP intermediaries that
			// strip request bodies on DELETE); POST keeps the JSON body.
			const url = isMine
				? `/api/admin/template-lemma-blocks?template_id=${encodeURIComponent(row.template.id)}&template_type=${encodeURIComponent(row.template.type)}&lemma=${encodeURIComponent(lemma)}`
				: '/api/admin/template-lemma-blocks';
			const res = await fetch(url, {
				method: isMine ? 'DELETE' : 'POST',
				headers: isMine ? {} : { 'content-type': 'application/json' },
				body: isMine
					? null
					: JSON.stringify({
							template_id: row.template.id,
							template_type: row.template.type,
							lemma
						})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				console.error('Failed to toggle block:', body);
				alert(`Failed to update block: ${body.error ?? res.statusText}`);
				return;
			}
			await invalidateAll();
		} catch (err) {
			console.error('Failed to toggle block:', err);
			alert('Network error while updating block.');
		} finally {
			pendingChipKey = null;
		}
	}

	/**
	 * Block every unblocked-by-me lemma in a sub-category bucket for this
	 * template — the "flag this whole sub-category" action. Existing blocks
	 * (mine or someone else's) are left alone; we only add new ones.
	 */
	async function bulkBlockSubCategory(row: TemplateRowVm, lemmas: string[]): Promise<void> {
		const targets = lemmas.filter((l) => !row.myBlockedLemmas.includes(l));
		if (targets.length === 0) return;
		const ok = confirm(
			`Block ${targets.length} lemma${targets.length === 1 ? '' : 's'} for this template?\n\nLearners will no longer see these lemmas paired with this template once the next bake is deployed.`
		);
		if (!ok) return;
		const key = subCategoryKey(row, []); // group identifier — only one bulk in flight per row anyway
		pendingSubCategoryKey = key;
		try {
			const results = await Promise.all(
				targets.map((lemma) =>
					fetch('/api/admin/template-lemma-blocks', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							template_id: row.template.id,
							template_type: row.template.type,
							lemma
						})
					})
				)
			);
			const failures = results.filter((r) => !r.ok).length;
			if (failures > 0) {
				alert(
					`Bulk block partially failed: ${failures} of ${targets.length} did not save. Reload to see current state.`
				);
			}
			await invalidateAll();
		} catch (err) {
			console.error('Bulk block failed:', err);
			alert('Network error during bulk block.');
		} finally {
			pendingSubCategoryKey = null;
		}
	}

	/**
	 * Mark every unreviewed-by-me template in the group as OK in parallel.
	 * Confirms first since this is bulk and not undoable in a single click
	 * (the per-card status buttons let you flip individual rows back).
	 */
	async function bulkMarkOk(group: GroupVm): Promise<void> {
		const targets = group.templates.filter((r) => !r.myReview);
		if (targets.length === 0) return;
		const ok = confirm(
			`Mark ${targets.length} unreviewed template${targets.length === 1 ? '' : 's'} in "${group.label}" as OK?`
		);
		if (!ok) return;
		bulkPendingGroupKey = group.key;
		try {
			const results = await Promise.all(
				targets.map((row) =>
					fetch('/api/admin/template-reviews', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							template_id: row.template.id,
							template_type: row.template.type,
							status: 'ok',
							note: null
						})
					})
				)
			);
			const failures = results.filter((r) => !r.ok).length;
			if (failures > 0) {
				alert(
					`Bulk OK partially failed: ${failures} of ${targets.length} did not save. Reload to see current state.`
				);
			}
			await invalidateAll();
		} catch (err) {
			console.error('Bulk OK failed:', err);
			alert('Network error during bulk OK.');
		} finally {
			bulkPendingGroupKey = null;
		}
	}

	/**
	 * Group default-open state: expand if there is unreviewed-by-me work or any
	 * flagged template; collapse otherwise so fully-reviewed groups stay out
	 * of the way. The user can still toggle manually — `<details>` keeps that
	 * native behavior.
	 */
	function groupDefaultOpen(group: GroupVm): boolean {
		return group.counts.unreviewedByMe > 0 || group.counts.flagged > 0;
	}
</script>

<svelte:head>
	<title>Admin · Template review</title>
</svelte:head>

{#if data.bakeStatus.pendingAdds > 0 || data.bakeStatus.pendingRemoves > 0}
	<aside
		class="mb-4 rounded-md border border-warning-stroke bg-warning-background px-4 py-3 text-sm text-warning-text"
	>
		<div class="font-semibold">Pending bake — drill engine is out of date.</div>
		<div class="mt-1 text-xs">
			Live blocks: <span class="font-mono">{data.bakeStatus.liveCount}</span> · Baked:
			<span class="font-mono">{data.bakeStatus.bakedCount}</span>
			{#if data.bakeStatus.pendingAdds > 0}· {data.bakeStatus.pendingAdds} pending add(s){/if}{#if data.bakeStatus.pendingRemoves > 0}
				· {data.bakeStatus.pendingRemoves} pending remove(s){/if}. Run
			<code class="rounded bg-card-bg px-1 py-0.5 font-mono">pnpm audit:bake-blocks</code>, commit
			<code class="rounded bg-card-bg px-1 py-0.5 font-mono">src/lib/data/lemma_blocks.json</code>,
			and deploy.
		</div>
	</aside>
{/if}

<section class="mb-4 grid gap-3 text-sm md:grid-cols-3 lg:grid-cols-6">
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
	<div class="rounded-md border border-card-stroke bg-card-bg p-3">
		<div class="text-xs uppercase text-darker-subtitle">With blocked lemmas</div>
		<div class="text-lg font-semibold">{data.totals.withBlockedLemmas}</div>
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

{#if data.groups.length === 0}
	<p class="rounded-md border border-card-stroke bg-card-bg p-6 text-center text-darker-subtitle">
		No templates match the current filters.
	</p>
{:else}
	<div class="space-y-2">
		{#each data.groups as group (group.key)}
			{@const bulkPending = bulkPendingGroupKey === group.key}
			<details
				open={groupDefaultOpen(group)}
				class="rounded-md border border-card-stroke bg-card-bg"
			>
				<summary
					class="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm hover:bg-shaded-background"
				>
					<span
						class="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase {TYPE_BADGE[
							group.type
						]}"
					>
						{group.type}
					</span>
					<span class="text-base font-semibold">{group.label}</span>
					<span class="text-xs text-darker-subtitle">
						{group.counts.total} template{group.counts.total === 1 ? '' : 's'}
					</span>
					{#if group.counts.unreviewedByMe > 0}
						<span
							class="rounded-full bg-warning-background px-2 py-0.5 text-[11px] font-medium text-warning-text"
						>
							{group.counts.unreviewedByMe} unreviewed
						</span>
					{/if}
					{#if group.counts.flagged > 0}
						<span
							class="rounded-full bg-negative-background px-2 py-0.5 text-[11px] font-medium text-negative-stroke"
						>
							{group.counts.flagged} flagged
						</span>
					{/if}
					{#if group.counts.noCandidates > 0}
						<span
							class="rounded-full bg-negative-background px-2 py-0.5 text-[11px] font-medium text-negative-stroke"
						>
							{group.counts.noCandidates} no-match
						</span>
					{/if}
					{#if group.counts.withBlockedLemmas > 0}
						<span
							class="rounded-full bg-shaded-background px-2 py-0.5 text-[11px] font-medium text-darker-subtitle"
						>
							{group.counts.withBlockedLemmas} with blocks
						</span>
					{/if}
					{#if group.counts.unreviewedByMe > 0}
						<button
							type="button"
							class="ml-auto rounded-md border border-positive-stroke bg-positive-background px-2.5 py-1 text-xs font-medium text-positive-stroke transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
							disabled={bulkPending}
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								void bulkMarkOk(group);
							}}
						>
							{bulkPending ? 'Saving…' : `Mark ${group.counts.unreviewedByMe} as OK`}
						</button>
					{/if}
				</summary>

				<div class="space-y-2 border-t border-card-stroke p-3">
					{#each group.templates as row (rowKey(row))}
						{@const t = row.template}
						{@const pending = pendingId === rowKey(row)}
						{@const pills = shapePills(row)}
						{@const meta = detailMeta(row)}
						<article class="rounded-md border border-card-stroke bg-card-bg p-4">
							<header class="mb-2 flex flex-wrap items-center gap-2">
								<span class="font-mono text-[11px] text-darker-subtitle">{t.id}</span>
								{#each pills as p (p)}
									<span
										class="rounded-full bg-shaded-background px-2 py-0.5 text-[11px] font-medium text-darker-subtitle"
									>
										{p}
									</span>
								{/each}
								{#if t.candidates.length === 0}
									<span
										class="rounded-full bg-negative-background px-2 py-0.5 text-[11px] font-medium text-negative-stroke"
									>
										no matching lemmas
									</span>
								{/if}
								{#if row.myReview}
									<span
										class="ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium {REVIEW_STATUS_BADGE[
											row.myReview.status
										]}"
									>
										{REVIEW_STATUS_LABELS[row.myReview.status]}
									</span>
								{:else if row.flagged}
									<span
										class="ml-auto rounded-full bg-negative-background px-2 py-0.5 text-[11px] font-medium text-negative-stroke"
									>
										flagged by other
									</span>
								{/if}
							</header>

							<div
								class="sticky top-14 z-20 -mx-4 mb-2 border-b border-card-stroke/60 bg-card-bg px-4 py-2 sm:top-16"
							>
								<code
									class="block rounded bg-shaded-background px-2 py-1.5 font-mono text-base text-text-default"
								>
									{t.template}
								</code>
							</div>

							{#if t.examples.length > 0}
								<ul class="mb-3 space-y-1.5 text-sm">
									{#each t.examples as ex (ex.lemma)}
										{@const exBucket = lemmasInSameBucket(row, ex.subCategories)}
										{@const exBucketUnblocked = exBucket.filter(
											(l) => !row.myBlockedLemmas.includes(l)
										).length}
										{@const lemmaBlocked = row.myBlockedLemmas.includes(ex.lemma)}
										{@const lemmaPending = pendingChipKey === chipKey(row, ex.lemma)}
										{@const bulkPending = pendingSubCategoryKey === subCategoryKey(row, [])}
										<li class="flex flex-wrap items-center gap-2">
											<span
												class="min-w-[120px] rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700"
												title={ex.subCategories.length === 0
													? 'No narrowing sub-tags — falling back to matched category'
													: 'Sub-categories of this lemma'}
											>
												{exampleCategoryLabel(row, ex)}
											</span>
											<span class="text-text-default"
												>"{ex.before}<strong class="font-semibold">{ex.form}</strong
												>{ex.after}"</span
											>
											<span class="ml-auto flex flex-wrap gap-1">
												<button
													type="button"
													disabled={lemmaPending || bulkPending}
													onclick={() => toggleBlock(row, ex.lemma)}
													title={lemmaBlocked
														? 'You flagged this lemma — click to clear'
														: `Flag lemma "${ex.lemma}" for this template`}
													class="rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 {lemmaBlocked
														? 'border-negative-stroke bg-negative-background text-negative-stroke'
														: 'border-card-stroke text-darker-subtitle hover:bg-shaded-background'}"
												>
													{lemmaBlocked ? '✓ flagged' : `⚑ lemma`}
												</button>
												{#if exBucket.length > 1 && exBucketUnblocked > 0}
													<button
														type="button"
														disabled={bulkPending}
														onclick={() => bulkBlockSubCategory(row, exBucket)}
														title={`Flag every lemma in "${exampleCategoryLabel(row, ex)}" (${exBucket.length} total)`}
														class="rounded-md border border-card-stroke px-2 py-0.5 text-[11px] font-medium text-darker-subtitle transition-colors hover:bg-shaded-background disabled:cursor-not-allowed disabled:opacity-60"
													>
														{bulkPending ? 'Saving…' : `⚑ category (${exBucketUnblocked})`}
													</button>
												{/if}
											</span>
										</li>
									{/each}
								</ul>
							{/if}

							<div class="mb-3 flex flex-wrap items-start gap-2 border-t border-card-stroke pt-3">
								<div class="flex flex-wrap gap-1">
									{#each UI_REVIEW_BUTTONS as btn (btn.status)}
										{@const active = isButtonActive(row.myReview?.status, btn.status)}
										<button
											type="button"
											class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors {active
												? 'border-text-default bg-text-default text-text-inverted'
												: 'border-card-stroke text-darker-subtitle hover:bg-shaded-background'}"
											onclick={() => saveReview(row, { status: active ? null : btn.status })}
											disabled={pending}
										>
											{btn.label}
										</button>
									{/each}
								</div>
								<input
									type="text"
									placeholder={row.myReview
										? 'Note (optional)…'
										: 'Set a status first to add a note'}
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

							{#if t.candidates.length > 0}
								{@const bulkPending = pendingSubCategoryKey === subCategoryKey(row, [])}
								<details class="mb-1">
									<summary
										class="cursor-pointer text-xs text-darker-subtitle hover:text-text-default"
									>
										Show {t.candidates.length} matched lemma{t.candidates.length === 1 ? '' : 's'} ({t
											.candidateGroups.length} sub-categor{t.candidateGroups.length === 1
											? 'y'
											: 'ies'}){#if row.blockedLemmas.length > 0}
											· {row.blockedLemmas.length} blocked{/if}
									</summary>
									<div class="mt-2 space-y-2">
										{#each t.candidateGroups as group (group.subCategories.join('|') || '__none__')}
											{@const unblockedInGroup = group.lemmas.filter(
												(l) => !row.myBlockedLemmas.includes(l)
											).length}
											<div class="rounded-md border border-card-stroke bg-shaded-background/40 p-2">
												<div class="mb-1.5 flex flex-wrap items-center gap-2">
													<span
														class="inline-flex items-center rounded-md bg-brand-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700"
														>{subCategoryLabel(group.subCategories)}</span
													>
													<span class="text-[11px] text-darker-subtitle"
														>{group.lemmas.length} lemma{group.lemmas.length === 1 ? '' : 's'}</span
													>
													{#if unblockedInGroup > 0}
														<button
															type="button"
															class="ml-auto rounded-md border border-negative-stroke bg-negative-background px-2 py-0.5 text-[11px] font-medium text-negative-stroke transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
															disabled={bulkPending}
															onclick={() => bulkBlockSubCategory(row, group.lemmas)}
															title="Block every lemma in this sub-category for this template"
														>
															{bulkPending ? 'Saving…' : `Flag all ${unblockedInGroup}`}
														</button>
													{/if}
												</div>
												<div class="flex flex-wrap gap-1">
													{#each group.lemmas as lemma (lemma)}
														{@const blockedByMe = row.myBlockedLemmas.includes(lemma)}
														{@const blockedByAnyone = row.blockedLemmas.includes(lemma)}
														{@const blockedByOther = blockedByAnyone && !blockedByMe}
														{@const chipPending = pendingChipKey === chipKey(row, lemma)}
														<button
															type="button"
															title={blockedByMe
																? 'You flagged this — click to clear'
																: blockedByOther
																	? 'Flagged by another reviewer — click to add your own flag'
																	: 'Flag this (template, lemma) pair'}
															disabled={chipPending || bulkPending}
															onclick={() => toggleBlock(row, lemma)}
															class="rounded-full px-2 py-0.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 {blockedByMe
																? 'bg-negative-background text-negative-stroke line-through'
																: blockedByOther
																	? 'bg-warning-background text-warning-text line-through opacity-70'
																	: 'bg-card-bg text-text-default hover:bg-shaded-background'}"
														>
															{lemma}
														</button>
													{/each}
												</div>
											</div>
										{/each}
									</div>
								</details>
							{/if}

							<details class="mb-1">
								<summary
									class="cursor-pointer text-xs text-darker-subtitle hover:text-text-default"
								>
									Why &amp; full metadata
								</summary>
								<div class="mt-2 space-y-1 text-sm">
									<p>{t.why}</p>
									{#if meta.length > 0}
										<ul class="ml-4 list-disc text-xs text-darker-subtitle">
											{#each meta as line (line)}
												<li class="font-mono">{line}</li>
											{/each}
										</ul>
									{/if}
								</div>
							</details>

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
			</details>
		{/each}
	</div>
{/if}
