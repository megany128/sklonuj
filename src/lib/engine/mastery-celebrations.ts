const STORAGE_KEY = 'sklonuj_mastery_celebrations';

function load(): Set<string> {
	if (typeof window === 'undefined') return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return new Set();
		return new Set(parsed.filter((v): v is string => typeof v === 'string'));
	} catch {
		return new Set();
	}
}

function save(set: Set<string>): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
	} catch {
		// ignore
	}
}

export function hasMasteryCelebrated(key: string): boolean {
	return load().has(key);
}

export function markMasteryCelebrated(key: string): void {
	const set = load();
	if (set.has(key)) return;
	set.add(key);
	save(set);
}

export function clearMasteryCelebrations(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
