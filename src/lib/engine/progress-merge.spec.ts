import { describe, it, expect } from 'vitest';
import { mergeProgress } from './progress-merge';
import type { Progress } from '../types';

function emptyProgress(overrides: Partial<Progress> = {}): Progress {
	return {
		level: 'A1',
		caseScores: {},
		paradigmScores: {},
		lastSession: '',
		...overrides
	};
}

describe('mergeProgress', () => {
	it('merges two empty progress objects', () => {
		const result = mergeProgress(emptyProgress(), emptyProgress());
		expect(result).toEqual(emptyProgress());
	});

	it('local has scores, remote is empty', () => {
		const local = emptyProgress({
			caseScores: { gen_sg: { attempts: 5, correct: 3 } },
			paradigmScores: { hrad_gen_sg: { attempts: 5, correct: 3 } }
		});
		const remote = emptyProgress();
		const result = mergeProgress(local, remote);

		expect(result.caseScores['gen_sg']).toEqual({ attempts: 5, correct: 3 });
		expect(result.paradigmScores['hrad_gen_sg']).toEqual({ attempts: 5, correct: 3 });
	});

	it('remote has scores, local is empty', () => {
		const local = emptyProgress();
		const remote = emptyProgress({
			caseScores: { dat_pl: { attempts: 10, correct: 7 } },
			paradigmScores: { žena_dat_pl: { attempts: 10, correct: 7 } }
		});
		const result = mergeProgress(local, remote);

		expect(result.caseScores['dat_pl']).toEqual({ attempts: 10, correct: 7 });
		expect(result.paradigmScores['žena_dat_pl']).toEqual({ attempts: 10, correct: 7 });
	});

	it('overlapping keys use Math.max for each field', () => {
		const local = emptyProgress({
			caseScores: { gen_sg: { attempts: 10, correct: 5 } },
			paradigmScores: { hrad_gen_sg: { attempts: 10, correct: 5 } }
		});
		const remote = emptyProgress({
			caseScores: { gen_sg: { attempts: 8, correct: 7 } },
			paradigmScores: { hrad_gen_sg: { attempts: 8, correct: 7 } }
		});
		const result = mergeProgress(local, remote);

		// Math.max(10,8)=10 for attempts, Math.max(5,7)=7 for correct
		expect(result.caseScores['gen_sg']).toEqual({ attempts: 10, correct: 7 });
		expect(result.paradigmScores['hrad_gen_sg']).toEqual({ attempts: 10, correct: 7 });
	});

	it('disjoint keys are all present in merged result', () => {
		const local = emptyProgress({
			caseScores: { gen_sg: { attempts: 3, correct: 2 } },
			paradigmScores: { hrad_gen_sg: { attempts: 3, correct: 2 } }
		});
		const remote = emptyProgress({
			caseScores: { dat_pl: { attempts: 7, correct: 5 } },
			paradigmScores: { žena_dat_pl: { attempts: 7, correct: 5 } }
		});
		const result = mergeProgress(local, remote);

		expect(result.caseScores['gen_sg']).toEqual({ attempts: 3, correct: 2 });
		expect(result.caseScores['dat_pl']).toEqual({ attempts: 7, correct: 5 });
		expect(result.paradigmScores['hrad_gen_sg']).toEqual({ attempts: 3, correct: 2 });
		expect(result.paradigmScores['žena_dat_pl']).toEqual({ attempts: 7, correct: 5 });
	});

	it('picks higher level', () => {
		const local = emptyProgress({ level: 'A2' });
		const remote = emptyProgress({ level: 'B1' });
		expect(mergeProgress(local, remote).level).toBe('B1');
	});

	it('picks higher level (reversed)', () => {
		const local = emptyProgress({ level: 'B2' });
		const remote = emptyProgress({ level: 'A1' });
		expect(mergeProgress(local, remote).level).toBe('B2');
	});

	it('same level returns that level', () => {
		const local = emptyProgress({ level: 'A2' });
		const remote = emptyProgress({ level: 'A2' });
		expect(mergeProgress(local, remote).level).toBe('A2');
	});

	it('picks later lastSession date', () => {
		const local = emptyProgress({ lastSession: '2024-01-15' });
		const remote = emptyProgress({ lastSession: '2024-03-01' });
		expect(mergeProgress(local, remote).lastSession).toBe('2024-03-01');
	});

	it('picks later lastSession date (reversed)', () => {
		const local = emptyProgress({ lastSession: '2024-06-01' });
		const remote = emptyProgress({ lastSession: '2024-02-01' });
		expect(mergeProgress(local, remote).lastSession).toBe('2024-06-01');
	});

	it('handles empty lastSession on one side', () => {
		const local = emptyProgress({ lastSession: '' });
		const remote = emptyProgress({ lastSession: '2024-05-10' });
		expect(mergeProgress(local, remote).lastSession).toBe('2024-05-10');
	});

	it('handles empty lastSession on both sides', () => {
		const local = emptyProgress({ lastSession: '' });
		const remote = emptyProgress({ lastSession: '' });
		expect(mergeProgress(local, remote).lastSession).toBe('');
	});

	it('handles undefined paradigmScores gracefully (backward compat)', () => {
		// Simulate old progress format without paradigmScores
		const local = {
			level: 'A1' as const,
			caseScores: { gen_sg: { attempts: 2, correct: 1 } },
			paradigmScores: undefined as unknown as Record<string, { attempts: number; correct: number }>,
			lastSession: ''
		};
		const remote = emptyProgress({
			paradigmScores: { hrad_gen_sg: { attempts: 3, correct: 2 } }
		});
		const result = mergeProgress(local, remote);
		expect(result.paradigmScores['hrad_gen_sg']).toEqual({ attempts: 3, correct: 2 });
	});

	it('full merge scenario with all fields differing', () => {
		const local: Progress = {
			level: 'A2',
			caseScores: {
				gen_sg: { attempts: 10, correct: 8 },
				acc_sg: { attempts: 5, correct: 2 }
			},
			paradigmScores: {
				hrad_gen_sg: { attempts: 10, correct: 8 }
			},
			lastSession: '2024-06-15'
		};
		const remote: Progress = {
			level: 'B1',
			caseScores: {
				gen_sg: { attempts: 12, correct: 6 },
				dat_pl: { attempts: 3, correct: 3 }
			},
			paradigmScores: {
				žena_dat_pl: { attempts: 3, correct: 3 }
			},
			lastSession: '2024-05-01'
		};
		const result = mergeProgress(local, remote);

		expect(result.level).toBe('B1');
		expect(result.lastSession).toBe('2024-06-15');
		expect(result.caseScores['gen_sg']).toEqual({ attempts: 12, correct: 8 });
		expect(result.caseScores['acc_sg']).toEqual({ attempts: 5, correct: 2 });
		expect(result.caseScores['dat_pl']).toEqual({ attempts: 3, correct: 3 });
		expect(result.paradigmScores['hrad_gen_sg']).toEqual({ attempts: 10, correct: 8 });
		expect(result.paradigmScores['žena_dat_pl']).toEqual({ attempts: 3, correct: 3 });
	});
});
