<script lang="ts">
	import type { DrillQuestion, DrillResult, Case } from '$lib/types';
	import { CASE_LABELS, CASE_INDEX, CASE_COLORS } from '$lib/types';
	import DiacriticsBar from './DiacriticsBar.svelte';

	let {
		question,
		result,
		onSubmit,
		onSpeak,
		selectedCases,
		showWordHint,
		onWordClick = null
	}: {
		question: DrillQuestion | null;
		result: DrillResult | null;
		onSubmit: (answer: string) => void;
		onSpeak: ((text: string) => void) | null;
		selectedCases: Case[];
		showWordHint: boolean;
		onWordClick?: ((lemma: string) => void) | null;
	} = $props();

	let userInput = $state('');
	let submitted = $state(false);
	let inputEl: HTMLInputElement | undefined = $state(undefined);
	let showFeedback = $state(false);

	let unlockedCases = $derived(selectedCases);

	let showDiacriticsBar = $derived(
		question !== null &&
			(question.drillType === 'form_production' || question.drillType === 'sentence_fill_in')
	);

	// Reset state and re-focus when question changes
	$effect(() => {
		if (question) {
			userInput = '';
			submitted = false;
			showFeedback = false;
			queueMicrotask(() => {
				inputEl?.focus();
			});
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (!submitted && question?.drillType !== 'case_identification') {
				handleSubmit();
			} else if (submitted) {
				onSubmit('__advance__');
			}
		}
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (!question) return;

		// Don't intercept if user is typing in the text input (Enter is handled by handleKeydown)
		if (e.target === inputEl) return;

		// Enter to advance after any drill type is submitted
		if (e.key === 'Enter' && submitted) {
			onSubmit('__advance__');
			return;
		}

		// Number keys 1-7 for case identification (only when not yet submitted)
		if (question.drillType === 'case_identification' && !submitted) {
			const keyNum = parseInt(e.key, 10);
			if (keyNum >= 1 && keyNum <= unlockedCases.length) {
				e.preventDefault();
				handleCaseSelect(unlockedCases[keyNum - 1]);
			}
		}
	}

	function handleSubmit() {
		if (!question || submitted || userInput.trim() === '') return;
		submitted = true;
		showFeedback = true;
		onSubmit(userInput);
	}

	function handleCaseSelect(caseKey: Case) {
		if (!question || submitted) return;
		submitted = true;
		showFeedback = true;
		onSubmit(caseKey);
	}

	function handleSkip() {
		if (!question || submitted) return;
		submitted = true;
		showFeedback = true;
		onSubmit('__skip__');
	}

	function sentenceWithBlankAndLemma(q: DrillQuestion): { before: string; after: string } {
		const parts = q.template.template.split('___');
		return {
			before: parts[0] ?? '',
			after: parts[1] ?? ''
		};
	}

	function getCaseButtonClass(caseKey: Case): string {
		const base =
			'rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-all duration-200 cursor-pointer';

		if (!submitted || !result || !question) {
			return `${base} border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:scale-[0.97] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-500 dark:hover:bg-brand-950 dark:hover:text-brand-300`;
		}

		const isCorrectCase = caseKey === question.correctAnswer;
		const isUserPick = caseKey === result.userAnswer;

		if (isCorrectCase) {
			return `${base} border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800`;
		}

		if (isUserPick && !result.correct) {
			return `${base} border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-500 dark:bg-rose-950 dark:text-rose-300`;
		}

		return `${base} border-slate-100 bg-slate-50 text-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-600`;
	}

	/** Smart number display: only show "plural" when asking for plural forms */
	function formatCasePrompt(q: DrillQuestion): { caseName: string; isPlural: boolean } {
		return {
			caseName: CASE_LABELS[q.case],
			isPlural: q.number === 'pl'
		};
	}

	let drillTypeLabel = $derived.by(() => {
		if (!question) return '';
		switch (question.drillType) {
			case 'form_production':
				return 'Form Production';
			case 'case_identification':
				return 'Case Identification';
			case 'sentence_fill_in':
				return 'Sentence Fill-in';
		}
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="w-full">
	{#if question}
		{#key question}
			<div
				class="drill-fade-enter rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-slate-200/50 sm:p-8 dark:border-slate-700/60 dark:bg-slate-800/80 dark:shadow-slate-900/50 {submitted &&
				result?.correct
					? 'correct-flash'
					: ''}"
				role="region"
				aria-label="{drillTypeLabel} drill"
			>
				<!-- Drill type indicator -->
				<p
					class="mb-5 text-center text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500"
				>
					{drillTypeLabel}
				</p>

				<!-- Prompt -->
				<div class="mb-8 text-center">
					{#if question.drillType === 'form_production'}
						{@const prompt = formatCasePrompt(question)}
						<p
							class="text-sm font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500"
						>
							Decline
						</p>
						<p class="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
							{#if onWordClick}
								<button
									type="button"
									onclick={() => onWordClick?.(question!.word.lemma)}
									class="cursor-pointer underline decoration-slate-300 decoration-dotted underline-offset-4 transition-colors hover:decoration-brand-400 hover:text-brand-700 dark:decoration-slate-600 dark:hover:decoration-brand-400 dark:hover:text-brand-300"
								>
									{question.word.lemma}
								</button>
							{:else}
								{question.word.lemma}
							{/if}
						</p>
						<div class="mt-3 flex items-center justify-center gap-2">
							<span
								class="inline-block rounded-full px-3 py-1 text-sm font-semibold {CASE_COLORS[
									question.case
								].bg} {CASE_COLORS[question.case].dark}"
							>
								{prompt.caseName}{#if prompt.isPlural}&nbsp;plural{/if}
							</span>
						</div>
					{:else if question.drillType === 'case_identification'}
						<p
							class="text-sm font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500"
						>
							Which case?
						</p>
						{@const parts = sentenceWithBlankAndLemma(question)}
						<p class="mt-3 text-xl font-medium leading-relaxed text-slate-900 dark:text-slate-100">
							{parts.before}<span
								class="mx-0.5 inline-block rounded bg-brand-100 px-2 py-0.5 font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300"
								>{#if onWordClick}<button
										type="button"
										onclick={() => onWordClick?.(question!.word.lemma)}
										class="cursor-pointer underline decoration-brand-300 decoration-dotted underline-offset-2 transition-colors hover:decoration-brand-500 dark:decoration-brand-600 dark:hover:decoration-brand-400"
										>({question.word.lemma})</button
									>{:else}({question.word.lemma}){/if}</span
							>{parts.after}
						</p>
					{:else}
						<p
							class="text-sm font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500"
						>
							Fill in the blank
						</p>
						{@const parts = sentenceWithBlankAndLemma(question)}
						<p class="mt-3 text-xl font-medium leading-relaxed text-slate-900 dark:text-slate-100">
							{parts.before}<span
								class="mx-0.5 inline-block border-b-2 border-dashed border-brand-400 px-4 dark:border-brand-500"
								>&nbsp;&nbsp;&nbsp;&nbsp;</span
							>{parts.after}
						</p>
						{#if showWordHint}
							<p class="mt-2 text-sm text-slate-400 dark:text-slate-500">
								({#if onWordClick}<button
										type="button"
										onclick={() => onWordClick?.(question!.word.lemma)}
										class="cursor-pointer underline decoration-slate-300 decoration-dotted underline-offset-2 transition-colors hover:decoration-brand-400 hover:text-brand-600 dark:decoration-slate-600 dark:hover:decoration-brand-400 dark:hover:text-brand-300"
										>{question.word.lemma}</button
									>{:else}{question.word.lemma}{/if}) &mdash; {question.word.translation}
							</p>
						{/if}
					{/if}
				</div>

				<!-- Input area: buttons for case_identification, text input for others -->
				{#if question.drillType === 'case_identification'}
					<div role="group" aria-label="Select the correct case">
						<div class="grid grid-cols-3 gap-2.5">
							{#each unlockedCases as caseKey, idx (caseKey)}
								<button
									onclick={() => handleCaseSelect(caseKey)}
									disabled={submitted}
									class={getCaseButtonClass(caseKey)}
									aria-label="{CASE_LABELS[caseKey]} (press {idx + 1})"
								>
									<span>{CASE_LABELS[caseKey]}</span>
									<span
										class="mt-0.5 block text-[0.6rem] font-normal text-slate-400 dark:text-slate-500"
										>{idx + 1}</span
									>
								</button>
							{/each}
						</div>
					</div>
					{#if !submitted}
						<div class="mt-5">
							<button
								onclick={handleSkip}
								class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
							>
								Skip
							</button>
						</div>
						<p class="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
							Press 1&ndash;{unlockedCases.length} to select
						</p>
					{/if}
				{:else}
					<div class="relative">
						<label for="drill-answer" class="sr-only">
							{#if question.drillType === 'form_production'}
								Type the {CASE_LABELS[question.case]}
								{question.number === 'pl' ? 'plural ' : ''}form of {question.word.lemma}
							{:else}
								Type the correct form of {question.word.lemma} to fill in the blank
							{/if}
						</label>
						<input
							id="drill-answer"
							bind:this={inputEl}
							bind:value={userInput}
							onkeydown={handleKeydown}
							disabled={submitted}
							type="text"
							autocomplete="off"
							autocorrect="off"
							autocapitalize="off"
							spellcheck="false"
							placeholder="Type your answer..."
							class="w-full rounded-xl border-2 px-5 py-3.5 text-center text-lg font-medium outline-none transition-all duration-200
								{submitted && result?.correct
								? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-300'
								: submitted && result && result.nearMiss
									? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-300'
									: submitted && result && !result.correct
										? 'border-rose-400 bg-rose-50 text-rose-800 dark:border-rose-500 dark:bg-rose-950 dark:text-rose-300'
										: 'border-slate-200 bg-slate-50/50 text-slate-900 placeholder:text-slate-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-brand-500 dark:focus:ring-brand-900'}"
						/>
					</div>

					<!-- Diacritics helper bar -->
					{#if showDiacriticsBar && !submitted}
						<div class="mt-2.5">
							<DiacriticsBar {inputEl} inputValue={userInput} />
						</div>
					{/if}

					{#if !submitted}
						<div class="mt-4 flex gap-3">
							<button
								onclick={handleSkip}
								class="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
							>
								Skip
							</button>
							<button
								onclick={handleSubmit}
								disabled={userInput.trim() === ''}
								class="flex-1 rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow-md active:scale-[0.98] disabled:opacity-30 disabled:shadow-none dark:bg-brand-500 dark:hover:bg-brand-400"
							>
								Check
							</button>
						</div>
					{/if}
				{/if}

				<!-- Feedback after submission -->
				{#if submitted && result && showFeedback}
					<div class="drill-fade-enter mt-5 text-center">
						{#if result.correct}
							<div class="flex items-center justify-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-5 w-5 text-emerald-500 dark:text-emerald-400"
								>
									<path
										fill-rule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
										clip-rule="evenodd"
									/>
								</svg>
								<p class="text-lg font-bold text-emerald-600 dark:text-emerald-400">Correct!</p>
							</div>
							{#if question.drillType === 'case_identification'}
								<p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
									{question.word.lemma} &rarr;
									<span class="font-semibold text-slate-700 dark:text-slate-200">
										{question.word.forms[question.number][CASE_INDEX[question.case]]}
									</span>
								</p>
							{/if}
						{:else}
							<p class="mb-1 text-xs font-medium text-slate-400 uppercase dark:text-slate-500">
								Correct answer
							</p>
							<p class="text-2xl font-bold text-rose-600 dark:text-rose-400">
								{#if question.drillType === 'case_identification'}
									{CASE_LABELS[question.correctAnswer as Case]}
								{:else}
									{result.question.correctAnswer}
								{/if}
							</p>
							{#if question.drillType === 'case_identification'}
								<p class="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
									{question.word.lemma} &rarr;
									<span class="font-semibold text-slate-700 dark:text-slate-200">
										{question.word.forms[question.number][CASE_INDEX[question.case]]}
									</span>
								</p>
							{/if}
							{#if result.nearMiss}
								<div
									class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="h-4 w-4"
									>
										<path
											fill-rule="evenodd"
											d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.345 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
											clip-rule="evenodd"
										/>
									</svg>
									Almost! Check your diacritics.
								</div>
							{/if}
						{/if}

						{#if onSpeak && question.drillType !== 'case_identification'}
							<button
								onclick={() => onSpeak(question!.correctAnswer)}
								class="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
								aria-label="Listen to pronunciation"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="h-4 w-4"
								>
									<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
									<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
									<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
								</svg>
								Listen
							</button>
						{/if}

						<button
							onclick={() => onSubmit('__advance__')}
							class="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
						>
							Next
						</button>
						<p class="mt-2 text-[0.65rem] text-slate-400 dark:text-slate-500">
							{#if result.correct}Auto-advancing...{:else}Press Enter or tap Next{/if}
						</p>
					</div>
				{/if}
			</div>
		{/key}
	{:else}
		<div
			class="rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-lg shadow-slate-200/50 dark:border-slate-700/60 dark:bg-slate-800/80 dark:shadow-slate-900/50"
		>
			<p class="text-slate-500 dark:text-slate-400">
				No words available for this level. Try a different level.
			</p>
		</div>
	{/if}
</div>
