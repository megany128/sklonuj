let speakTimer: ReturnType<typeof setTimeout> | null = null;
let cachedVoice: SpeechSynthesisVoice | null = null;

function getCzechVoice(): SpeechSynthesisVoice | null {
	if (cachedVoice) return cachedVoice;
	const voices = speechSynthesis.getVoices();
	cachedVoice = voices.find((v) => v.lang.startsWith('cs')) ?? null;
	return cachedVoice;
}

export function speak(text: string, lang = 'cs-CZ', rate = 0.85): void {
	if (typeof window === 'undefined' || !window.speechSynthesis) return;

	if (speakTimer) {
		clearTimeout(speakTimer);
		speakTimer = null;
	}

	speechSynthesis.cancel();

	speakTimer = setTimeout(() => {
		speakTimer = null;
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = lang;
		utterance.rate = rate;

		const voice = getCzechVoice();
		if (voice) {
			utterance.voice = voice;
		}

		speechSynthesis.speak(utterance);
	}, 150);
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
		ctx.resume();
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
		ctx.resume();
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
		ctx.resume();
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

export function isTTSAvailable(): boolean {
	if (typeof window === 'undefined') return false;
	return typeof window.speechSynthesis !== 'undefined';
}

/** Warm up voices so they're ready when needed. Call once on init. */
export function warmUpVoices(): void {
	if (typeof window === 'undefined' || !window.speechSynthesis) return;
	// Trigger voice loading — on Chrome, getVoices() is empty until voiceschanged fires
	speechSynthesis.getVoices();
}
