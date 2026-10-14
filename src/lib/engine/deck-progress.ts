import { writable } from 'svelte/store';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FocusTopic } from '../types';
import { isFocusTopic } from './focus';
import { isRecord } from '../utils/is-record';

/**
 * How a learner is doing in each deck: answers given and answers right, so the
 * Decks page can show "62% right · 41 answered". Kept on the device
 * (localStorage) and, when signed in, merged with the account so every device
 * shows the same. It plays no part in scheduling.
 */
export interface DeckStat {
	attempts: number;
	correct: number;
	/** Epoch ms of the latest answer. */
	last: number;
}

export type DeckProgress = Partial<Record<FocusTopic, DeckStat>>;

const STORAGE_KEY = 'sklonuj_deck_progress';

function isStat(value: unknown): value is DeckStat {
	if (!isRecord(value)) return false;
	const { attempts, correct, last } = value;
	return (
		typeof attempts === 'number' &&
		typeof correct === 'number' &&
		typeof last === 'number' &&
		Number.isFinite(attempts) &&
		Number.isFinite(correct) &&
		Number.isFinite(last) &&
		attempts >= 0 &&
		correct >= 0 &&
		correct <= attempts
	);
}

/** Keep the well-formed entries of whatever was stored; drop the rest. */
export function sanitizeDeckProgress(raw: unknown): DeckProgress {
	const out: DeckProgress = {};
	if (!isRecord(raw)) return out;
	for (const [key, value] of Object.entries(raw)) {
		if (isFocusTopic(key) && isStat(value)) out[key] = value;
	}
	return out;
}

/** The progress after one more answer in `deck`. Does not mutate `progress`. */
export function withDeckAnswer(
	progress: DeckProgress,
	deck: FocusTopic,
	correct: boolean,
	now: number
): DeckProgress {
	const prev = progress[deck] ?? { attempts: 0, correct: 0, last: 0 };
	return {
		...progress,
		[deck]: {
			attempts: prev.attempts + 1,
			correct: prev.correct + (correct ? 1 : 0),
			last: now
		}
	};
}

/** Whole-number percent right, or null before the first answer. */
export function deckAccuracy(stat: DeckStat | undefined): number | null {
	if (!stat || stat.attempts === 0) return null;
	return Math.round((stat.correct / stat.attempts) * 100);
}

export function loadDeckProgress(): DeckProgress {
	if (typeof localStorage === 'undefined') return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? sanitizeDeckProgress(JSON.parse(raw)) : {};
	} catch {
		return {};
	}
}

/**
 * The saved totals as a store, so the Decks page updates when a sync brings
 * in another device's progress.
 */
export const deckProgress = writable<DeckProgress>(loadDeckProgress());

function save(next: DeckProgress): void {
	deckProgress.set(next);
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private mode or a full quota: the deck still works, it just isn't kept.
	}
}

/** Count one answer in `deck` and save. */
export function recordDeckAnswer(deck: FocusTopic, correct: boolean, now = Date.now()): void {
	save(withDeckAnswer(loadDeckProgress(), deck, correct, now));
}

// Bumped whenever the device's totals stop belonging to whoever was signed
// in, so a sync answer that arrives afterwards is not written back.
let owner = 0;

/** Forget this device's totals (sign-out, or another account's leftovers). */
export function clearDeckProgress(): void {
	owner++;
	save({});
}

// Another tab's answers reach this one through storage; keep the store in step.
if (typeof window !== 'undefined') {
	window.addEventListener('storage', (event) => {
		if (event.key === STORAGE_KEY || event.key === null) deckProgress.set(loadDeckProgress());
	});
}

/**
 * Combine two devices' totals. They are counters and both may have counted
 * while apart, so there is no exact merge: per deck the one with more attempts
 * wins, then the more recent, then `a`. The `merge_deck_progress` RPC
 * (migration 041) applies the same rule on the account.
 */
export function mergeDeckProgress(a: DeckProgress, b: DeckProgress): DeckProgress {
	const out: DeckProgress = { ...b };
	for (const [key, stat] of Object.entries(a)) {
		if (!isFocusTopic(key) || !stat) continue;
		const other = b[key];
		const keepOther =
			other !== undefined &&
			(other.attempts > stat.attempts ||
				(other.attempts === stat.attempts && other.last > stat.last));
		if (!keepOther) out[key] = stat;
	}
	return out;
}

/** PostgREST / Postgres codes for "this function does not exist". */
const MISSING_FUNCTION_CODES: ReadonlySet<string> = new Set(['PGRST202', '42883']);

/** True for the error a database gives before migration 041 has been run. */
export function isMissingFunctionError(error: { code?: string }): boolean {
	return error.code !== undefined && MISSING_FUNCTION_CODES.has(error.code);
}

/**
 * What the account's totals come to on this device, given what was sent and
 * what the device holds now. Answers given while the request was in flight
 * are in `current` but in neither `sent` nor `remote`, so they are added on
 * top of the merge rather than lost when the account is ahead. This assumes
 * nothing but answers changed the stored totals in between, which
 * `syncDeckProgress` guarantees with a cross-tab lock.
 */
export function reconcileDeckProgress(
	sent: DeckProgress,
	remote: DeckProgress,
	current: DeckProgress
): DeckProgress {
	const out = mergeDeckProgress(sent, remote);
	for (const [key, now] of Object.entries(current)) {
		if (!isFocusTopic(key) || !now) continue;
		const before = sent[key] ?? { attempts: 0, correct: 0, last: 0 };
		const attempts = now.attempts - before.attempts;
		if (attempts <= 0) continue;
		const base = out[key] ?? { attempts: 0, correct: 0, last: 0 };
		out[key] = {
			attempts: base.attempts + attempts,
			correct: base.correct + Math.max(0, now.correct - before.correct),
			last: Math.max(base.last, now.last)
		};
	}
	return out;
}

/**
 * Merge this device's totals into the signed-in account and bring the
 * account's back; called on sign-in. Answers after that reach the account
 * through `/api/sync`. Does nothing before migration 041 has been run (the
 * totals stay on the device) or before the account has a progress row, and
 * drops the answer if the learner signed out while it was on its way.
 *
 * Tabs share the stored totals, so the exchange runs under a lock held
 * across tabs: while one tab is between sending and applying, another tab
 * can add answers to storage but cannot write downloaded totals there.
 * Without that, the second tab's download would look like new answers to
 * the first and be counted twice.
 */
export async function syncDeckProgress(supabase: SupabaseClient): Promise<void> {
	const exchange = async (exclusive: boolean): Promise<void> => {
		const sent = loadDeckProgress();
		const sentFor = owner;
		const { data, error } = await supabase.rpc('merge_deck_progress', { p_incoming: sent });
		if (error) {
			if (!isMissingFunctionError(error)) console.error('Failed to sync deck progress:', error);
			return;
		}
		if (data === null || sentFor !== owner) return;
		// Only with the lock is "what changed since I sent" certainly answers.
		applyAccountDeckProgress(data, exclusive ? sent : loadDeckProgress());
	};
	if (typeof navigator !== 'undefined' && navigator.locks) {
		await navigator.locks.request(SYNC_LOCK, () => exchange(true));
	} else {
		// No Web Locks (older Safari): take the plain merge, which can drop an
		// answer given during the request but can never double-count.
		await exchange(false);
	}
}

const SYNC_LOCK = 'sklonuj_deck_progress_sync';

/**
 * Take the account's totals (untrusted JSON from the RPC) into this device.
 * `sent` is what the device held when it asked; anything counted since is
 * kept on top (see `reconcileDeckProgress`).
 */
export function applyAccountDeckProgress(
	remote: unknown,
	sent: DeckProgress = loadDeckProgress()
): void {
	save(reconcileDeckProgress(sent, sanitizeDeckProgress(remote), loadDeckProgress()));
}
