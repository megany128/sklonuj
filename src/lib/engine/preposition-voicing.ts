/**
 * Czech preposition voicing rules.
 * Certain prepositions gain an extra vowel before specific consonant clusters:
 *   k -> ke, s -> se, v -> ve, z -> ze
 *
 * Pure module — no dependencies. Imported by both the drill engine (runtime
 * rendering) and the template-review module (offline / admin audit) so that
 * reviewers see the same surface form learners see.
 */
export function applyPrepositionVoicing(template: string, filledForm: string): string {
	if (filledForm.length === 0) return template;

	const lower = filledForm.toLowerCase();
	const firstChar = lower[0];
	const firstTwo = lower.slice(0, 2);

	// Detect consonant cluster: first two chars are both consonants (not vowels)
	const vowels = new Set('aeiouyáéíóúůý');
	const isCluster = lower.length >= 2 && !vowels.has(lower[0]) && !vowels.has(lower[1]);

	// k -> ke: before k, g, or consonant clusters starting with k/g/mn/vz/vš/dv
	function needsKe(): boolean {
		if (firstChar === 'k' || firstChar === 'g') return true;
		if (isCluster) {
			if (
				['mn', 'vz', 'vš', 'dv', 'dn', 'sp', 'sk', 'st', 'sv', 'šk', 'šp', 'št'].some(
					(cl) => firstTwo === cl
				)
			)
				return true;
		}
		return false;
	}

	// s -> se: before s, z, š, ž, or consonant clusters starting with those + mn/vz/dv
	function needsSe(): boolean {
		if ('szšž'.includes(firstChar)) return true;
		if (isCluster) {
			if (['mn', 'vz', 'vš', 'dv', 'ct', 'čt'].some((cl) => firstTwo === cl)) return true;
		}
		return false;
	}

	// v -> ve: before v, f, or consonant clusters starting with those + sp/st/sk/šk/zd/zn/mn/jm
	// Also covers lexicalized cases: "ve městě" (mě-), "ve všech" (vš-), "ve vzduchu" (vz-).
	function needsVe(): boolean {
		if (firstChar === 'v' || firstChar === 'f') return true;
		if (isCluster) {
			if (
				[
					'sp',
					'st',
					'sk',
					'šk',
					'zd',
					'zn',
					'dn',
					'dv',
					'sv',
					'šp',
					'št',
					'ct',
					'čt',
					'mn',
					'jm',
					'mě',
					'vš',
					'vz'
				].some((cl) => firstTwo === cl)
			)
				return true;
		}
		return false;
	}

	// z -> ze: before s, z, š, ž, or consonant clusters
	function needsZe(): boolean {
		if ('szšž'.includes(firstChar)) return true;
		if (isCluster) {
			if (['dv', 'dn', 'vz', 'vš', 'mn', 'ct', 'čt'].some((cl) => firstTwo === cl)) return true;
		}
		return false;
	}

	// Replace the preposition immediately before the blank (___) in the template.
	// Pattern: word boundary + preposition + space + ___
	return template
		.replace(/\bk ___/g, needsKe() ? 'ke ___' : 'k ___')
		.replace(/\bs ___/g, needsSe() ? 'se ___' : 's ___')
		.replace(/\bv ___/g, needsVe() ? 've ___' : 'v ___')
		.replace(/\bz ___/g, needsZe() ? 'ze ___' : 'z ___');
}
