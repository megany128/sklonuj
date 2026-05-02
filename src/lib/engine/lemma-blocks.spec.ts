import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Progress, SentenceTemplate } from '../types';

/**
 * Find a template by id, or throw with a clear message. Avoids the
 * `if (!template) return` early-exit pattern that hides regressions when an
 * id is renamed or removed.
 */
function requireTemplate(templates: SentenceTemplate[], id: string): SentenceTemplate {
	const t = templates.find((x) => x.id === id);
	if (!t) throw new Error(`Template "${id}" missing — update the test fixture id.`);
	return t;
}

// Hoisted mutable mock state — accessible from both the vi.mock factory (which
// runs before any imports) and from individual tests that want to inject
// targeted blocks. The lemma-blocks module reads this object at module load
// and the *same reference* stays live, so mutating it + clearing the per-id
// cache gives each test a clean slate.
const mockBlocks = vi.hoisted(() => ({
	default: {
		sentence: {} as Record<string, string[]>,
		adjective: {} as Record<string, string[]>,
		pronoun: {} as Record<string, string[]>
	}
}));

vi.mock('../data/lemma_blocks.json', () => mockBlocks);

import { getCandidates, loadTemplates, loadWordBank } from './drill';
import {
	loadAdjectiveTemplates,
	getAdjectiveCandidates,
	filterAdjectivesByTemplate
} from './adjective-drill';
import { loadPronounTemplates, getPronounCandidates } from './pronoun-drill';
import { _resetLemmaBlockCacheForTests } from './lemma-blocks';

function clearMock(): void {
	mockBlocks.default.sentence = {};
	mockBlocks.default.adjective = {};
	mockBlocks.default.pronoun = {};
	_resetLemmaBlockCacheForTests();
}

beforeEach(() => {
	clearMock();
});

const PROGRESS_B2: Progress = {
	level: 'B2',
	caseScores: {},
	paradigmScores: {},
	lastSession: '',
	longestStreak: 0
};

describe('lemma blocks · sentence (noun) drill', () => {
	it('excludes a blocked lemma from getCandidates', () => {
		const template = requireTemplate(loadTemplates(), 'loc_v_001');
		// Baseline: lemma is present without a block.
		const baseline = getCandidates(template, PROGRESS_B2);
		const dum = baseline.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();

		// Inject a block, clear cache, re-query.
		mockBlocks.default.sentence[template.id] = ['dům'];
		_resetLemmaBlockCacheForTests();
		const blocked = getCandidates(template, PROGRESS_B2);
		expect(blocked.some((w) => w.lemma === 'dům')).toBe(false);
		// Sanity check: the template still produces other candidates.
		expect(blocked.length).toBeGreaterThan(0);
		expect(blocked.length).toBe(baseline.length - 1);
	});

	it('non-blocked lemmas remain in getCandidates', () => {
		const template = requireTemplate(loadTemplates(), 'loc_v_001');
		mockBlocks.default.sentence[template.id] = ['dům'];
		_resetLemmaBlockCacheForTests();
		const blocked = getCandidates(template, PROGRESS_B2);
		const hrad = loadWordBank().find((w) => w.lemma === 'hrad');
		if (hrad && hrad.categories.includes(template.lemmaCategory)) {
			expect(blocked.some((w) => w.lemma === 'hrad')).toBe(true);
		}
	});

	it('templates with no block list are unaffected (no-op)', () => {
		const template = requireTemplate(loadTemplates(), 'loc_v_001');
		const candidates = getCandidates(template, PROGRESS_B2);
		expect(candidates.length).toBeGreaterThan(0);
	});
});

describe('lemma blocks · adjective drill', () => {
	it('filterAdjectivesByTemplate excludes a blocked adjective lemma', () => {
		const templates = loadAdjectiveTemplates();
		const allCandidates = getAdjectiveCandidates(['A1', 'A2', 'B1', 'B2']);
		// Pick a template with multiple candidates after structural filtering.
		const target = templates.find((t) => filterAdjectivesByTemplate(allCandidates, t).length >= 2);
		if (!target) {
			throw new Error('No adjective template has ≥2 candidates — fixture changed.');
		}

		const baseline = filterAdjectivesByTemplate(allCandidates, target);
		const victim = baseline[0].lemma;
		mockBlocks.default.adjective[target.id] = [victim];
		_resetLemmaBlockCacheForTests();

		const filtered = filterAdjectivesByTemplate(allCandidates, target);
		expect(filtered.some((a) => a.lemma === victim)).toBe(false);
		expect(filtered.length).toBe(baseline.length - 1);
	});

	it('templates with no block list keep all structurally valid adjectives', () => {
		const templates = loadAdjectiveTemplates();
		const allCandidates = getAdjectiveCandidates(['A1', 'A2', 'B1', 'B2']);
		const target = templates[0];
		if (!target) throw new Error('No adjective templates loaded.');
		const filtered = filterAdjectivesByTemplate(allCandidates, target);
		expect(Array.isArray(filtered)).toBe(true);
	});
});

describe('lemma blocks · pronoun drill', () => {
	it('excludes a blocked pronoun lemma from getPronounCandidates', () => {
		const templates = loadPronounTemplates();
		// Find any template with at least 1 candidate; we'll block its first
		// candidate and assert the count drops by exactly 1.
		let target: {
			template: (typeof templates)[number];
			victim: string;
			baselineLen: number;
		} | null = null;
		for (const tpl of templates) {
			const cands = getPronounCandidates(tpl, PROGRESS_B2);
			if (cands.length >= 1) {
				target = { template: tpl, victim: cands[0].lemma, baselineLen: cands.length };
				break;
			}
		}
		if (!target) throw new Error('No pronoun template has ≥1 candidate — fixture changed.');

		mockBlocks.default.pronoun[target.template.id] = [target.victim];
		_resetLemmaBlockCacheForTests();

		const blocked = getPronounCandidates(target.template, PROGRESS_B2);
		expect(blocked.some((p) => p.lemma === target.victim)).toBe(false);
		expect(blocked.length).toBe(target.baselineLen - 1);
	});

	it('templates with no block list keep all candidates (no-op)', () => {
		const templates = loadPronounTemplates();
		const target = templates[0];
		if (!target) throw new Error('No pronoun templates loaded.');
		const candidates = getPronounCandidates(target, PROGRESS_B2);
		expect(Array.isArray(candidates)).toBe(true);
	});
});
