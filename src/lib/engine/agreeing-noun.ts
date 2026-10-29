import type { DrillQuestion, WordEntry } from '../types';
import { loadWordBank } from './drill';

/**
 * The noun an adjective question's answer agrees with. A sentence names its
 * own noun (`nounLemma`); `q.word` there is only picked to match its gender,
 * so it can be another noun ("humor" for "Jsem v ___ obchodě"). Null when
 * the sentence's noun isn't in the bank.
 */
export function agreeingNoun(q: DrillQuestion): WordEntry | null {
	const lemma = q.template.nounLemma;
	if (lemma === undefined || lemma === q.word.lemma) return q.word;
	return loadWordBank().find((w) => w.lemma === lemma) ?? null;
}
