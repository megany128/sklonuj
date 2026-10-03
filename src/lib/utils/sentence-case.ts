/**
 * Capitalize the first letter of a sentence, skipping leading punctuation
 * such as the "[" that marks the drilled word in assignment mistake reports.
 * Templates that open with the blank ("___ je tady.") would otherwise start
 * with a lowercase noun once filled in.
 */
export function capitalizeSentence(sentence: string): string {
	const i = sentence.search(/\p{L}/u);
	if (i === -1) return sentence;
	return sentence.slice(0, i) + sentence[i].toUpperCase() + sentence.slice(i + 1);
}
