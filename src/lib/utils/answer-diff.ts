import { stripDiacritics } from './diacritics';

export interface DiffSegment {
	text: string;
	changed: boolean;
}

function pushSegment(segments: DiffSegment[], text: string, changed: boolean): void {
	if (text === '') return;
	const last = segments.at(-1);
	if (last && last.changed === changed) {
		last.text += text;
	} else {
		segments.push({ text, changed });
	}
}

/**
 * Split `text` into unchanged / changed runs relative to `reference`, so
 * feedback can point at exactly the part of an answer that differs.
 *
 * - Diacritic-only differences (`zene` vs `ženě`) mark each letter whose
 *   accent differs.
 * - Anything else marks the span between the longest shared prefix and
 *   suffix — for declension that is almost always the ending (`ženem` vs
 *   `ženou` → `žen[em]`) or a stem alternation (`kočke` vs `kočce` →
 *   `koč[k]e`).
 *
 * Comparison is case-insensitive; the returned text keeps `text`'s casing.
 */
export function diffAnswer(text: string, reference: string): DiffSegment[] {
	const a = Array.from(text.normalize('NFC'));
	const b = Array.from(reference.normalize('NFC'));
	const al = a.map((c) => c.toLowerCase());
	const bl = b.map((c) => c.toLowerCase());
	const segments: DiffSegment[] = [];

	if (a.length === b.length && stripDiacritics(al.join('')) === stripDiacritics(bl.join(''))) {
		a.forEach((ch, i) => pushSegment(segments, ch, al[i] !== bl[i]));
		return segments;
	}

	const maxShared = Math.min(a.length, b.length);
	let prefix = 0;
	while (prefix < maxShared && al[prefix] === bl[prefix]) prefix++;
	let suffix = 0;
	while (suffix < maxShared - prefix && al[a.length - 1 - suffix] === bl[b.length - 1 - suffix]) {
		suffix++;
	}

	pushSegment(segments, a.slice(0, prefix).join(''), false);
	pushSegment(segments, a.slice(prefix, a.length - suffix).join(''), true);
	pushSegment(segments, a.slice(a.length - suffix).join(''), false);
	return segments;
}
