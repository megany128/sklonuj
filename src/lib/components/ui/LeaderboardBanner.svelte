<script lang="ts">
	import Trophy from '@lucide/svelte/icons/trophy';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Smile from '@lucide/svelte/icons/smile';
	import Flame from '@lucide/svelte/icons/flame';
	import PartyPopper from '@lucide/svelte/icons/party-popper';
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
		totalStudents: number;
		currentUserId: string;
		classId?: string;
		sentToday?: string[];
		pointsDelta?: number;
		onReactionSent?: (toUserId: string) => void;
		mode?: 'class' | 'global';
		showOnLeaderboard?: boolean;
		onToggleVisibility?: () => void;
		isAnonymous?: boolean;
		onSignUp?: () => void;
	}

	let {
		leaderboard,
		totalStudents,
		currentUserId,
		classId = '',
		sentToday = [],
		pointsDelta = 0,
		onReactionSent = () => {},
		mode = 'class',
		showOnLeaderboard = true,
		onToggleVisibility = () => {},
		isAnonymous = false,
		onSignUp = () => {}
	}: Props = $props();

	let expanded = $state(false);
	let reactionMenuOpen = $state<string | null>(null);
	let sendingReaction = $state(false);

	// Floating reaction feedback — burst of icons
	interface FloatingReaction {
		id: number;
		type: 'flame' | 'party';
		userId: string;
		x: number; // horizontal offset px
		y: number; // vertical drift variance
		delay: number; // animation delay ms
		scale: number; // size multiplier
		opacity: number; // base opacity
		rotation: number; // slight tilt
	}
	let floatingReactions = $state<FloatingReaction[]>([]);
	let floatingId = 0;

	// Confirmation text after sending
	let cheeredUserId = $state<string | null>(null);
	let cheeredTimer: ReturnType<typeof setTimeout> | null = null;

	let myEntry = $derived(leaderboard.find((e) => e.userId === currentUserId));
	let myRank = $derived(myEntry?.rank ?? 0);
	let myScore = $derived(myEntry?.score ?? 0);
	// People below that aren't already visible in the windowed list
	let peopleBelowNotShown = $derived.by(() => {
		if (myRank <= 0) return 0;
		const totalBelow = totalStudents - myRank;
		// The API includes one person below, so subtract 1 if there is one
		const shownBelow = leaderboard.some((e) => e.rank > myRank) ? 1 : 0;
		return Math.max(0, totalBelow - shownBelow);
	});

	interface DisplayRow {
		kind: 'entry';
		entry: LeaderboardEntry;
	}
	interface SeparatorRow {
		kind: 'separator';
	}
	type Row = DisplayRow | SeparatorRow;

	let displayRows = $derived.by<Row[]>(() => {
		const sorted = [...leaderboard].sort((a, b) => a.rank - b.rank);
		const rows: Row[] = [];
		for (let i = 0; i < sorted.length; i++) {
			if (i > 0 && sorted[i].rank > sorted[i - 1].rank + 1) {
				rows.push({ kind: 'separator' });
			}
			rows.push({ kind: 'entry', entry: sorted[i] });
		}
		return rows;
	});

	let nextRankEntry = $derived.by(() => {
		if (!myEntry || myEntry.rank <= 1) return null;
		const above = leaderboard.filter((e) => e.rank < myEntry!.rank);
		if (above.length === 0) return null;
		return above[above.length - 1];
	});

	let pointsBehind = $derived.by(() => {
		if (!nextRankEntry || !myEntry) return 0;
		return Math.round(nextRankEntry.score - myEntry.score);
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

	function openReactionMenu(userId: string): void {
		reactionMenuOpen = userId;
	}

	function closeReactionMenu(userId: string): void {
		if (reactionMenuOpen === userId) {
			reactionMenuOpen = null;
		}
	}

	function spawnFloating(userId: string, type: 'flame' | 'party'): void {
		const count = 8;
		const newFloats: FloatingReaction[] = [];
		for (let i = 0; i < count; i++) {
			newFloats.push({
				id: ++floatingId,
				type,
				userId,
				x: (Math.random() - 0.5) * 70,
				y: -30 - Math.random() * 30,
				delay: Math.random() * 250,
				scale: 0.5 + Math.random() * 0.7,
				opacity: 0.5 + Math.random() * 0.5,
				rotation: (Math.random() - 0.5) * 40
			});
		}
		floatingReactions = [...floatingReactions, ...newFloats];
		const ids = new Set(newFloats.map((f) => f.id));
		setTimeout(() => {
			floatingReactions = floatingReactions.filter((r) => !ids.has(r.id));
		}, 1200);
	}

	let cheeredMessage = $state<string | null>(null);

	function showCheered(userId: string, name: string, type: 'flame' | 'party'): void {
		cheeredUserId = userId;
		cheeredMessage = type === 'flame' ? `Watch out, ${name}!` : `Keep it up, ${name}!`;
		if (cheeredTimer) clearTimeout(cheeredTimer);
		cheeredTimer = setTimeout(() => {
			cheeredUserId = null;
			cheeredMessage = null;
		}, 2000);
	}

	async function sendReaction(
		toUserId: string,
		toName: string,
		emoji: string,
		type: 'flame' | 'party'
	): Promise<void> {
		if (sendingReaction) return;
		sendingReaction = true;
		reactionMenuOpen = null;
		spawnFloating(toUserId, type);
		showCheered(toUserId, toName, type);

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

	// Floating points animation
	interface FloatingPoints {
		id: number;
		value: number;
	}
	let floatingPoints = $state<FloatingPoints[]>([]);
	let lastPointsDelta = 0;

	$effect(() => {
		if (pointsDelta !== lastPointsDelta && pointsDelta !== 0) {
			const diff = pointsDelta - lastPointsDelta;
			lastPointsDelta = pointsDelta;
			if (diff > 0) {
				const id = ++floatingId;
				floatingPoints = [...floatingPoints, { id, value: diff }];
				setTimeout(() => {
					floatingPoints = floatingPoints.filter((p) => p.id !== id);
				}, 900);
			}
		}
	});

	function hasSentToday(userId: string): boolean {
		return sentToday.includes(userId);
	}

	function formatScore(score: number): string {
		return String(Math.round(score));
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if mode === 'global' && !showOnLeaderboard}
	<!-- Leaderboard off — minimal strip with toggle -->
	<div
		class="flex w-full items-center justify-between rounded-xl border border-card-stroke bg-card-bg px-3 py-2"
	>
		<div class="flex items-center gap-2">
			<Trophy class="size-4 text-text-subtitle" aria-hidden="true" />
			<span class="text-sm text-text-subtitle">Weekly Leaderboard</span>
		</div>
		<button
			type="button"
			role="switch"
			aria-checked={false}
			aria-label="Enable leaderboard"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				onToggleVisibility();
			}}
			class="relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full bg-slate-300 transition-colors"
		>
			<span
				class="pointer-events-none inline-block size-[14px] translate-x-[2px] rounded-full bg-white shadow-sm transition-transform"
			></span>
		</button>
	</div>
{:else if leaderboard.length > 0 && (myEntry || isAnonymous)}
	<!-- Collapsed banner -->
	<div
		role="button"
		tabindex="0"
		onclick={toggleExpanded}
		onkeydown={(e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleExpanded();
			}
		}}
		class="flex w-full cursor-pointer items-center justify-between rounded-xl border border-card-stroke bg-card-bg px-3 py-2 transition-colors hover:bg-shaded-background/50"
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
			<span class="relative text-xs font-semibold text-text-subtitle">
				{formatScore(myScore)} pts
				{#each floatingPoints as fp (fp.id)}
					<span class="points-float absolute -top-1 right-0 text-xs font-medium text-text-subtitle">
						+{fp.value}
					</span>
				{/each}
			</span>
			{#if mode === 'global' && !isAnonymous}
				<button
					type="button"
					role="switch"
					aria-checked={true}
					aria-label="Disable leaderboard"
					onclick={(e: MouseEvent) => {
						e.stopPropagation();
						onToggleVisibility();
					}}
					class="relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full bg-brand-600 transition-colors"
				>
					<span
						class="pointer-events-none inline-block size-[14px] translate-x-[16px] rounded-full bg-white shadow-sm transition-transform"
					></span>
				</button>
			{/if}
			<ChevronDown
				class="size-3.5 text-text-subtitle transition-transform duration-200 {expanded
					? 'rotate-180'
					: ''}"
				aria-hidden="true"
			/>
		</div>
	</div>

	<!-- Expanded leaderboard -->
	{#if expanded}
		<div
			transition:slide={{ duration: 200 }}
			class="mt-1 rounded-xl border border-card-stroke bg-card-bg"
		>
			<div class="px-3 py-2">
				<div class="mb-2">
					<span class="text-xs font-semibold text-text-subtitle">Weekly Leaderboard</span>
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
							{@const entryFloats = floatingReactions.filter((r) => r.userId === entry.userId)}
							<div
								class="relative flex items-center gap-2 rounded-lg px-2 py-1.5 {isMe
									? 'bg-brand-50'
									: ''}"
							>
								<!-- Rank -->
								<span
									class="w-5 shrink-0 text-center text-xs font-bold {isMe
										? 'text-brand-600'
										: entry.rank === 1
											? 'text-amber-500'
											: entry.rank === 2
												? 'text-slate-400'
												: entry.rank === 3
													? 'text-amber-700'
													: 'text-text-subtitle'}"
								>
									{entry.rank}
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
									{formatScore(entry.score)} pts
								</span>

								<!-- Reaction button (class mode only) -->
								{#if mode === 'class'}
									{#if !isMe}
										<div
											class="relative -m-2 p-2"
											role="group"
											onmouseenter={() => openReactionMenu(entry.userId)}
											onmouseleave={() => closeReactionMenu(entry.userId)}
										>
											{#if hasSentToday(entry.userId)}
												<span
													class="inline-flex size-6 items-center justify-center text-text-subtitle opacity-40"
													title="Already sent today"
												>
													<Smile class="size-3.5" aria-hidden="true" />
												</span>
											{:else}
												<span
													class="inline-flex size-6 items-center justify-center rounded-md text-text-subtitle transition-colors hover:bg-icon-hover hover:text-text-default"
												>
													<Smile class="size-3.5" aria-hidden="true" />
												</span>
											{/if}

											<!-- Reaction picker popup -->
											{#if showMenu && canReact}
												<div class="absolute right-0 top-full z-50 pt-1">
													<div
														class="flex flex-col items-center gap-1 rounded-lg border border-card-stroke bg-card-bg px-2 py-1.5 shadow-lg"
													>
														<span class="whitespace-nowrap text-[10px] text-text-subtitle">
															Send {entry.firstName} a reaction
														</span>
														<div class="flex gap-1 whitespace-nowrap">
															<button
																type="button"
																onclick={() =>
																	sendReaction(entry.userId, entry.firstName, '\u{1F525}', 'flame')}
																class="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-orange-500 transition-colors hover:bg-orange-50 hover:text-orange-600"
																title="Watch out!"
																disabled={sendingReaction}
															>
																<Flame class="size-3.5" fill="currentColor" aria-hidden="true" />
																<span class="text-[10px] font-medium">Watch out!</span>
															</button>
															<button
																type="button"
																onclick={() =>
																	sendReaction(entry.userId, entry.firstName, '\u{1F44F}', 'party')}
																class="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-teal-500 transition-colors hover:bg-teal-50 hover:text-teal-600"
																title="Keep it up!"
																disabled={sendingReaction}
															>
																<PartyPopper
																	class="size-3.5"
																	fill="currentColor"
																	aria-hidden="true"
																/>
																<span class="text-[10px] font-medium">Keep it up!</span>
															</button>
														</div>
													</div>
												</div>
											{/if}
										</div>
									{:else}
										<span class="size-6"></span>
									{/if}

									<!-- Floating reaction feedback -->
									{#each entryFloats as float (float.id)}
										<span
											class="reaction-float pointer-events-none absolute right-2"
											style="--float-x: {float.x}px; --float-y: {float.y}px; --float-delay: {float.delay}ms; --float-scale: {float.scale}; --float-opacity: {float.opacity}; --float-rotation: {float.rotation}deg;"
										>
											{#if float.type === 'flame'}
												<Flame
													class="size-4 text-orange-500"
													fill="currentColor"
													aria-hidden="true"
												/>
											{:else}
												<PartyPopper
													class="size-4 text-teal-500"
													fill="currentColor"
													aria-hidden="true"
												/>
											{/if}
										</span>
									{/each}
								{/if}
							</div>
							{#if mode === 'class' && cheeredUserId === entry.userId && cheeredMessage}
								<div
									class="cheered-text -mt-0.5 mb-0.5 text-right text-[10px] font-medium text-brand-600 pr-2"
								>
									{cheeredMessage}
								</div>
							{/if}
						{/if}
					{/each}
					{#if peopleBelowNotShown > 0}
						<div class="py-1 text-center text-xs text-text-subtitle">
							{peopleBelowNotShown} more below
						</div>
					{/if}
				</div>
				{#if isAnonymous}
					<button
						type="button"
						onclick={onSignUp}
						class="mt-3 flex w-full items-center justify-center rounded-xl bg-emphasis px-4 py-2 text-sm font-semibold text-text-inverted transition-opacity hover:opacity-90"
					>
						Sign up to save your rank
					</button>
				{:else}
					<p class="mt-2 text-center text-[11px] leading-snug text-text-subtitle">
						Scored by questions answered &amp; accuracy this week. Keep practicing — every answer
						moves you up.
					</p>
				{/if}
			</div>
		</div>
	{/if}
{/if}

<style>
	@keyframes float-up {
		0% {
			opacity: var(--float-opacity, 1);
			transform: translate(0, 0) scale(var(--float-scale, 1)) rotate(0deg);
		}
		50% {
			opacity: var(--float-opacity, 1);
		}
		100% {
			opacity: 0;
			transform: translate(var(--float-x, 0px), var(--float-y, -40px))
				scale(calc(var(--float-scale, 1) * 1.1)) rotate(var(--float-rotation, 0deg));
		}
	}

	.reaction-float {
		animation: float-up 1s ease-out forwards;
		animation-delay: var(--float-delay, 0ms);
		opacity: 0;
		animation-fill-mode: backwards;
	}

	@keyframes fade-in-out {
		0% {
			opacity: 0;
			transform: translateY(2px);
		}
		15% {
			opacity: 1;
			transform: translateY(0);
		}
		85% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	.cheered-text {
		animation: fade-in-out 2s ease-in-out forwards;
	}

	@keyframes points-up {
		0% {
			opacity: 1;
			transform: translateY(0);
		}
		70% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translateY(-18px);
		}
	}

	.points-float {
		animation: points-up 0.8s ease-out forwards;
		pointer-events: none;
	}
</style>
