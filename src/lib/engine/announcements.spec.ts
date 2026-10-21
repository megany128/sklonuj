import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ANNOUNCEMENT,
	activeAnnouncement,
	dismissAnnouncement,
	isAnnouncementDismissed,
	type Announcement
} from './announcements';

const sample: Announcement = {
	id: 'test-2026-10',
	title: 'Test',
	body: 'Body',
	href: '/decks',
	actionLabel: 'Try it',
	until: '2026-11-30'
};

describe('announcements', () => {
	beforeEach(() => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => store.set(k, v)
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	it('shows until its last day, then not', () => {
		expect(activeAnnouncement(sample, new Date(2026, 10, 30, 23, 0))).toBe(sample);
		expect(activeAnnouncement(sample, new Date(2026, 11, 1, 0, 30))).toBeNull();
		expect(activeAnnouncement(null)).toBeNull();
	});

	it('stays dismissed, and a new id shows again', () => {
		const today = new Date(2026, 9, 21);
		dismissAnnouncement(sample.id);
		dismissAnnouncement(sample.id);
		expect(isAnnouncementDismissed(sample.id)).toBe(true);
		expect(activeAnnouncement(sample, today)).toBeNull();
		expect(activeAnnouncement({ ...sample, id: 'next' }, today)?.id).toBe('next');
		expect(JSON.parse(localStorage.getItem('sklonuj_dismissed_announcements') ?? '[]')).toEqual([
			sample.id
		]);
	});

	it('shows anyway when storage is blocked or holds junk', () => {
		localStorage.setItem('sklonuj_dismissed_announcements', '{not json');
		expect(activeAnnouncement(sample, new Date(2026, 9, 21))).toBe(sample);
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		});
		expect(() => dismissAnnouncement(sample.id)).not.toThrow();
		expect(activeAnnouncement(sample, new Date(2026, 9, 21))).toBe(sample);
	});

	it('the current announcement names a dated, unique id', () => {
		if (ANNOUNCEMENT === null) return;
		expect(ANNOUNCEMENT.id).toMatch(/-\d{4}-\d{2}$/);
		expect(ANNOUNCEMENT.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
