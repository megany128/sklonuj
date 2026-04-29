/** Czech diacritics → ASCII mapping used for near-miss detection. */
export const DIACRITICS_MAP: Record<string, string> = {
	ě: 'e',
	š: 's',
	č: 'c',
	ř: 'r',
	ž: 'z',
	ý: 'y',
	á: 'a',
	í: 'i',
	é: 'e',
	ó: 'o',
	ú: 'u',
	ů: 'u',
	ď: 'd',
	ť: 't',
	ň: 'n',
	Ě: 'E',
	Š: 'S',
	Č: 'C',
	Ř: 'R',
	Ž: 'Z',
	Ý: 'Y',
	Á: 'A',
	Í: 'I',
	É: 'E',
	Ó: 'O',
	Ú: 'U',
	Ů: 'U',
	Ď: 'D',
	Ť: 'T',
	Ň: 'N'
};

/** Strip Czech diacritics from a string, replacing accented characters with their ASCII equivalents. */
export function stripDiacritics(s: string): string {
	let result = '';
	for (const ch of s) {
		result += DIACRITICS_MAP[ch] ?? ch;
	}
	return result;
}
