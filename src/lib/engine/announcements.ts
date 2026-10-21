/**
 * "What's new" announcements: one dismissible banner on the practice page.
 * Pure module apart from the dismissed list, which lives in localStorage
 * (per device: a learner who dismisses on one device may see it once more on
 * another, which is fine for a short-lived banner).
 *
 * To announce something, replace `ANNOUNCEMENT` with a new one under a new
 * `id`; a learner who dismissed the last one still sees the next.
 */

export interface Announcement {
	/** Stable key for dismissal and analytics. Change it for every new announcement. */
	id: string;
	title: string;
	body: string;
	/** The page the button opens. */
	href: '/decks';
	actionLabel: string;
	/** Last day it shows (inclusive, YYYY-MM-DD, local time). */
	until: string;
}

export const ANNOUNCEMENT: Announcement | null = {
	id: 'decks-2026-10',
	title: 'Decks',
	body: 'Practise one topic at a time: Kam? Kde? Odkud?, verbs + case, numbers, můj and ten.',
	href: '/decks',
	actionLabel: 'Browse decks',
	until: '2026-12-15'
};

const DISMISSED_KEY = 'sklonuj_dismissed_announcements';

function readDismissed(): string[] {
	try {
		const raw = localStorage.getItem(DISMISSED_KEY);
		if (raw === null) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

export function isAnnouncementDismissed(id: string): boolean {
	return readDismissed().includes(id);
}

export function dismissAnnouncement(id: string): void {
	try {
		const dismissed = readDismissed();
		if (dismissed.includes(id)) return;
		localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, id]));
	} catch {
		// Storage blocked: the banner closes for this visit only.
	}
}

/** Today as YYYY-MM-DD in local time, to compare with `until`. */
function localDate(now: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The announcement to show now, or null when there is none, it has run out, or it was dismissed. */
export function activeAnnouncement(
	announcement: Announcement | null = ANNOUNCEMENT,
	now: Date = new Date()
): Announcement | null {
	if (announcement === null) return null;
	if (localDate(now) > announcement.until) return null;
	if (isAnnouncementDismissed(announcement.id)) return null;
	return announcement;
}
