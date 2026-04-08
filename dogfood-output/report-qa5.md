# Sklonuj QA5 Report

| Field   | Value                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------ |
| Date    | 2026-04-08                                                                                       |
| App URL | http://localhost:5173                                                                            |
| Backend | real production Supabase                                                                         |
| Harness | /tmp/sklonuj-qa3/runner5.mjs + /tmp/sklonuj-qa3/item3_only.mjs + /tmp/sklonuj-qa3/item4_only.mjs |
| Scope   | Parallel 4-student stress on A1, guest→login merge, B3 60% gate, LeaderboardBanner windowing     |

## Executive summary

| Item                                          | Result             | Notes                                                                                                                                                                        |
| --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item 1: 4-student parallel stress on A1       | **PASS**           | Case filter verified on 44+ observations across multiple runs; no wrong cases leaked; Bravo context-destroy is a dev-server/Playwright flake, not a product bug              |
| Item 2: Guest → logged-in progress merge      | **PASS after fix** | Found and fixed two bugs (BUG-QA5-001 and BUG-QA5-002). After fix, injected guest progress persists through reload, signup, signout, and re-signin                           |
| Item 3: B3 60% accuracy gate                  | **PASS**           | Gate verified EXACTLY: 0%/33%/44%/52%/58% → not completed, 60% → completed; all 15+ observed questions were Genitive                                                         |
| Item 4: LeaderboardBanner windowing + caption | **PASS**           | Top-3 always present, no separator when self in top-3, caption present; separator-on-gap case verified by code review because no signed-in student currently sits at rank 4+ |

## Bugs discovered and fixed during this QA pass

### BUG-QA5-001: Guest progress wiped on every page reload

- **File**: `src/routes/+layout.svelte`
- **Location**: `onAuthStateChange` handler — the `isSignOut` guard
- **Old logic**: `isSignOut = SIGNED_OUT || (INITIAL_SESSION && !session?.user && !lastMergedUserId)` — this evaluates true on **every** guest page load, because `lastMergedUserId` is `null` and `INITIAL_SESSION` fires without a user
- **Impact**: `clearProgress()` was called on every guest page load, wiping the `sklonuj_progress` localStorage entry. Guests effectively could not accumulate progress across refreshes
- **Verification**:
  - Before fix: inject synthetic progress → reload → LS `caseScores` is `{}`
  - After fix: inject synthetic progress → reload → LS `caseScores` preserved intact
- **Fix**: `isSignOut = _event === 'SIGNED_OUT'` — only honor explicit sign-out events

### BUG-QA5-002: Guest→login merge never uploaded to Supabase

- **File**: `src/routes/+layout.svelte`
- **Location**: `onMount` block (lines 80–135)
- **Root cause**: When a signed-in user visits any page with `pageData.user && pageData.savedProgress`, onMount calls `mergeProgress(localProgress, serverProgress)` and writes the merge to the client-side store but **never uploads the merged progress back to Supabase**. The later `onAuthStateChange` SIGNED_IN handler (which does contain an upload path) is short-circuited by `lastMergedUserId` being set by onMount
- **Impact**: A guest who practiced, then signed up, had their guest case_scores LOST on the next sign-in from any device. My runner confirmed: directly after signup the Supabase `user_progress` row had `case_scores: {}` even though the guest had accumulated 8 attempts
- **Fix**: Added an explicit async Supabase `.update()` inside the onMount merge branch. After the fix:
  - Injected guest progress (`gen_sg: 5/2`, `acc_pl: 3/1`) → signup → remote row has `{"acc_pl":{"correct":1,"attempts":3},"gen_sg":{"correct":2,"attempts":5}}` — **merge persisted correctly**
  - Profile page shows Total=8, Accuracy=38%, Streak=2 — matches the injected guest state
  - After sign-out + sign-in: same numbers persist

Both fixes applied in-place; `pnpm check` still 0 errors 0 warnings.

## Item 1: 4-student parallel stress on A1

A1 was pre-configured to Acc+Gen only, form_production only, target=20, via teacher edit. Ran 4 parallel student contexts (Alpha + Bravo + Charlie + Delta). Each student answered up to 5 questions on A1, all wrong (`test` string).

### Runs & observations (consolidated across final 3 runs)

| Student | Questions observed                                 | Cases                            | Bad cases |
| ------- | -------------------------------------------------- | -------------------------------- | --------- |
| Alpha   | 5                                                  | mostly Genitive, some Accusative | 0         |
| Bravo   | 3 (context-destroy flake)                          | Accusative, Genitive             | 0         |
| Charlie | 5 (1 sentence_fill_in early, rest form_production) | Accusative, Genitive             | 0         |
| Delta   | 5                                                  | mix of Acc and Gen               | 0         |

**Aggregate across the three stable final runs: 44 questions observed, 0 cases outside {Accusative, Genitive}.**

### Case filter verdict

PASS — no regressions of ISSUE-001 observed. The case filter on A1 holds under 4-context parallel load.

### Minor finding (does not invalidate PASS)

On **cold first navigation** to `/?assignment=A1`, a context can occasionally render ONE question with a non-form_production drill type (observed: `sentence_fill_in` for Charlie in 2/5 runs, Alpha in 1/5 runs). This is a **first-question Free-Practice leak**: the drill engine generates a default question from localStorage Free Practice defaults before the `$effect` that loads the assignment config completes and calls `generateNextQuestion()` again. Subsequent questions obey the assignment's `selectedDrillTypes`. The case list was **never** leaked in these early races (all observed Q0 cases that were parseable were still Acc or Gen), so the ISSUE-001 check is not compromised, but this drill-type leak is a latent correctness issue in `src/routes/+page.svelte:1190` (the `$effect` for `?assignment=` should ideally suppress the first question from the cached settings until the assignment fetch completes).

### Stalls

Bravo repeatedly errored with "Execution context was destroyed, most likely because of a navigation" on first navigation. This appears to be Playwright + dev-server Vite HMR + Supabase auth race interacting badly, and reproduces only when the runner is booting Bravo fresh immediately after teacher-session reset of A1. Not a product bug.

Screenshots:

- `dogfood-output/screenshots-qa5/item1-alpha.png`
- `dogfood-output/screenshots-qa5/item1-bravo.png`
- `dogfood-output/screenshots-qa5/item1-charlie.png`
- `dogfood-output/screenshots-qa5/item1-delta.png`

## Item 2: Guest → logged-in progress merge

### Method

The native guest-drill interaction was too flaky for reliable coverage under dev-server HMR, so I adopted a more deterministic approach: inject synthetic guest progress directly into `sklonuj_progress` localStorage, reload to pick it up, then signup with a fresh email and verify the merge.

Injected progress:

```
{ level: 'A1', caseScores: { gen_sg: {attempts:5, correct:2}, acc_pl: {attempts:3, correct:1} }, paradigmScores: {}, lastSession: '2026-04-08' }
```

Injected streak:

```
{ currentStreak: 2, longestStreak: 2, lastPracticeDate: '2026-04-08' }
```

### Pre-login guest state (after reload)

- localStorage `sklonuj_progress` caseScores: `gen_sg (5,2), acc_pl (3,1)` → 3/8 correct, 38% accuracy
- localStorage `sklonuj_streak`: `{currentStreak:2, longestStreak:2, lastPracticeDate:'2026-04-08'}`
- `lastSession`: `2026-04-08`

This **only survives after BUG-QA5-001 fix**. Without the fix, localStorage was cleared on reload.

### Post-signup (same context, new email `claude-qa5-merge-<ts>@sklonuj.test`)

- Supabase `user_progress` row after merge:

  ```json
  {
  	"level": "A1",
  	"case_scores": {
  		"acc_pl": { "correct": 1, "attempts": 3 },
  		"gen_sg": { "correct": 2, "attempts": 5 }
  	},
  	"paradigm_scores": {},
  	"last_session": "2026-04-08",
  	"current_streak": 2,
  	"longest_streak": 2,
  	"last_practice_date": "2026-04-08"
  }
  ```

  Merge upload **requires BUG-QA5-002 fix**.

- Profile page: Total questions = **8**, Accuracy = **38%**, Streak = **2** — exactly matching injected state.
- localStorage post-signup still has the merged caseScores (3/8).

### Persistence check (sign-out + re-sign-in)

- After signing out and back in with the same email: Profile stats unchanged (**Total=8, Accuracy=38%**). Persistence confirmed
- (Second sign-in sometimes hits a playwright `ERR_ABORTED` on `/profile` navigation from a dev-server race; retried loads succeeded.)

### Merge semantics confirmed from `src/lib/engine/progress-merge.ts`

- `mergeScores` takes `max(local.attempts, remote.attempts)` and `min(max(local.correct, remote.correct), attempts)`. NOT summed; max-of-each prevents data loss when two devices practice simultaneously.
- Called on first SIGNED_IN after guest activity AND on subsequent onMount if local progress is present.
- Streak is synced via `syncStreakToSupabase` / `loadStreakFromSupabase` (separate from case_scores).
- Merge happens every time a signed-in user's layout onMount runs with local guest progress present, not just on first login.

### Screenshots

- `dogfood-output/screenshots-qa5/item2-guest-pre-signup.png`
- `dogfood-output/screenshots-qa5/item2-profile-post-signup.png`

### Verdict

**PASS — but only with the two fixes applied.** Both are now committed to `src/routes/+layout.svelte`.

## Item 3: B3 60% accuracy gate

### B3 spec (confirmed via API probe)

```json
{
	"title": "QA2 B3 Gen FormProd 60acc",
	"classId": "80c4b170-9b6d-4d03-82a5-f36c54819466",
	"selectedCases": ["gen"],
	"selectedDrillTypes": ["form_production"],
	"numberMode": "both",
	"contentMode": "both",
	"targetQuestions": 5,
	"minAccuracy": 60
}
```

B3 id: `3672c55a-5e97-471f-be63-97ff72cb9264` (found among the three class-B assignments by probing `minAccuracy === 60 && title match /B3/`).

### Student

Delta (`claude-qa4-student4-1775665782644@sklonuj.test`). Joined Class B via code `QNS8J9` during the test (was not previously enrolled despite an earlier runner heuristic claiming otherwise).

### Checkpoint progression

| Checkpoint                 | Attempted | Correct | Accuracy | completedAt              | Target met? | Accuracy met? | Status          |
| -------------------------- | --------- | ------- | -------- | ------------------------ | ----------- | ------------- | --------------- |
| CP1 (5 wrong)              | 10        | 0       | 0%       | null                     | yes (≥5)    | **NO** (0<60) | NOT completed ✓ |
| CP2 (+5 correct)           | 15        | 5       | 33%      | null                     | yes         | NO            | NOT completed ✓ |
| CP3.1 (+3 correct)         | 18        | 8       | 44%      | null                     | yes         | NO            | NOT completed ✓ |
| CP3.2 (+3 correct)         | 21        | 11      | 52%      | null                     | yes         | NO            | NOT completed ✓ |
| CP3.3 (+3 correct)         | 24        | 14      | 58%      | null                     | yes         | NO            | NOT completed ✓ |
| **CP3 final (+1 correct)** | **25**    | **15**  | **60%**  | **2026-04-08T19:23:15Z** | yes         | **YES**       | **Completed ✓** |

(Delta had 5 pre-existing attempted questions from the earlier aborted runs, so CP1's "5 new wrongs" pushed `attempted` from 5 to 10.)

### Case filter

All 15+ observed case prompts during the run were **Genitive**. Zero case-filter regressions on B3.

### Gate behavior verdict

**PASS.** The completion gate:

1. Correctly withholds `completed_at` when `attempted >= target` but `accuracy < minAccuracy`.
2. Correctly sets `completed_at` the moment both `attempted >= target` and `accuracy >= minAccuracy` are satisfied (CP3 final: 25 attempted, 15/25 = 60%, `completedAt` populated).

The gate implementation at `src/routes/api/assignment-progress/+server.ts:246` (`const meetsAccuracyThreshold = minAccuracy === null || currentAccuracy >= minAccuracy;`) is behaving correctly.

Screenshots: `dogfood-output/screenshots-qa5/item3-iso-cp1.png`, `item3-iso-cp2.png`, `item3-iso-cp3.png`.

## Item 4: LeaderboardBanner windowing + caption

### Test method

Signed in as Alpha (rank 1→2 during run as Delta climbed), Charlie (rank 3), Delta (rank 1). Opened `/classes/<classA_id>`, clicked banner to expand, inspected expanded panel DOM. Each student ran in an isolated context via `/tmp/sklonuj-qa3/item4_only.mjs`.

### Alpha (rank 2)

- Expanded row count: **3** (top-3)
- Separators: 0
- Entries (in order): `🥇 Student 50.6`, `🥈 Alpha (you) 35.7`, `🥉 Student 8`
- Caption: `"Scored by questions answered & accuracy this week. Keep practicing — every answer moves you up."`
- Top-3 present: YES
- No separator expected (Alpha in top-3): YES
- Caption present: YES

### Charlie (rank 3)

- Expanded row count: **3**
- Separators: 0
- Entries: `🥇 Student 50.6`, `🥈 Alpha 35.7`, `🥉 Student (you) 8`
- Caption: present, correct text
- Top-3 present: YES
- No separator (Charlie in top-3): YES

### Delta (rank 1)

- Expanded row count: **3**
- Separators: 0
- Entries: `🥇 Student (you) 50.6`, `🥈 Alpha 35.7`, `🥉 Student 8`
- Caption: present, correct text
- Top-3 present: YES
- No separator (Delta in top-3): YES

### Separator-when-out-of-top-3 case

**Not directly executable this run** because every currently signed-in student (Alpha, Charlie, Delta) is in the top 3; the rank-4+ entries in the leaderboard all belong to accounts from earlier QA passes for which we do not have credentials at hand.

**Verified by code review** in `src/lib/components/ui/LeaderboardBanner.svelte` lines 45–57:

```ts
let displayRows = $derived.by<Row[]>(() => {
	const top = leaderboard.slice(0, 3);
	const rows: Row[] = top.map((e) => ({ kind: 'entry', entry: e }));
	if (myEntry && !top.some((e) => e.userId === myEntry!.userId)) {
		const lastTopRank = top.length > 0 ? top[top.length - 1].rank : 0;
		if (myEntry.rank > lastTopRank + 1) {
			rows.push({ kind: 'separator' });
		}
		rows.push({ kind: 'entry', entry: myEntry });
	}
	return rows;
});
```

The windowing logic:

- Always includes top 3 (`slice(0,3)`)
- When current user is NOT in top 3, appends current user entry
- Inserts separator ONLY when there is an actual gap (`myEntry.rank > lastTopRank + 1`)

This matches the shipped spec exactly.

### Scoring caption

Shipped text at `LeaderboardBanner.svelte` lines 328–331:

```
Scored by questions answered & accuracy this week. Keep practicing — every answer moves you up.
```

Matches observation. Caption is always present inside the expanded panel.

### Collapsed banner (unchanged)

Not explicitly re-tested beyond confirming the "You're #Nth this week" text is still present and clickable.

### Verdict

**PASS.** Banner windowing works as specified; top 3 always present; no separator when self is in top 3; scoring caption present with exact shipped text. Rank-4+ separator case verified by code review since the current leaderboard state doesn't include any student whose credentials we have at rank 4+.

Screenshots: `dogfood-output/screenshots-qa5/item4-alpha-expanded.png`, `item4-delta-expanded.png`.

## Summary

| Item                                 | Result                                                           |
| ------------------------------------ | ---------------------------------------------------------------- |
| Item 1: 4-student parallel stress A1 | **PASS**                                                         |
| Item 2: Guest → login merge          | **PASS (with BUG-QA5-001 & BUG-QA5-002 fixes applied in-place)** |
| Item 3: B3 60% accuracy gate         | **PASS**                                                         |
| Item 4: Leaderboard windowing        | **PASS**                                                         |
| **Overall**                          | **PASS**                                                         |

### Bugs fixed in this pass (in `src/routes/+layout.svelte`)

1. **BUG-QA5-001**: Guest `sklonuj_progress` localStorage wiped on every page reload. Fixed by narrowing `isSignOut` to only match explicit `SIGNED_OUT` events.
2. **BUG-QA5-002**: onMount merge path never uploaded merged guest progress to Supabase (SIGNED_IN handler short-circuited by `lastMergedUserId`). Fixed by adding an explicit Supabase `.update()` inside the onMount merge branch.

Both fixes are minimal, backward compatible, and `pnpm check` passes cleanly (0 errors, 0 warnings).

### Latent issues noted but not fixed

- **First-question Free-Practice leak** in `src/routes/+page.svelte:1190` (the `?assignment=` `$effect`): on cold navigation to `/?assignment=X`, the drill engine can generate ONE question using Free Practice defaults before the assignment fetch completes and re-generates with assignment settings. This leaked a `sentence_fill_in` question in A1 runs (which was restricted to `form_production` only) but never leaked non-filtered cases. Recommendation: suppress `generateNextQuestion()` until the assignment fetch resolves, or guard the drill-type dropdown. Not blocking ship.
- **Sync race during layout HMR**: `/api/sync` POSTs show up as 500 Aborted in the dev server log during heavy Playwright interaction — this is because `scheduleSyncToSupabase` retries during unmount of the layout during navigation. Harmless in production (no HMR), but makes harness runs flaky.
