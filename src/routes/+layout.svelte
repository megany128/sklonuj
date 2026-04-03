<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import { mergeProgress, loadProgressFromLocalStorage } from '$lib/engine/progress-merge';
	import { progress, STORAGE_USER_KEY } from '$lib/engine/progress';
	import type { Progress, CaseScore, Difficulty } from '$lib/types';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import { initPostHog } from '$lib/posthog';
	import posthog from '$lib/posthog';

	let { children } = $props();

	/** Track the last merged user ID to prevent duplicate merge operations on repeated SIGNED_IN events. */
	let lastMergedUserId: string | null = null;

	/** Validate that an unknown value is a Record<string, CaseScore>. */
	function isValidScoresRecord(value: unknown): value is Record<string, CaseScore> {
		if (typeof value !== 'object' || value === null) return false;
		for (const v of Object.values(value as Record<string, unknown>)) {
			if (
				typeof v !== 'object' ||
				v === null ||
				!('attempts' in v) ||
				!('correct' in v) ||
				typeof (v as Record<string, unknown>).attempts !== 'number' ||
				typeof (v as Record<string, unknown>).correct !== 'number'
			) {
				return false;
			}
		}
		return true;
	}

	const VALID_LEVELS: ReadonlySet<string> = new Set(['A1', 'A2', 'B1', 'B2']);

	/** Safely parse remote Supabase row into a Progress object, returning null on invalid data. */
	function parseRemoteProgress(row: Record<string, unknown>): Progress | null {
		const level = row.level;
		if (typeof level !== 'string' || !VALID_LEVELS.has(level)) return null;

		const caseScores = row.case_scores ?? {};
		const paradigmScores = row.paradigm_scores ?? {};
		const lastSession = row.last_session;

		if (!isValidScoresRecord(caseScores)) return null;
		if (!isValidScoresRecord(paradigmScores)) return null;
		if (typeof row.user_id !== 'string') return null;

		return {
			level: level as Difficulty,
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
		const supabase = getSupabaseBrowserClient();

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange(
			async (_event: string, session: { user?: { id: string } } | null) => {
				const isSignIn =
					_event === 'SIGNED_IN' || (_event === 'INITIAL_SESSION' && !!session?.user);
				const isSignOut =
					_event === 'SIGNED_OUT' || (_event === 'INITIAL_SESSION' && !session?.user);

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
							const remoteProgress = parseRemoteProgress(remoteData as Record<string, unknown>);

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
							const parsed = parseRemoteProgress(remoteData as Record<string, unknown>);
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
					} catch (err) {
						console.error('Error during SIGNED_IN progress sync:', err);
					}
				}

				if (isSignOut) {
					lastMergedUserId = null;
					localStorage.removeItem(STORAGE_USER_KEY);
					clearProgress();
					posthog.reset();
				}

				// Refresh server data (user session)
				invalidateAll();
			}
		);

		return () => {
			subscription.unsubscribe();
		};
	});

	function hasAnyProgress(p: {
		caseScores: Record<string, unknown>;
		paradigmScores?: Record<string, unknown>;
	}): boolean {
		return Object.keys(p.caseScores).length > 0;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<div class="flex-1">{@render children()}</div>

	<footer class="py-6 text-center text-xs text-text-subtitle">
		<div class="flex items-center justify-center gap-3">
			<a href={resolve('/contact')} class="transition-colors hover:text-text-default">Contact</a>
			<span aria-hidden="true">·</span>
			<a href={resolve('/privacy')} class="transition-colors hover:text-text-default"
				>Privacy Policy</a
			>
		</div>
		<div class="mt-1.5 font-medium">Skloňuj</div>
	</footer>
</div>
