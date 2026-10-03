import type { DrillQuestion } from '$lib/types';

/**
 * In-session re-asks: a question the learner misses comes back a few
 * questions later, while the correction is still fresh but no longer on
 * screen. Pure — the page keeps the queue in state and passes in its own
 * question counter as the clock.
 */

/** Other questions served between a miss and its re-ask. */
export const RETRY_GAP = 3;

/** Re-asks per item before it is left to the mistakes list and spacing. */
export const MAX_RETRIES = 2;

export interface RetryItem {
	question: DrillQuestion;
	/** Counter value at or after which the item may be served. */
	dueAt: number;
	/** Re-asks already served for this item. */
	attempts: number;
	/** The practice context (level, chapter, assignment) the miss happened in;
	 * the page drops items whose context no longer matches. */
	context: string;
}

/** Same word, case, number and drill type: two misses on it are one item. */
export function retryKey(q: DrillQuestion): string {
	const lemma =
		q.wordCategory === 'adjective'
			? `adj:${q.adjective?.lemma ?? ''}:${q.word.lemma}`
			: q.wordCategory === 'pronoun'
				? `pron:${q.pronoun?.lemma ?? ''}`
				: `noun:${q.word.lemma}`;
	return `${lemma}|${q.case}|${q.number}|${q.drillType}`;
}

/**
 * Queue a missed question to come back after `RETRY_GAP` more questions.
 * `attempts` is how many re-asks it has already had (0 for a fresh miss); an
 * item past `MAX_RETRIES` is dropped, and a miss on an item already queued
 * just pushes it back.
 */
export function enqueueRetry(
	queue: readonly RetryItem[],
	question: DrillQuestion,
	now: number,
	context: string,
	attempts = 0
): RetryItem[] {
	const key = retryKey(question);
	const rest = queue.filter((item) => retryKey(item.question) !== key);
	if (attempts >= MAX_RETRIES) return rest;
	return [...rest, { question, dueAt: now + RETRY_GAP, attempts, context }];
}

/**
 * The oldest due item that `eligible` still allows (the learner may have
 * changed cases or content since the miss), and the queue without it.
 * Ineligible items stay queued in case the filter comes back.
 */
export function takeDueRetry(
	queue: readonly RetryItem[],
	now: number,
	eligible: (q: DrillQuestion) => boolean
): { item: RetryItem; rest: RetryItem[] } | null {
	const index = queue.findIndex((item) => item.dueAt <= now && eligible(item.question));
	if (index === -1) return null;
	return { item: queue[index], rest: queue.filter((_, i) => i !== index) };
}
