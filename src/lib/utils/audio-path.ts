import { sha1Hex } from './sha1';

/**
 * Where a pre-generated recording lives, relative to the audio root:
 * `cs/<first two hex>/<hash>.mp3` with `hash = sha1(voice|text)[:16]`. This is
 * the scheme `scripts/generate_tts.py` writes files under (`path_for`), so the
 * page can find a recording from the word alone and only needs to know which
 * words have one (`static/audio/forms.json`), not the full path map
 * (`index.json`, six times the size).
 */
export function audioPathFor(voice: string, text: string): string {
	const hash = sha1Hex(`${voice}|${text}`).slice(0, 16);
	return `cs/${hash.slice(0, 2)}/${hash}.mp3`;
}
