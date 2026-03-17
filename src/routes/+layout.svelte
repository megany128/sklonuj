<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { getSupabaseBrowserClient } from '$lib/supabase';
	import { mergeProgress, loadProgressFromLocalStorage } from '$lib/engine/progress-merge';
	import { progress } from '$lib/engine/progress';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();

	onMount(() => {
		const supabase = getSupabaseBrowserClient();

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange(async (event: string) => {
			if (event === 'SIGNED_IN') {
				// Merge localStorage progress into Supabase on first login
				const localProgress = loadProgressFromLocalStorage();
				if (localProgress && hasAnyProgress(localProgress)) {
					const { data: remoteData } = await supabase.from('user_progress').select('*').single();

					if (remoteData) {
						const remoteProgress = {
							level: remoteData.level,
							caseScores: (remoteData.case_scores ?? {}) as Record<
								string,
								{ attempts: number; correct: number }
							>,
							paradigmScores: (remoteData.paradigm_scores ?? {}) as Record<
								string,
								{ attempts: number; correct: number }
							>,
							lastSession: remoteData.last_session ?? ''
						};

						const merged = mergeProgress(localProgress, remoteProgress);

						await supabase
							.from('user_progress')
							.update({
								level: merged.level,
								case_scores: merged.caseScores,
								paradigm_scores: merged.paradigmScores,
								last_session: merged.lastSession,
								updated_at: new Date().toISOString()
							})
							.eq('user_id', remoteData.user_id);

						// Update local store with merged data
						progress.set(merged);
					}
				} else {
					// No local progress — load from Supabase into local store
					const { data: remoteData } = await supabase.from('user_progress').select('*').single();

					if (remoteData) {
						progress.set({
							level: remoteData.level,
							caseScores: (remoteData.case_scores ?? {}) as Record<
								string,
								{ attempts: number; correct: number }
							>,
							paradigmScores: (remoteData.paradigm_scores ?? {}) as Record<
								string,
								{ attempts: number; correct: number }
							>,
							lastSession: remoteData.last_session ?? ''
						});
					}
				}
			}

			if (event === 'SIGNED_OUT') {
				// Revert to empty local progress
				progress.set({
					level: 'A1',
					caseScores: {},
					paradigmScores: {},
					lastSession: ''
				});
			}

			// Refresh server data (user session)
			invalidateAll();
		});

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

{@render children()}
