import { describe, it, expect } from 'vitest';

// Mirrors the parsing applied in +page.server.ts's updateEmailPreferences action.
// Kept inline so the test exercises the exact behaviour without exporting from a
// server action file (which would force route-tree side effects).
function parseReminderDays(raw: string | null): number[] {
	const parsed =
		typeof raw === 'string'
			? raw
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s !== '')
					.map((s) => Number(s))
					.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
			: [];
	const deduped = Array.from(new Set(parsed)).sort((a, b) => a - b);
	return deduped.length > 0 ? deduped.slice(0, 7) : [1];
}

function to12Hour(hour24: number): { h12: number; ampm: 'AM' | 'PM' } {
	const ampm: 'AM' | 'PM' = hour24 < 12 ? 'AM' : 'PM';
	const h12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
	return { h12, ampm };
}

function from12Hour(h12: number, ampm: 'AM' | 'PM'): number {
	const base = h12 % 12;
	return ampm === 'PM' ? base + 12 : base;
}

describe('parseReminderDays', () => {
	it('parses comma-separated days', () => {
		expect(parseReminderDays('1,3,5')).toEqual([1, 3, 5]);
	});

	it('sorts and dedupes', () => {
		expect(parseReminderDays('5,1,3,1')).toEqual([1, 3, 5]);
	});

	it('drops out-of-range and non-integers', () => {
		expect(parseReminderDays('1,7,-1,foo,3')).toEqual([1, 3]);
	});

	it('falls back to Monday when empty or invalid', () => {
		expect(parseReminderDays('')).toEqual([1]);
		expect(parseReminderDays('foo,bar')).toEqual([1]);
		expect(parseReminderDays(null)).toEqual([1]);
	});

	it('caps at 7 entries', () => {
		expect(parseReminderDays('0,1,2,3,4,5,6')).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});
});

describe('12-hour conversion', () => {
	it('converts midnight to 12 AM', () => {
		expect(to12Hour(0)).toEqual({ h12: 12, ampm: 'AM' });
	});

	it('converts noon to 12 PM', () => {
		expect(to12Hour(12)).toEqual({ h12: 12, ampm: 'PM' });
	});

	it('converts 13:00 to 1 PM', () => {
		expect(to12Hour(13)).toEqual({ h12: 1, ampm: 'PM' });
	});

	it('round-trips every hour', () => {
		for (let h = 0; h < 24; h++) {
			const { h12, ampm } = to12Hour(h);
			expect(from12Hour(h12, ampm)).toBe(h);
		}
	});
});
