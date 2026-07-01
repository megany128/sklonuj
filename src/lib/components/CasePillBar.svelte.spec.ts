import { page } from 'vitest/browser';
import { describe, expect, it, beforeEach } from 'vitest';
import { ALL_CASES, CASE_SHORT_LABELS, type Case } from '$lib/types';

const { default: CasePillBar } = await import('./CasePillBar.svelte');
const { render, cleanup } = await import('vitest-browser-svelte');

const emptyStrengths = () =>
	Object.fromEntries(ALL_CASES.map((c) => [c, { accuracy: 0, attempts: 0 }])) as Record<
		Case,
		{ accuracy: number; attempts: number }
	>;

describe('CasePillBar', () => {
	beforeEach(() => cleanup());

	it('renders only the available cases plus the All pill', async () => {
		const available: Case[] = ['nom', 'acc', 'gen', 'loc', 'voc'];
		render(CasePillBar, {
			selectedCase: 'all',
			caseStrengths: emptyStrengths(),
			availableCases: available,
			onSelect: () => {}
		});

		// dat/ins are hidden at this (A1-like) set
		await expect
			.element(page.getByText(CASE_SHORT_LABELS.dat, { exact: true }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByText(CASE_SHORT_LABELS.ins, { exact: true }))
			.not.toBeInTheDocument();
		// All pill always present
		await expect.element(page.getByText('All', { exact: true })).toBeInTheDocument();
		// an available case is shown
		await expect
			.element(page.getByText(CASE_SHORT_LABELS.acc, { exact: true }))
			.toBeInTheDocument();
	});

	it('keeps available and locked pills in canonical case order', async () => {
		// gen/dat are locked; they must hold their natural slots between the
		// available nom and acc pills rather than being appended at the end, so
		// pills never reflow when a level unlocks a case.
		render(CasePillBar, {
			selectedCase: 'all',
			caseStrengths: emptyStrengths(),
			availableCases: ['nom', 'acc'],
			lockedCases: [
				{ case: 'gen', unlockLevel: 'A2' },
				{ case: 'dat', unlockLevel: 'B1' }
			],
			onSelect: () => {},
			onLockedSelect: () => {}
		});

		const group = page.getByRole('group', { name: 'Case filter' }).element();
		const labels = Array.from(group.querySelectorAll('button'))
			.map((b) => b.textContent ?? '')
			.filter((t) => t.trim().length > 0);
		const posOf = (label: string) => labels.findIndex((t) => t.includes(label));

		expect(posOf(CASE_SHORT_LABELS.nom)).toBeGreaterThanOrEqual(0);
		expect(posOf(CASE_SHORT_LABELS.nom)).toBeLessThan(posOf(CASE_SHORT_LABELS.gen));
		expect(posOf(CASE_SHORT_LABELS.gen)).toBeLessThan(posOf(CASE_SHORT_LABELS.dat));
		expect(posOf(CASE_SHORT_LABELS.dat)).toBeLessThan(posOf(CASE_SHORT_LABELS.acc));
	});

	it('defaults to all 7 cases when availableCases is omitted', async () => {
		render(CasePillBar, {
			selectedCase: 'all',
			caseStrengths: emptyStrengths(),
			onSelect: () => {}
		});
		await expect
			.element(page.getByText(CASE_SHORT_LABELS.dat, { exact: true }))
			.toBeInTheDocument();
		await expect
			.element(page.getByText(CASE_SHORT_LABELS.ins, { exact: true }))
			.toBeInTheDocument();
	});
});
