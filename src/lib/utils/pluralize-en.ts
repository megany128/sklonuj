// Simple English pluralization for noun translation display.
// Handles common regular patterns; not a full inflector.

const IRREGULAR: Record<string, string> = {
	man: 'men',
	woman: 'women',
	child: 'children',
	person: 'people',
	foot: 'feet',
	tooth: 'teeth',
	goose: 'geese',
	mouse: 'mice',
	ox: 'oxen',
	cactus: 'cacti',
	nucleus: 'nuclei',
	syllabus: 'syllabi',
	focus: 'foci',
	fungus: 'fungi',
	thesis: 'theses',
	crisis: 'crises',
	phenomenon: 'phenomena',
	criterion: 'criteria',
	datum: 'data',
	medium: 'media',
	bacterium: 'bacteria',
	leaf: 'leaves',
	loaf: 'loaves',
	knife: 'knives',
	life: 'lives',
	wife: 'wives',
	wolf: 'wolves',
	calf: 'calves',
	half: 'halves',
	self: 'selves',
	elf: 'elves',
	shelf: 'shelves'
};

const UNCOUNTABLE = new Set([
	'sheep',
	'fish',
	'deer',
	'series',
	'species',
	'money',
	'information',
	'equipment',
	'rice',
	'water',
	'milk',
	'bread',
	'music',
	'news',
	'advice',
	'furniture',
	'luggage'
]);

function pluralizeWord(word: string): string {
	const lower = word.toLowerCase();
	if (UNCOUNTABLE.has(lower)) return word;
	if (IRREGULAR[lower]) return matchCase(word, IRREGULAR[lower]);

	if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es';
	if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
	if (/[^aeiou]o$/i.test(word)) return word + 'es';
	if (/fe$/i.test(word)) return word.slice(0, -2) + 'ves';
	if (/[^f]f$/i.test(word)) return word.slice(0, -1) + 'ves';
	return word + 's';
}

function matchCase(src: string, target: string): string {
	if (src === src.toUpperCase()) return target.toUpperCase();
	if (src[0] === src[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
	return target;
}

// Pluralize a translation string. Splits on commas / slashes and pluralizes
// the head noun of each clause (last word before any parenthetical).
export function pluralizeTranslation(translation: string): string {
	if (!translation) return translation;
	return translation
		.split(/(\s*[,/]\s*)/)
		.map((chunk) => {
			if (/^\s*[,/]\s*$/.test(chunk)) return chunk;
			const parenMatch = chunk.match(/^(.*?)(\s*\(.*\))?$/);
			const head = parenMatch?.[1] ?? chunk;
			const tail = parenMatch?.[2] ?? '';
			const words = head.trim().split(/\s+/);
			if (words.length === 0) return chunk;
			const lastIdx = words.length - 1;
			const last = words[lastIdx];
			const punctMatch = last.match(/^([A-Za-zÀ-ÿ'-]+)([^A-Za-zÀ-ÿ'-]*)$/);
			if (punctMatch) {
				words[lastIdx] = pluralizeWord(punctMatch[1]) + punctMatch[2];
			} else {
				words[lastIdx] = pluralizeWord(last);
			}
			const leading = head.match(/^\s*/)?.[0] ?? '';
			const trailing = head.match(/\s*$/)?.[0] ?? '';
			return leading + words.join(' ') + trailing + tail;
		})
		.join('');
}
