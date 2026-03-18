import { writable } from 'svelte/store';

export const darkMode = writable(false);

let initialized = false;

/**
 * Read localStorage / system preference and apply the `dark` class.
 * Safe to call multiple times — only the first call has any effect.
 */
export function initDarkMode(): void {
	if (initialized) return;
	initialized = true;
	if (typeof window === 'undefined') return;

	let stored: string | null = null;
	try {
		stored = localStorage.getItem('sklonuj_dark');
	} catch {
		// localStorage may be unavailable (e.g., Safari private browsing)
	}
	let dark: boolean;
	if (stored !== null) {
		dark = stored === 'true';
	} else {
		dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		// Listen for system preference changes when user has no stored preference
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', (e) => {
			let storedNow: string | null = null;
			try {
				storedNow = localStorage.getItem('sklonuj_dark');
			} catch {
				// localStorage may be unavailable
			}
			if (storedNow === null) {
				const newDark = e.matches;
				darkMode.set(newDark);
				document.documentElement.classList.toggle('dark', newDark);
			}
		});
	}
	darkMode.set(dark);
	document.documentElement.classList.toggle('dark', dark);
}

/** Toggle dark mode, persist the choice, and update the DOM class. */
export function toggleDarkMode(): void {
	if (typeof window === 'undefined') return;
	darkMode.update((current) => {
		const next = !current;
		document.documentElement.classList.toggle('dark', next);
		try {
			localStorage.setItem('sklonuj_dark', String(next));
		} catch {
			// Silently ignore if localStorage is unavailable (e.g., private browsing)
		}
		return next;
	});
}
