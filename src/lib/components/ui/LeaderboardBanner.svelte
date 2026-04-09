<script lang="ts">
	import Trophy from '@lucide/svelte/icons/trophy';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';
	import Smile from '@lucide/svelte/icons/smile';
	import { slide } from 'svelte/transition';

	interface LeaderboardEntry {
		rank: number;
		userId: string;
		displayName: string;
		firstName: string;
		score: number;
		questionsAnswered: number;
		correctAnswers: number;
	}

	interface Props {
		leaderboard: LeaderboardEntry[];
		currentUserId: string;
		classId: string;
		sentToday: string[];
		onReactionSent: (toUserId: string) => void;
	}

	let { leaderboard, currentUserId, classId, sentToday, onReactionSent }: Props = $props();

	let expanded = $state(false);
	let reactionMenuOpen = $state<string | null>(null);
	let sendingReaction = $state(false);

	let myEntry = $derived(leaderboard.find((e) => e.userId === currentUserId));
	let myRank = $derived(myEntry?.rank ?? 0);
	let myScore = $derived(myEntry?.score ?? 0);

	// Windowed view: show top 3 + the current user (if outside top 3). Keeps the
	// leaderboard motivating without shaming students at the bottom. If the user
	// is within the top 3, show just the top 3. If they're below, splice them in
	// with a "…" separator marker so the gap is visible.
	interface DisplayRow {
		kind: 'entry';
		entry: LeaderboardEntry;
	}
	interface SeparatorRow {
		kind: 'separator';
	}
	type Row = DisplayRow | SeparatorRow;

	let displayRows = $derived.by<Row[]>(() => {
		const top = leaderboard.slice(0, 3);
		const rows: Row[] = top.map((e) => ({ kind: 'entry', entry: e }));
		if (myEntry && !top.some((e) => e.userId === myEntry!.userId)) {
			// Insert a separator if there's actually a gap between top[2] and me
			const lastTopRank = top.length > 0 ? top[top.length - 1].rank : 0;
			if (myEntry.rank > lastTopRank + 1) {
				rows.push({ kind: 'separator' });
			}
			rows.push({ kind: 'entry', entry: myEntry });
		}
		return rows;
	});

	let nextRankEntry = $derived.by(() => {
		if (!myEntry || myEntry.rank <= 1) return null;
		// Find the person directly above us (rank = myRank - 1, or same rank but higher score)
		const above = leaderboard.filter((e) => e.rank < myEntry!.rank);
		if (above.length === 0) return null;
		// Closest person above
		return above[above.length - 1];
	});

	let pointsBehind = $derived.by(() => {
		if (!nextRankEntry || !myEntry) return 0;
		return Math.round((nextRankEntry.score - myEntry.score) * 10) / 10;
	});

	function getRankSuffix(rank: number): string {
		if (rank % 100 >= 11 && rank % 100 <= 13) return 'th';
		switch (rank % 10) {
			case 1:
				return 'st';
			case 2:
				return 'nd';
			case 3:
				return 'rd';
			default:
				return 'th';
		}
	}

	function toggleExpanded(): void {
		expanded = !expanded;
		if (!expanded) {
			reactionMenuOpen = null;
		}
	}

	function handleWindowKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && expanded) {
			e.preventDefault();
			expanded = false;
			reactionMenuOpen = null;
		}
	}

	function toggleReactionMenu(userId: string): void {
		if (reactionMenuOpen === userId) {
			reactionMenuOpen = null;
		} else {
			reactionMenuOpen = userId;
		}
	}

	async function sendReaction(toUserId: string, emoji: string): Promise<void> {
		if (sendingReaction) return;
		sendingReaction = true;
		reactionMenuOpen = null;

		try {
			const res = await fetch('/api/leaderboard/reactions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ classId, toUserId, emoji })
			});
			if (res.ok) {
				onReactionSent(toUserId);
			}
		} catch {
			// silently fail
		} finally {
			sendingReaction = false;
		}
	}

	function hasSentToday(userId: string): boolean {
		return sentToday.includes(userId);
	}

	function formatScore(score: number): string {
		return score % 1 === 0 ? String(score) : score.toFixed(1);
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if leaderboard.length > 0 && myEntry}
	<!-- Collapsed banner -->
	<button
		type="button"
		onclick={toggleExpanded}
		class="flex w-full items-center justify-between rounded-xl border border-card-stroke bg-card-bg px-3 py-2 transition-colors hover:bg-shaded-background/50"
	>
		<div class="flex items-center gap-2">
			<Trophy class="size-4 text-warning-text" aria-hidden="true" />
			<span class="text-sm font-medium text-text-default">
				You're #{myRank}{getRankSuffix(myRank)} this week
			</span>
			{#if pointsBehind > 0 && nextRankEntry}
				<span class="hidden text-xs text-text-subtitle sm:inline">
					{formatScore(pointsBehind)} pts behind {nextRankEntry.firstName}
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<span class="text-xs font-semibold text-text-subtitle">
				{formatScore(myScore)} pts
			</span>
			<ChevronDown
				class="size-3.5 text-text-subtitle transition-transform duration-200 {expanded
					? 'rotate-180'
					: ''}"
				aria-hidden="true"
			/>
		</div>
	</button>

	<!-- Expanded leaderboard -->
	{#if expanded}
		<div
			transition:slide={{ duration: 200 }}
			class="mt-1 rounded-xl border border-card-stroke bg-card-bg"
		>
			<div class="px-3 py-2">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-xs font-semibold text-text-subtitle">Weekly Leaderboard</span>
					<button
						type="button"
						onclick={toggleExpanded}
						class="p-0.5 text-text-subtitle transition-colors hover:text-text-default"
						aria-label="Close leaderboard"
					>
						<X class="size-3.5" aria-hidden="true" />
					</button>
				</div>
				<div class="flex flex-col gap-0.5">
					{#each displayRows as row, i (row.kind === 'entry' ? row.entry.userId : `sep-${i}`)}
						{#if row.kind === 'separator'}
							<div
								class="flex items-center justify-center py-1 text-xs text-text-subtitle"
								aria-hidden="true"
							>
								&middot;&middot;&middot;
							</div>
						{:else}
							{@const entry = row.entry}
							{@const isMe = entry.userId === currentUserId}
							{@const canReact = !isMe && !hasSentToday(entry.userId)}
							{@const showMenu = reactionMenuOpen === entry.userId}
							<div
								class="relative flex items-center gap-2 rounded-lg px-2 py-1.5 {isMe
									? 'bg-brand-50'
									: ''}"
							>
								<!-- Rank -->
								<span
									class="w-5 shrink-0 text-center text-xs font-bold {isMe
										? 'text-brand-600'
										: 'text-text-subtitle'}"
								>
									{#if entry.rank === 1}
										<span class="text-sm" title="1st place">&#x1F947;</span>
									{:else if entry.rank === 2}
										<span class="text-sm" title="2nd place">&#x1F948;</span>
									{:else if entry.rank === 3}
										<span class="text-sm" title="3rd place">&#x1F949;</span>
									{:else}
										{entry.rank}
									{/if}
								</span>

								<!-- Name -->
								<span
									class="min-w-0 flex-1 truncate text-sm {isMe
										? 'font-semibold text-brand-700'
										: 'text-text-default'}"
								>
									{entry.firstName}
									{#if isMe}
										<span class="text-xs font-normal text-brand-500">(you)</span>
									{/if}
								</span>

								<!-- Score -->
								<span class="shrink-0 text-xs font-medium text-text-subtitle">
									{formatScore(entry.score)}
								</span>

								<!-- Reaction button -->
								{#if !isMe}
									<div class="relative">
										{#if hasSentToday(entry.userId)}
											<span
												class="inline-flex size-6 items-center justify-center text-xs opacity-40"
												title="Already sent today"
											>
												&#x2714;
											</span>
										{:else}
											<button
												type="button"
												onclick={() => toggleReactionMenu(entry.userId)}
												class="inline-flex size-6 items-center justify-center rounded-md text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
												title="Send reaction"
												disabled={sendingReaction}
											>
												<Smile class="size-3.5" aria-hidden="true" />
											</button>
										{/if}

										<!-- Reaction picker popup -->
										{#if showMenu && canReact}
											<div
												class="absolute right-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-card-stroke bg-card-bg p-1 shadow-lg"
											>
												<button
													type="button"
													onclick={() => sendReaction(entry.userId, '\u{1F525}')}
													class="rounded-md px-2 py-1 text-base transition-colors hover:bg-icon-hover"
													title="Fire"
													disabled={sendingReaction}
												>
													&#x1F525;
												</button>
												<button
													type="button"
													onclick={() => sendReaction(entry.userId, '\u{1F44F}')}
													class="rounded-md px-2 py-1 text-base transition-colors hover:bg-icon-hover"
													title="Clap"
													disabled={sendingReaction}
												>
													&#x1F44F;
												</button>
											</div>
										{/if}
									</div>
								{:else}
									<span class="size-6"></span>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
				<p class="mt-2 text-center text-[11px] leading-snug text-text-subtitle">
					Scored by questions answered &amp; accuracy this week. Keep practicing — every answer
					moves you up.
				</p>
			</div>
		</div>
	{/if}
{/if}
