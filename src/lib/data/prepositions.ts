import type { Case } from '$lib/types';

export interface PrepositionEntry {
	czech: string;
	english: string;
}

export interface CasePrepositions {
	case_: string;
	key: Case;
	prepositions: PrepositionEntry[];
}

export const casePrepositions: CasePrepositions[] = [
	{
		case_: 'Genitive',
		key: 'gen',
		prepositions: [
			{ czech: 'do', english: 'to / into' },
			{ czech: 'z / ze', english: 'from / out of' },
			{ czech: 'od', english: 'from (a person)' },
			{ czech: 'bez', english: 'without' },
			{ czech: 'u', english: 'at / near' },
			{ czech: 'podle', english: 'according to' },
			{ czech: 'vedle', english: 'next to' },
			{ czech: 'kolem', english: 'around' }
		]
	},
	{
		case_: 'Dative',
		key: 'dat',
		prepositions: [{ czech: 'k / ke', english: 'to / toward' }]
	},
	{
		case_: 'Accusative',
		key: 'acc',
		prepositions: [
			{ czech: 'na', english: 'onto (motion)' },
			{ czech: 'přes', english: 'across / over' },
			{ czech: 'pro', english: 'for' },
			{ czech: 'o', english: 'about' }
		]
	},
	{
		case_: 'Locative',
		key: 'loc',
		prepositions: [
			{ czech: 'v / ve', english: 'in' },
			{ czech: 'na', english: 'on (location)' },
			{ czech: 'o', english: 'about' },
			{ czech: 'po', english: 'after / around' },
			{ czech: 'při', english: 'during / at' }
		]
	},
	{
		case_: 'Instrumental',
		key: 'ins',
		prepositions: [
			{ czech: 's / se', english: 'with' },
			{ czech: 'za', english: 'behind / for' },
			{ czech: 'pod', english: 'under' },
			{ czech: 'nad', english: 'above' },
			{ czech: 'před', english: 'in front of' },
			{ czech: 'mezi', english: 'between' }
		]
	}
];
