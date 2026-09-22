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
import { ALL_ADJECTIVE_GENDER_KEYS, isCase, isNumber, isParadigm } from '../types.ts';
import { isRecord } from '../utils/is-record.ts';

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

/**
 * Most cells a persisted schedule may hold. Every drillable cell (noun
 * paradigm × case × number, adjective type × gender × case × number, pronoun
 * × case × number) is well under this; a bigger schedule is truncated rather
 * than rejected so an oversized schedule never blocks the rest of a sync.
 */
export const MAX_CELL_SCHEDULE_KEYS = 2000;
/** Cell timestamps come from client clocks; further ahead than this is skew, not an attempt. */
export const MAX_CELL_CLOCK_SKEW_MS = 5 * 60_000;

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

export type CellOutcome = 'correct' | 'incorrect' | 'near_miss' | 'skipped';

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
 * up a box and a miss drops two. A skip (looking at the answer) and a
 * near-miss (right ending, wrong diacritics — graded wrong at B1+) drop one:
 * both are weaker signals than a wrong ending and must not wipe weeks of
 * spacing.
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
	const drop = outcome === 'incorrect' ? 2 : 1;
	return { last: now, box: Math.max(box - drop, 0), streak: 0 };
}

/**
 * How much one never-attempted cell counts against an attempted one when a
 * case's weight is averaged. A case spans dozens of cells (every paradigm ×
 * number in the pool), so a plain mean would let the unseen majority pin
 * every case near `W_NEW` and drown out the cells actually practised; the
 * word picker surfaces unseen paradigms once the case is chosen anyway.
 */
export const UNSEEN_CELL_SHARE = 0.1;

/**
 * Weight of a case from the cells it can currently drill: the mean of the
 * attempted cells' weights, with each unseen cell counting `UNSEEN_CELL_SHARE`
 * of a seen one at `W_NEW`. A case with no attempted cell is `W_NEW`; an
 * empty list means nothing in the pool can be asked in that case, so it
 * weighs nothing rather than "unseen" — otherwise an undrillable case would
 * outrank every practised one and render a blank question.
 */
export function caseWeight(
	cellKeys: readonly string[],
	schedule: CellSchedule,
	now: number
): number {
	if (cellKeys.length === 0) return 0;
	let seen = 0;
	let seenTotal = 0;
	let unseen = 0;
	for (const key of cellKeys) {
		const state = schedule[key];
		if (state === undefined) unseen++;
		else {
			seen++;
			seenTotal += cellWeight(state, now);
		}
	}
	if (seen === 0) return W_NEW;
	const unseenShare = unseen * UNSEEN_CELL_SHARE;
	return (seenTotal + unseenShare * W_NEW) / (seen + unseenShare);
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
	let lastPositive = 0;
	for (let i = 0; i < items.length; i++) {
		const w = Math.max(0, weights[i]);
		if (w <= 0) continue;
		lastPositive = i;
		r -= w;
		if (r < 0) return items[i];
	}
	// Floating-point drift can leave r >= 0 after the last subtraction; fall
	// back to the last item that actually carries weight, never a zero one.
	return items[lastPositive];
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

export function isValidCellState(value: unknown): value is CellState {
	if (!isRecord(value)) return false;
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
		typeof streak === 'number' &&
		Number.isInteger(streak) &&
		streak >= 0
	);
}

const MAX_CELL_KEY_LENGTH = 80;
const ADJECTIVE_TYPES: ReadonlySet<string> = new Set(['hard', 'soft']);
const GENDER_KEYS: ReadonlySet<string> = new Set(ALL_ADJECTIVE_GENDER_KEYS);

/**
 * Does a key follow the cell grammar this module produces? Anything else is
 * dropped on load so a stale or tampered client cannot park garbage keys in
 * the schedule that every later merge would carry along forever.
 *
 *   n:<paradigm>:<case>:<number>
 *   a:<hard|soft>:<gender>:<case>:<number>
 *   p:<lemma>:<case>:<number>
 *   c:<case>:<number>
 */
export function isCellKey(key: string): boolean {
	if (key.length === 0 || key.length > MAX_CELL_KEY_LENGTH) return false;
	const parts = key.split(':');
	// Length is checked before any part is read, so a bare "n" or "a:" can
	// never throw — this runs inside the never-throws sanitiser.
	const tail = (from: number): boolean =>
		parts.length === from + 2 && isCase(parts[from]) && isNumber(parts[from + 1]);
	switch (parts[0]) {
		case 'n':
			return tail(2) && isParadigm(parts[1]);
		case 'p':
			// Pronoun lemmas are only checked for shape: the bank is not
			// importable here without a dependency cycle.
			return tail(2) && parts[1].length > 0;
		case 'a':
			return tail(3) && ADJECTIVE_TYPES.has(parts[1]) && GENDER_KEYS.has(parts[2]);
		case 'c':
			return tail(1);
		default:
			return false;
	}
}

/**
 * Keep the well-formed cells of an untrusted schedule and drop the rest.
 * Per-entry rather than all-or-nothing: one bad cell (a client on another
 * version, a hand edit) must never throw away every other cell — or, on the
 * client, the whole progress record. Timestamps are kept as they are:
 * `cellWeight` already treats a future `last` as "just seen", and rewriting
 * it here would let a device with a slow clock persist wrong times for cells
 * another device wrote.
 */
export function sanitizeCellSchedule(value: unknown): CellSchedule {
	if (!isRecord(value)) return {};
	const out: CellSchedule = {};
	for (const [key, state] of Object.entries(value)) {
		if (!isCellKey(key) || !isValidCellState(state)) continue;
		// A box past the top (a version with more intervals) is clamped, not
		// dropped: those are the learner's best-known rules.
		out[key] = { last: state.last, box: clampBox(state.box), streak: state.streak };
	}
	return out;
}

/**
 * Drop cells whose `last` lies more than `toleranceMs` past `now`. For the
 * server only, whose clock is authoritative: a device running fast would
 * otherwise write timestamps no genuine later attempt on another device can
 * beat in the latest-wins merge — and re-stamping them to "now" instead
 * would let that device's stale states win on every sync. Its lifetime
 * scores still sync; only its cells stay local until its clock is right.
 */
export function dropFutureCells(
	schedule: CellSchedule,
	now: number,
	toleranceMs: number
): CellSchedule {
	const limit = now + toleranceMs;
	const out: CellSchedule = {};
	for (const [key, state] of Object.entries(schedule)) {
		if (state.last <= limit) out[key] = state;
	}
	return out;
}

/**
 * Keep at most `limit` cells, preferring the highest boxes (the learner's
 * best-spaced rules, whose history is the costliest to lose) and, within a
 * box, the most recently attempted. Bounds what a client can persist without
 * failing its whole sync over the count.
 */
export function truncateCellSchedule(schedule: CellSchedule, limit: number): CellSchedule {
	const entries = Object.entries(schedule);
	if (entries.length <= limit) return schedule;
	entries.sort((a, b) => b[1].box - a[1].box || b[1].last - a[1].last);
	return Object.fromEntries(entries.slice(0, limit));
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
