<script lang="ts">
	import type { Case, Difficulty, MultiStepQuestion, MultiStepResult } from '$lib/types';
	import { ALL_CASES, CASE_LABELS, CASE_COLORS, CASE_NUMBER, isParadigm } from '$lib/types';
	import { applyPrepositionVoicing, checkMultiStepForm } from '$lib/engine/drill';
	import DiacriticsBar from './DiacriticsBar.svelte';
	import CaseAnswerOption from '$lib/components/ui/CaseAnswerOption.svelte';
	import CaseBadge from '$lib/components/ui/CaseBadge.svelte';
	import CorrectAnswerPanel from '$lib/components/ui/CorrectAnswerPanel.svelte';
	import FeedbackDeclensionChart from '$lib/components/ui/FeedbackDeclensionChart.svelte';
	import paradigmsData from '$lib/data/paradigms.json';

	interface ParadigmEntry {
		id: string;
		name: string;
		gender: string;
		animate: boolean;
		exampleLemma: string;
		whyNotes: Record<string, string>;
	}

	const paradigms: ParadigmEntry[] = paradigmsData.map((p) => ({
		id: String(p.id),
		name: String(p.name),
		gender: String(p.gender),
		animate: Boolean(p.animate),
		exampleLemma: String(p.exampleLemma),
		whyNotes: p.whyNotes
	}));

	const SOFT_CONSONANTS = new Set(['ž', 'š', 'č', 'ř', 'ď', 'ť', 'ň', 'j', 'c']);
	const HARD_CONSONANTS = new Set([
		'h',
		'k',
		'g',
		'd',
		't',
		'n',
		'r',
		'b',
		'p',
		'v',
		'f',
		'm',
		'l',
		's',
		'z'
	]);

	function getParadigmExplanation(lemma: string, paradigm: ParadigmEntry): string {
		const lastChar = lemma.slice(-1).toLowerCase();
		const genderLabel =
			paradigm.gender === 'm' ? 'masculine' : paradigm.gender === 'f' ? 'feminine' : 'neuter';
		const animateLabel = paradigm.animate ? 'animate' : 'inanimate';

		// Ending-based paradigms
		if (lastChar === 'a' && paradigm.gender === 'f') {
			return `"${lemma}" ends in -a and is feminine, so it follows the ${paradigm.exampleLemma} paradigm.`;
		}
		if (lastChar === 'a' && paradigm.gender === 'm') {
			return `"${lemma}" ends in -a but is masculine animate, so it follows the ${paradigm.exampleLemma} paradigm.`;
		}
		if (lastChar === 'e' || lastChar === 'ě') {
			if (paradigm.gender === 'f') {
				return `"${lemma}" ends in -${lastChar} and is feminine, so it follows the ${paradigm.exampleLemma} paradigm.`;
			}
			if (paradigm.gender === 'n') {
				return `"${lemma}" ends in -${lastChar} and is neuter, so it follows the ${paradigm.exampleLemma} paradigm.`;
			}
			if (paradigm.gender === 'm') {
				return `"${lemma}" ends in -${lastChar} and is masculine animate, so it follows the ${paradigm.exampleLemma} paradigm.`;
			}
		}
		if (lastChar === 'o' && paradigm.gender === 'n') {
			return `"${lemma}" ends in -o and is neuter, so it follows the ${paradigm.exampleLemma} paradigm.`;
		}
		if (lastChar === 'í' && paradigm.gender === 'n') {
			return `"${lemma}" ends in -í and is neuter, so it follows the ${paradigm.exampleLemma} paradigm.`;
		}

		// Consonant-ending paradigms
		if (SOFT_CONSONANTS.has(lastChar)) {
			if (paradigm.gender === 'm') {
				return `"${lemma}" ends in the soft consonant -${lastChar} and is ${genderLabel} ${animateLabel}, so it follows the ${paradigm.exampleLemma} paradigm.`;
			}
			if (paradigm.gender === 'f') {
				return `"${lemma}" ends in the soft consonant -${lastChar} and is feminine, so it follows the ${paradigm.exampleLemma} paradigm.`;
			}
		}
		if (HARD_CONSONANTS.has(lastChar)) {
			if (paradigm.gender === 'm') {
				return `"${lemma}" ends in the hard consonant -${lastChar} and is ${genderLabel} ${animateLabel}, so it follows the ${paradigm.exampleLemma} paradigm.`;
			}
			if (paradigm.gender === 'f') {
				return `"${lemma}" ends in the consonant -${lastChar} and is feminine, so it follows the ${paradigm.exampleLemma} paradigm.`;
			}
		}

		// Fallback
		return `"${lemma}" is ${genderLabel}${paradigm.gender === 'm' ? ` ${animateLabel}` : ''}, so it follows the ${paradigm.exampleLemma} paradigm.`;
	}

	let {
		question,
		onComplete,
		paradigmNotes = null,
		onSpeak = null,
		level = 'A1'
	}: {
		question: MultiStepQuestion;
		onComplete: (result: MultiStepResult) => void;
		paradigmNotes?: Record<string, string> | null;
		onSpeak?: ((text: string) => void) | null;
		level?: Difficulty;
	} = $props();

	type Step = 'paradigm' | 'case' | 'form' | 'summary';

	let currentStep: Step = $state('paradigm');
	let selectedGender: 'm' | 'f' | 'n' | '' = $state('');
	let selectedParadigm = $state('');
	let paradigmSubmitted = $state(false);
	let paradigmCorrect = $state(false);

	let selectedCase: Case | null = $state(null);
	let caseSubmitted = $state(false);
	let caseCorrect = $state(false);

	let formInput = $state('');
	let formSubmitted = $state(false);
	let formCorrect = $state(false);
	let formNearMiss = $state(false);
	let formInputEl: HTMLInputElement | undefined = $state(undefined);

	let canAdvance = $state(false);
	let pendingKeyUpHandler: (() => void) | null = null;

	// Track active timers for cleanup
	let activeTimers: ReturnType<typeof setTimeout>[] = [];

	// Clean up on teardown
	$effect(() => {
		return () => {
			for (const id of activeTimers) {
				clearTimeout(id);
			}
			activeTimers = [];
			if (pendingKeyUpHandler) {
				window.removeEventListener('keyup', pendingKeyUpHandler);
				pendingKeyUpHandler = null;
			}
		};
	});

	// Reset on question change
	$effect(() => {
		if (question) {
			currentStep = 'paradigm';
			selectedGender = '';
			selectedParadigm = '';
			paradigmSubmitted = false;
			paradigmCorrect = false;
			selectedCase = null;
			caseSubmitted = false;
			caseCorrect = false;
			formInput = '';
			formSubmitted = false;
			formCorrect = false;
			formNearMiss = false;
			canAdvance = false;
		}
	});

	function enableAdvance() {
		if (pendingKeyUpHandler) {
			window.removeEventListener('keyup', pendingKeyUpHandler);
		}
		function onKeyUp() {
			pendingKeyUpHandler = null;
			requestAnimationFrame(() => {
				canAdvance = true;
			});
		}
		pendingKeyUpHandler = onKeyUp;
		window.addEventListener('keyup', onKeyUp, { once: true });
	}

	const GENDER_OPTIONS: { value: 'm' | 'f' | 'n'; label: string }[] = [
		{ value: 'm', label: 'Masculine' },
		{ value: 'f', label: 'Feminine' },
		{ value: 'n', label: 'Neuter' }
	];

	// Paradigms filtered by selected gender
	let filteredParadigms = $derived(
		selectedGender ? paradigms.filter((p) => p.gender === selectedGender) : []
	);

	/** Strip redundant gender prefix from paradigm name (e.g. "Feminine (-a)" → "(-a)") */
	function shortParadigmName(name: string): string {
		return name
			.replace(/^Hard Masc\.\s*/i, 'Hard ')
			.replace(/^Soft Masc\.\s*/i, 'Soft ')
			.replace(/^Masc\.\s*/i, '')
			.replace(/^Feminine\s*/i, '')
			.replace(/^Neuter\s*/i, '');
	}

	// Sentence parts for display
	let sentenceParts = $derived.by(() => {
		const form = question.correctForm;
		const voiced = applyPrepositionVoicing(question.template.template, form);
		const parts = voiced.split('___');
		return {
			before: parts[0] ?? '',
			after: parts[1] ?? ''
		};
	});

	// Paradigm notes for form step
	let whyNoteKey = $derived(`${question.case}_${question.number}`);
	let whyNote = $derived(paradigmNotes?.[whyNoteKey] ?? null);
	let templateWhy = $derived(question.template.why ?? null);

	// Step handlers
	function handleParadigmSubmit() {
		if (paradigmSubmitted || !selectedParadigm) return;
		paradigmSubmitted = true;
		paradigmCorrect = selectedParadigm === question.correctParadigm;
		canAdvance = false;
		enableAdvance();
	}

	function advanceFromParadigm() {
		if (question.showCaseStep) {
			currentStep = 'case';
		} else {
			currentStep = 'form';
			queueMicrotask(() => formInputEl?.focus());
		}
		canAdvance = false;
	}

	function handleCaseSelect(c: Case) {
		if (caseSubmitted) return;
		selectedCase = c;
		caseSubmitted = true;
		caseCorrect = c === question.correctCase;
		canAdvance = false;
		enableAdvance();
	}

	function advanceFromCase() {
		currentStep = 'form';
		canAdvance = false;
		queueMicrotask(() => formInputEl?.focus());
	}

	function handleFormSubmit() {
		if (formSubmitted || formInput.trim() === '') return;
		formSubmitted = true;
		const result = checkMultiStepForm(question, formInput, level);
		formCorrect = result.correct;
		formNearMiss = result.nearMiss;
		canAdvance = false;
		enableAdvance();
	}

	function advanceFromForm() {
		currentStep = 'summary';
		canAdvance = false;
		enableAdvance();
	}

	function handleFinalAdvance() {
		onComplete({
			question,
			paradigmCorrect,
			caseCorrect: question.showCaseStep ? caseCorrect : null,
			formCorrect,
			formNearMiss,
			userParadigm: isParadigm(selectedParadigm) ? selectedParadigm : question.correctParadigm,
			userCase: question.showCaseStep ? selectedCase : null,
			userForm: formInput
		});
	}

	// Keyboard navigation
	function handleWindowKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target?.closest('[data-modal]')) return;

		if (e.key === 'Enter' || e.key === ' ') {
			if (currentStep === 'paradigm' && paradigmSubmitted && canAdvance) {
				e.preventDefault();
				advanceFromParadigm();
				return;
			}
			if (currentStep === 'case' && caseSubmitted && canAdvance) {
				e.preventDefault();
				advanceFromCase();
				return;
			}
			if (currentStep === 'form' && formSubmitted && canAdvance) {
				e.preventDefault();
				advanceFromForm();
				return;
			}
			if (currentStep === 'summary' && canAdvance) {
				e.preventDefault();
				handleFinalAdvance();
				return;
			}
		}

		// Number keys for case step
		if (currentStep === 'case' && !caseSubmitted) {
			const keyNum = parseInt(e.key, 10);
			if (keyNum >= 1 && keyNum <= 7) {
				const matchedCase = ALL_CASES.find((c) => CASE_NUMBER[c] === keyNum);
				if (matchedCase) {
					e.preventDefault();
					handleCaseSelect(matchedCase);
				}
			}
		}
	}

	function handleFormKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !formSubmitted) {
			if (formInput.trim() === '') return;
			handleFormSubmit();
		}
	}

	// Step progress indicator
	let totalSteps = $derived(question.showCaseStep ? 3 : 2);
	let stepIndices = $derived(Array.from({ length: totalSteps }, (_, i) => i));
	let currentStepNumber = $derived.by(() => {
		if (currentStep === 'paradigm') return 1;
		if (currentStep === 'case') return 2;
		if (currentStep === 'form') return question.showCaseStep ? 3 : 2;
		return totalSteps;
	});

	// Correct paradigm info for display
	let correctParadigmEntry = $derived(paradigms.find((p) => p.id === question.correctParadigm));
	let paradigmExplanation = $derived(
		correctParadigmEntry ? getParadigmExplanation(question.word.lemma, correctParadigmEntry) : null
	);
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="w-full">
	{#key question}
		<div
			class="drill-fade-enter relative flex flex-col gap-4 rounded-[24px] border-2 sm:gap-6 sm:rounded-[40px] border-card-stroke bg-card-bg p-5 sm:p-8 md:p-10"
			role="region"
			aria-label="Full Analysis Drill"
		>
			<!-- Step progress bar -->
			{#if currentStep !== 'summary'}
				<div class="flex items-center justify-center gap-2">
					<span class="text-xs font-semibold text-text-subtitle">
						Step {currentStepNumber} of {totalSteps}
					</span>
					<div class="flex gap-1">
						{#each stepIndices as step (step)}
							<div
								class="h-1.5 w-8 rounded-full transition-colors {step < currentStepNumber
									? 'bg-emphasis'
									: 'bg-card-stroke'}"
							></div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Word display (always shown) -->
			<div class="text-center">
				<div class="flex items-center justify-center gap-2">
					<span class="text-3xl font-semibold text-text-default sm:text-4xl">
						{question.word.lemma}
					</span>
					{#if onSpeak}
						<button
							type="button"
							onclick={() => onSpeak?.(question.word.lemma)}
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
				<p class="mt-1 text-sm text-text-subtitle">{question.word.translation}</p>
			</div>

			<!-- STEP 1: PARADIGM IDENTIFICATION -->
			{#if currentStep === 'paradigm'}
				<div class="flex flex-col items-center gap-4">
					<p class="text-sm font-semibold text-text-default">
						What paradigm does this word follow?
					</p>

					{#if !paradigmSubmitted}
						<!-- Phase 1: Gender selection -->
						<div class="flex flex-col items-center gap-2">
							<p class="text-xs font-medium text-text-subtitle">Choose gender</p>
							<div role="group" aria-label="Select gender" class="flex gap-2 sm:gap-3">
								{#each GENDER_OPTIONS as g (g.value)}
									<button
										type="button"
										onclick={() => {
											selectedGender = g.value;
											selectedParadigm = '';
										}}
										class="rounded-xl border-2 px-5 py-2.5 text-sm font-medium transition-colors {selectedGender ===
										g.value
											? 'border-emphasis bg-emphasis text-text-inverted'
											: 'border-card-stroke bg-card-bg text-text-default hover:border-emphasis/50'}"
									>
										{g.label}
									</button>
								{/each}
							</div>
						</div>

						<!-- Phase 2: Paradigm selection (shown after gender is picked) -->
						{#if selectedGender}
							<div class="flex w-full max-w-sm flex-col items-center gap-2">
								<p class="text-xs font-medium text-text-subtitle">Choose paradigm</p>
								<div role="group" aria-label="Select paradigm" class="flex w-full flex-col gap-2">
									{#each filteredParadigms as p (p.id)}
										<button
											type="button"
											onclick={() => {
												if (isParadigm(p.id)) {
													selectedParadigm = p.id;
													handleParadigmSubmit();
												}
											}}
											class="w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-colors {selectedParadigm ===
											p.id
												? 'border-emphasis bg-emphasis text-text-inverted'
												: 'border-card-stroke bg-card-bg text-text-default hover:border-emphasis/50'}"
										>
											{p.exampleLemma}
											<span
												class="font-normal {selectedParadigm === p.id
													? 'text-text-inverted/70'
													: 'text-text-subtitle'}">{shortParadigmName(p.name)}</span
											>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					{:else}
						<!-- Show selected answer (disabled buttons) -->
						<div class="flex gap-2 sm:gap-3">
							{#each GENDER_OPTIONS as g (g.value)}
								<div
									class="rounded-xl border-2 px-5 py-2.5 text-sm font-medium {selectedGender ===
									g.value
										? 'border-emphasis bg-emphasis text-text-inverted'
										: 'border-card-stroke bg-card-bg text-text-subtitle opacity-40'}"
								>
									{g.label}
								</div>
							{/each}
						</div>

						<div class="flex w-full max-w-sm flex-col gap-2">
							{#each filteredParadigms as p (p.id)}
								<div
									class="w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold {selectedParadigm ===
									p.id
										? paradigmCorrect
											? 'border-positive-stroke bg-positive-background text-positive-stroke'
											: 'border-negative-stroke bg-negative-background text-negative-stroke'
										: 'border-card-stroke bg-card-bg text-text-subtitle opacity-40'}"
								>
									{p.exampleLemma}
									<span class="font-normal">{shortParadigmName(p.name)}</span>
								</div>
							{/each}
						</div>

						<!-- Paradigm feedback -->
						<div
							class="w-full max-w-sm rounded-[24px] border-2 p-4 text-center {paradigmCorrect
								? 'border-positive-stroke bg-positive-background'
								: 'border-negative-stroke bg-negative-background'}"
						>
							{#if paradigmCorrect}
								<p class="text-sm font-semibold text-positive-stroke">Correct!</p>
								<p class="mt-1 text-xs text-text-subtitle">
									{paradigmExplanation ??
										`${question.word.lemma} follows the ${correctParadigmEntry?.exampleLemma} paradigm (${correctParadigmEntry?.name})`}
								</p>
							{:else}
								<p class="text-sm font-semibold text-negative-stroke">
									Not quite — it's the <span class="font-bold"
										>{correctParadigmEntry?.exampleLemma}</span
									> paradigm
								</p>
								{#if paradigmExplanation}
									<p class="mt-1 text-xs text-text-subtitle">
										{paradigmExplanation}
									</p>
								{:else}
									<p class="mt-1 text-xs text-text-subtitle">
										{correctParadigmEntry?.name}
									</p>
								{/if}
							{/if}
						</div>

						<button
							type="button"
							onclick={advanceFromParadigm}
							class="w-full max-w-sm rounded-[48px] bg-emphasis py-3 text-base font-semibold text-text-inverted transition-opacity hover:opacity-90 active:opacity-80"
						>
							Continue &rarr;
						</button>
					{/if}
				</div>

				<!-- STEP 2: CASE IDENTIFICATION -->
			{:else if currentStep === 'case'}
				<div class="flex flex-col items-center gap-4">
					<!-- Sentence with blank -->
					<p class="text-lg font-normal leading-relaxed text-emphasis sm:text-xl">
						{sentenceParts.before}<span
							class="mx-0.5 inline-block border-b-2 border-dashed border-text-subtitle px-6"
							>&nbsp;&nbsp;&nbsp;&nbsp;</span
						>{sentenceParts.after}
					</p>

					<p class="text-sm font-semibold text-text-default">What case is needed?</p>

					<div
						role="group"
						aria-label="Select the correct case"
						class="flex flex-wrap justify-center gap-2 sm:gap-3"
					>
						{#each ALL_CASES as caseKey (caseKey)}
							{@const isCorrect = caseSubmitted && caseKey === question.correctCase}
							{@const isIncorrect =
								caseSubmitted && caseKey === selectedCase && caseKey !== question.correctCase}
							{@const isDimmed =
								caseSubmitted && caseKey !== question.correctCase && caseKey !== selectedCase}
							<CaseAnswerOption
								case_={caseKey}
								correct={isCorrect}
								incorrect={isIncorrect}
								dimmed={isDimmed}
								disabled={caseSubmitted}
								onclick={() => handleCaseSelect(caseKey)}
							/>
						{/each}
					</div>

					{#if caseSubmitted}
						<div
							class="w-full max-w-sm rounded-[24px] border-2 p-4 text-center {caseCorrect
								? 'border-positive-stroke bg-positive-background'
								: 'border-negative-stroke bg-negative-background'}"
						>
							{#if caseCorrect}
								<p class="text-sm font-semibold text-positive-stroke">Correct!</p>
							{:else}
								<p class="text-sm font-semibold text-negative-stroke">
									The correct case is <span class="font-bold"
										>{CASE_LABELS[question.correctCase]}</span
									>
								</p>
							{/if}
							{#if question.template.why}
								<p class="mt-1 text-xs text-text-subtitle">{question.template.why}</p>
							{/if}
						</div>

						<button
							type="button"
							onclick={advanceFromCase}
							class="w-full max-w-sm rounded-[48px] bg-emphasis py-3 text-base font-semibold text-text-inverted transition-opacity hover:opacity-90 active:opacity-80"
						>
							Continue &rarr;
						</button>
					{/if}
				</div>

				<!-- STEP 3: FORM PRODUCTION -->
			{:else if currentStep === 'form'}
				<div class="flex flex-col items-center gap-4">
					<!-- Context badges -->
					<div class="flex flex-wrap items-center justify-center gap-2">
						<span
							class="rounded-full bg-shaded-background px-2.5 py-0.5 text-xs font-medium text-text-subtitle"
						>
							{correctParadigmEntry?.exampleLemma} paradigm
						</span>
						<CaseBadge case_={question.correctCase} size="sm" />
						{#if question.number === 'pl'}
							<span
								class="rounded-full bg-shaded-background px-2.5 py-0.5 text-xs font-normal text-text-subtitle"
							>
								plural
							</span>
						{/if}
					</div>

					<!-- Sentence with blank -->
					<p class="text-lg font-normal leading-relaxed text-emphasis sm:text-xl">
						{sentenceParts.before}<span
							class="mx-0.5 inline-block border-b-2 border-dashed border-text-subtitle px-6"
							>&nbsp;&nbsp;&nbsp;&nbsp;</span
						>{sentenceParts.after}
					</p>

					<p class="text-sm text-text-subtitle">{question.word.translation}</p>

					<!-- Text input -->
					<div class="flex w-full max-w-md flex-col gap-3">
						<input
							bind:this={formInputEl}
							bind:value={formInput}
							onkeydown={handleFormKeydown}
							disabled={formSubmitted}
							type="text"
							autocomplete="off"
							autocapitalize="none"
							spellcheck="false"
							placeholder="Type the correct form..."
							class="w-full rounded-[24px] border-2 px-4 py-3 text-center text-lg font-semibold transition-colors placeholder:text-text-subtitle/50 focus:border-emphasis focus:outline-none {formSubmitted &&
							!formCorrect
								? 'border-negative-stroke bg-negative-background text-negative-stroke'
								: 'border-card-stroke bg-card-bg text-text-default disabled:opacity-60'}"
						/>

						{#if !formSubmitted}
							<DiacriticsBar inputEl={formInputEl} inputValue={formInput} />
						{/if}
					</div>

					{#if !formSubmitted}
						<button
							type="button"
							onclick={handleFormSubmit}
							disabled={formInput.trim() === ''}
							class="w-full max-w-md rounded-[48px] bg-emphasis py-3 text-base font-semibold text-text-inverted transition-opacity hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Check
						</button>
					{:else}
						<!-- Form feedback -->
						{#if formCorrect}
							<div
								class="w-full max-w-md rounded-[24px] border-2 border-positive-stroke bg-positive-background p-4 text-center"
							>
								<p class="text-sm font-semibold text-positive-stroke">
									{#if formNearMiss}
										Correct (watch the diacritics): <span class="font-semibold"
											>{question.correctForm}</span
										>
									{:else}
										Correct!
									{/if}
								</p>
							</div>
						{:else}
							<div class="flex w-full max-w-md flex-col gap-3">
								<CorrectAnswerPanel
									correctAnswer={question.correctForm}
									nominative={question.word.lemma}
									targetForm={question.correctForm}
									case_={question.correctCase}
									drillType="sentence_fill_in"
									nearMiss={formNearMiss}
									questionNumber={question.number}
									number_={question.number}
									{templateWhy}
									{whyNote}
									onSpeak={onSpeak ?? undefined}
								/>
							</div>
						{/if}

						{#if formCorrect && whyNote}
							<div class="w-full max-w-md border-t border-darker-subtitle/30 pt-3">
								<div class="mb-2 flex items-center justify-center gap-1.5">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 20 20"
										fill="currentColor"
										class="h-3.5 w-3.5 text-darker-subtitle"
									>
										<path
											d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.75.75h2.5a.75.75 0 00.75-.75v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.226 1.483 9.066 9.066 0 002.726 0 .75.75 0 00-.226-1.483 7.563 7.563 0 01-2.274 0z"
										/>
									</svg>
									<p class="text-xs font-semibold text-darker-subtitle">Why?</p>
								</div>
								{#if templateWhy}
									<p class="text-center text-sm leading-relaxed text-darker-subtitle">
										{templateWhy}
									</p>
								{/if}
								<p
									class="text-center text-sm leading-relaxed {templateWhy
										? 'mt-1.5'
										: ''} text-text-subtitle"
								>
									{whyNote}
								</p>
							</div>

							<FeedbackDeclensionChart
								lemma={question.word.lemma}
								case_={question.correctCase}
								number_={question.number}
							/>
						{/if}

						<button
							type="button"
							onclick={advanceFromForm}
							class="w-full max-w-md rounded-[48px] bg-emphasis py-3 text-base font-semibold text-text-inverted transition-opacity hover:opacity-90 active:opacity-80"
						>
							See Summary &rarr;
						</button>
					{/if}
				</div>

				<!-- SUMMARY -->
			{:else if currentStep === 'summary'}
				<div class="flex flex-col items-center gap-4">
					<p class="text-sm font-semibold text-text-default">Summary</p>

					<!-- Full sentence revealed -->
					<p class="text-lg font-normal leading-relaxed text-emphasis sm:text-xl">
						{sentenceParts.before}<span
							class="font-semibold {CASE_COLORS[question.correctCase].text}"
							>{question.correctForm}</span
						>{sentenceParts.after}
					</p>

					<!-- Step results -->
					<div class="flex w-full max-w-sm flex-col gap-2">
						<!-- Paradigm -->
						<div
							class="flex items-center gap-3 rounded-[24px] border px-4 py-3 {paradigmCorrect
								? 'border-positive-stroke/30 bg-positive-background/50'
								: 'border-negative-stroke/30 bg-negative-background/50'}"
						>
							{#if paradigmCorrect}
								<svg
									width="20"
									height="20"
									viewBox="0 0 20 20"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<circle cx="10" cy="10" r="10" fill="#22c55e" />
									<path
										d="M6 10.5l2.5 2.5L14 7.5"
										stroke="white"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<svg
									width="20"
									height="20"
									viewBox="0 0 20 20"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<circle cx="10" cy="10" r="10" fill="#ef4444" />
									<path
										d="M7 7l6 6M13 7l-6 6"
										stroke="white"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{/if}
							<div class="flex-1">
								<p class="text-xs font-semibold text-text-subtitle">Paradigm</p>
								<p class="text-sm text-text-default">
									{correctParadigmEntry?.exampleLemma} ({correctParadigmEntry?.name})
								</p>
								{#if !paradigmCorrect && selectedParadigm}
									{@const userEntry = paradigms.find((p) => p.id === selectedParadigm)}
									<p class="text-xs text-negative-stroke">
										You chose: {userEntry?.exampleLemma} ({userEntry?.name})
									</p>
								{/if}
							</div>
						</div>

						<!-- Case (if shown) -->
						{#if question.showCaseStep}
							<div
								class="flex items-center gap-3 rounded-[24px] border px-4 py-3 {caseCorrect
									? 'border-positive-stroke/30 bg-positive-background/50'
									: 'border-negative-stroke/30 bg-negative-background/50'}"
							>
								{#if caseCorrect}
									<svg
										width="20"
										height="20"
										viewBox="0 0 20 20"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<circle cx="10" cy="10" r="10" fill="#22c55e" />
										<path
											d="M6 10.5l2.5 2.5L14 7.5"
											stroke="white"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								{:else}
									<svg
										width="20"
										height="20"
										viewBox="0 0 20 20"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<circle cx="10" cy="10" r="10" fill="#ef4444" />
										<path
											d="M7 7l6 6M13 7l-6 6"
											stroke="white"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								{/if}
								<div class="flex-1">
									<p class="text-xs font-semibold text-text-subtitle">Case</p>
									<p class="text-sm text-text-default">
										{CASE_NUMBER[question.correctCase]}. {CASE_LABELS[question.correctCase]}
									</p>
									{#if !caseCorrect && selectedCase}
										<p class="text-xs text-negative-stroke">
											You chose: {CASE_NUMBER[selectedCase]}. {CASE_LABELS[selectedCase]}
										</p>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Form -->
						<div
							class="flex items-center gap-3 rounded-[24px] border px-4 py-3 {formCorrect
								? 'border-positive-stroke/30 bg-positive-background/50'
								: 'border-negative-stroke/30 bg-negative-background/50'}"
						>
							{#if formCorrect}
								<svg
									width="20"
									height="20"
									viewBox="0 0 20 20"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<circle cx="10" cy="10" r="10" fill="#22c55e" />
									<path
										d="M6 10.5l2.5 2.5L14 7.5"
										stroke="white"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{:else}
								<svg
									width="20"
									height="20"
									viewBox="0 0 20 20"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
								>
									<circle cx="10" cy="10" r="10" fill="#ef4444" />
									<path
										d="M7 7l6 6M13 7l-6 6"
										stroke="white"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							{/if}
							<div class="flex-1">
								<p class="text-xs font-semibold text-text-subtitle">Declined Form</p>
								<p class="text-sm text-text-default">
									{question.correctForm}
								</p>
								{#if !formCorrect && formInput}
									<p class="text-xs text-negative-stroke">
										You typed: {formInput}
									</p>
								{/if}
							</div>
						</div>
					</div>

					<button
						type="button"
						onclick={handleFinalAdvance}
						class="w-full max-w-sm rounded-[48px] bg-emphasis py-3.5 text-lg font-semibold text-text-inverted transition-opacity hover:opacity-90 active:opacity-80"
					>
						Next &rarr;
					</button>
				</div>
			{/if}
		</div>
	{/key}
</div>
