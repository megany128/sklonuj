import { get } from 'svelte/store';
import { progress, getAllCaseStrengths } from './progress';
import { ALL_CASES } from '../types';

const BADGES_STORAGE_KEY = 'sklonuj_badges';
const PRACTICE_DAYS_KEY = 'sklonuj_practice_days';

export interface BadgeDefinition {
	id: string;
	name: string;
	description: string;
	icon: string;
	condition: string;
	check: (context: BadgeCheckContext) => boolean;
}

export interface EarnedBadge {
	earnedAt: string;
}

export interface BadgeWithStatus extends BadgeDefinition {
	earned: boolean;
	earnedAt: string | null;
}

export interface BadgeCheckContext {
	/** Whether the latest answer was correct */
	wasCorrect: boolean;
	/** Current consecutive-correct streak */
	streak: number;
	/** Total questions answered in this session */
	sessionQuestionCount: number;
	/** Current time (Date) */
	now: Date;
}

/**
 * Get practice days stored in localStorage (array of ISO date strings).
 * Maintained separately from session data so it works for guest users.
 */
function getPracticeDays(): string[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(PRACTICE_DAYS_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((v): v is string => typeof v === 'string');
	} catch {
		return [];
	}
}

/** Record today as a practice day (idempotent). */
export function recordPracticeDay(): void {
	if (typeof window === 'undefined') return;
	const today = new Date().toISOString().slice(0, 10);
	const days = getPracticeDays();
	if (!days.includes(today)) {
		days.push(today);
		try {
			localStorage.setItem(PRACTICE_DAYS_KEY, JSON.stringify(days));
		} catch {
			// localStorage may be unavailable
		}
	}
}

/** Count the current consecutive-day practice streak ending at today or yesterday. */
function getConsecutiveDayStreak(): number {
	const days = getPracticeDays();
	if (days.length === 0) return 0;

	const daySet = new Set(days);
	const now = new Date();
	const todayStr = now.toISOString().slice(0, 10);

	// Start from today or yesterday
	const current = new Date(now);
	if (!daySet.has(todayStr)) {
		current.setDate(current.getDate() - 1);
		const yesterdayStr = current.toISOString().slice(0, 10);
		if (!daySet.has(yesterdayStr)) return 0;
	}

	let streak = 0;
	while (daySet.has(current.toISOString().slice(0, 10))) {
		streak++;
		current.setDate(current.getDate() - 1);
	}
	return streak;
}

/** Get total questions answered across all time from the progress store. */
function getTotalQuestions(): number {
	const current = get(progress);
	let total = 0;
	for (const score of Object.values(current.caseScores)) {
		total += score.attempts;
	}
	return total;
}

/** Get total correct answers across all time from the progress store. */
function getTotalCorrect(): number {
	const current = get(progress);
	let total = 0;
	for (const score of Object.values(current.caseScores)) {
		total += score.correct;
	}
	return total;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
	{
		id: 'first_steps',
		name: 'First Steps',
		description: 'Answer your first question correctly',
		icon: '\u{1F331}',
		condition: 'Get 1 correct answer',
		check: (ctx) => ctx.wasCorrect && getTotalCorrect() >= 1
	},
	{
		id: 'centurion',
		name: 'Centurion',
		description: 'Answer 100 questions total',
		icon: '\u{1F4AF}',
		condition: 'Answer 100 questions',
		check: () => getTotalQuestions() >= 100
	},
	{
		id: 'thousand_strong',
		name: 'Thousand Strong',
		description: 'Answer 1,000 questions total',
		icon: '\u{1F3C6}',
		condition: 'Answer 1,000 questions',
		check: () => getTotalQuestions() >= 1000
	},
	{
		id: 'sharp_shooter',
		name: 'Sharp Shooter',
		description: 'Get 10 correct answers in a row',
		icon: '\u{1F3AF}',
		condition: '10 correct in a row',
		check: (ctx) => ctx.streak >= 10
	},
	{
		id: 'case_cracker',
		name: 'Case Cracker',
		description: 'Reach 80%+ accuracy on any single case (min 10 attempts)',
		icon: '\u{1F9E0}',
		condition: '80%+ on one case',
		check: () => {
			const strengths = getAllCaseStrengths();
			for (const c of ALL_CASES) {
				const s = strengths[c];
				if (s.attempts >= 10 && s.accuracy >= 0.8) return true;
			}
			return false;
		}
	},
	{
		id: 'polyglot_cases',
		name: 'Polyglot Cases',
		description: 'Reach 60%+ accuracy on all 7 cases (min 5 attempts each)',
		icon: '\u{1F30D}',
		condition: '60%+ on all 7 cases',
		check: () => {
			const strengths = getAllCaseStrengths();
			for (const c of ALL_CASES) {
				const s = strengths[c];
				if (s.attempts < 5 || s.accuracy < 0.6) return false;
			}
			return true;
		}
	},
	{
		id: 'week_warrior',
		name: 'Week Warrior',
		description: 'Practice 7 days in a row',
		icon: '\u{1F4AA}',
		condition: '7-day streak',
		check: () => getConsecutiveDayStreak() >= 7
	},
	{
		id: 'speed_demon',
		name: 'Speed Demon',
		description: 'Answer 50 questions in a single session',
		icon: '\u{26A1}',
		condition: '50 questions in one session',
		check: (ctx) => ctx.sessionQuestionCount >= 50
	},
	{
		id: 'night_owl',
		name: 'Night Owl',
		description: 'Practice after 11 PM',
		icon: '\u{1F989}',
		condition: 'Practice after 11 PM',
		check: (ctx) => ctx.now.getHours() >= 23
	},
	{
		id: 'perfectionist',
		name: 'Perfectionist',
		description: 'Answer 20 questions in a row correctly',
		icon: '\u{2B50}',
		condition: '20 correct in a row',
		check: (ctx) => ctx.streak >= 20
	}
];

/** Load earned badges from localStorage. */
function loadEarnedBadges(): Record<string, EarnedBadge> {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem(BADGES_STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
		const result: Record<string, EarnedBadge> = {};
		// parsed is a non-null, non-array object at this point
		const obj: Record<string, unknown> = Object.fromEntries(Object.entries(parsed));
		for (const [key, value] of Object.entries(obj)) {
			if (typeof value !== 'object' || value === null) continue;
			if (!('earnedAt' in value)) continue;
			const inner: Record<string, unknown> = Object.fromEntries(Object.entries(value));
			const earnedAt = inner['earnedAt'];
			if (typeof earnedAt === 'string') {
				result[key] = { earnedAt };
			}
		}
		return result;
	} catch {
		return {};
	}
}

/** Save earned badges to localStorage. */
function saveEarnedBadges(badges: Record<string, EarnedBadge>): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(BADGES_STORAGE_KEY, JSON.stringify(badges));
	} catch {
		// localStorage may be unavailable
	}
}

/**
 * Check all unearned badges and award any that pass their check.
 * Returns an array of newly earned badge definitions.
 */
export function checkAndAwardBadges(context: BadgeCheckContext): BadgeDefinition[] {
	const earned = loadEarnedBadges();
	const newlyEarned: BadgeDefinition[] = [];

	for (const badge of BADGE_DEFINITIONS) {
		if (badge.id in earned) continue;
		if (badge.check(context)) {
			earned[badge.id] = { earnedAt: new Date().toISOString() };
			newlyEarned.push(badge);
		}
	}

	if (newlyEarned.length > 0) {
		saveEarnedBadges(earned);
	}

	return newlyEarned;
}

/** Get all earned badges with their earned dates. */
export function getEarnedBadges(): Record<string, EarnedBadge> {
	return loadEarnedBadges();
}

/** Get all badge definitions with their earned status. */
export function getAllBadges(): BadgeWithStatus[] {
	const earned = loadEarnedBadges();
	return BADGE_DEFINITIONS.map((badge) => {
		const entry = earned[badge.id];
		return {
			...badge,
			earned: badge.id in earned,
			earnedAt: entry?.earnedAt ?? null
		};
	});
}
