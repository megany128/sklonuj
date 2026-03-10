export function speak(text: string, lang = 'cs-CZ', rate = 0.85): void {
	if (typeof window === 'undefined' || !window.speechSynthesis) return;

	speechSynthesis.cancel();

	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = lang;
	utterance.rate = rate;

	speechSynthesis.speak(utterance);
}

export function isTTSAvailable(): boolean {
	if (typeof window === 'undefined') return false;
	return typeof window.speechSynthesis !== 'undefined';
}
