<script lang="ts">
	import type { DrillQuestion, DrillResult, Case } from '$lib/types';
	import { CASE_LABELS, CASE_INDEX, CASE_COLORS, CASE_NUMBER } from '$lib/types';
	import { applyPrepositionVoicing } from '$lib/engine/drill';
	import { playClinkSound } from '$lib/audio';
	import DiacriticsBar from './DiacriticsBar.svelte';
	import CaseAnswerOption from '$lib/components/ui/CaseAnswerOption.svelte';
	import CaseBadge from '$lib/components/ui/CaseBadge.svelte';
	import DottedUnderline from '$lib/components/ui/DottedUnderline.svelte';
	import WrongAnswerDisplay from '$lib/components/ui/WrongAnswerDisplay.svelte';
	import CorrectAnswerPanel from '$lib/components/ui/CorrectAnswerPanel.svelte';
	import NextButton from '$lib/components/ui/NextButton.svelte';

	let {
		question,
		loading = false,
		result,
		onSubmit,
		onSpeak,
		selectedCases,
		paradigmNotes = null,
		onWordClick = null,
		streak = 0,
		soundEnabled = true
	}: {
		question: DrillQuestion | null;
		loading?: boolean;
		result: DrillResult | null;
		onSubmit: (answer: string) => void;
		onSpeak: ((text: string) => void) | null;
		selectedCases: Case[];
		paradigmNotes?: Record<string, string> | null;
		onWordClick?: ((lemma: string) => void) | null;
		streak?: number;
		soundEnabled?: boolean;
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

	let isPivo = $derived(question?.word.lemma === 'pivo');
	let cardEl: HTMLDivElement | undefined = $state(undefined);
	let pivoCursorEl: HTMLDivElement | undefined = $state(undefined);
	let pivoVisible = $state(false);

	function hideSystemCursor(node: HTMLElement) {
		node.style.setProperty('cursor', 'none', 'important');
		for (const el of node.querySelectorAll('*')) {
			(el as HTMLElement).style.setProperty('cursor', 'none', 'important');
		}
	}

	function restoreSystemCursor(node: HTMLElement) {
		node.style.removeProperty('cursor');
		for (const el of node.querySelectorAll('*')) {
			(el as HTMLElement).style.removeProperty('cursor');
		}
	}

	// Hide system cursor on mount and whenever DOM changes
	$effect(() => {
		if (!cardEl || !isPivo) return;
		hideSystemCursor(cardEl);
		const observer = new MutationObserver(() => hideSystemCursor(cardEl!));
		observer.observe(cardEl, { childList: true, subtree: true });
		return () => {
			observer.disconnect();
			restoreSystemCursor(cardEl!);
		};
	});

	// Attach pivo Easter egg mouse listeners programmatically to avoid a11y warnings
	// (these are purely decorative effects, not interactive controls)
	$effect(() => {
		if (!cardEl || !isPivo) return;
		const el = cardEl;
		function onClick(e: MouseEvent) {
			if (soundEnabled) playClinkSound();
			triggerClink(e);
		}
		el.addEventListener('click', onClick);
		el.addEventListener('mousemove', handlePivoMouseMove);
		el.addEventListener('mouseleave', handlePivoMouseLeave);
		return () => {
			el.removeEventListener('click', onClick);
			el.removeEventListener('mousemove', handlePivoMouseMove);
			el.removeEventListener('mouseleave', handlePivoMouseLeave);
		};
	});

	function handlePivoMouseMove(e: MouseEvent) {
		if (!pivoCursorEl || !isPivo) return;
		pivoCursorEl.style.left = `${e.clientX}px`;
		pivoCursorEl.style.top = `${e.clientY}px`;
		if (!pivoVisible) pivoVisible = true;
	}

	function handlePivoMouseLeave() {
		pivoVisible = false;
	}

	// Clink animation: the cursor emoji floats up and fades, then reappears
	let clinkAnimating = $state(false);
	let clinkX = $state(0);
	let clinkY = $state(0);

	function triggerClink(e: MouseEvent) {
		clinkX = e.clientX;
		clinkY = e.clientY;
		clinkAnimating = true;
		setTimeout(() => {
			clinkAnimating = false;
		}, 800);
	}

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
				if (userInput.trim() === '') {
					// Empty input: treat Enter as skip
					submitted = true;
					showFeedback = true;
					onSubmit('__skip__');
					enableAdvance();
				} else {
					handleSubmit();
				}
			}
		}
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (!question) return;

		// Don't intercept if focus is inside a modal or other overlay
		const target = e.target as HTMLElement | null;
		if (target?.closest('[data-modal]')) return;

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
		const form = q.word.forms[q.number][CASE_INDEX[q.case]];
		const voiced = applyPrepositionVoicing(q.template.template, form);
		const parts = voiced.split('___');
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
		const form = q.word.forms[q.number][CASE_INDEX[q.case]];
		if (q.drillType === 'case_identification') {
			// Before submission: read only the nominative form
			// After submission: read the full sentence with the correctly declined form
			if (submitted) {
				return applyPrepositionVoicing(q.template.template, form).replace('___', form);
			}
			return q.word.forms[q.number][0];
		}
		return applyPrepositionVoicing(q.template.template, form).replace('___', form);
	}

	function sentenceWithGap(q: DrillQuestion): string {
		const form = q.word.forms[q.number][CASE_INDEX[q.case]];
		return applyPrepositionVoicing(q.template.template, form).replace('___', '...');
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="w-full">
	{#if question}
		{#key question}
			<div
				bind:this={cardEl}
				class="drill-fade-enter relative flex flex-col gap-4 rounded-[24px] border-2 sm:gap-6 sm:rounded-[40px] {question
					.word.lemma === 'pivo'
					? 'border-easter-egg-border pivo-glow'
					: 'border-card-stroke'} {streak >= 10 && showFeedback && result?.correct
					? 'streak-glow'
					: ''} bg-card-bg p-5 sm:p-8 md:p-10"
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
										class="cursor-pointer text-3xl font-semibold sm:text-4xl {CASE_COLORS[
											question.case
										].text} transition-opacity hover:opacity-70"
									>
										{question.word.lemma}
										<DottedUnderline
											colorClass={CASE_COLORS[question.case].bg}
											word={question.word.lemma}
											scale={1.4}
										/>
									</button>
								{:else}
									<span
										class="text-3xl font-semibold sm:text-4xl {CASE_COLORS[question.case].text}"
									>
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
									class="inline-block rounded-full bg-shaded-background px-2.5 py-0.5 text-xs font-normal text-text-subtitle"
								>
									plural
								</span>
							{/if}
						</div>
					{:else if question.drillType === 'case_identification'}
						<p class="text-sm text-text-subtitle">Which case?</p>
						{@const parts = sentenceWithBlankAndLemma(question)}
						<p class="mt-3 text-lg font-normal leading-relaxed text-emphasis sm:text-xl">
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
									class="ml-3 inline-flex size-8 items-center justify-center rounded-full bg-shaded-background align-middle text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
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
						<p class="mt-3 text-lg font-normal leading-relaxed text-emphasis sm:text-xl">
							{parts.before}<span
								class="mx-0.5 inline-block border-b-2 border-dashed border-text-subtitle px-6"
								>&nbsp;&nbsp;&nbsp;&nbsp;</span
							>{parts.after}{#if onSpeak}<button
									type="button"
									onclick={() => onSpeak(sentenceWithGap(question!))}
									class="ml-3 inline-flex size-8 items-center justify-center rounded-full bg-shaded-background align-middle text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
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
						{#if question.number === 'pl'}
							<div class="mt-3 flex items-center justify-center">
								<span
									class="inline-block rounded-full bg-shaded-background px-2.5 py-0.5 text-xs font-normal text-text-subtitle"
								>
									plural
								</span>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Input area: buttons for case_identification, text input for others -->
				{#if question.drillType === 'case_identification'}
					<div
						role="group"
						aria-label="Select the correct case"
						class="flex flex-wrap justify-center gap-2 sm:gap-3"
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
							class="w-full rounded-[16px] border-2 px-4 py-3 text-center text-base font-normal outline-none transition-all duration-200 sm:rounded-[20px] sm:px-5 sm:py-3.5 sm:text-lg
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
						<p class="mt-2 text-center text-xs text-text-subtitle">
							{userInput.trim() !== '' ? 'Press enter to submit' : 'Press enter to skip'}
						</p>
					{/if}
				{/if}

				<!-- Feedback after submission -->
				{#if submitted && result && showFeedback}
					<div class="drill-fade-enter space-y-4" aria-live="polite">
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
								<p class="text-lg font-semibold text-positive-stroke">
									{#if streak >= 3}
										Correct! {streak} in a row!
									{:else}
										Correct!
									{/if}
								</p>
							</div>
							{#if streak >= 5}
								<div
									class="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px] sm:rounded-[40px]"
								>
									{#each Array.from({ length: streak >= 25 ? 10 : streak >= 10 ? 8 : 4 }, (_, i) => i) as i (i)}
										<span
											class="streak-float absolute text-xl"
											style="left: {10 + Math.random() * 80}%; bottom: {20 +
												Math.random() * 40}%; animation-delay: {i * 0.1}s"
										>
											{['🔥', '⭐', '✨', '💥', '🌟'][i % 5]}
										</span>
									{/each}
								</div>
							{/if}
							{@const nomForm = question.word.forms[question.number][0]}
							{@const targetForm = question.word.forms[question.number][CASE_INDEX[question.case]]}
							{#if result.nearMiss}
								<p class="text-center text-sm text-warning-text">
									Almost! Check your diacritics: <span class="font-semibold"
										>{question.correctAnswer}</span
									>
								</p>
							{:else if nomForm !== targetForm}
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
					<div
						class="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px] sm:rounded-[40px]"
					>
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
	{:else if loading}
		<div
			class="rounded-[24px] border-2 border-card-stroke bg-card-bg p-5 text-center sm:rounded-[40px] sm:p-8"
		>
			<p class="text-sm text-text-subtitle">Loading exercises...</p>
		</div>
	{:else}
		<div
			class="rounded-[24px] border-2 border-card-stroke bg-card-bg p-5 text-center sm:rounded-[40px] sm:p-8"
		>
			<p class="text-text-subtitle">
				No exercises available for this combination. Try selecting different cases, number mode, or
				difficulty level.
			</p>
		</div>
	{/if}
</div>

{#if isPivo}
	<!-- Cursor emoji: hidden until mouse enters card, hidden during clink animation -->
	<div
		bind:this={pivoCursorEl}
		class="pointer-events-none fixed z-[9999] text-2xl"
		style="left: -100px; top: -100px; opacity: {pivoVisible && !clinkAnimating
			? 1
			: 0}; transform: translate(-4px, -28px)"
	>
		🍻
	</div>

	{#if clinkAnimating}
		<span
			class="pivo-clink pointer-events-none fixed z-[9999] text-2xl"
			style="left: {clinkX}px; top: {clinkY}px"
		>
			🍻
		</span>
	{/if}
{/if}
