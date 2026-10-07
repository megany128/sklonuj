<script lang="ts">
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import type { DrillQuestion, DrillResult, DrillType, Case, Paradigm } from '$lib/types';
	import {
		ALL_CASES,
		CASE_LABELS,
		CASE_INDEX,
		CASE_COLORS,
		CASE_HEX,
		CASE_NUMBER,
		isCase
	} from '$lib/types';
	import { applyPrepositionVoicing, loadWordBank } from '$lib/engine/drill';
	import { getAdjectiveGenderKey } from '$lib/engine/adjective-drill';
	import { playClinkSound } from '$lib/audio';
	import DiacriticsBar from './DiacriticsBar.svelte';
	import CaseAnswerOption from '$lib/components/ui/CaseAnswerOption.svelte';

	import DottedUnderline from '$lib/components/ui/DottedUnderline.svelte';
	import ReportMenu from '$lib/components/ReportMenu.svelte';
	import FeedbackVerdict from '$lib/components/ui/FeedbackVerdict.svelte';
	import SubmittedAnswer from '$lib/components/ui/SubmittedAnswer.svelte';
	import AnswerDiff from '$lib/components/ui/AnswerDiff.svelte';
	import CaseChip from '$lib/components/ui/CaseChip.svelte';
	import WhyNote from '$lib/components/ui/WhyNote.svelte';
	import CorrectAnswerPanel from '$lib/components/ui/CorrectAnswerPanel.svelte';
	import FeedbackAdjectiveDeclensionChart from '$lib/components/ui/FeedbackAdjectiveDeclensionChart.svelte';
	import FeedbackPronounDeclensionChart from '$lib/components/ui/FeedbackPronounDeclensionChart.svelte';
	import FeedbackDeclensionChart from '$lib/components/ui/FeedbackDeclensionChart.svelte';
	import NextButton from '$lib/components/ui/NextButton.svelte';
	import RetypePractice from '$lib/components/ui/RetypePractice.svelte';
	import { pluralizeTranslation } from '$lib/utils/pluralize-en';
	import { drillHints, findTrigger } from '$lib/utils/drill-hints';
	import { explainWrongEnding } from '$lib/utils/wrong-ending';

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
		soundEnabled = true,
		skeletonDrillType = null,
		retry = false,
		caseKnown = false
	}: {
		question: DrillQuestion | null;
		loading?: boolean;
		/** Drill type the next question is known to have (settings pin a single
		 * type); lets the loading skeleton match that card's layout. */
		skeletonDrillType?: DrillType | null;
		result: DrillResult | null;
		/** `hinted` is set when the learner opened a hint before answering. */
		onSubmit: (answer: string, meta?: { hinted: boolean }) => void;
		onSpeak: ((text: string) => void) | null;
		selectedCases: Case[];
		paradigmNotes?: Record<string, string> | null;
		onWordClick?: ((lemma: string) => void) | null;
		streak?: number;
		soundEnabled?: boolean;
		/** This question is a re-ask of one missed earlier in the session. */
		retry?: boolean;
		/** Only one case is in play, so hints skip naming it. */
		caseKnown?: boolean;
	} = $props();

	let userInput = $state('');
	/** Empty input submits as a skip; the button label and hint follow it. */
	let isSkip = $derived(userInput.trim() === '');
	let submitted = $state(false);
	let inputEl: HTMLInputElement | undefined = $state(undefined);
	let showFeedback = $state(false);

	/** Hints opened so far for this question; any at all marks the answer hinted. */
	let hintsShown = $state(0);
	function modelWord(paradigm: Paradigm) {
		return loadWordBank().find((w) => w.lemma === paradigm);
	}
	let hints = $derived(question ? drillHints(question, modelWord, caseKnown) : []);
	let openHints = $derived(hints.slice(0, hintsShown));
	/** Highlight the cue word in the sentence once it's been hinted or answered. */
	let showTrigger = $derived(
		submitted || openHints.some((h) => h.kind === 'clue' || h.kind === 'case')
	);

	function showHint(): void {
		if (submitted || hintsShown >= hints.length) return;
		hintsShown++;
		inputEl?.focus();
	}

	const MAX_CASE_OPTIONS = 3;

	// Simple seeded PRNG (mulberry32) for deterministic shuffle
	function mulberry32(seed: number): () => number {
		let s = seed | 0;
		return () => {
			s = (s + 0x6d2b79f5) | 0;
			let t = Math.imul(s ^ (s >>> 15), 1 | s);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	/** Single-shot seeded random: takes a seed integer, returns float in [0, 1) */
	function seededRandom(seed: number): number {
		let s = seed | 0;
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function hashString(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = (hash * 31 + str.charCodeAt(i)) | 0;
		}
		return hash;
	}

	// For case identification, pick max 3 options: correct answer + random distractors
	let caseOptions = $derived.by(() => {
		if (!question || question.drillType !== 'case_identification') return selectedCases;
		if (!isCase(question.correctAnswer)) return selectedCases;
		const correctCase = question.correctAnswer;
		if (selectedCases.length <= MAX_CASE_OPTIONS) return selectedCases;
		const distractors = selectedCases.filter((c) => c !== correctCase);
		// Shuffle distractors deterministically based on stable question data
		const seed = hashString(question.correctAnswer + question.word.lemma + question.template.id);
		const rng = mulberry32(seed);
		const shuffled = [...distractors].sort(() => rng() - 0.5);
		const picked = shuffled.slice(0, MAX_CASE_OPTIONS - 1);
		// Combine correct + distractors and sort by original order in selectedCases
		const result = [correctCase, ...picked];
		return result.sort((a, b) => CASE_NUMBER[a] - CASE_NUMBER[b]);
	});

	let streakParticles = $derived(
		Array.from({ length: streak >= 25 ? 10 : streak >= 10 ? 8 : 4 }, (_, i) => ({
			left: 10 + seededRandom(streak * 100 + i * 37) * 80,
			bottom: 20 + seededRandom(streak * 100 + i * 73 + 1000) * 40
		}))
	);

	let isPivo = $derived(
		question?.word.lemma === 'pivo' &&
			question?.wordCategory !== 'adjective' &&
			question?.wordCategory !== 'pronoun'
	);
	let cardEl: HTMLDivElement | undefined = $state(undefined);
	let pivoCursorEl: HTMLDivElement | undefined = $state(undefined);
	let pivoVisible = $state(false);

	function hideSystemCursor(node: HTMLElement) {
		node.style.setProperty('cursor', 'none', 'important');
		for (const el of node.querySelectorAll('*')) {
			if (el instanceof HTMLElement) {
				el.style.setProperty('cursor', 'none', 'important');
			}
		}
	}

	function restoreSystemCursor(node: HTMLElement) {
		node.style.removeProperty('cursor');
		for (const el of node.querySelectorAll('*')) {
			if (el instanceof HTMLElement) {
				el.style.removeProperty('cursor');
			}
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
		trackTimeout(() => {
			clinkAnimating = false;
		}, 800);
	}

	let showCheers = $state(false);
	let canAdvance = $state(false);

	// Track active timers and listeners for cleanup
	let activeTimers: ReturnType<typeof setTimeout>[] = [];
	let pendingKeyUpHandler: (() => void) | null = null;

	function trackTimeout(fn: () => void, ms: number): void {
		const id = setTimeout(() => {
			activeTimers = activeTimers.filter((t) => t !== id);
			fn();
		}, ms);
		activeTimers.push(id);
	}

	// Clean up all timers and listeners on component teardown
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

	function triggerCheers() {
		showCheers = true;
		trackTimeout(() => {
			showCheers = false;
		}, 1000);
	}

	let userTyped = $derived(result?.userAnswer.trim() ?? '');
	let wasSkipped = $derived(
		result !== null &&
			!result.correct &&
			question?.drillType !== 'case_identification' &&
			(result.skipped === true || userTyped === '')
	);
	/** The accepted form the answer was graded against: the variant it matched, else the primary. */
	let gradedForm = $derived(result?.matchedForm ?? question?.correctAnswer ?? '');
	let fieldTone = $derived<'correct' | 'wrong' | 'almost' | 'skipped'>(
		wasSkipped ? 'skipped' : result?.correct ? 'correct' : result?.nearMiss ? 'almost' : 'wrong'
	);

	/** "plural" only where it disambiguates — not for plural-only pronouns like "vy". */
	function showPlural(q: DrillQuestion, n: DrillQuestion['number']): boolean {
		return n === 'pl' && !(q.wordCategory === 'pronoun' && q.pronoun?.forms.sg === null);
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
			hintsShown = 0;
			showCheers = false;
			canAdvance = false;
			requestAnimationFrame(() => {
				inputEl?.focus();
			});
		}
	});

	/**
	 * Submit the typed answer, or skip when the input is empty. Reached from a
	 * physical Enter (keydown) and from the answer form's submit event — the
	 * latter is what mobile keyboards actually fire (Android IMEs often report
	 * a composition keydown rather than "Enter"), and what the Check button uses.
	 */
	function submitAnswer(fromKeyboard: boolean) {
		if (submitted || !question || question.drillType === 'case_identification') return;
		if (userInput.trim() === '') {
			// Empty input means "I'm stuck": open the next hint, and skip only
			// once there are none left.
			if (hintsShown < hints.length) showHint();
			else skip(fromKeyboard);
		} else {
			handleSubmit(fromKeyboard);
		}
	}

	function skip(fromKeyboard = false) {
		if (submitted || !question) return;
		submitted = true;
		showFeedback = true;
		onSubmit('__skip__');
		enableAdvance(fromKeyboard);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			// Handle it here so the form's implicit submission doesn't run it twice.
			e.preventDefault();
			// A held Enter must not run through every hint and then skip.
			if (e.repeat) return;
			submitAnswer(true);
		}
	}

	function handleAnswerFormSubmit(e: SubmitEvent) {
		e.preventDefault();
		submitAnswer(false);
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (!question) return;

		// Don't intercept if focus is inside a modal or other overlay
		const target = e.target instanceof HTMLElement ? e.target : null;
		if (target?.closest('[data-modal]')) return;

		// Don't intercept typing in any text field: the answer input handles its
		// own Enter, and the retype box and lookup search need Space and Enter.
		if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

		// Advance on Enter or Space after submission (only on fresh keypresses, not repeats)
		if (submitted && canAdvance && !e.repeat && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onSubmit('__advance__');
			return;
		}

		// Case identification has no text box, so Enter before answering is the
		// same "I'm stuck" signal as an empty box in typed drills.
		if (
			!submitted &&
			!e.repeat &&
			e.key === 'Enter' &&
			question.drillType === 'case_identification'
		) {
			e.preventDefault();
			showHint();
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
					handleCaseSelect(matchedCase, true);
				}
			}
		}
	}

	function enableAdvance(fromKeyboard = false) {
		if (fromKeyboard) {
			// Wait for the submitting key to be fully released before allowing advance
			// This prevents the same keypress from both submitting and advancing
			if (pendingKeyUpHandler) {
				window.removeEventListener('keyup', pendingKeyUpHandler);
			}
			function onKeyUp() {
				pendingKeyUpHandler = null;
				canAdvance = true;
			}
			pendingKeyUpHandler = onKeyUp;
			window.addEventListener('keyup', onKeyUp, { once: true });
		} else {
			// Mouse click: no key to wait for, allow advance immediately
			canAdvance = true;
		}
	}

	function handleSubmit(fromKeyboard = false) {
		if (!question || submitted || userInput.trim() === '') return;
		submitted = true;
		showFeedback = true;
		onSubmit(userInput, { hinted: hintsShown > 0 });
		enableAdvance(fromKeyboard);
	}

	function handleCaseSelect(caseKey: Case, fromKeyboard = false) {
		if (!question || submitted) return;
		submitted = true;
		showFeedback = true;
		onSubmit(caseKey, { hinted: hintsShown > 0 });
		enableAdvance(fromKeyboard);
	}

	/** Forms the retype box accepts: the answer shown, plus any accepted variant. */
	function retypeForms(q: DrillQuestion): string[] {
		const forms = [q.correctAnswer.split('/')[0], ...(q.acceptedAnswers ?? [])];
		if (q.wordCategory !== 'adjective' && q.wordCategory !== 'pronoun') {
			forms.push(...(q.word.variantForms?.[q.number]?.[CASE_INDEX[q.case]] ?? []));
		}
		return forms;
	}

	function getPronounForm(q: DrillQuestion): string {
		if (!q.pronoun) return '';
		const caseForms = q.number === 'sg' ? q.pronoun.forms.sg : q.pronoun.forms.pl;
		if (!caseForms) return '';
		const form = caseForms[q.case];
		// Respect the expectedFormContext: return the form matching the drill context
		const ctx = q.expectedFormContext ?? 'either';
		if (ctx === 'bare' && form.bare) return form.bare.split('/')[0];
		if (ctx === 'prep' && form.prep) return form.prep.split('/')[0];
		// 'either' or fallback: prefer prep, then bare
		return form.prep.split('/')[0] || form.bare.split('/')[0] || '';
	}

	function sentenceWithBlankAndLemma(q: DrillQuestion): { before: string; after: string } {
		const form =
			q.wordCategory === 'adjective'
				? q.correctAnswer
				: q.wordCategory === 'pronoun'
					? getPronounForm(q)
					: q.word.forms[q.number][CASE_INDEX[q.case]];
		const voiced = applyPrepositionVoicing(q.template.template, form);
		const parts = voiced.split('___');
		return {
			before: parts[0] ?? '',
			after: parts[1] ?? ''
		};
	}

	/** Smart number display: show "plural" only when relevant.
	 *  Skip for pronouns that only exist in one number (e.g. "vy" is always plural). */
	function formatCasePrompt(q: DrillQuestion): { caseName: string; isPlural: boolean } {
		let isPlural = q.number === 'pl';
		if (isPlural && q.wordCategory === 'pronoun' && q.pronoun?.forms.sg === null) {
			isPlural = false;
		}
		return { caseName: CASE_LABELS[q.case], isPlural };
	}

	// Speaker buttons always pronounce a single word — lemma before the user
	// submits, declined form after. Sentences are never spoken; we only
	// pre-generate single-word MP3s and mixing MP3 + Web Speech sentence reads
	// creates jarring voice changes. For case_identification nouns we read
	// the nominative in the drill's number (plody for plural) so the audio
	// matches what's shown in parens.
	function speakTargetText(q: DrillQuestion): string {
		const declinedForm =
			q.wordCategory === 'adjective'
				? q.correctAnswer
				: q.wordCategory === 'pronoun'
					? getPronounForm(q)
					: q.word.forms[q.number][CASE_INDEX[q.case]];
		if (submitted) {
			return declinedForm;
		}
		if (q.drillType === 'case_identification' && q.wordCategory === 'noun') {
			return q.word.forms[q.number][0];
		}
		return q.wordCategory === 'adjective'
			? (q.adjective?.lemma ?? q.word.lemma)
			: q.wordCategory === 'pronoun'
				? (q.pronoun?.lemma ?? '')
				: q.word.lemma;
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#snippet hintButton()}
	{#if hintsShown < hints.length}
		<button
			type="button"
			onclick={showHint}
			class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-darker-subtitle transition-colors hover:bg-shaded-background hover:text-text-default"
		>
			<Lightbulb class="size-3.5" aria-hidden="true" />
			{hintsShown === 0 ? 'Hint' : 'Another hint'}
		</button>
	{/if}
{/snippet}

<!-- Sentence text with the template's cue word (do, na, s …) underlined. Before
     the answer it's neutral so it doesn't give the case away. A bottom border
     (not text-decoration) so it lines up with the answer slot's border. -->
{#snippet cueText(text: string, trigger: string, case_: Case)}{@const at = showTrigger
		? findTrigger(text, trigger)
		: null}{#if at}{text.slice(0, at.start)}<span
			class="inline-block border-b-2 font-semibold {submitted
				? CASE_COLORS[case_].text
				: 'border-emphasis'}"
			style={submitted ? `border-bottom-color: ${CASE_HEX[case_]}` : undefined}
			>{text.slice(at.start, at.end)}</span
		>{text.slice(at.end)}{:else}{text}{/if}{/snippet}

<div class="w-full">
	{#if question}
		{#key question}
			<div
				bind:this={cardEl}
				class="drill-fade-enter relative flex flex-col gap-4 rounded-[24px] border-2 sm:gap-6 sm:rounded-[40px] {isPivo
					? 'border-easter-egg-border pivo-glow'
					: 'border-card-stroke'} {streak >= 10 && showFeedback && result?.correct
					? 'streak-glow'
					: ''} bg-card-bg p-5 sm:p-8 md:p-10"
				role="region"
				aria-label="Drill"
			>
				<div class="absolute right-3 top-3 z-10 sm:right-4 sm:top-4">
					<ReportMenu {question} {result} {paradigmNotes} drillType={question?.drillType} />
				</div>
				<!-- Prompt -->
				<div class="text-center">
					{#if retry}
						<p
							class="mb-3 inline-flex items-center gap-1.5 rounded-full bg-shaded-background px-2.5 py-1 text-xs font-semibold text-darker-subtitle"
						>
							<RotateCcw class="size-3.5" aria-hidden="true" />
							Second try · you missed this earlier
						</p>
					{/if}
					{#if question.drillType === 'form_production'}
						{@const prompt = formatCasePrompt(question)}
						{@const displayLemma =
							question.wordCategory === 'adjective' && question.adjective
								? question.adjective.lemma
								: question.wordCategory === 'pronoun'
									? (question.pronoun?.lemma ?? question.word.lemma)
									: question.word.lemma}
						<p class="-ml-3 text-center text-base font-medium text-text-default">
							<span
								class="mr-1 inline-flex size-5 translate-y-[1px] items-center justify-center rounded-full text-xs font-bold text-white"
								style="background-color: {CASE_HEX[question.case]}"
								>{CASE_NUMBER[question.case]}</span
							><span class="{CASE_COLORS[question.case].text} font-semibold">{prompt.caseName}</span
							>{#if prompt.isPlural}
								<span class="font-bold {CASE_COLORS[question.case].text}">&nbsp;plural</span>
							{/if} of
						</p>
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
											onWordClick?.(
												question!.wordCategory === 'adjective' && question!.adjective
													? question!.adjective.lemma
													: question!.wordCategory === 'pronoun'
														? (question!.pronoun?.lemma ?? question!.word.lemma)
														: question!.word.lemma
											);
											if (isPivo) triggerCheers();
										}}
										class="cursor-pointer text-3xl font-semibold sm:text-4xl {CASE_COLORS[
											question.case
										].text} transition-opacity hover:opacity-70"
									>
										{displayLemma}
										<DottedUnderline
											colorClass={CASE_COLORS[question.case].bg}
											word={displayLemma}
											scale={1.4}
										/>
									</button>
								{:else}
									<span
										class="text-3xl font-semibold sm:text-4xl {CASE_COLORS[question.case].text}"
									>
										{displayLemma}
									</span>
									<DottedUnderline
										colorClass={CASE_COLORS[question.case].bg}
										word={displayLemma}
										scale={1.4}
									/>
								{/if}
							</div>
							{#if question.wordCategory === 'adjective' && question.adjective}
								<span class="text-lg font-normal text-text-subtitle sm:text-xl">
									{question.word.lemma}
								</span>
							{/if}
							{#if onSpeak}
								<button
									type="button"
									onclick={() =>
										onSpeak(
											question!.wordCategory === 'adjective' && question!.adjective
												? question!.adjective.lemma
												: question!.wordCategory === 'pronoun'
													? (question!.pronoun?.lemma ?? question!.word.lemma)
													: question!.word.lemma
										)}
									class="flex size-8 shrink-0 items-center justify-center rounded-full bg-shaded-background text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
									aria-label="Listen to pronunciation"
								>
									<Volume2 class="size-4" aria-hidden="true" />
								</button>
							{/if}
						</div>
						<p class="mt-2 text-sm text-text-subtitle">
							{question.wordCategory === 'adjective' && question.adjective
								? question.adjective.translation
								: question.wordCategory === 'pronoun'
									? (question.pronoun?.translation ?? question.word.translation)
									: question.word.translation}
						</p>
					{:else if question.drillType === 'case_identification'}
						{@const caseIdLemma =
							question.wordCategory === 'pronoun'
								? (question.pronoun?.lemma ?? question.word.lemma)
								: question.word.forms[question.number][0]}
						<p class="text-sm text-text-subtitle">Which case?</p>
						{@const parts = sentenceWithBlankAndLemma(question)}
						<p class="mt-3 text-lg font-normal leading-relaxed text-emphasis sm:text-xl">
							{@render cueText(parts.before, question.template.trigger, question.case)}<span
								class="mx-0.5 inline-block rounded bg-shaded-background px-2 py-0.5 font-semibold text-emphasis"
								>{#if onWordClick}<button
										type="button"
										onclick={() =>
											onWordClick?.(
												question!.wordCategory === 'pronoun'
													? (question!.pronoun?.lemma ?? question!.word.lemma)
													: question!.word.lemma
											)}
										class="cursor-pointer underline decoration-text-subtitle decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
										>({caseIdLemma})</button
									>{:else}({caseIdLemma}){/if}</span
							>{parts.after}{#if onSpeak}<button
									type="button"
									onclick={() => onSpeak(speakTargetText(question!))}
									class="ml-3 inline-flex size-8 items-center justify-center rounded-full bg-shaded-background align-middle text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
									aria-label="Listen to pronunciation"
									><Volume2 class="size-4" aria-hidden="true" /></button
								>{/if}
						</p>
					{:else}
						{#if question.wordCategory === 'adjective' && question.adjective}
							<div class="flex items-center justify-center gap-2">
								{#if onWordClick}
									<button
										type="button"
										onclick={() => onWordClick?.(question!.adjective!.lemma)}
										class="cursor-pointer text-lg font-semibold text-emphasis underline decoration-text-subtitle decoration-dotted underline-offset-2 transition-opacity hover:opacity-70 sm:text-xl"
									>
										{question.adjective.lemma}
									</button>
								{:else}
									<p class="text-lg font-semibold text-emphasis sm:text-xl">
										{question.adjective.lemma}
									</p>
								{/if}
								{#if question.number === 'pl'}
									<span
										class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
										>plural</span
									>
								{/if}
							</div>
							<p class="mt-0.5 text-sm text-text-subtitle">
								{question.adjective.translation}
							</p>
						{:else}
							{@const headerLemma =
								question.wordCategory === 'pronoun'
									? (question.pronoun?.lemma ?? question.word.lemma)
									: question.word.lemma}
							{@const headerTranslation =
								question.wordCategory === 'pronoun'
									? (question.pronoun?.translation ?? question.word.translation)
									: question.word.translation}
							<div class="flex items-center justify-center gap-2">
								{#if onWordClick}
									<button
										type="button"
										onclick={() => onWordClick?.(headerLemma)}
										class="cursor-pointer text-lg font-semibold text-emphasis underline decoration-text-subtitle decoration-dotted underline-offset-2 transition-opacity hover:opacity-70 sm:text-xl"
									>
										{headerLemma}
									</button>
								{:else}
									<p class="text-lg font-semibold text-emphasis sm:text-xl">
										{headerLemma}
									</p>
								{/if}
								{#if question.number === 'pl' && !(question.wordCategory === 'pronoun' && question.pronoun?.forms.sg === null)}
									<span
										class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
										>plural</span
									>
								{/if}
								{#if question.wordCategory === 'pronoun' && question.expectedFormContext && question.expectedFormContext !== 'either'}
									<span
										class="rounded-full bg-shaded-background px-2 py-0.5 text-xs font-normal text-text-subtitle"
									>
										{question.expectedFormContext === 'prep'
											? 'after preposition'
											: 'without preposition'}
									</span>
								{/if}
							</div>
							<p class="mt-0.5 text-sm text-text-subtitle">
								{headerTranslation}
							</p>
						{/if}
						{@const parts = sentenceWithBlankAndLemma(question)}
						<p class="mt-3 text-lg font-normal leading-relaxed text-emphasis sm:text-xl">
							{@render cueText(
								parts.before,
								question.template.trigger,
								question.case
							)}{#if submitted && result}<span
									class="mx-0.5 inline-block border-b-2 border-positive-stroke px-1 font-semibold text-emphasis"
									>{result.correct ? gradedForm : question.correctAnswer}</span
								>{:else}<span
									class="mx-0.5 inline-block border-b-2 border-dashed border-text-subtitle px-6"
									>&nbsp;&nbsp;&nbsp;&nbsp;</span
								>{/if}{parts.after}{#if onSpeak}<button
									type="button"
									onclick={() => onSpeak(speakTargetText(question!))}
									class="ml-3 inline-flex size-8 items-center justify-center rounded-full bg-shaded-background align-middle text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
									aria-label="Listen to pronunciation"
									><Volume2 class="size-4" aria-hidden="true" /></button
								>{/if}
						</p>
					{/if}
				</div>

				{#if !submitted && openHints.length > 0}
					<div
						class="drill-fade-enter -mt-1 flex flex-col items-center gap-1 rounded-[16px] bg-shaded-background px-4 py-2.5 text-center text-sm text-text-default sm:-mt-2"
						aria-live="polite"
					>
						{#each openHints as hint, i (i)}
							<p>
								{#if hint.kind === 'clue'}
									<span class="font-semibold">Clue:</span> {hint.text}
								{:else if hint.kind === 'case'}
									<span class="font-semibold">Needs</span>
									<CaseChip case_={hint.case} plural={hint.plural} />
									{#if hint.clue}
										<span class="text-text-subtitle">· {hint.clue}</span>
									{/if}
								{:else if hint.kind === 'like'}
									<span class="font-semibold">Declines like</span>
									{hint.model} &rarr; {hint.form}
								{:else}
									<span class="font-semibold">Starts with</span> {hint.prefix}&hellip;
								{/if}
							</p>
						{/each}
					</div>
				{/if}

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
						<div class="mt-3 flex flex-col items-center gap-1">
							{@render hintButton()}
							<p class="hidden text-center text-xs text-text-subtitle sm:block">
								Press 1&ndash;7 to select by case number{hintsShown < hints.length
									? ' · enter for a hint'
									: ''}
							</p>
						</div>
					{/if}
				{:else}
					{@const labelLemma =
						question.wordCategory === 'pronoun'
							? (question.pronoun?.lemma ?? question.word.lemma)
							: question.word.lemma}
					<!-- A real form so the mobile keyboard's action key submits even when no
					     Enter keydown is delivered; the button doubles as the visible affordance. -->
					<form onsubmit={handleAnswerFormSubmit} novalidate>
						<div class="flex items-stretch gap-2">
							<label for="drill-answer" class="sr-only">
								{#if question.drillType === 'form_production'}
									Type the {CASE_LABELS[question.case]}
									{question.number === 'pl' ? 'plural ' : ''}form of {labelLemma}
								{:else}
									Type the correct form of {labelLemma} to fill in the blank
								{/if}
							</label>
							{#if submitted && result}
								<SubmittedAnswer
									answer={userTyped}
									reference={gradedForm}
									tone={fieldTone}
									class="rounded-[16px] px-4 py-3 text-base font-semibold sm:rounded-[20px] sm:px-5 sm:py-3.5 sm:text-lg"
								/>
							{:else}
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
									enterkeyhint="go"
									placeholder="Type your answer..."
									class="min-w-0 flex-1 rounded-[16px] border-2 border-card-stroke bg-card-bg px-4 py-3 text-center text-base font-normal text-emphasis caret-emphasis outline-none transition-all duration-200 placeholder:text-text-subtitle focus:border-emphasis sm:rounded-[20px] sm:px-5 sm:py-3.5 sm:text-lg"
								/>
							{/if}
							{#if !submitted}
								<button
									type={isSkip ? 'button' : 'submit'}
									onclick={isSkip ? () => skip() : undefined}
									class="min-w-[5.5rem] shrink-0 rounded-[16px] border-2 px-5 text-base font-semibold transition-opacity hover:opacity-90 active:opacity-80 sm:min-w-[6rem] sm:rounded-[20px] sm:px-6 {isSkip
										? 'border-card-stroke bg-card-bg text-text-subtitle'
										: 'border-emphasis bg-emphasis text-text-inverted'}"
								>
									{isSkip ? 'Skip' : 'Check'}
								</button>
							{/if}
						</div>

						<!-- Diacritics helper bar -->
						{#if showDiacriticsBar && !submitted}
							<div class="mt-2.5">
								<DiacriticsBar {inputEl} inputValue={userInput} />
							</div>
						{/if}

						{#if !submitted}
							<div class="mt-2 flex flex-col items-center gap-1">
								{@render hintButton()}
								<p class="hidden text-center text-xs text-text-subtitle sm:block">
									{!isSkip
										? 'Press enter to submit'
										: hintsShown < hints.length
											? 'Press enter for a hint'
											: 'Press enter to skip'}
								</p>
							</div>
						{/if}
					</form>
				{/if}

				<!-- Feedback after submission -->
				{#if submitted && result && showFeedback}
					<div class="drill-fade-enter space-y-4" aria-live="polite">
						{#if result.correct}
							{@const nomForm =
								question.wordCategory === 'adjective'
									? (question.adjective?.lemma ?? question.word.lemma)
									: question.wordCategory === 'pronoun'
										? (question.pronoun?.lemma ?? '')
										: question.word.forms[question.number][0]}
							{@const targetForm =
								question.wordCategory === 'adjective'
									? question.correctAnswer
									: question.wordCategory === 'pronoun'
										? getPronounForm(question)
										: question.word.forms[question.number][CASE_INDEX[question.case]]}
							<FeedbackVerdict
								tone="correct"
								title={retry
									? 'Got it this time!'
									: result.hinted
										? 'Correct, with a hint'
										: streak >= 3
											? `Correct! ${streak} in a row!`
											: 'Correct!'}
							>
								{#if result.nearMiss}
									<span class="text-warning-text">Watch the accents:</span>
									<span class="font-semibold"
										><AnswerDiff text={gradedForm} reference={userTyped} tone="almost" /></span
									>
									{#if gradedForm.toLowerCase() !== question.correctAnswer.trim().toLowerCase()}
										<span class="text-text-subtitle"
											>— accepted variant of <span class="font-semibold"
												>{question.correctAnswer}</span
											></span
										>
									{/if}
								{:else if nomForm !== targetForm}
									<span class="text-text-subtitle">{nomForm} &rarr;</span>
									<span class="font-semibold">{targetForm}</span>
								{/if}
							</FeedbackVerdict>
							{#if streak >= 5}
								<div
									class="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px] sm:rounded-[40px]"
								>
									{#each streakParticles as particle, i (i)}
										<span
											class="streak-float absolute text-xl"
											style="left: {particle.left}%; bottom: {particle.bottom}%; animation-delay: {i *
												0.1}s"
										>
											{['🔥', '⭐', '✨', '💥', '🌟'][i % 5]}
										</span>
									{/each}
								</div>
							{/if}
							{@const isAltPronounForm =
								question.wordCategory === 'pronoun' &&
								(question.drillType === 'form_production' ||
									question.drillType === 'sentence_fill_in') &&
								!result.nearMiss &&
								result.userAnswer.trim().toLowerCase() !==
									question.correctAnswer.trim().toLowerCase()}
							{#if isAltPronounForm}
								<p class="text-center text-sm text-text-subtitle">
									Without a preposition, <span class="font-semibold">{question.correctAnswer}</span> is
									more common
								</p>
							{/if}
							{@const isAltNounForm =
								question.wordCategory !== 'adjective' &&
								question.wordCategory !== 'pronoun' &&
								(question.drillType === 'form_production' ||
									question.drillType === 'sentence_fill_in') &&
								!result.nearMiss &&
								result.userAnswer.trim().toLowerCase() !==
									question.correctAnswer.trim().toLowerCase() &&
								result.userAnswer.trim() !== ''}
							{#if isAltNounForm}
								<p class="text-center text-sm text-text-subtitle">
									You typed <span class="font-semibold">{result.userAnswer.trim()}</span> — also
									accepted. The more common form is
									<span class="font-semibold {CASE_COLORS[question.case].text}"
										>{question.correctAnswer}</span
									>.
								</p>
							{/if}
							{@const correctNoteKey = `${question.case}_${question.number}`}
							{@const correctWhyNote = paradigmNotes?.[correctNoteKey] ?? null}
							{@const correctTemplateWhy =
								question.template.id !== '_form_production' &&
								question.template.id !== '_pronoun_form_production' &&
								question.template.id !== '_adj_form_production'
									? question.template.why
									: null}
							<WhyNote templateWhy={correctTemplateWhy} whyNote={correctWhyNote} />
							{#if question.wordCategory === 'adjective' && question.adjective}
								<div class="w-full">
									<FeedbackAdjectiveDeclensionChart
										lemma={question.adjective.lemma}
										genderKey={getAdjectiveGenderKey(question.word)}
										case_={question.case}
										number_={question.number}
									/>
								</div>
							{/if}
							{#if question.wordCategory === 'pronoun' && question.pronoun}
								<div class="w-full">
									<FeedbackPronounDeclensionChart
										lemma={question.pronoun.lemma}
										case_={question.case}
										number_={question.number}
									/>
								</div>
							{/if}
							{#if question.wordCategory !== 'adjective' && question.wordCategory !== 'pronoun'}
								<div class="w-full">
									<FeedbackDeclensionChart
										lemma={question.word.lemma}
										case_={question.case}
										number_={question.number}
									/>
								</div>
							{/if}
						{:else}
							{@const pickedCase =
								question.drillType === 'case_identification' && isCase(result.userAnswer)
									? result.userAnswer
									: null}
							{@const endingLine =
								question.wordCategory !== 'adjective' &&
								question.wordCategory !== 'pronoun' &&
								question.drillType !== 'case_identification' &&
								!wasSkipped &&
								!result.nearMiss
									? explainWrongEnding(
											question.word,
											{ case: question.case, number: question.number },
											userTyped,
											{ accidentalCase: result.accidentalCase !== undefined }
										)
									: null}
							{#if wasSkipped}
								<FeedbackVerdict tone="skipped" title="Skipped">Here's the answer.</FeedbackVerdict>
							{:else if pickedCase}
								<FeedbackVerdict tone="wrong" title="Not quite">
									You picked <CaseChip case_={pickedCase} /> — needed <CaseChip
										case_={question.case}
									/>
								</FeedbackVerdict>
							{:else if result.nearMiss}
								<FeedbackVerdict tone="almost" title="Almost — check the accents">
									Right letters, but accents count here.
								</FeedbackVerdict>
							{:else if result.accidentalCase}
								{@const typedAs = result.accidentalCase}
								{#if typedAs.case === question.case}
									<FeedbackVerdict tone="wrong" title="Right case, wrong number">
										<span class="font-semibold">{userTyped}</span> is {typedAs.number === 'pl'
											? 'plural'
											: 'singular'} — needed
										{question.number === 'pl' ? 'plural' : 'singular'}
									</FeedbackVerdict>
								{:else}
									<FeedbackVerdict tone="wrong" title="Wrong case">
										<span class="font-semibold">{userTyped}</span> is
										<CaseChip case_={typedAs.case} plural={showPlural(question, typedAs.number)} /> —
										needed
										<CaseChip
											case_={question.case}
											plural={showPlural(question, question.number)}
										/>
									</FeedbackVerdict>
								{/if}
							{:else if endingLine}
								<FeedbackVerdict tone="wrong" title="Not quite">{endingLine}</FeedbackVerdict>
							{:else}
								<FeedbackVerdict tone="wrong" title="Not quite" />
							{/if}

							<!-- Correct answer panel with explanation -->
							{@const noteKey = `${question.case}_${question.number}`}
							{@const adjGenderNote =
								question.wordCategory === 'adjective' && question.adjective
									? `${question.adjective.paradigmType === 'hard' ? 'hard' : 'soft'} adjective · ${
											question.word.gender === 'm'
												? question.word.animate
													? 'masculine animate'
													: 'masculine inanimate'
												: question.word.gender === 'f'
													? 'feminine'
													: 'neuter'
										}`
									: null}
							{@const baseWhyNote = adjGenderNote ?? paradigmNotes?.[noteKey] ?? null}
							{@const whyNote =
								// A plain miss shows the ending explanation in its verdict; after an
								// other-case verdict it leads the Why? instead.
								endingLine && result.accidentalCase
									? baseWhyNote
										? `${endingLine}\n\n${baseWhyNote}`
										: endingLine
									: baseWhyNote}
							{@const templateWhy =
								question.template.id !== '_form_production' &&
								question.template.id !== '_pronoun_form_production' &&
								question.template.id !== '_adj_form_production'
									? question.template.why
									: null}
							<CorrectAnswerPanel
								correctAnswer={question.drillType === 'case_identification' &&
								isCase(question.correctAnswer)
									? CASE_LABELS[question.correctAnswer]
									: result.question.correctAnswer}
								userAnswer={wasSkipped || question.drillType === 'case_identification'
									? undefined
									: userTyped}
								nominative={question.wordCategory === 'adjective'
									? (question.adjective?.lemma ?? question.word.lemma)
									: question.wordCategory === 'pronoun'
										? (question.pronoun?.lemma ?? '')
										: question.word.forms[question.number][0]}
								targetForm={question.wordCategory === 'adjective'
									? question.correctAnswer
									: question.wordCategory === 'pronoun'
										? getPronounForm(question)
										: question.word.forms[question.number][CASE_INDEX[question.case]]}
								translation={question.drillType === 'case_identification'
									? question.wordCategory === 'adjective'
										? (question.adjective?.translation ?? question.word.translation)
										: question.wordCategory === 'pronoun'
											? (question.pronoun?.translation ?? question.word.translation)
											: question.number === 'pl'
												? pluralizeTranslation(question.word.translation)
												: question.word.translation
									: undefined}
								chartLemma={question.wordCategory === 'adjective'
									? (question.adjective?.lemma ?? question.word.lemma)
									: question.wordCategory === 'pronoun'
										? (question.pronoun?.lemma ?? '')
										: question.word.lemma}
								case_={question.case}
								drillType={question.drillType}
								number_={question.number}
								{templateWhy}
								{whyNote}
								onSpeak={onSpeak ? (text: string) => onSpeak(text) : undefined}
								onWordClick={onWordClick
									? () =>
											onWordClick?.(
												question!.wordCategory === 'adjective'
													? (question!.adjective?.lemma ?? question!.word.lemma)
													: question!.wordCategory === 'pronoun'
														? (question!.pronoun?.lemma ?? question!.word.lemma)
														: question!.word.lemma
											)
									: undefined}
								adjectiveLemma={question.wordCategory === 'adjective' && question.adjective
									? question.adjective.lemma
									: undefined}
								adjectiveGenderKey={question.wordCategory === 'adjective' && question.adjective
									? getAdjectiveGenderKey(question.word)
									: undefined}
								pronounLemma={question.wordCategory === 'pronoun' && question.pronoun
									? question.pronoun.lemma
									: undefined}
							>
								{#snippet practice()}
									{#if question && question.drillType !== 'case_identification'}
										<RetypePractice
											accepted={retypeForms(question)}
											{canAdvance}
											onAdvance={() => onSubmit('__advance__')}
										/>
									{/if}
								{/snippet}
							</CorrectAnswerPanel>
						{/if}

						<!-- Next button -->
						<NextButton onclick={() => onSubmit('__advance__')} />

						<p class="text-center text-xs text-text-subtitle">Press enter to continue</p>
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
			class="rounded-[24px] border-2 border-card-stroke bg-card-bg p-5 sm:rounded-[40px] sm:p-8 md:p-10"
		>
			<!-- Skeleton loading state -->
			<div class="space-y-4 sm:space-y-6">
				<!-- Question type label skeleton -->
				<div class="flex justify-center">
					<div class="h-4 w-16 animate-pulse rounded bg-shaded-background"></div>
				</div>

				<!-- Main content skeleton (sentence/word) -->
				<div class="flex flex-col items-center gap-2">
					<div class="h-9 w-48 animate-pulse rounded-lg bg-shaded-background sm:h-10 sm:w-64"></div>
					<div class="h-6 w-32 animate-pulse rounded-full bg-shaded-background"></div>
				</div>

				{#if skeletonDrillType === 'case_identification'}
					<!-- Case-option pills (7, wrapping to 2–3 rows like the real card) -->
					<div class="flex flex-wrap justify-center gap-2 sm:gap-3">
						{#each ALL_CASES as c (c)}
							<div
								class="h-11 w-28 animate-pulse rounded-full bg-shaded-background sm:h-12 sm:w-32"
							></div>
						{/each}
					</div>
					<!-- "Press 1–7 to select" hint -->
					<div class="flex justify-center">
						<div class="h-4 w-44 animate-pulse rounded bg-shaded-background"></div>
					</div>
				{:else}
					<!-- Input/answer area skeleton -->
					<div class="mt-2 space-y-2">
						<div
							class="h-12 w-full animate-pulse rounded-[16px] bg-shaded-background sm:h-14 sm:rounded-[20px]"
						></div>
						<!-- Diacritics bar skeleton -->
						<div class="flex justify-center gap-1">
							{#each [0, 1, 2, 3, 4, 5, 6, 7, 8] as n (n)}
								<div class="size-8 animate-pulse rounded-lg bg-shaded-background"></div>
							{/each}
						</div>
						<!-- "Press enter to submit" hint -->
						<div class="flex justify-center">
							<div class="h-4 w-32 animate-pulse rounded bg-shaded-background"></div>
						</div>
					</div>
				{/if}
			</div>
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
