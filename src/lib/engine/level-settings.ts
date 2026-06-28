import type { Difficulty, DrillSettings, DrillType } from '$lib/types';
import { ALL_CASES } from '$lib/types';
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
