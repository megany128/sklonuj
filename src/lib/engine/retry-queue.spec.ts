import { describe, it, expect } from 'vitest';
import { enqueueRetry, takeDueRetry, retryKey, RETRY_GAP, MAX_RETRIES } from './retry-queue';
import { generateFormProduction, loadWordBank } from './drill';
import type { DrillQuestion } from '$lib/types';

const bank = loadWordBank();

function q(lemma: string, case_: DrillQuestion['case'] = 'loc'): DrillQuestion {
	const w = bank.find((x) => x.lemma === lemma);
	const question = w ? generateFormProduction(w, case_, 'sg') : null;
	if (!question) throw new Error(`no question for ${lemma}`);
	return question;
}

const any = () => true;

describe('retry queue', () => {
	it('serves a miss only after RETRY_GAP more questions', () => {
		const queue = enqueueRetry([], q('hrad'), 5);
		expect(takeDueRetry(queue, 5 + RETRY_GAP - 1, any)).toBeNull();
		const due = takeDueRetry(queue, 5 + RETRY_GAP, any);
		expect(due?.item.question.word.lemma).toBe('hrad');
		expect(due?.rest).toEqual([]);
	});

	it('keeps one item per word, case, number and drill type', () => {
		let queue = enqueueRetry([], q('hrad'), 1);
		queue = enqueueRetry(queue, q('hrad'), 2);
		queue = enqueueRetry(queue, q('hrad', 'dat'), 2);
		expect(queue).toHaveLength(2);
		expect(queue[1].dueAt).toBe(2 + RETRY_GAP);
		expect(retryKey(queue[0].question)).not.toBe(retryKey(queue[1].question));
	});

	it('drops an item once it has used its re-asks', () => {
		expect(enqueueRetry([], q('hrad'), 1, MAX_RETRIES - 1)).toHaveLength(1);
		expect(enqueueRetry([], q('hrad'), 1, MAX_RETRIES)).toEqual([]);
	});

	it('serves the oldest eligible item and keeps ineligible ones queued', () => {
		let queue = enqueueRetry([], q('hrad'), 1);
		queue = enqueueRetry(queue, q('žena', 'dat'), 1);
		const due = takeDueRetry(queue, 10, (x) => x.case === 'dat');
		expect(due?.item.question.word.lemma).toBe('žena');
		expect(due?.rest.map((i) => i.question.word.lemma)).toEqual(['hrad']);
	});
});
