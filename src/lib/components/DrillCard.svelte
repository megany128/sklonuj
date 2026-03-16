<script lang="ts">
	import type { DrillQuestion, DrillResult, Case } from '$lib/types';
	import { CASE_LABELS, CASE_INDEX, CASE_COLORS, CASE_NUMBER } from '$lib/types';
	import DiacriticsBar from './DiacriticsBar.svelte';
	import CaseAnswerOption from '$lib/components/ui/CaseAnswerOption.svelte';
	import CaseBadge from '$lib/components/ui/CaseBadge.svelte';
	import DottedUnderline from '$lib/components/ui/DottedUnderline.svelte';
	import WrongAnswerDisplay from '$lib/components/ui/WrongAnswerDisplay.svelte';
	import CorrectAnswerPanel from '$lib/components/ui/CorrectAnswerPanel.svelte';
	import NextButton from '$lib/components/ui/NextButton.svelte';

	let {
		question,
		result,
		onSubmit,
		onSpeak,
		selectedCases,
		showWordHint,
		paradigmNotes = null,
		onWordClick = null
	}: {
		question: DrillQuestion | null;
		result: DrillResult | null;
		onSubmit: (answer: string) => void;
		onSpeak: ((text: string) => void) | null;
		selectedCases: Case[];
		showWordHint: boolean;
		paradigmNotes?: Record<string, string> | null;
		onWordClick?: ((lemma: string) => void) | null;
	} = $props();

	let userInput = $state('');
	let submitted = $state(false);
	let inputEl: HTMLInputElement | undefined = $state(undefined);
	let showFeedback = $state(false);

	let unlockedCases = $derived(selectedCases);

	const MAX_CASE_OPTIONS = 3;

	// For case identification, pick max 3 options: correct answer + random distractors
	let caseOptions = $derived.by(() => {
		if (!question || question.drillType !== 'case_identification') return unlockedCases;
		const correctCase = question.correctAnswer as Case;
		if (unlockedCases.length <= MAX_CASE_OPTIONS) return unlockedCases;
		const distractors = unlockedCases.filter((c) => c !== correctCase);
		// Shuffle distractors deterministically based on question content
		const shuffled = [...distractors].sort(() => {
			// Use a simple seeded approach based on the question's template id + word
			return 0.5 - Math.random();
		});
		const picked = shuffled.slice(0, MAX_CASE_OPTIONS - 1);
		// Combine correct + distractors and sort by original order in unlockedCases
		const result = [correctCase, ...picked];
		return result.sort((a, b) => CASE_NUMBER[a] - CASE_NUMBER[b]);
	});

	let showCheers = $state(false);
	let canAdvance = $state(false);

	function triggerCheers() {
		showCheers = true;
		setTimeout(() => {
			showCheers = false;
		}, 1000);
	}

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
			showCheers = false;
			canAdvance = false;
			queueMicrotask(() => {
				inputEl?.focus();
			});
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (!submitted && question?.drillType !== 'case_identification') {
				handleSubmit();
			}
		}
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (!question) return;

		// Don't intercept if user is typing in the text input (Enter is handled by handleKeydown)
		if (e.target === inputEl) return;

		// Advance on Enter or Space after submission (only on fresh keypresses, not repeats)
		if (submitted && canAdvance && !e.repeat && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onSubmit('__advance__');
			return;
		}

		// Number keys 1-7 for case identification (only when not yet submitted)
		// Maps to case number, not option position (e.g. 2 = genitive)
		if (question.drillType === 'case_identification' && !submitted) {
			const keyNum = parseInt(e.key, 10);
			if (keyNum >= 1 && keyNum <= 7) {
				const matchedCase = caseOptions.find((c) => CASE_NUMBER[c] === keyNum);
				if (matchedCase) {
					e.preventDefault();
					handleCaseSelect(matchedCase);
				}
			}
		}
	}

	function enableAdvance() {
		// Wait for the submitting key to be fully released before allowing advance
		// This prevents the same keypress from both submitting and advancing
		function onKeyUp() {
			// Use requestAnimationFrame to ensure the advance isn't possible
			// until the next frame after the key is released
			requestAnimationFrame(() => {
				canAdvance = true;
			});
		}
		window.addEventListener('keyup', onKeyUp, { once: true });
	}

	function handleSubmit() {
		if (!question || submitted || userInput.trim() === '') return;
		submitted = true;
		showFeedback = true;
		onSubmit(userInput);
		enableAdvance();
	}

	function handleCaseSelect(caseKey: Case) {
		if (!question || submitted) return;
		submitted = true;
		showFeedback = true;
		onSubmit(caseKey);
		enableAdvance();
	}

	function sentenceWithBlankAndLemma(q: DrillQuestion): { before: string; after: string } {
		const parts = q.template.template.split('___');
		return {
			before: parts[0] ?? '',
			after: parts[1] ?? ''
		};
	}

	/** Smart number display: only show "plural" when asking for plural forms */
	function formatCasePrompt(q: DrillQuestion): { caseName: string; isPlural: boolean } {
		return {
			caseName: CASE_LABELS[q.case],
			isPlural: q.number === 'pl'
		};
	}

	function fullSentenceText(q: DrillQuestion): string {
		return q.template.template.replace('___', q.word.forms[q.number][CASE_INDEX[q.case]]);
	}

	function sentenceWithGap(q: DrillQuestion): string {
		return q.template.template.replace('___', '...');
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="w-full">
	{#if question}
		{#key question}
			<div
				class="drill-fade-enter relative flex flex-col gap-6 rounded-[40px] border-2 {question.word
					.lemma === 'pivo'
					? 'border-amber-300 pivo-cursor'
					: 'border-card-stroke'} bg-card-bg p-8 sm:p-10"
				role="region"
				aria-label="Drill"
			>
				<!-- Prompt -->
				<div class="text-center">
					{#if question.drillType === 'form_production'}
						{@const prompt = formatCasePrompt(question)}
						<p class="text-sm text-text-subtitle">Decline</p>
						<div class="mt-2 flex items-center justify-center gap-2">
							<div class="relative flex flex-col items-center">
								{#if showCheers}
									<span class="cheers-pop absolute -top-8 left-1/2 -translate-x-1/2 text-3xl"
										>🍻</span
									>
								{/if}
								{#if onWordClick}
									<button
										type="button"
										onclick={() => {
											onWordClick?.(question!.word.lemma);
											if (question!.word.lemma === 'pivo') triggerCheers();
										}}
										class="cursor-pointer text-4xl font-semibold {CASE_COLORS[question.case]
											.text} transition-opacity hover:opacity-70"
									>
										{question.word.lemma}
										<DottedUnderline
											colorClass={CASE_COLORS[question.case].bg}
											word={question.word.lemma}
											scale={1.4}
										/>
									</button>
								{:else}
									<span class="text-4xl font-semibold {CASE_COLORS[question.case].text}">
										{question.word.lemma}
									</span>
									<DottedUnderline
										colorClass={CASE_COLORS[question.case].bg}
										word={question.word.lemma}
										scale={1.4}
									/>
								{/if}
							</div>
							{#if onSpeak}
								<button
									type="button"
									onclick={() => onSpeak(question!.word.lemma)}
									class="flex size-8 shrink-0 items-center justify-center rounded-full bg-shaded-background text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
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
										class="size-4"
									>
										<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
										<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
										<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
									</svg>
								</button>
							{/if}
						</div>
						<div class="mt-3 flex items-center justify-center gap-2">
							<CaseBadge case_={question.case} size="sm" />
							{#if prompt.isPlural}
								<span
									class="inline-block rounded-full bg-shaded-background px-2.5 py-0.5 text-xs font-semibold text-text-subtitle"
								>
									plural
								</span>
							{/if}
						</div>
					{:else if question.drillType === 'case_identification'}
						<p class="text-sm text-text-subtitle">Which case?</p>
						{@const parts = sentenceWithBlankAndLemma(question)}
						<p class="mt-3 text-xl font-medium leading-relaxed text-emphasis">
							{parts.before}<span
								class="mx-0.5 inline-block rounded bg-shaded-background px-2 py-0.5 font-semibold text-emphasis"
								>{#if onWordClick}<button
										type="button"
										onclick={() => onWordClick?.(question!.word.lemma)}
										class="cursor-pointer underline decoration-text-subtitle decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
										>({question.word.lemma})</button
									>{:else}({question.word.lemma}){/if}</span
							>{parts.after}{#if onSpeak}<button
									type="button"
									onclick={() => onSpeak(fullSentenceText(question!))}
									class="ml-1 inline-flex size-8 items-center justify-center rounded-full bg-shaded-background align-middle text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
									aria-label="Listen to pronunciation"
									><svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="size-4"
									>
										<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
										<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
										<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
									</svg></button
								>{/if}
						</p>
					{:else}
						<p class="text-sm text-text-subtitle">Fill in the blank</p>
						{@const parts = sentenceWithBlankAndLemma(question)}
						<p class="mt-3 text-xl font-medium leading-relaxed text-emphasis">
							{parts.before}<span
								class="mx-0.5 inline-block border-b-2 border-dashed border-text-subtitle px-6"
								>&nbsp;&nbsp;&nbsp;&nbsp;</span
							>{parts.after}{#if onSpeak}<button
									type="button"
									onclick={() => onSpeak(sentenceWithGap(question!))}
									class="ml-1 inline-flex size-8 items-center justify-center rounded-full bg-shaded-background align-middle text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
									aria-label="Listen to pronunciation"
									><svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="size-4"
									>
										<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
										<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
										<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
									</svg></button
								>{/if}
						</p>
						{#if showWordHint}
							<p class="mt-2 flex items-center justify-center gap-1.5 text-sm text-text-subtitle">
								<span>{question.word.translation}</span>
								<span class="group relative">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="h-4 w-4 text-text-subtitle"
									>
										<circle cx="12" cy="12" r="10" />
										<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
										<path d="M12 17h.01" />
									</svg>
									<span
										class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-emphasis px-3 py-1.5 text-xs font-normal text-text-inverted opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
									>
										{question.word.lemma}
									</span>
								</span>
							</p>
						{/if}
						<div class="mt-3 flex items-center justify-center gap-2">
							<CaseBadge case_={question.case} size="sm" />
							{#if question.number === 'pl'}
								<span
									class="inline-block rounded-full bg-shaded-background px-2.5 py-0.5 text-xs font-medium text-text-subtitle"
								>
									plural
								</span>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Input area: buttons for case_identification, text input for others -->
				{#if question.drillType === 'case_identification'}
					<div
						role="group"
						aria-label="Select the correct case"
						class="flex flex-wrap justify-center gap-3"
					>
						{#each caseOptions as caseKey (caseKey)}
							{@const isCorrect =
								submitted && result !== null && caseKey === question.correctAnswer}
							{@const isIncorrect =
								submitted && result !== null && !result.correct && caseKey === result.userAnswer}
							{@const isDimmed = submitted && result !== null && !isCorrect && !isIncorrect}
							<CaseAnswerOption
								case_={caseKey}
								selected={false}
								disabled={submitted}
								correct={isCorrect}
								incorrect={isIncorrect}
								dimmed={isDimmed}
								onclick={() => handleCaseSelect(caseKey)}
							/>
						{/each}
					</div>
					{#if !submitted}
						<p class="mt-3 text-center text-xs text-text-subtitle">
							Press 1&ndash;7 to select by case number
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
							class="w-full rounded-[20px] border-2 px-5 py-3.5 text-center text-lg font-medium outline-none transition-all duration-200
								{submitted && result?.correct
								? 'border-positive-stroke bg-positive-background text-positive-stroke'
								: submitted && result && !result.correct
									? 'border-negative-stroke bg-negative-background text-negative-stroke'
									: 'border-card-stroke bg-card-bg text-emphasis placeholder:text-text-subtitle focus:border-emphasis'}"
						/>
					</div>

					<!-- Diacritics helper bar -->
					{#if showDiacriticsBar && !submitted}
						<div class="mt-2.5">
							<DiacriticsBar {inputEl} inputValue={userInput} />
						</div>
						{#if userInput.trim() !== ''}
							<p class="mt-2 text-center text-xs text-text-subtitle">Press enter to submit</p>
						{/if}
					{/if}
				{/if}

				<!-- Feedback after submission -->
				{#if submitted && result && showFeedback}
					<div class="drill-fade-enter space-y-4">
						{#if result.correct}
							<div class="flex items-center justify-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-5 w-5 text-positive-stroke"
								>
									<path
										fill-rule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
										clip-rule="evenodd"
									/>
								</svg>
								<p class="text-lg font-semibold text-positive-stroke">Correct!</p>
							</div>
							{@const nomForm = question.word.forms[question.number][0]}
							{@const targetForm = question.word.forms[question.number][CASE_INDEX[question.case]]}
							{#if nomForm !== targetForm}
								<p class="text-center text-sm text-text-subtitle">
									{nomForm} &rarr;
									<span class="font-semibold {CASE_COLORS[question.case].text}">{targetForm}</span>
								</p>
							{/if}
						{:else}
							<!-- Wrong answer display: only show for skipped answers since the input already shows wrong answers in red -->
							{#if question.drillType !== 'case_identification' && result.userAnswer === ''}
								<WrongAnswerDisplay userAnswer="skipped" />
							{/if}

							<!-- Correct answer panel with explanation -->
							{@const noteKey = `${question.case}_${question.number}`}
							{@const whyNote = paradigmNotes?.[noteKey] ?? null}
							{@const templateWhy =
								question.template.id !== '_form_production' ? question.template.why : null}
							<CorrectAnswerPanel
								correctAnswer={question.drillType === 'case_identification'
									? CASE_LABELS[question.correctAnswer as Case]
									: result.question.correctAnswer}
								nominative={question.word.forms[question.number][0]}
								targetForm={question.word.forms[question.number][CASE_INDEX[question.case]]}
								case_={question.case}
								drillType={question.drillType}
								nearMiss={result.nearMiss}
								{templateWhy}
								{whyNote}
								onSpeak={onSpeak ? (text: string) => onSpeak(text) : undefined}
								onWordClick={onWordClick ? () => onWordClick?.(question!.word.lemma) : undefined}
							/>
						{/if}

						<!-- Next button -->
						<NextButton onclick={() => onSubmit('__advance__')} />
					</div>
				{/if}

				<!-- Beer rain on correct pivo answer -->
				{#if showFeedback && result?.correct && question.word.lemma === 'pivo'}
					<div class="pointer-events-none absolute inset-0 overflow-hidden rounded-[40px]">
						{#each Array.from({ length: 12 }, (_, i) => i) as i (i)}
							<span
								class="beer-float absolute bottom-0 text-2xl"
								style="left: {8 + i * 7.5}%; animation-delay: {i * 0.15}s"
							>
								🍺
							</span>
						{/each}
					</div>
				{/if}
			</div>
		{/key}
	{:else}
		<div class="rounded-[40px] border-2 border-card-stroke bg-card-bg p-8 text-center">
			<p class="text-text-subtitle">No words available for this level. Try a different level.</p>
		</div>
	{/if}
</div>
