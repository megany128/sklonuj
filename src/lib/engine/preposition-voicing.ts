/**
 * Czech preposition voicing rules.
 * The non-syllabic prepositions k, s, v, z gain an extra vowel (ke, se, ve, ze)
 * before certain consonants and consonant clusters. Rules follow the ÚJČ
 * Internetová jazyková příručka ("Vokalizace předložek"):
 *   - always before the same consonant (ke kořenům, se sestrou, ve vejci, ze země)
 *   - before a similar consonant: k + g, s + z/ž/š, z + s/š/ž, v + f
 *   - before the groups tř, dř, sl, zr, zl (ve třech, ze dřeva, ke slibu, se zlodějem),
 *     but "k dřevěné" stays unvocalized
 *   - common usage before s/z/š/ž + consonant (ke stolu, ve sněhu, ke zdi)
 *   - lexicalized cases (ke mně, se mnou, ve dne, ve dvou, se psem, se lvem,
 *     ve čtvrtek, ve jménu, ve městě, ze vsi)
 *   - mn- only for the pronoun já and mnoho/mnohý (ke mně, se mnou, ve mnoha);
 *     other mn- words stay unvocalized (v Mnichově, z množství, k mnichovi)
 *
 * Pure module — no dependencies. Imported by both the drill engine (runtime
 * rendering) and the template-review module (offline / admin audit) so that
 * reviewers see the same surface form learners see.
 */
const VOWELS = new Set('aeiouyáéíóúůýě');
const SIBILANTS = 'szšž';

// Groups that trigger vocalization for every non-syllabic preposition.
const SHARED_CLUSTERS = ['tř', 'sl', 'zr', 'zl', 'dv', 'dn', 'ct', 'čt', 'vz', 'vš'];

// mn- vocalizes the preposition before forms of já (mně, mne, mnou) and of
// mnoho/mnohý, not before every mn- word ("v Mnichově", "z množství").
const MN_VOCALIZING = /^(mně|mne|mnou|mnoh)/;

const EXTRA_CLUSTERS: Record<'k' | 's' | 'v' | 'z', string[]> = {
	k: ['ps', 'lv', 'vs'],
	s: ['dř', 'ps', 'lv', 'vs'],
	v: ['dř', 'jm'],
	z: ['dř', 'lv', 'vs']
};

function needsVowel(prep: 'k' | 's' | 'v' | 'z', filledForm: string): boolean {
	const lower = filledForm.toLowerCase();
	const first = lower[0];
	const second = lower[1] ?? '';
	const firstTwo = lower.slice(0, 2);
	const isCluster = second !== '' && !VOWELS.has(first) && !VOWELS.has(second);

	switch (prep) {
		case 'k':
			if (first === 'k' || first === 'g') return true;
			break;
		case 's':
		case 'z':
			if (SIBILANTS.includes(first)) return true;
			break;
		case 'v':
			if (first === 'v' || first === 'f') return true;
			// "ve městě" is lexicalized; other mě- words stay unvocalized (v měsíci).
			if (lower.startsWith('měst')) return true;
			break;
	}

	if (!isCluster) return false;
	if (firstTwo === 'mn') return MN_VOCALIZING.test(lower);
	// k/v before s, z, š, ž + consonant (s/z already covered above).
	if (SIBILANTS.includes(first)) return true;
	return SHARED_CLUSTERS.includes(firstTwo) || EXTRA_CLUSTERS[prep].includes(firstTwo);
}

// The preposition must be a standalone word (not the tail of a word like "lev ___"),
// so require start-of-string or a non-letter before it. Capitalized prepositions at
// the start of a sentence ("S ___ kamarádem") keep their capital.
const PREPOSITION_BEFORE_BLANK = /(?<!\p{L})([kKsSvVzZ]) ___/gu;

export function applyPrepositionVoicing(template: string, filledForm: string): string {
	if (filledForm.length === 0) return template;
	return template.replace(PREPOSITION_BEFORE_BLANK, (match, prep: string) => {
		const key = prep.toLowerCase();
		if (key !== 'k' && key !== 's' && key !== 'v' && key !== 'z') return match;
		return needsVowel(key, filledForm) ? `${prep}e ___` : match;
	});
}
