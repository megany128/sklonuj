import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAlias } from '$lib/engine/leaderboard-alias';

interface RpcResponse {
	data: unknown;
	error: unknown;
}

const mocks = vi.hoisted(() => {
	const publicEnv: Record<string, string> = {};
	const privateEnv: Record<string, string> = {};
	const profileLookups: string[] = [];
	const profile: RpcResponse = { data: null, error: null };
	return {
		publicEnv,
		privateEnv,
		rpc: vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcResponse>>(),
		profileLookups,
		profile
	};
});

vi.mock('$env/dynamic/public', () => ({ env: mocks.publicEnv }));
vi.mock('$env/dynamic/private', () => ({ env: mocks.privateEnv }));
vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		rpc: mocks.rpc,
		from: () => ({
			select: () => ({
				eq: (_column: string, id: string) => ({
					maybeSingle: async () => {
						mocks.profileLookups.push(id);
						return mocks.profile;
					}
				})
			})
		})
	})
}));

import {
	computeGlobalLeaderboard,
	GlobalLeaderboardError,
	mapLeaderboardWindowRows,
	parseWeeklyTotalsRows,
	rankAndWindowWeeklyTotals,
	type WeeklyTotalsRow
} from './global-leaderboard';

function uid(n: number): string {
	return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** A row as `global_leaderboard_window` returns it. */
function windowRow(
	n: number,
	attempted: number,
	correct: number,
	rank: number,
	position: number,
	total: number,
	viewerRank: number | null = null
): Record<string, unknown> {
	return {
		user_id: uid(n),
		questions_attempted: attempted,
		questions_correct: correct,
		score: correct * 5 + (attempted - correct),
		rank,
		board_position: position,
		total_users: total,
		viewer_rank: viewerRank
	};
}

/** A row as `global_leaderboard_week` returns it. */
function weekRow(n: number, attempted: number, correct: number): Record<string, unknown> {
	return { user_id: uid(n), questions_attempted: attempted, questions_correct: correct };
}

function totals(n: number, attempted: number, correct: number): WeeklyTotalsRow {
	return { userId: uid(n), attempted, correct };
}

/** Ten participants with distinct scores; participant 1 is first, 10 is last. */
const TEN: WeeklyTotalsRow[] = Array.from({ length: 10 }, (_, i) =>
	totals(i + 1, 100 - i * 5, 50 - i)
);

function ranks(board: { leaderboard: Array<{ rank: number }> }): number[] {
	return board.leaderboard.map((e) => e.rank);
}

function ids(board: { leaderboard: Array<{ userId: string }> }): string[] {
	return board.leaderboard.map((e) => e.userId);
}

describe('mapLeaderboardWindowRows', () => {
	it('maps each row and names it from its id', () => {
		const board = mapLeaderboardWindowRows([windowRow(1, 20, 15, 1, 1, 42, 1)]);
		expect(board).toEqual({
			leaderboard: [
				{
					rank: 1,
					userId: uid(1),
					displayName: generateAlias(uid(1)),
					firstName: generateAlias(uid(1)),
					score: 80,
					questionsAnswered: 20,
					correctAnswers: 15
				}
			],
			totalUsers: 42
		});
	});

	it('takes the participant count from the rows, not from how many came back', () => {
		const board = mapLeaderboardWindowRows([
			windowRow(1, 30, 30, 1, 1, 500),
			windowRow(2, 20, 20, 2, 2, 500),
			windowRow(3, 10, 10, 3, 3, 500)
		]);
		expect(board?.totalUsers).toBe(500);
		expect(board?.leaderboard).toHaveLength(3);
	});

	it('orders rows by board position, keeping tied ranks in that order', () => {
		const board = mapLeaderboardWindowRows([
			windowRow(7, 5, 1, 6, 7, 9),
			windowRow(2, 20, 10, 1, 2, 9),
			windowRow(5, 6, 1, 6, 6, 9),
			windowRow(1, 12, 12, 1, 1, 9),
			windowRow(3, 60, 0, 1, 3, 9)
		]);
		expect(board ? ids(board) : null).toEqual([uid(1), uid(2), uid(3), uid(5), uid(7)]);
		expect(board ? ranks(board) : null).toEqual([1, 1, 1, 6, 6]);
	});

	it('reads an empty result as an empty board', () => {
		expect(mapLeaderboardWindowRows([])).toEqual({ leaderboard: [], totalUsers: 0 });
	});

	it('rejects a payload that is not the function’s shape', () => {
		const good = windowRow(1, 20, 15, 1, 1, 3);
		expect(mapLeaderboardWindowRows(null)).toBeNull();
		expect(mapLeaderboardWindowRows({ rows: [good] })).toBeNull();
		expect(mapLeaderboardWindowRows([good, null])).toBeNull();
		expect(mapLeaderboardWindowRows([{ ...good, user_id: 5 }])).toBeNull();
		expect(mapLeaderboardWindowRows([{ ...good, score: '80' }])).toBeNull();
		expect(mapLeaderboardWindowRows([{ ...good, rank: null }])).toBeNull();
		expect(mapLeaderboardWindowRows([{ ...good, rank: 1.5 }])).toBeNull();
		expect(mapLeaderboardWindowRows([{ ...good, questions_correct: -1 }])).toBeNull();
		// The rows of the older function carry no rank or total.
		expect(mapLeaderboardWindowRows([weekRow(1, 20, 15)])).toBeNull();
	});
});

describe('parseWeeklyTotalsRows', () => {
	it('keeps well-formed rows and skips the rest', () => {
		expect(
			parseWeeklyTotalsRows([
				weekRow(1, 20, 15),
				null,
				{ user_id: uid(2), questions_attempted: '3', questions_correct: 1 },
				weekRow(3, 4, 0)
			])
		).toEqual([totals(1, 20, 15), totals(3, 4, 0)]);
	});
});

describe('rankAndWindowWeeklyTotals', () => {
	it('shows only the top three to a viewer who is in it', () => {
		const board = rankAndWindowWeeklyTotals(TEN, uid(2), true);
		expect(ranks(board)).toEqual([1, 2, 3]);
		expect(board.totalUsers).toBe(10);
	});

	it('shows the top three and the viewer with one neighbour each side', () => {
		const board = rankAndWindowWeeklyTotals(TEN, uid(8), true);
		expect(ranks(board)).toEqual([1, 2, 3, 7, 8, 9]);
		expect(board.totalUsers).toBe(10);
	});

	it('fills the gap when exactly one rank sits between the two groups', () => {
		expect(ranks(rankAndWindowWeeklyTotals(TEN, uid(6), true))).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it('shows a last-placed viewer with only the row above', () => {
		expect(ranks(rankAndWindowWeeklyTotals(TEN, uid(10), true))).toEqual([1, 2, 3, 9, 10]);
	});

	it('adds a viewer who has not practised at 0 points, in last place', () => {
		const board = rankAndWindowWeeklyTotals(TEN, uid(99), true);
		expect(board.totalUsers).toBe(11);
		expect(ranks(board)).toEqual([1, 2, 3, 10, 11]);
		expect(board.leaderboard.at(-1)).toMatchObject({
			userId: uid(99),
			score: 0,
			questionsAnswered: 0,
			correctAnswers: 0
		});
	});

	it('leaves an opted-out viewer off the board', () => {
		const board = rankAndWindowWeeklyTotals(TEN, uid(99), false);
		expect(board.totalUsers).toBe(10);
		expect(ranks(board)).toEqual([1, 2, 3]);
	});

	it('shows the top three when there is no viewer', () => {
		expect(ranks(rankAndWindowWeeklyTotals(TEN, null, true))).toEqual([1, 2, 3]);
	});

	it('returns an empty board for an empty week with no viewer', () => {
		expect(rankAndWindowWeeklyTotals([], null, true)).toEqual({ leaderboard: [], totalUsers: 0 });
	});

	it('scores 5 per correct answer and 1 per wrong one', () => {
		const board = rankAndWindowWeeklyTotals([totals(1, 10, 7)], uid(1), true);
		expect(board.leaderboard[0].score).toBe(38);
	});

	it('shares a rank between equal scores and orders them by correct answers, then id', () => {
		const board = rankAndWindowWeeklyTotals(
			[
				// Listed out of order on purpose: the result must not depend on it.
				totals(3, 60, 0), // 60 points, 0 correct
				totals(2, 20, 10), // 60 points, 10 correct
				totals(5, 10, 0), // 10 points
				totals(1, 20, 10), // 60 points, 10 correct: tied with 2 on everything
				totals(4, 12, 12) // 60 points, 12 correct
			],
			uid(5),
			true
		);
		expect(ids(board)).toEqual([uid(4), uid(1), uid(2), uid(3), uid(5)]);
		expect(ranks(board)).toEqual([1, 1, 1, 1, 5]);
	});
});

describe('computeGlobalLeaderboard', () => {
	const MISSING_FROM_SCHEMA_CACHE = {
		code: 'PGRST202',
		message: 'Could not find the function public.global_leaderboard_window in the schema cache'
	};

	beforeEach(() => {
		mocks.publicEnv.PUBLIC_SUPABASE_URL = 'http://localhost:54321';
		mocks.privateEnv.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
		mocks.rpc.mockReset();
		mocks.profileLookups.length = 0;
		mocks.profile = { data: { show_on_leaderboard: true }, error: null };
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	/** Answer each RPC by name; an unlisted name is a test bug. */
	function answerRpc(responses: Record<string, RpcResponse>): void {
		mocks.rpc.mockImplementation(async (name) => {
			const response = responses[name];
			if (!response) throw new Error(`unexpected rpc ${name}`);
			return response;
		});
	}

	function rpcNames(): string[] {
		return mocks.rpc.mock.calls.map(([name]) => name);
	}

	it('asks the window function for the viewer’s rows and maps them', async () => {
		answerRpc({
			global_leaderboard_window: {
				data: [
					windowRow(1, 30, 30, 1, 1, 40, 12),
					windowRow(2, 20, 20, 2, 2, 40, 12),
					windowRow(3, 10, 10, 3, 3, 40, 12),
					windowRow(7, 6, 1, 11, 11, 40, 12),
					windowRow(8, 5, 1, 12, 12, 40, 12),
					windowRow(9, 4, 1, 13, 13, 40, 12)
				],
				error: null
			}
		});

		const result = await computeGlobalLeaderboard({ id: uid(8) });

		expect(rpcNames()).toEqual(['global_leaderboard_window']);
		const [, args] = mocks.rpc.mock.calls[0];
		expect(args.viewer_id).toBe(uid(8));
		expect(args.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(args.week_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(mocks.profileLookups).toEqual([uid(8)]);
		expect(ranks(result)).toEqual([1, 2, 3, 11, 12, 13]);
		expect(result.totalUsers).toBe(40);
		expect(result.showOnLeaderboard).toBe(true);
		expect(result.leaderboard[4]).toEqual({
			rank: 12,
			userId: uid(8),
			displayName: generateAlias(uid(8)),
			firstName: generateAlias(uid(8)),
			score: 9,
			questionsAnswered: 5,
			correctAnswers: 1
		});
	});

	it('passes a guest as the viewer without looking up a profile', async () => {
		answerRpc({
			global_leaderboard_window: { data: [windowRow(5, 0, 0, 1, 1, 1, 1)], error: null }
		});

		const result = await computeGlobalLeaderboard(null, uid(5));

		expect(mocks.rpc.mock.calls[0][1].viewer_id).toBe(uid(5));
		expect(mocks.profileLookups).toEqual([]);
		expect(result.showOnLeaderboard).toBe(true);
		expect(ids(result)).toEqual([uid(5)]);
	});

	it('passes no viewer for a visitor with neither an account nor a guest id', async () => {
		answerRpc({ global_leaderboard_window: { data: [], error: null } });

		const result = await computeGlobalLeaderboard(null);

		expect(mocks.rpc.mock.calls[0][1].viewer_id).toBeNull();
		expect(result).toEqual({ leaderboard: [], totalUsers: 0, showOnLeaderboard: true });
	});

	it('reports an opted-out viewer as such', async () => {
		mocks.profile = { data: { show_on_leaderboard: false }, error: null };
		answerRpc({
			global_leaderboard_window: {
				data: [windowRow(1, 30, 30, 1, 1, 2), windowRow(2, 20, 20, 2, 2, 2)],
				error: null
			}
		});

		const result = await computeGlobalLeaderboard({ id: uid(8) });

		expect(result.showOnLeaderboard).toBe(false);
		expect(ids(result)).toEqual([uid(1), uid(2)]);
		expect(result.totalUsers).toBe(2);
	});

	it.each([
		['PostgREST cannot find the function', MISSING_FROM_SCHEMA_CACHE],
		['Postgres reports an undefined function', { code: '42883', message: 'does not exist' }]
	])('falls back to ranking in JS when %s', async (_label, error) => {
		answerRpc({
			global_leaderboard_window: { data: null, error },
			global_leaderboard_week: {
				data: TEN.map((r) => weekRow(Number(r.userId.slice(-2)), r.attempted, r.correct)),
				error: null
			}
		});

		const result = await computeGlobalLeaderboard({ id: uid(8) });

		expect(rpcNames()).toEqual(['global_leaderboard_window', 'global_leaderboard_week']);
		const [, weekArgs] = mocks.rpc.mock.calls[1];
		expect(Object.keys(weekArgs).sort()).toEqual(['week_end', 'week_start']);
		expect(weekArgs.week_start).toBe(mocks.rpc.mock.calls[0][1].week_start);
		expect(weekArgs.week_end).toBe(mocks.rpc.mock.calls[0][1].week_end);
		expect(result).toEqual({
			...rankAndWindowWeeklyTotals(TEN, uid(8), true),
			showOnLeaderboard: true
		});
		expect(ranks(result)).toEqual([1, 2, 3, 7, 8, 9]);
	});

	it('returns the same result on both paths', async () => {
		// The window function's answer for viewer 6 of TEN, written out by hand.
		answerRpc({
			global_leaderboard_window: {
				data: [1, 2, 3, 4, 5, 6, 7].map((n) => {
					const row = TEN[n - 1];
					return windowRow(n, row.attempted, row.correct, n, n, 10, 6);
				}),
				error: null
			}
		});
		const viaWindow = await computeGlobalLeaderboard({ id: uid(6) });

		answerRpc({
			global_leaderboard_window: { data: null, error: MISSING_FROM_SCHEMA_CACHE },
			global_leaderboard_week: {
				data: TEN.map((r) => weekRow(Number(r.userId.slice(-2)), r.attempted, r.correct)),
				error: null
			}
		});
		const viaFallback = await computeGlobalLeaderboard({ id: uid(6) });

		expect(viaFallback).toEqual(viaWindow);
	});

	it('keeps an opted-out viewer off the board on the fallback path', async () => {
		mocks.profile = { data: { show_on_leaderboard: false }, error: null };
		answerRpc({
			global_leaderboard_window: { data: null, error: MISSING_FROM_SCHEMA_CACHE },
			global_leaderboard_week: { data: [weekRow(1, 30, 30)], error: null }
		});

		const result = await computeGlobalLeaderboard({ id: uid(8) });

		expect(result).toEqual({
			...rankAndWindowWeeklyTotals([totals(1, 30, 30)], uid(8), false),
			showOnLeaderboard: false
		});
		expect(ids(result)).toEqual([uid(1)]);
	});

	it('adds a 0-point guest viewer on the fallback path', async () => {
		answerRpc({
			global_leaderboard_window: { data: null, error: MISSING_FROM_SCHEMA_CACHE },
			global_leaderboard_week: { data: [weekRow(1, 30, 30)], error: null }
		});

		const result = await computeGlobalLeaderboard(null, uid(5));

		expect(ids(result)).toEqual([uid(1), uid(5)]);
		expect(result.totalUsers).toBe(2);
	});

	it('does not fall back on any other window error', async () => {
		answerRpc({
			global_leaderboard_window: {
				data: null,
				error: { code: '57014', message: 'canceling statement due to statement timeout' }
			}
		});

		await expect(computeGlobalLeaderboard({ id: uid(8) })).rejects.toBeInstanceOf(
			GlobalLeaderboardError
		);
		expect(rpcNames()).toEqual(['global_leaderboard_window']);
	});

	it('fails when the window payload is malformed', async () => {
		answerRpc({ global_leaderboard_window: { data: [weekRow(1, 30, 30)], error: null } });

		await expect(computeGlobalLeaderboard({ id: uid(8) })).rejects.toBeInstanceOf(
			GlobalLeaderboardError
		);
	});

	it('fails when the fallback query fails too', async () => {
		answerRpc({
			global_leaderboard_window: { data: null, error: MISSING_FROM_SCHEMA_CACHE },
			global_leaderboard_week: { data: null, error: { code: '42501', message: 'denied' } }
		});

		await expect(computeGlobalLeaderboard({ id: uid(8) })).rejects.toBeInstanceOf(
			GlobalLeaderboardError
		);
	});

	it('fails without querying when the service is not configured', async () => {
		delete mocks.privateEnv.SUPABASE_SERVICE_ROLE_KEY;

		await expect(computeGlobalLeaderboard({ id: uid(8) })).rejects.toBeInstanceOf(
			GlobalLeaderboardError
		);
		expect(mocks.rpc).not.toHaveBeenCalled();
	});
});
