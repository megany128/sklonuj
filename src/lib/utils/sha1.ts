/**
 * SHA-1 of a string's UTF-8 bytes, as lowercase hex. Synchronous on purpose:
 * `crypto.subtle.digest` is async, and audio must start inside the tap that
 * asked for it. Used only to name audio files (see `audio-path.ts`), never for
 * anything security-related.
 */
export function sha1Hex(text: string): string {
	const bytes = new TextEncoder().encode(text);
	const bitLength = bytes.length * 8;
	// Message + 0x80 + zero padding + 64-bit length, in 64-byte blocks.
	const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
	view.setUint32(padded.length - 4, bitLength >>> 0);

	let h0 = 0x67452301;
	let h1 = 0xefcdab89;
	let h2 = 0x98badcfe;
	let h3 = 0x10325476;
	let h4 = 0xc3d2e1f0;
	const w = new Uint32Array(80);
	const rotl = (n: number, bits: number): number => (n << bits) | (n >>> (32 - bits));

	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
		for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;
		for (let i = 0; i < 80; i++) {
			let f: number;
			let k: number;
			if (i < 20) {
				f = (b & c) | (~b & d);
				k = 0x5a827999;
			} else if (i < 40) {
				f = b ^ c ^ d;
				k = 0x6ed9eba1;
			} else if (i < 60) {
				f = (b & c) | (b & d) | (c & d);
				k = 0x8f1bbcdc;
			} else {
				f = b ^ c ^ d;
				k = 0xca62c1d6;
			}
			const temp = (rotl(a, 5) + f + e + k + w[i]) | 0;
			e = d;
			d = c;
			c = rotl(b, 30);
			b = a;
			a = temp;
		}
		h0 = (h0 + a) | 0;
		h1 = (h1 + b) | 0;
		h2 = (h2 + c) | 0;
		h3 = (h3 + d) | 0;
		h4 = (h4 + e) | 0;
	}
	return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}
