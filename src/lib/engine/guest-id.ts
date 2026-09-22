/**
 * Stable identity for anonymous (guest) visitors, used to put them on the
 * global weekly leaderboard. Stored in localStorage and mirrored into the
 * `sklonuj_guest_id` cookie so `+page.server.ts` can window the streamed
 * leaderboard around the viewer during SSR.
 *
 * Safe to import on the server: every browser access is guarded.
 */

/** Key used for both `localStorage` and the mirroring cookie. */
export const GUEST_ID_STORAGE_KEY = 'sklonuj_guest_id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical hyphenated UUID (the only shape ever written). */
export function isGuestId(value: unknown): value is string {
	return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * The `document.cookie` assignment that mirrors (or, for `null`, clears) the
 * guest id. Pure, so it can be unit-tested without a DOM.
 */
export function serializeGuestIdCookie(guestId: string | null, secure: boolean): string {
	const flags = `path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
	return guestId === null
		? `${GUEST_ID_STORAGE_KEY}=; ${flags}; max-age=0`
		: `${GUEST_ID_STORAGE_KEY}=${guestId}; ${flags}; max-age=31536000`;
}

function writeCookie(guestId: string | null): void {
	if (typeof document === 'undefined' || typeof location === 'undefined') return;
	document.cookie = serializeGuestIdCookie(guestId, location.protocol === 'https:');
}

function randomUuid(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	// Non-secure contexts (plain-http LAN dev) lack randomUUID; build a v4 by hand.
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Read the persisted guest id, creating one on first visit, and (re)write the
 * cookie so the server sees the same id. If localStorage is unavailable the
 * id still works for the lifetime of the page. Returns `null` only when
 * called outside a browser.
 */
export function getOrCreateGuestId(): string | null {
	if (typeof window === 'undefined') return null;
	let guestId: string | null = null;
	try {
		const stored = localStorage.getItem(GUEST_ID_STORAGE_KEY);
		if (isGuestId(stored)) guestId = stored.toLowerCase();
	} catch {
		// localStorage may be unavailable
	}
	if (guestId === null) {
		guestId = randomUuid();
		try {
			localStorage.setItem(GUEST_ID_STORAGE_KEY, guestId);
		} catch {
			// localStorage may be unavailable or full
		}
	}
	writeCookie(guestId);
	return guestId;
}

/**
 * Forget the guest identity (storage + cookie). Called once a guest signs up
 * and their sessions have moved to `practice_sessions`, so a later sign-out
 * starts a fresh guest rather than resurrecting the old rows.
 */
export function clearGuestId(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(GUEST_ID_STORAGE_KEY);
	} catch {
		// localStorage may be unavailable
	}
	writeCookie(null);
}
