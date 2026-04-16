import { PUBLIC_AUDIO_BASE_URL } from '$env/static/public';

interface AudioIndex {
	voice: string;
	entries: Record<string, string>;
}

// Strip trailing slashes so we can safely join with `/${rel}`. Empty string
// means "same origin" — lookupEntry returns `/audio/${rel}` in that case
// (current local-dev behavior). In prod this points at the R2 custom domain,
// e.g. https://audio.sklonuj.com.
const AUDIO_BASE = PUBLIC_AUDIO_BASE_URL.replace(/\/+$/, '');

let speakTimer: number | null = null;
let cachedVoice: SpeechSynthesisVoice | undefined;
let voicesChangedRegistered = false;
let voicesReadyCallbacks: (() => void)[] = [];

let audioIndexPromise: Promise<AudioIndex | null> | null = null;
let audioIndex: AudioIndex | null = null;
let currentAudio: HTMLAudioElement | null = null;

// Cap on how long speak() will wait for a still-loading manifest before
// giving up and falling through to Web Speech. Avoids user-visible latency
// on the first click if the manifest fetch is slow.
const MANIFEST_WAIT_MS = 500;

// Anything with spaces or long enough to be a sentence is not pre-generated
// (sentences would be a combinatorial explosion). Skip the lookup and go
// straight to Web Speech for those.
const SENTENCE_MIN_LEN = 25;

function getCzechVoice(): SpeechSynthesisVoice | null {
	if (cachedVoice) return cachedVoice;
	if (typeof window === 'undefined' || !window.speechSynthesis) return null;
	const voices = speechSynthesis.getVoices();
	const czVoices = voices.filter((v) => v.lang.startsWith('cs'));
	// Prefer enhanced/premium voices for better quality
	const enhanced = czVoices.find((v) => v.name.includes('Enhanced') || v.name.includes('Premium'));
	const found = enhanced ?? czVoices[0] ?? null;
	if (found) {
		cachedVoice = found;
		return found;
	}
	// On Chrome, voices may not be loaded yet. Register a one-time listener
	// so the cache is invalidated when voices become available.
	if (!voicesChangedRegistered) {
		voicesChangedRegistered = true;
		speechSynthesis.addEventListener('voiceschanged', () => {
			cachedVoice = undefined;
			// Notify listeners that voices are now available
			if (getCzechVoice()) {
				for (const cb of voicesReadyCallbacks) cb();
				voicesReadyCallbacks = [];
			}
		});
	}
	return null;
}

/** Lazily fetch and cache the pre-generated audio manifest. */
export function loadAudioIndex(): Promise<AudioIndex | null> {
	if (typeof window === 'undefined') return Promise.resolve(null);
	if (audioIndexPromise) return audioIndexPromise;
	audioIndexPromise = (async () => {
		try {
			const res = await fetch('/audio/index.json', { cache: 'force-cache' });
			if (!res.ok) return null;
			const data = (await res.json()) as AudioIndex;
			if (!data || typeof data !== 'object' || !data.entries) return null;
			audioIndex = data;
			return data;
		} catch {
			return null;
		}
	})();
	return audioIndexPromise;
}

function isLikelySentence(text: string): boolean {
	return text.includes(' ') || text.length > SENTENCE_MIN_LEN;
}

function stopCurrentAudio(): void {
	if (currentAudio) {
		try {
			currentAudio.pause();
			currentAudio.src = '';
		} catch {
			// Ignore — element may already be detached
		}
		currentAudio = null;
	}
}

function speakViaWebSpeech(text: string, lang: string, rate: number): void {
	if (typeof window === 'undefined' || !window.speechSynthesis) return;

	if (speakTimer) {
		clearTimeout(speakTimer);
		speakTimer = null;
	}

	if (speechSynthesis.speaking) {
		speechSynthesis.cancel();
	}

	speakTimer = window.setTimeout(() => {
		speakTimer = null;

		const voice = getCzechVoice();
		// Don't speak if no Czech voice is available — falling back to an
		// English voice for Czech text is confusing and unhelpful.
		if (!voice) return;

		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = lang;
		utterance.rate = rate;
		utterance.voice = voice;

		speechSynthesis.speak(utterance);
	}, 150);
}

function playPreGenerated(url: string, onFail: () => void): void {
	stopCurrentAudio();
	// Cancel any pending Web Speech utterance so we don't double-play.
	if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
		speechSynthesis.cancel();
	}
	if (speakTimer) {
		clearTimeout(speakTimer);
		speakTimer = null;
	}

	const audio = new Audio(url);
	currentAudio = audio;
	audio.addEventListener('ended', () => {
		if (currentAudio === audio) currentAudio = null;
	});
	audio.addEventListener('error', () => {
		if (currentAudio === audio) currentAudio = null;
		onFail();
	});
	const playPromise = audio.play();
	if (playPromise && typeof playPromise.catch === 'function') {
		playPromise.catch(() => {
			if (currentAudio === audio) currentAudio = null;
			onFail();
		});
	}
}

function lookupEntry(text: string): string | null {
	if (!audioIndex) return null;
	const rel = audioIndex.entries[text];
	if (!rel) return null;
	return AUDIO_BASE ? `${AUDIO_BASE}/${rel}` : `/audio/${rel}`;
}

async function waitForIndex(): Promise<AudioIndex | null> {
	if (audioIndex) return audioIndex;
	if (!audioIndexPromise) loadAudioIndex();
	let timer: ReturnType<typeof setTimeout> | null = null;
	const timeout = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), MANIFEST_WAIT_MS);
	});
	try {
		return await Promise.race([audioIndexPromise ?? Promise.resolve(null), timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export function speak(text: string, lang = 'cs-CZ', rate = 0.92): void {
	if (typeof window === 'undefined') return;

	const trimmed = text.trim();
	if (!trimmed) return;

	if (isLikelySentence(trimmed)) {
		speakViaWebSpeech(text, lang, rate);
		return;
	}

	const url = lookupEntry(trimmed);
	if (url) {
		playPreGenerated(url, () => speakViaWebSpeech(text, lang, rate));
		return;
	}

	if (audioIndex) {
		// Manifest is loaded and doesn't have this text — fall back directly.
		speakViaWebSpeech(text, lang, rate);
		return;
	}

	// Manifest still loading. Wait briefly, then either play or fall back.
	void waitForIndex().then((idx) => {
		if (idx) {
			const url2 = lookupEntry(trimmed);
			if (url2) {
				playPreGenerated(url2, () => speakViaWebSpeech(text, lang, rate));
				return;
			}
		}
		speakViaWebSpeech(text, lang, rate);
	});
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!audioCtx) {
		audioCtx = new AudioContext();
	}
	return audioCtx;
}

export function playCorrectSound(): void {
	const ctx = getAudioContext();
	if (!ctx) return;

	// Resume if suspended (browser autoplay policy)
	if (ctx.state === 'suspended') {
		void ctx.resume();
	}

	const now = ctx.currentTime;

	// Two-tone chime: short rising notes
	const gain = ctx.createGain();
	gain.connect(ctx.destination);
	gain.gain.setValueAtTime(0.15, now);
	gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

	const osc1 = ctx.createOscillator();
	osc1.type = 'sine';
	osc1.frequency.setValueAtTime(587, now); // D5
	osc1.connect(gain);
	osc1.start(now);
	osc1.stop(now + 0.15);

	const gain2 = ctx.createGain();
	gain2.connect(ctx.destination);
	gain2.gain.setValueAtTime(0.15, now + 0.12);
	gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

	const osc2 = ctx.createOscillator();
	osc2.type = 'sine';
	osc2.frequency.setValueAtTime(880, now + 0.12); // A5
	osc2.connect(gain2);
	osc2.start(now + 0.12);
	osc2.stop(now + 0.45);
}

export function playStreakSound(streak: number): void {
	const ctx = getAudioContext();
	if (!ctx) return;

	if (ctx.state === 'suspended') {
		void ctx.resume();
	}

	const now = ctx.currentTime;

	let notes: number[];
	let interval: number;

	if (streak >= 10) {
		notes = [587, 880, 1175, 1480, 1760];
		interval = 0.09;
	} else if (streak >= 5) {
		notes = [587, 880, 1175, 1480];
		interval = 0.1;
	} else {
		notes = [587, 880, 1175];
		interval = 0.12;
	}

	for (let i = 0; i < notes.length; i++) {
		const startTime = now + i * interval;
		const noteGain = ctx.createGain();
		noteGain.connect(ctx.destination);
		noteGain.gain.setValueAtTime(0.15, startTime);
		noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

		const osc = ctx.createOscillator();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(notes[i], startTime);
		osc.connect(noteGain);
		osc.start(startTime);
		osc.stop(startTime + 0.3);
	}

	// Shimmer effect for streak 10+
	if (streak >= 10) {
		const shimmerGain = ctx.createGain();
		shimmerGain.connect(ctx.destination);
		shimmerGain.gain.setValueAtTime(0.04, now);
		shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

		const shimmerOsc = ctx.createOscillator();
		shimmerOsc.type = 'sine';
		shimmerOsc.frequency.setValueAtTime(3520, now);
		shimmerOsc.connect(shimmerGain);
		shimmerOsc.start(now);
		shimmerOsc.stop(now + 0.6);
	}
}

export function playClinkSound(): void {
	const ctx = getAudioContext();
	if (!ctx) return;

	if (ctx.state === 'suspended') {
		void ctx.resume();
	}

	const now = ctx.currentTime;

	// Glass clink: noise burst for the initial "tick" impact
	const bufferLen = Math.floor(ctx.sampleRate * 0.04);
	const noiseBuffer = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
	const data = noiseBuffer.getChannelData(0);
	for (let i = 0; i < bufferLen; i++) {
		data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferLen * 0.15));
	}
	const noiseSrc = ctx.createBufferSource();
	noiseSrc.buffer = noiseBuffer;

	// Bandpass filter the noise to sound glassy
	const noiseBP = ctx.createBiquadFilter();
	noiseBP.type = 'bandpass';
	noiseBP.frequency.value = 4000;
	noiseBP.Q.value = 2;

	const noiseGain = ctx.createGain();
	noiseGain.gain.setValueAtTime(0.25, now);
	noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

	noiseSrc.connect(noiseBP);
	noiseBP.connect(noiseGain);
	noiseGain.connect(ctx.destination);
	noiseSrc.start(now);
	noiseSrc.stop(now + 0.05);

	// High glass ring tone
	const ring1 = ctx.createOscillator();
	ring1.type = 'sine';
	ring1.frequency.setValueAtTime(3200, now);
	const ring1Gain = ctx.createGain();
	ring1Gain.gain.setValueAtTime(0.1, now);
	ring1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
	ring1.connect(ring1Gain);
	ring1Gain.connect(ctx.destination);
	ring1.start(now);
	ring1.stop(now + 0.25);

	// Second harmonic ring
	const ring2 = ctx.createOscillator();
	ring2.type = 'sine';
	ring2.frequency.setValueAtTime(5200, now);
	const ring2Gain = ctx.createGain();
	ring2Gain.gain.setValueAtTime(0.06, now);
	ring2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
	ring2.connect(ring2Gain);
	ring2Gain.connect(ctx.destination);
	ring2.start(now);
	ring2.stop(now + 0.18);
}

/** Remove the ___ gap placeholder and clean up whitespace/punctuation for natural TTS. */
export function prepareSentenceForTTS(text: string): string {
	return text
		.replace('___', '')
		.replace(/\s+/g, ' ')
		.replace(/\s([.,!?])/g, '$1')
		.trim();
}

export function isTTSAvailable(): boolean {
	if (typeof window === 'undefined') return false;
	// Pre-generated audio works on any browser that can play MP3s, even those
	// without Web Speech API. Treat TTS as available whenever either source
	// can deliver audio.
	if (audioIndex && Object.keys(audioIndex.entries).length > 0) return true;
	if (typeof window.speechSynthesis === 'undefined') return false;
	return getCzechVoice() !== null;
}

/** Register a callback for when Czech voices become available (async on Chrome). */
export function onCzechVoiceReady(callback: () => void): void {
	if (getCzechVoice()) {
		callback();
	} else {
		voicesReadyCallbacks.push(callback);
	}
}

/** Warm up voices so they're ready when needed. Call once on init. */
export function warmUpVoices(): void {
	if (typeof window === 'undefined' || !window.speechSynthesis) return;
	// Trigger voice loading — on Chrome, getVoices() is empty until voiceschanged fires
	speechSynthesis.getVoices();
}
