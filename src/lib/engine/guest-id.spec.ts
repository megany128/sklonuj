import { describe, it, expect } from 'vitest';
import {
	GUEST_ID_STORAGE_KEY,
	clearGuestId,
	getOrCreateGuestId,
	isGuestId,
	serializeGuestIdCookie
} from './guest-id';

describe('isGuestId', () => {
	it('accepts canonical hyphenated UUIDs in either case', () => {
		expect(isGuestId('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
		expect(isGuestId('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true);
	});

	it('rejects anything that is not a UUID string', () => {
		expect(isGuestId('__anon__')).toBe(false);
		expect(isGuestId('3f2504e04f8941d39a0c0305e82c3301')).toBe(false);
		expect(isGuestId('3f2504e0-4f89-41d3-9a0c-0305e82c330')).toBe(false);
		expect(isGuestId("3f2504e0-4f89-41d3-9a0c-0305e82c3301' OR 1=1")).toBe(false);
		expect(isGuestId(42)).toBe(false);
		expect(isGuestId(null)).toBe(false);
		expect(isGuestId(undefined)).toBe(false);
	});
});

describe('serializeGuestIdCookie', () => {
	const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

	it('writes a year-long Lax cookie carrying the id', () => {
		expect(serializeGuestIdCookie(id, false)).toBe(
			`${GUEST_ID_STORAGE_KEY}=${id}; path=/; SameSite=Lax; max-age=31536000`
		);
	});

	it('adds Secure on https', () => {
		expect(serializeGuestIdCookie(id, true)).toContain('; Secure');
		expect(serializeGuestIdCookie(id, false)).not.toContain('Secure');
	});

	it('expires the cookie for null', () => {
		expect(serializeGuestIdCookie(null, false)).toBe(
			`${GUEST_ID_STORAGE_KEY}=; path=/; SameSite=Lax; max-age=0`
		);
	});
});

describe('outside a browser', () => {
	it('getOrCreateGuestId returns null and clearGuestId is a no-op', () => {
		expect(getOrCreateGuestId()).toBeNull();
		expect(() => clearGuestId()).not.toThrow();
	});
});
