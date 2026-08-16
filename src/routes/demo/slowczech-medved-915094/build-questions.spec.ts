import { describe, expect, it } from 'vitest';
import { checkAnswer } from '$lib/engine/drill';
import { CASE_INDEX } from '$lib/types';
import { demoPackage } from './content';
import { buildPackage, buildQuestion, resolveWord, withFormOverride } from './build-questions';

describe('slowczech demo package', () => {
	const built = buildPackage(demoPackage);

	it('builds every section without missing lemmas or empty forms', () => {
		expect(built.length).toBe(demoPackage.sections.length);
		for (const section of built) {
			expect(section.questions.length).toBeGreaterThan(0);
			for (const q of section.questions) {
				expect(q.question.correctAnswer.trim()).not.toBe('');
			}
		}
	});

	it('mixed review only reuses items that exist elsewhere', () => {
		const ids = new Set(demoPackage.sections.flatMap((s) => s.items.map((i) => i.id)));
		for (const id of demoPackage.sections.find((s) => s.id === 'mix')?.reuse ?? []) {
			expect(ids.has(id)).toBe(true);
		}
	});

	it('the accusative hero section is dominated by masculine animate accusatives', () => {
		const acc = built.find((s) => s.def.id === 'acc');
		expect(acc).toBeDefined();
		const animAcc = acc?.questions.filter(
			(q) => q.item.case === 'acc' && q.question.word.gender === 'm' && q.question.word.animate
		);
		expect(animAcc?.length ?? 0).toBeGreaterThanOrEqual(6);
	});

	it('resolves local words before the bank and the bank otherwise', () => {
		expect(resolveWord('kamzík', demoPackage.localWords)?.translation).toBe('chamois');
		expect(resolveWord('medvěd', demoPackage.localWords)?.paradigm).toBe('pán');
		expect(resolveWord('nonexistent-lemma', demoPackage.localWords)).toBeNull();
	});

	it('withFormOverride makes the story form primary and keeps the standard accepted', () => {
		const turista = resolveWord('turista', [])!;
		const patched = withFormOverride(turista, 'pl', 'nom', 'turisti', ['turisté']);
		expect(patched.forms.pl[CASE_INDEX.nom]).toBe('turisti');
		expect(patched.variantForms?.pl?.[CASE_INDEX.nom]).toContain('turisté');
		expect(patched.variantForms?.pl?.[CASE_INDEX.nom]).not.toContain('turisti');
		// original untouched
		expect(turista.forms.pl[CASE_INDEX.nom]).toBe('turisté');
	});

	it('grades the colloquial item: turisti is the answer, turisté is accepted, medveda is a near-miss', () => {
		const item = demoPackage.sections.flatMap((s) => s.items).find((i) => i.id === 'mix-03');
		expect(item).toBeDefined();
		const { question } = buildQuestion(item!, demoPackage.localWords);
		expect(question.correctAnswer).toBe('turisti');
		expect(checkAnswer(question, 'turisti', 'A2')?.correct).toBe(true);
		expect(checkAnswer(question, 'turisté', 'A2')?.correct).toBe(true);
		expect(checkAnswer(question, 'turisty', 'A2')?.correct).toBe(false);

		const bear = buildQuestion(
			demoPackage.sections[0].items.find((i) => i.id === 'acc-01')!,
			demoPackage.localWords
		);
		const nearMiss = checkAnswer(bear.question, 'medveda', 'A2');
		expect(nearMiss?.correct).toBe(true);
		expect(nearMiss?.nearMiss).toBe(true);
	});

	it('form-recall items carry their explanation through paradigmNotes', () => {
		const form = buildQuestion(
			demoPackage.sections[0].items.find((i) => i.id === 'acc-13')!,
			demoPackage.localWords
		);
		expect(form.paradigmNotes['acc_sg']).toContain('medvěda');
	});
});
