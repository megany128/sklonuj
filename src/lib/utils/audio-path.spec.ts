import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sha1Hex } from './sha1';
import { audioPathFor } from './audio-path';
import { isRecord } from './is-record';

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('sha1Hex', () => {
	it('matches the standard test vectors', () => {
		expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
		expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
		expect(sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
			'84983e441c3bd26ebaae4aa1f95129e5e54670f1'
		);
	});

	it('hashes UTF-8 bytes, and messages that cross a block boundary', () => {
		// Python: hashlib.sha1('cs-CZ-AntoninNeural|Američance'.encode()).hexdigest()
		expect(sha1Hex('cs-CZ-AntoninNeural|Američance').slice(0, 16)).toBe('52a903461c8cbdf2');
		// 55, 56 and 64 bytes sit on either side of the padding edge.
		expect(sha1Hex('a'.repeat(55))).toBe('c1c8bbdc22796e28c0e15163d20899b65621d65a');
		expect(sha1Hex('a'.repeat(56))).toBe('c2db330f6083854c99d4b5bfb6e8f29f201be699');
		expect(sha1Hex('a'.repeat(64))).toBe('0098ba824b5c16427bd7a1122a5a442a25ec644d');
	});
});

describe('audio manifest', () => {
	const index = readJson('static/audio/index.json');
	const forms = readJson('static/audio/forms.json');
	if (!isRecord(index) || !isRecord(index.entries) || typeof index.voice !== 'string') {
		throw new Error('static/audio/index.json is not a manifest');
	}
	const entries = index.entries;
	const voice = index.voice;

	it('every recording is where the app computes it to be', () => {
		const texts = Object.keys(entries);
		expect(texts.length).toBeGreaterThan(20000);
		const wrong = texts.filter((text) => entries[text] !== audioPathFor(voice, text));
		expect(wrong).toEqual([]);
	});

	it('forms.json lists exactly the texts in index.json, for the same voice', () => {
		// Regenerate with `pnpm tts:generate`, which writes both files.
		expect(forms).toEqual({ voice, forms: Object.keys(entries).sort() });
	});
});
