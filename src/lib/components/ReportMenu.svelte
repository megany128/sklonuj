<script lang="ts">
	import MoreVertical from '@lucide/svelte/icons/more-vertical';
	import X from '@lucide/svelte/icons/x';
	import { CASE_LABELS, CASE_INDEX } from '$lib/types';
	import type { DrillQuestion, DrillResult } from '$lib/types';

	let {
		question,
		result,
		drillType
	}: {
		question: DrillQuestion | null;
		result: DrillResult | null;
		drillType?: string;
	} = $props();

	type Category = 'wrong_answer' | 'bad_sentence' | 'bad_explanation' | 'other';

	const CATEGORY_OPTIONS: Array<{ value: Category; label: string }> = [
		{ value: 'wrong_answer', label: 'Wrong answer' },
		{ value: 'bad_sentence', label: 'Bad Czech sentence' },
		{ value: 'bad_explanation', label: 'Bad explanation' },
		{ value: 'other', label: 'Other' }
	];

	const MAX_COMMENT = 2000;

	let dropdownOpen = $state(false);
	let modalOpen = $state(false);
	let category = $state<Category>('wrong_answer');
	let comment = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');
	let successVisible = $state(false);

	let buttonEl = $state<HTMLButtonElement | undefined>(undefined);
	let dropdownEl = $state<HTMLDivElement | undefined>(undefined);
	let modalEl = $state<HTMLDivElement | undefined>(undefined);

	let lemma = $derived.by(() => {
		if (!question) return null;
		if (question.wordCategory === 'adjective' && question.adjective)
			return question.adjective.lemma;
		if (question.wordCategory === 'pronoun' && question.pronoun) return question.pronoun.lemma;
		return question.word.lemma;
	});

	let expectedAnswer = $derived.by(() => {
		if (!question) return null;
		if (question.drillType === 'case_identification') {
			return CASE_LABELS[question.case];
		}
		return question.correctAnswer ?? null;
	});

	let sentenceText = $derived.by(() => {
		if (!question) return null;
		const template = question.template?.template;
		if (typeof template !== 'string' || template.length === 0) return null;
		return template.replace('___', expectedAnswer ?? '___');
	});

	let explanationText = $derived.by(() => {
		if (!question) return null;
		const why = question.template?.why;
		return typeof why === 'string' && why.trim().length > 0 ? why : null;
	});

	let caseName = $derived(question ? CASE_LABELS[question.case] : null);
	let numberForm = $derived(question ? (question.number === 'pl' ? 'plural' : 'singular') : null);

	let summaryLines = $derived.by(() => {
		const lines: string[] = [];
		if (question) {
			if (lemma) lines.push(`Lemma: ${lemma}`);
			if (caseName) {
				const num = question.number === 'pl' ? ' plural' : '';
				lines.push(`Case: ${caseName}${num}`);
			}
			if (expectedAnswer) lines.push(`Expected: ${expectedAnswer}`);
			if (result && !result.correct && result.userAnswer) {
				lines.push(`Your answer: ${result.userAnswer}`);
			}
			if (sentenceText) lines.push(`Sentence: ${sentenceText}`);
		}
		return lines;
	});

	function openDropdown() {
		dropdownOpen = true;
	}

	function closeDropdown() {
		dropdownOpen = false;
	}

	function openReportModal() {
		dropdownOpen = false;
		resetForm();
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		resetForm();
	}

	function resetForm() {
		category = 'wrong_answer';
		comment = '';
		submitting = false;
		errorMessage = '';
		successVisible = false;
	}

	function handleDocumentClick(e: MouseEvent) {
		if (!dropdownOpen) return;
		const target = e.target;
		if (!(target instanceof Node)) return;
		if (buttonEl?.contains(target)) return;
		if (dropdownEl?.contains(target)) return;
		dropdownOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (modalOpen) {
				e.stopPropagation();
				closeModal();
			} else if (dropdownOpen) {
				e.stopPropagation();
				closeDropdown();
			}
		}
	}

	$effect(() => {
		if (dropdownOpen || modalOpen) {
			document.addEventListener('click', handleDocumentClick);
			document.addEventListener('keydown', handleKeydown);
			return () => {
				document.removeEventListener('click', handleDocumentClick);
				document.removeEventListener('keydown', handleKeydown);
			};
		}
	});

	let nominativeForm = $derived.by(() => {
		if (!question) return null;
		if (question.wordCategory === 'noun') {
			return question.word.forms[question.number][CASE_INDEX.nom];
		}
		return null;
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (submitting) return;
		if (comment.length > MAX_COMMENT) {
			errorMessage = `Comment is too long (max ${MAX_COMMENT} characters).`;
			return;
		}
		submitting = true;
		errorMessage = '';

		const body: Record<string, unknown> = {
			category,
			comment: comment.trim() === '' ? null : comment.trim(),
			drill_type: drillType ?? question?.drillType ?? null,
			lemma,
			case_name: caseName,
			number_form: numberForm,
			expected_answer: expectedAnswer,
			user_answer: result?.userAnswer ?? null,
			sentence: sentenceText,
			explanation: explanationText,
			page_url: typeof window !== 'undefined' ? window.location.href : undefined,
			context: question
				? {
						templateId: question.template?.id ?? null,
						wordCategory: question.wordCategory ?? null,
						nominative: nominativeForm,
						translation: question.word?.translation ?? null,
						correct: result?.correct ?? null,
						nearMiss: result?.nearMiss ?? null
					}
				: null
		};

		try {
			const res = await fetch('/api/report', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				let msg = 'Failed to send report. Please try again.';
				try {
					const data = await res.json();
					if (data && typeof data.error === 'string') msg = data.error;
				} catch {
					// ignore json parse failure
				}
				errorMessage = msg;
				submitting = false;
				return;
			}
			successVisible = true;
			submitting = false;
			setTimeout(() => {
				closeModal();
			}, 2000);
		} catch (err) {
			console.error('Report submission error:', err);
			errorMessage = 'Network error. Please try again.';
			submitting = false;
		}
	}
</script>

<div class="relative">
	<button
		bind:this={buttonEl}
		type="button"
		onclick={(e) => {
			e.stopPropagation();
			if (dropdownOpen) closeDropdown();
			else openDropdown();
		}}
		class="flex size-8 shrink-0 items-center justify-center rounded-full bg-shaded-background text-text-subtitle transition-colors hover:bg-darker-shaded-background hover:text-text-default"
		aria-label="Report menu"
		aria-haspopup="menu"
		aria-expanded={dropdownOpen}
	>
		<MoreVertical class="size-4" aria-hidden="true" />
	</button>

	{#if dropdownOpen}
		<div
			bind:this={dropdownEl}
			class="absolute right-0 top-10 z-20 min-w-[160px] overflow-hidden rounded-xl border border-card-stroke bg-card-bg shadow-lg"
			role="menu"
		>
			<button
				type="button"
				onclick={openReportModal}
				class="block w-full px-4 py-2.5 text-left text-sm text-text-default transition-colors hover:bg-shaded-background"
				role="menuitem"
			>
				Report an issue
			</button>
		</div>
	{/if}
</div>

{#if modalOpen}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center px-4"
		data-modal
		role="presentation"
		tabindex="-1"
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/40"
			onclick={closeModal}
			aria-label="Close"
			tabindex="-1"
		></button>

		<div
			bind:this={modalEl}
			class="relative z-10 w-full max-w-md"
			role="dialog"
			aria-modal="true"
			aria-label="Report an issue"
		>
			<div class="rounded-2xl border border-card-stroke bg-card-bg p-6 shadow-xl">
				<button
					type="button"
					onclick={closeModal}
					class="absolute right-4 top-4 p-1 text-text-subtitle transition-colors hover:text-text-default"
					aria-label="Close"
				>
					<X class="size-5" aria-hidden="true" />
				</button>

				<h2 class="mb-1 text-lg font-semibold text-text-default">Report an issue</h2>
				<p class="mb-4 text-xs text-text-subtitle">
					Tell us what's wrong with this question. Your feedback helps us improve.
				</p>

				{#if successVisible}
					<div
						class="rounded-xl border border-positive-stroke bg-positive-background px-4 py-3 text-sm text-positive-stroke"
						role="status"
					>
						Thanks — report sent.
					</div>
				{:else}
					{#if summaryLines.length > 0}
						<div
							class="mb-4 rounded-xl bg-shaded-background px-3 py-2.5 text-xs text-text-subtitle"
						>
							{#each summaryLines as line (line)}
								<p class="truncate">{line}</p>
							{/each}
						</div>
					{/if}

					<form onsubmit={handleSubmit} class="flex flex-col gap-4">
						<fieldset class="flex flex-col gap-2">
							<legend class="mb-1 text-sm font-medium text-text-default">What's the issue?</legend>
							{#each CATEGORY_OPTIONS as option (option.value)}
								<label class="flex cursor-pointer items-center gap-2 text-sm text-text-default">
									<input
										type="radio"
										name="category"
										value={option.value}
										checked={category === option.value}
										onchange={() => (category = option.value)}
										class="size-4 accent-emphasis"
									/>
									{option.label}
								</label>
							{/each}
						</fieldset>

						<div class="flex flex-col gap-1.5">
							<label for="report-comment" class="text-sm font-medium text-text-default">
								Additional details (optional)
							</label>
							<textarea
								id="report-comment"
								bind:value={comment}
								maxlength={MAX_COMMENT}
								rows="4"
								placeholder="Anything else we should know?"
								class="w-full resize-y rounded-xl border border-card-stroke bg-card-bg px-3 py-2 text-sm text-text-default placeholder:text-text-subtitle focus:border-emphasis focus:outline-none"
							></textarea>
							<p class="text-right text-xs text-text-subtitle">
								{comment.length}/{MAX_COMMENT}
							</p>
						</div>

						{#if errorMessage}
							<p class="text-xs text-negative-stroke" role="alert">{errorMessage}</p>
						{/if}

						<div class="flex justify-end gap-2">
							<button
								type="button"
								onclick={closeModal}
								disabled={submitting}
								class="rounded-xl border border-card-stroke bg-card-bg px-4 py-2 text-sm font-medium text-text-default transition-colors hover:bg-shaded-background disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={submitting}
								class="rounded-xl bg-emphasis px-4 py-2 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90 disabled:opacity-50"
							>
								{submitting ? 'Sending…' : 'Send report'}
							</button>
						</div>
					</form>
				{/if}
			</div>
		</div>
	</div>
{/if}
