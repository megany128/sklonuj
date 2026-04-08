<script lang="ts">
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
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="size-4 text-warning-text"
			>
				<path
					fill-rule="evenodd"
					d="M10 1c-1.828 0-3.623.149-5.371.435a.75.75 0 00-.629.74v.387c-.827.157-1.642.345-2.445.564a.75.75 0 00-.552.698c-.028 1.13.175 2.436.8 3.49.622 1.047 1.61 1.79 3.005 1.86A7.97 7.97 0 007.97 12.84a.75.75 0 00-.209.575l.164 4.926a.75.75 0 01-.75.775H5.75a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-1.424a.75.75 0 01-.75-.775l.164-4.926a.75.75 0 00-.209-.575A7.97 7.97 0 0015.192 9.174c1.395-.07 2.383-.813 3.005-1.86.625-1.054.828-2.36.8-3.49a.75.75 0 00-.552-.698 41.678 41.678 0 00-2.445-.564v-.387a.75.75 0 00-.629-.74A49.423 49.423 0 0010 1zM4.75 3.097v-.243a47.557 47.557 0 014.5-.354v1.08a.75.75 0 001.5 0V2.5c1.527.047 3.037.172 4.5.354v.243a36.32 36.32 0 00-5.25-.345 36.32 36.32 0 00-5.25.345zM3.166 7.87c-.491-.827-.673-1.845-.694-2.791A40.57 40.57 0 014.75 4.506v3.07c0 .625.073 1.232.21 1.816-.932-.254-1.487-.842-1.794-1.522zM15.25 7.576V4.506c.762.139 1.517.307 2.278.573-.021.946-.203 1.964-.694 2.791-.307.68-.862 1.268-1.794 1.522a8.065 8.065 0 00.21-1.816z"
					clip-rule="evenodd"
				/>
			</svg>
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
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="size-3.5 text-text-subtitle transition-transform duration-200 {expanded
					? 'rotate-180'
					: ''}"
			>
				<path
					fill-rule="evenodd"
					d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
					clip-rule="evenodd"
				/>
			</svg>
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
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-3.5"
						>
							<path
								d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
							/>
						</svg>
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
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 20 20"
													fill="currentColor"
													class="size-3.5"
												>
													<path
														fill-rule="evenodd"
														d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.536-4.464a.75.75 0 10-1.06-1.06 3.5 3.5 0 01-4.95 0 .75.75 0 00-1.06 1.06 5 5 0 007.07 0zM9 8.5c0 .828-.448 1.5-1 1.5s-1-.672-1-1.5S7.448 7 8 7s1 .672 1 1.5zm3 1.5c.552 0 1-.672 1-1.5S12.552 7 12 7s-1 .672-1 1.5.448 1.5 1 1.5z"
														clip-rule="evenodd"
													/>
												</svg>
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
