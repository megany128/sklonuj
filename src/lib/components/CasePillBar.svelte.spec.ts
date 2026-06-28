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
