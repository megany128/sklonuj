import type { Difficulty, DrillSettings, DrillType } from '$lib/types';
import { ALL_CASES, LEVEL_ORDER } from '$lib/types';
import curriculumData from '$lib/data/curriculum.json';
import type { CurriculumLevel } from './drill';

const curriculum: Record<string, CurriculumLevel> = curriculumData;

/**
 * The settings a CEFR level should auto-enable when the learner has no saved
 * per-level config: turn on exactly the content the level's curriculum entry
 * unlocks. Pure — the page wires storage + reactivity around it.
 *
 * Drill-type selection isn't level-gated, so it carries over from whatever is
 * currently active (`baseDrillTypes`) rather than resetting on every switch.
 *
 * - pronouns unlocked  => contentMode 'both' (nouns + pronouns), else 'nouns'
 * - adjectives unlocked => wordMode 'both' (nouns + adjectives), else 'nouns'
 * - plural fully unlocked (=== true) => numberMode 'both', else 'sg'
 *   ('sg_first' deliberately defaults to singular but stays toggleable).
 */
export function levelDefaultSettings(
	level: Difficulty,
	baseDrillTypes: DrillType[]
): DrillSettings {
	const cfg = curriculum[level];
	return {
		selectedCases: [...ALL_CASES],
		selectedDrillTypes: baseDrillTypes,
		contentMode: cfg?.pronouns_unlocked ? 'both' : 'nouns',
		wordMode: cfg?.adjectives_unlocked ? 'both' : 'nouns',
		numberMode: cfg?.plural_unlocked === true ? 'both' : 'sg'
	};
}

/** A content toggle in the drill settings that a CEFR level can lock. */
export type GatedContent = 'pronouns' | 'adjectives' | 'demonstratives';

const CONTENT_FLAG: Record<GatedContent, keyof CurriculumLevel> = {
	pronouns: 'pronouns_unlocked',
	adjectives: 'adjectives_unlocked',
	demonstratives: 'demonstratives_unlocked'
};

/**
 * Content toggles `level` hasn't unlocked but a higher level does, each with
 * the lowest level that unlocks it. The settings show them anyway, greyed, and
 * picking one offers to move up to that level, as the locked case pills do.
 */
export function lockedContentForLevel(
	level: Difficulty
): { content: GatedContent; unlockLevel: Difficulty }[] {
	const result: { content: GatedContent; unlockLevel: Difficulty }[] = [];
	for (const content of ['pronouns', 'adjectives', 'demonstratives'] as const) {
		if (curriculum[level]?.[CONTENT_FLAG[content]] === true) continue;
		const above = LEVEL_ORDER.slice(LEVEL_ORDER.indexOf(level) + 1);
		const unlockLevel = above.find((l) => curriculum[l]?.[CONTENT_FLAG[content]] === true);
		if (unlockLevel) result.push({ content, unlockLevel });
	}
	return result;
}
