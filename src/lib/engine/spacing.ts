/**
 * Spaced weighting over drillable "cells": one paradigm × case × number for
 * nouns, one paradigm type × gender × case × number for adjectives, one
 * pronoun × case × number for pronouns. What a learner acquires in a
 * declension drill is the ending rule, not the word, so the cell — not the
 * lemma — is the unit that gets spaced. The lemma-level weighting inside a
 * cell (see `weightedRandom` in drill.ts) still picks the exemplar.
 *
 * Each cell carries a Leitner box. A correct answer moves it up one box, a
 * miss drops it two (a slip on one irregular exemplar should not fully reset
 * a rule). The box sets the interval after which the cell counts as due
 * again, and the selection weight ramps from a floor (just seen) up to a
 * "due" value, capped a bit past due so the longest-forgotten cells win.
 *
 * Pure module: no store, no clock — callers pass `now` and `random`, which
 * keeps the tests deterministic.
 */
import type {
	AdjectiveGenderKey,
	AdjectiveParadigmType,
	Case,
	CellSchedule,
	CellState,
	Number_
} from '../types.ts';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Interval before a cell in the given box counts as due again; index = box. */
export const CELL_INTERVALS_MS: readonly number[] = [
	10 * MINUTE_MS,
	1 * DAY_MS,
	3 * DAY_MS,
	7 * DAY_MS,
	14 * DAY_MS,
	30 * DAY_MS
];

export const MAX_BOX = CELL_INTERVALS_MS.length - 1;

/** Weight of a cell that has never been attempted. */
export const W_NEW = 3;
/** Weight right after an attempt (elapsed = 0). */
export const W_FLOOR = 0.5;
/** Weight when exactly due (elapsed = interval). */
export const W_DUE = 4;
/** Elapsed/interval ratio beyond which the weight stops growing. */
export const OVERDUE_CAP = 1.5;
/** Largest weight `cellWeight` can return. */
export const W_MAX = W_FLOOR + (W_DUE - W_FLOOR) * OVERDUE_CAP;

export function nounCellKey(paradigm: string, case_: Case, number_: Number_): string {
	return `n:${paradigm}:${case_}:${number_}`;
}

export function adjectiveCellKey(
	paradigmType: AdjectiveParadigmType,
	genderKey: AdjectiveGenderKey,
	case_: Case,
	number_: Number_
): string {
	return `a:${paradigmType}:${genderKey}:${case_}:${number_}`;
}

export function pronounCellKey(lemma: string, case_: Case, number_: Number_): string {
	return `p:${lemma}:${case_}:${number_}`;
}

/**
 * Recognition cell: can the learner tell which case a sentence slot calls
 * for? Keyed by case and number only — case identification never has them
 * produce an ending, so it must not move a paradigm's production cell, but a
 * case they keep misreading still has to come up more often.
 */
export function caseCellKey(case_: Case, number_: Number_): string {
	return `c:${case_}:${number_}`;
}

export type CellOutcome = 'correct' | 'incorrect' | 'skipped';

function clampBox(box: number): number {
	if (!Number.isFinite(box)) return 0;
	return Math.min(Math.max(Math.trunc(box), 0), MAX_BOX);
}

/**
 * Selection weight of a cell at time `now`. Unseen cells get `W_NEW`; seen
 * cells ramp linearly from `W_FLOOR` (just attempted) to `W_DUE` (interval
 * elapsed) and on to `W_MAX` at `OVERDUE_CAP` times the interval.
 */
export function cellWeight(state: CellState | undefined, now: number): number {
	if (state === undefined) return W_NEW;
	const interval = CELL_INTERVALS_MS[clampBox(state.box)];
	const elapsed = Math.max(0, now - state.last);
	const ratio = Math.min(elapsed / interval, OVERDUE_CAP);
	return W_FLOOR + (W_DUE - W_FLOOR) * ratio;
}

/**
 * Next state of a cell after an attempt at time `now`. A correct answer moves
 * up a box, a miss drops two, and a skip (looking at the answer) drops one:
 * it is a weaker signal than a wrong answer and must not wipe weeks of
 * spacing just because the learner peeked.
 */
export function advanceCell(
	state: CellState | undefined,
	outcome: CellOutcome,
	now: number
): CellState {
	const box = clampBox(state?.box ?? 0);
	const streak = state?.streak ?? 0;
	if (outcome === 'correct') {
		return { last: now, box: Math.min(box + 1, MAX_BOX), streak: streak + 1 };
	}
	const drop = outcome === 'skipped' ? 1 : 2;
	return { last: now, box: Math.max(box - drop, 0), streak: 0 };
}

/**
 * Average cell weight over the cells a case can currently drill. An empty
 * list means nothing in the pool can be asked in that case, so it weighs
 * nothing rather than "unseen" — otherwise an undrillable case would outrank
 * every practised one and render a blank question.
 */
export function caseWeight(
	cellKeys: readonly string[],
	schedule: CellSchedule,
	now: number
): number {
	if (cellKeys.length === 0) return 0;
	let total = 0;
	for (const key of cellKeys) total += cellWeight(schedule[key], now);
	return total / cellKeys.length;
}

/**
 * Roulette-wheel pick: item i is chosen with probability weights[i] / total.
 * A zero-weight item is never chosen while any other has weight (strict
 * comparison, so a draw of exactly 0 cannot land on it); when every weight is
 * zero the pick is uniform so callers always get an item back.
 */
export function weightedPick<T>(
	items: readonly T[],
	weights: readonly number[],
	random: () => number = Math.random
): T {
	if (items.length === 0) throw new Error('weightedPick called with empty items array');
	const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
	if (total <= 0) return items[Math.floor(random() * items.length)];
	let r = random() * total;
	for (let i = 0; i < items.length; i++) {
		r -= Math.max(0, weights[i]);
		if (r < 0) return items[i];
	}
	return items[items.length - 1];
}

/**
 * Weighted pick over cases: each case is weighted by the mean spacing weight
 * of the cells it can drill right now, so a case whose paradigms are due (or
 * never seen) comes up more often, and one just practised drops back.
 */
export function pickSpacedCase(
	cases: readonly Case[],
	cellKeysForCase: (case_: Case) => readonly string[],
	schedule: CellSchedule,
	now: number,
	random: () => number = Math.random
): Case {
	if (cases.length === 0) {
		throw new Error('pickSpacedCase called with empty cases array');
	}
	const weights = cases.map((c) => caseWeight(cellKeysForCase(c), schedule, now));
	return weightedPick(cases, weights, random);
}

/** Keys of every noun cell for the given paradigms, case and numbers. */
export function nounCellKeysForCase(
	paradigms: readonly string[],
	case_: Case,
	numbers: readonly Number_[]
): string[] {
	const keys: string[] = [];
	for (const paradigm of paradigms) {
		for (const number_ of numbers) keys.push(nounCellKey(paradigm, case_, number_));
	}
	return keys;
}

/** Keys of every adjective cell for the given paradigm types, genders, case and numbers. */
export function adjectiveCellKeysForCase(
	paradigmTypes: readonly AdjectiveParadigmType[],
	genderKeys: readonly AdjectiveGenderKey[],
	case_: Case,
	numbers: readonly Number_[]
): string[] {
	const keys: string[] = [];
	for (const type of paradigmTypes) {
		for (const gender of genderKeys) {
			for (const number_ of numbers) keys.push(adjectiveCellKey(type, gender, case_, number_));
		}
	}
	return keys;
}

/** Keys of every pronoun cell for the given lemmas, case and numbers. */
export function pronounCellKeysForCase(
	lemmas: readonly string[],
	case_: Case,
	numbers: readonly Number_[]
): string[] {
	const keys: string[] = [];
	for (const lemma of lemmas) {
		for (const number_ of numbers) keys.push(pronounCellKey(lemma, case_, number_));
	}
	return keys;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidCellState(value: unknown): value is CellState {
	if (!isRecordLike(value)) return false;
	const last = value['last'];
	const box = value['box'];
	const streak = value['streak'];
	return (
		typeof last === 'number' &&
		Number.isFinite(last) &&
		last >= 0 &&
		typeof box === 'number' &&
		Number.isInteger(box) &&
		box >= 0 &&
		box <= MAX_BOX &&
		typeof streak === 'number' &&
		Number.isInteger(streak) &&
		streak >= 0
	);
}

/**
 * Keep the well-formed cells of an untrusted schedule and drop the rest, with
 * any `last` in the future clamped to `now`. Per-entry rather than
 * all-or-nothing: one bad cell (a client on another version, a skewed clock,
 * a hand edit) must never throw away every other cell — or, on the client,
 * the whole progress record. The spacing state only steers selection, so
 * losing a single entry is harmless.
 */
export function sanitizeCellSchedule(value: unknown, now: number): CellSchedule {
	if (!isRecordLike(value)) return {};
	const out: CellSchedule = {};
	for (const [key, state] of Object.entries(value)) {
		if (!isValidCellState(state)) continue;
		out[key] = { last: Math.min(state.last, now), box: state.box, streak: state.streak };
	}
	return out;
}

/**
 * Merge two copies of a schedule (local + remote on login): for a cell on
 * both sides the more recently attempted state wins, cells on one side only
 * are kept.
 */
export function mergeCellSchedules(local: CellSchedule, remote: CellSchedule): CellSchedule {
	const merged: CellSchedule = { ...remote };
	for (const [key, l] of Object.entries(local)) {
		const r = merged[key];
		merged[key] = r === undefined || l.last >= r.last ? { ...l } : r;
	}
	return merged;
}
