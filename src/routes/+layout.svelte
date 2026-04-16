<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import { mergeProgress, loadProgressFromLocalStorage } from '$lib/engine/progress-merge';
	import { progress, STORAGE_USER_KEY } from '$lib/engine/progress';
	import { syncBadgesToSupabase, loadBadgesFromSupabase } from '$lib/engine/achievements';
	import { syncStreakToSupabase, loadStreakFromSupabase } from '$lib/engine/streak';
	import { syncMistakesToSupabase, loadMistakesFromSupabase } from '$lib/engine/mistakes';
	import type { Progress, CaseScore, Difficulty } from '$lib/types';
	import '../app.css';
	import { initPostHog } from '$lib/posthog';
	import posthog from '$lib/posthog';

	let { children } = $props();

	/** Track the last merged user ID to prevent duplicate merge operations on repeated SIGNED_IN events. */
	let lastMergedUserId: string | null = null;
	/** Track the last user ID whose badges/streaks were synced, to dedupe across onMount and SIGNED_IN. */
	let badgeStreakSyncedUserId: string | null = null;
	/** In-flight badge/streak sync promise, so concurrent callers await the same work. */
	let badgeStreakSyncInFlight: Promise<void> | null = null;

	async function syncBadgesAndStreaks(
		client: ReturnType<typeof getSupabaseBrowserClient>,
		userId: string
	): Promise<void> {
		if (badgeStreakSyncedUserId === userId) return;
		if (badgeStreakSyncInFlight) {
			await badgeStreakSyncInFlight;
			if (badgeStreakSyncedUserId === userId) return;
		}
		badgeStreakSyncInFlight = (async () => {
			try {
				await loadBadgesFromSupabase(client);
				await syncBadgesToSupabase(client);
				await loadStreakFromSupabase(client);
				await syncStreakToSupabase(client);
				await loadMistakesFromSupabase(client);
				await syncMistakesToSupabase(client);
				badgeStreakSyncedUserId = userId;
			} catch (err) {
				console.error('Error syncing badges/streaks:', err);
			} finally {
				badgeStreakSyncInFlight = null;
			}
		})();
		await badgeStreakSyncInFlight;
	}

	/** Offline detection */
	let isOffline = $state(false);

	function isRecord(v: unknown): v is Record<string, unknown> {
		return typeof v === 'object' && v !== null && !Array.isArray(v);
	}

	const DIFFICULTY_SET: ReadonlySet<string> = new Set<string>(['A1', 'A2', 'B1', 'B2']);
	function isDifficulty(value: unknown): value is Difficulty {
		return typeof value === 'string' && DIFFICULTY_SET.has(value);
	}

	/** Validate that an unknown value is a Record<string, CaseScore>. */
	function isValidScoresRecord(value: unknown): value is Record<string, CaseScore> {
		if (!isRecord(value)) return false;
		for (const v of Object.values(value)) {
			if (
				!isRecord(v) ||
				!('attempts' in v) ||
				!('correct' in v) ||
				typeof v.attempts !== 'number' ||
				typeof v.correct !== 'number'
			) {
				return false;
			}
		}
		return true;
	}

	/** Safely parse remote Supabase row into a Progress object, returning null on invalid data. */
	function parseRemoteProgress(row: Record<string, unknown>): Progress | null {
		const level = row.level;
		if (!isDifficulty(level)) return null;

		const caseScores = row.case_scores ?? {};
		const paradigmScores = row.paradigm_scores ?? {};
		const lastSession = row.last_session;

		if (!isValidScoresRecord(caseScores)) return null;
		if (!isValidScoresRecord(paradigmScores)) return null;
		if (typeof row.user_id !== 'string') return null;

		return {
			level,
			caseScores,
			paradigmScores,
			lastSession: typeof lastSession === 'string' ? lastSession : ''
		};
	}

	function clearProgress(): void {
		progress.set({ level: 'A1', caseScores: {}, paradigmScores: {}, lastSession: '' });
	}

	onMount(() => {
		initPostHog();

		// Offline detection
		isOffline = !navigator.onLine;
		const goOffline = () => (isOffline = true);
		const goOnline = () => (isOffline = false);
		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);

		const pageData = page.data;
		const spRaw = pageData.savedProgress;
		const spLevel = spRaw?.level;
		if (pageData.user && spRaw && isDifficulty(spLevel)) {
			const serverProgress: Progress = {
				level: spLevel,
				caseScores: spRaw.case_scores,
				paradigmScores: spRaw.paradigm_scores,
				lastSession: spRaw.last_session
			};
			const localProgress = loadProgressFromLocalStorage();
			const storedUserId = localStorage.getItem(STORAGE_USER_KEY);
			const isOrphanedFromOtherUser =
				storedUserId !== null && storedUserId !== '' && storedUserId !== pageData.user.id;

			const initSupabase = getSupabaseBrowserClient();

			const mergedUserId = pageData.user.id;

			if (localProgress && hasAnyProgress(localProgress) && !isOrphanedFromOtherUser) {
				// Merge local guest progress with server progress
				const merged = mergeProgress(localProgress, serverProgress);
				progress.set(merged);
				// Persist the merged result back to Supabase so the guest-accumulated
				// case/paradigm scores are not lost on the next sign-in from another
				// device. The SIGNED_IN auth handler below is short-circuited by
				// lastMergedUserId, so this onMount branch must push the merge itself.
				// If the update fails, retry via upsert on the next drill result by
				// leaving the in-memory store dirty — the progress store's own
				// debounced sync will pick it up.
				void (async () => {
					const { error: mergeUpdateError } = await initSupabase
						.from('user_progress')
						.update({
							level: merged.level,
							case_scores: merged.caseScores,
							paradigm_scores: merged.paradigmScores,
							last_session: merged.lastSession,
							updated_at: new Date().toISOString()
						})
						.eq('user_id', mergedUserId);
					if (mergeUpdateError) {
						console.error(
							'Failed to persist merged guest progress; will retry on next sync:',
							mergeUpdateError
						);
						// Nudge the store so its debounced syncToSupabase re-flushes with the merge.
						progress.set(merged);
					}
				})();
			} else {
				progress.set(serverProgress);
			}
			localStorage.setItem(STORAGE_USER_KEY, pageData.user.id);
			lastMergedUserId = pageData.user.id;
			posthog.identify(pageData.user.id);

			// Sync badges and streaks on initial page load for logged-in users.
			// Guarded by badgeStreakSyncedUserId so the SIGNED_IN auth handler
			// below doesn't race this path on a fresh sign-in.
			void syncBadgesAndStreaks(initSupabase, pageData.user.id);
		}

		const supabase = getSupabaseBrowserClient();

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange(
			async (_event: string, session: { user?: { id: string } } | null) => {
				const isSignIn =
					_event === 'SIGNED_IN' || (_event === 'INITIAL_SESSION' && !!session?.user);
				// Only treat an explicit SIGNED_OUT as sign-out. INITIAL_SESSION
				// without a user fires on every guest page load and must NOT
				// clobber guest-mode localStorage progress.
				const isSignOut = _event === 'SIGNED_OUT';

				if (isSignIn) {
					const userId = session?.user?.id ?? '';
					if (!userId || userId === lastMergedUserId) return;

					try {
						const storedUserId = localStorage.getItem(STORAGE_USER_KEY);
						const localProgress = loadProgressFromLocalStorage();

						// If localStorage progress belongs to a different signed-in user,
						// discard it so the new account doesn't inherit someone else's stats.
						const isOrphanedFromOtherUser =
							storedUserId !== null && storedUserId !== '' && storedUserId !== userId;

						const usableLocalProgress =
							localProgress && hasAnyProgress(localProgress) && !isOrphanedFromOtherUser
								? localProgress
								: null;

						const { data: remoteData, error: selectError } = await supabase
							.from('user_progress')
							.select('*')
							.maybeSingle();

						if (selectError) {
							console.error('Failed to fetch remote progress:', selectError);
						} else if (usableLocalProgress && remoteData) {
							// Both local and remote exist — merge them
							const remoteProgress = isRecord(remoteData) ? parseRemoteProgress(remoteData) : null;

							if (remoteProgress) {
								const merged = mergeProgress(usableLocalProgress, remoteProgress);

								const { error: updateError } = await supabase
									.from('user_progress')
									.update({
										level: merged.level,
										case_scores: merged.caseScores,
										paradigm_scores: merged.paradigmScores,
										last_session: merged.lastSession,
										updated_at: new Date().toISOString()
									})
									.eq('user_id', userId);

								if (updateError) {
									console.error('Failed to update merged progress:', updateError);
								}

								progress.set(merged);
							} else {
								console.error('Remote progress data has unexpected shape, skipping merge');
							}
						} else if (usableLocalProgress) {
							// Guest progress exists but no remote row — upload it
							const { error: insertError } = await supabase.from('user_progress').upsert(
								{
									user_id: userId,
									level: usableLocalProgress.level,
									case_scores: usableLocalProgress.caseScores,
									paradigm_scores: usableLocalProgress.paradigmScores,
									last_session: usableLocalProgress.lastSession,
									updated_at: new Date().toISOString()
								},
								{ onConflict: 'user_id' }
							);

							if (insertError) {
								console.error('Failed to upload local progress:', insertError);
							}

							progress.set(usableLocalProgress);
						} else if (remoteData) {
							// No usable local progress — load from Supabase
							const parsed = isRecord(remoteData) ? parseRemoteProgress(remoteData) : null;
							if (parsed) {
								progress.set(parsed);
							} else {
								console.error('Remote progress data has unexpected shape, using defaults');
								clearProgress();
							}
						} else {
							// New user, no local guest progress — start fresh
							clearProgress();
						}

						localStorage.setItem(STORAGE_USER_KEY, userId);
						lastMergedUserId = userId;
						posthog.identify(userId);

						// Sync badges and streaks with Supabase (merge local + remote).
						// Deduped against onMount's initial sync via badgeStreakSyncedUserId.
						await syncBadgesAndStreaks(supabase, userId);
					} catch (err) {
						console.error('Error during SIGNED_IN progress sync:', err);
					}
				}

				if (isSignOut) {
					lastMergedUserId = null;
					badgeStreakSyncedUserId = null;
					localStorage.removeItem(STORAGE_USER_KEY);
					clearProgress();
					posthog.reset();
				}

				// Refresh server data (user session) — guard against router not
				// being ready during INITIAL_SESSION which fires in onMount.
				try {
					invalidateAll();
				} catch {
					// Router not yet initialized; safe to ignore.
				}
			}
		);

		return () => {
			subscription.unsubscribe();
			window.removeEventListener('offline', goOffline);
			window.removeEventListener('online', goOnline);
		};
	});

	function hasAnyProgress(p: {
		caseScores: Record<string, unknown>;
		paradigmScores?: Record<string, unknown>;
	}): boolean {
		return Object.keys(p.caseScores).length > 0;
	}
</script>

<div class="flex min-h-screen flex-col">
	{#if isOffline}
		<div class="bg-warning-background px-4 py-2 text-center text-xs font-medium text-warning-text">
			You're offline — practice still works, but progress won't sync or count toward assignments
		</div>
	{/if}
	<div class="flex-1">{@render children()}</div>

	<footer class="py-6 text-center text-xs text-darker-subtitle">
		<div class="flex items-center justify-center gap-3">
			<a href={resolve('/about')} class="transition-colors hover:text-text-default">About</a>
			<span aria-hidden="true">·</span>
			<a href={resolve('/contact')} class="transition-colors hover:text-text-default">Contact</a>
			<span aria-hidden="true">·</span>
			<a href={resolve('/privacy')} class="transition-colors hover:text-text-default"
				>Privacy Policy</a
			>
		</div>
		<div class="mt-1.5 font-medium">Skloňuj</div>
	</footer>
</div>
