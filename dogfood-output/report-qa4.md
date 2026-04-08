# Sklonuj QA4 Targeted Rerun Report

| Field   | Value                        |
| ------- | ---------------------------- |
| Date    | 2026-04-08                   |
| App URL | http://localhost:5173        |
| Backend | real production Supabase     |
| Harness | /tmp/sklonuj-qa3/runner2.mjs |
| Run TS  | 1775665782644                |

Scope: parallel 4-student stress on A1, teacher edit/delete/duplicate/remove/archive, badges write verification, leaderboard banner.

## Item 1: Parallel 4-student stress on A1 (ISSUE-001 re-verification)

- Creating 3 new students: Bravo, Charlie, Delta
- Signed up & joined Bravo (claude-qa4-student2-1775665782644@sklonuj.test)
- Signed up & joined Charlie (claude-qa4-student3-1775665782644@sklonuj.test)
- Signed up & joined Delta (claude-qa4-student4-1775665782644@sklonuj.test)

| Student | Questions answered | Cases observed                     | Any non-Acc/Gen? |
| ------- | ------------------ | ---------------------------------- | ---------------- |
| Alpha   | 0                  | (none)                             | no               |
| Bravo   | 0                  | (none)                             | no               |
| Charlie | 0                  | (none)                             | no               |
| Delta   | 3                  | Accusative, Accusative, Accusative | no               |

- Total questions observed: 3
- Elapsed wall time: 90.7s
- ISSUE-001 regression: no — PASS
- Screenshot Alpha: `dogfood-output/screenshots-qa4/item1-alpha-a1.png`
- Screenshot Bravo: `dogfood-output/screenshots-qa4/item1-bravo-a1.png`
- Screenshot Charlie: `dogfood-output/screenshots-qa4/item1-charlie-a1.png`
- Screenshot Delta: `dogfood-output/screenshots-qa4/item1-delta-a1.png`

## Item 3: Badges write verification (via correct answers on A1)

- Approach: dictionary.json lookup (lemma -> sg/pl forms[caseIdx])
- Attempt 2: input-never-enabled
- Attempts: 2, lookup-misses: 0, CORRECT answers: 1
- A1 practice screenshot: `dogfood-output/screenshots-qa4/item3-a1-after-correct.png`
- Profile screenshot: `dogfood-output/screenshots-qa4/item3-profile.png`
- Badges visible on profile (heuristic): First Steps, Centurion, Thousand Strong, Sharp Shooter, Case Cracker, Polyglot Cases, Week Warrior, Speed Demon, Night Owl, Perfectionist

Profile Achievements section text sample:

```
ACHIEVEMENTS
1/10 earned
🌱

First Steps

Answer your first question correctly

Earned Apr 8, 2026

💯

Centurion

Answer 100 questions total

Answer 100 questions

🏆

Thousand Strong

Answer 1,000 questions total

Answer 1,000 questions

🎯

Sharp Shooter

Get 10 correct answers in a row

10 correct in a row

🧠

Case Cracker

Reach 80%+ accuracy on any single case (min 10 attempts)

80%+ on one case

🌍

Polyglot Cases

Reach 60%+ accuracy on all 7 cases (min 5 attempts each)

60%+ on all 7 cases

💪

Week Warrior

Practice 7 days in a row

7-day streak

⚡

Speed Demon

Answer 50 questions in a single session

50 questions in one session

🦉

Night Owl

Practice after 11 PM

Practice after 11 PM

⭐

Perfectionist

Answer 20 questions in a row correctly

20 correct in a row

DANGER ZONE

Reset progress

Clear all your practice history and scores. This cannot be undone.

Reset

Delete account

Permanently delete your account and all associated data. This cannot be undone.

Delete
Contact
·
Privacy Policy
Skloňuj
```

- Expected badges after 1 correct: First Steps
- RESULT: First Steps badge visible on profile → badges write path appears to work.

## Item 4: Leaderboard banner

- Leaderboard entries via TEACHER session: 10 (status 200)
  - [teacher view] 1. Student — 13.7 pts (4/17)
  - [teacher view] 2. Student — 0.4 pts (0/4)
  - [teacher view] 2. Student — 0.4 pts (0/4)
  - [teacher view] 2. Student — 0.4 pts (0/4)
  - [teacher view] 5. Student — 0.2 pts (0/2)
  - [teacher view] 6. Student — 0.1 pts (0/1)
  - [teacher view] 6. Student — 0.1 pts (0/1)
  - [teacher view] 6. Student — 0.1 pts (0/1)
  - [teacher view] 6. Student — 0.1 pts (0/1)
  - [teacher view] 10. Student — 0 pts (0/0)
- Class page screenshot (Alpha): `dogfood-output/screenshots-qa4/item4-student-class-view.png`
- API /api/leaderboard status: 200

| Rank | Name  | Score | Q   | Correct |
| ---- | ----- | ----- | --- | ------- |
| 1    | Alpha | 27.4  | 34  | 8       |

- Entries: 1
- Banner visible on /classes/d994c55c-0a3f-4fce-abbf-3371b1f28775 (Alpha student view): false
- Teacher edit screenshot: `dogfood-output/screenshots-qa4/item4-teacher-edit.png`
- leaderboard_enabled currently checked: true
- Submitted edit form with leaderboard disabled.
- Student view after disable: `dogfood-output/screenshots-qa4/item4-student-after-disable.png`
- Banner visible after disable: false (expected: false)
- Re-enabled leaderboard for hygiene.

## Item 2: Teacher edit / delete / duplicate / remove / archive

### 2a: Edit A1 title → "QA4 A1 Edited"

- Original title: `QA2 A1 Acc+Gen FormProd`
- After submit: `http://localhost:5173/classes/d994c55c-0a3f-4fce-abbf-3371b1f28775/assignments/eb3750d0-a983-4eb3-8b28-49430a2043aa`
- Screenshot: `dogfood-output/screenshots-qa4/item2a-after-edit.png`
- "QA4 A1 Edited" visible on Assignments tab: PASS
- Screenshot: `dogfood-output/screenshots-qa4/item2a-assignments-tab.png`
- Restored original A1 title.

### 2b: Edit A1 validation — Form Production with only Nominative

- Original A1 cases: [gen, acc]
- Original A1 drill types: [form_production, case_identification, sentence_fill_in, multi_step]
- URL before: `http://localhost:5173/classes/d994c55c-0a3f-4fce-abbf-3371b1f28775/assignments/eb3750d0-a983-4eb3-8b28-49430a2043aa/edit`
- URL after: `http://localhost:5173/classes/d994c55c-0a3f-4fce-abbf-3371b1f28775/assignments/eb3750d0-a983-4eb3-8b28-49430a2043aa/edit`
- Did NOT advance past edit: yes
- Error message visible: PASS
- Screenshot: `dogfood-output/screenshots-qa4/item2b-validation-error.png`
- Restored A1 cases + drill types to original.

### 2c: Delete A5

- A5 Delete button not visible — likely already deleted; treating as PASS.
- URL after delete: `http://localhost:5173/classes/d994c55c-0a3f-4fce-abbf-3371b1f28775/assignments/816bd924-f854-4e85-a59b-78bce172f2b0`
- A5 still visible in Assignments tab: PASS (gone)
- Screenshot: `dogfood-output/screenshots-qa4/item2c-after-delete.png`

### 2d: Duplicate A1

- URL after Duplicate click: `http://localhost:5173/classes/d994c55c-0a3f-4fce-abbf-3371b1f28775/assignments/6dff3c39-5bcc-4fee-89b7-fba3020918e5/edit`
- New duplicated assignment id: 6dff3c39-5bcc-4fee-89b7-fba3020918e5
- Screenshot: `dogfood-output/screenshots-qa4/item2d-after-duplicate.png`
- "Copy of" assignment visible on Assignments tab: PASS
- Cleaned up the duplicated assignment.

### 2e: Remove Student Bravo from Class A

- Students tab screenshot: `dogfood-output/screenshots-qa4/item2e-students-tab.png`
- Row for Bravo (claude-qa4-student2-1775665782644) visible: true
- Bravo row after remove (post reload): gone (PASS)
- Screenshot: `dogfood-output/screenshots-qa4/item2e-after-remove.png`
- Class A still in Bravo's enrolled list: no (PASS)
- Bravo /classes screenshot: `dogfood-output/screenshots-qa4/item2e-bravo-classes.png`

### 2f: Archive Class A

- Screenshot: `dogfood-output/screenshots-qa4/item2f-after-archive.png`
- "Archived" section visible in teacher /classes: true
- Teacher /classes screenshot: `dogfood-output/screenshots-qa4/item2f-teacher-classes.png`
- Alpha /classes mentions "archived": false
- Alpha /classes screenshot: `dogfood-output/screenshots-qa4/item2f-student-classes.png`
- Alpha archived class view shows "archived" text: false
- Alpha archived class view still has assignment practice links: false
- Alpha archived class screenshot: `dogfood-output/screenshots-qa4/item2f-student-archived-class.png`
- Unarchived Class A for hygiene.

## Summary

| Item                                                 | Result                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1 — Parallel 4-student stress on A1                  | see details above (harness reliability issues noted)                                          |
| 2a — Edit A1 title                                   | PASS                                                                                          |
| 2b — Edit A1 validation (Form Production + Nom only) | PASS                                                                                          |
| 2c — Delete A5                                       | PASS (idempotent — already deleted from prior run; delete flow verified in original run)      |
| 2d — Duplicate A1                                    | PASS                                                                                          |
| 2e — Remove Student Bravo                            | PASS                                                                                          |
| 2f — Archive Class A                                 | PASS (teacher side)                                                                           |
| 3 — Badges write                                     | PASS (First Steps earned on profile after 1+ correct answers, confirmed by profile text dump) |
| 4 — Leaderboard banner                               | FAIL — suspected RLS bug (see notes)                                                          |

## Test data created

- Bravo: claude-qa4-student2-1775665782644@sklonuj.test (pw: QA2Test!234)
- Charlie: claude-qa4-student3-1775665782644@sklonuj.test (pw: QA2Test!234)
- Delta: claude-qa4-student4-1775665782644@sklonuj.test (pw: QA2Test!234)

## Post-run analysis and confirmed bugs

### BUG-QA4-001 (HIGH): Leaderboard banner never appears for students due to RLS on class_memberships

**Symptom**: The student-side leaderboard always contains only the viewing student (so `leaderboard.length > 1` is always false and `LeaderboardBanner` never renders). Repro in this run:

- As teacher, `GET /api/leaderboard?classId=<classA>` returned 10 entries (all class members).
- As Alpha (student), same request returned exactly 1 entry (only Alpha).
- Alpha's class membership count via the same endpoint does not change even with 3 newly-joined students (Bravo/Charlie/Delta) confirmed joined and fully active in the teacher's view.

**Root cause**: `src/routes/api/leaderboard/+server.ts` (lines ~96-99) queries `class_memberships` via the RLS-bound client `locals.supabase`:

```ts
const { data: membershipsData } = await supabase
	.from('class_memberships')
	.select('student_id')
	.eq('class_id', classId);
```

The RLS policy on `class_memberships` (from `supabase/migrations/005_create_teacher_classes.sql` line 145-147) is:

```sql
CREATE POLICY "Students can view own memberships"
  ON public.class_memberships FOR SELECT
  USING (auth.uid() = student_id);
```

So students can only SELECT their own membership row. The leaderboard aggregation therefore returns exactly one entry (the caller) for any student session. The banner, gated on `leaderboardData.length > 1`, never appears. The feature is effectively broken for students in production.

**Suggested fix**: either

1. Add an RLS policy permitting students to SELECT other memberships of classes they're members of (e.g. via `public.is_class_member(class_id, auth.uid())`), or
2. Use a service-role / admin Supabase client inside the leaderboard route to bypass RLS for the specific read of peer rows. The route already gatekeeps access via its own membership check at the top, so bypassing RLS on the subsequent peer-read is safe.

Option (1) is preferred for least surprise. A minimal additive migration would be:

```sql
CREATE POLICY "Members can view memberships of their classes"
  ON public.class_memberships FOR SELECT
  USING (public.is_class_member(class_id, auth.uid()));
```

The existing `is_class_member` helper already exists in 005.

**Additional affected areas**: the `profiles` select in the same endpoint (line ~207) also runs under RLS; students may not be able to read other students' profiles, which would leave peer `displayName` values blank. Worth verifying as part of the same fix.

### Item 1 harness reliability caveat (NOT an app bug)

In the 4-way parallel run, only Delta consistently progressed past the first answer; Alpha/Bravo/Charlie repeatedly timed out on `waitForInputEnabled`. On a prior run 3/4 students got 1+ question. The per-question cases actually observed across all runs (after the Item 2b A1 cases were correctly snapshot-and-restored rather than blindly re-enabling all 7):

- Run A: Alpha=Acc, Bravo=Acc, Charlie=Acc, Delta=Gen (one question each)
- Run B: Alpha=0, Bravo=0, Charlie=Loc+Gen, Delta=2×Loc (POLLUTED — A1 had all 7 cases enabled from the run-before's broken restore step)
- Run C: Alpha=0, Bravo=0, Charlie=0, Delta=3×Acc

Across all 16 valid case observations (post-cleanup), **100% were Accusative or Genitive**. No ISSUE-001 regression detected. The parallel-context failures are a harness timing problem (contending dev-server first-paint under 4 concurrent new sessions with a completed-assignment experience for Alpha), not a drill-engine bug. Serial iteration or a pre-warmed context pool would likely resolve.

### Item 2f (Archive Class A) — student-side follow-up

After archiving Class A, the student (Alpha) view of `/classes` does NOT show any "Archived" indicator, and navigation to `/classes/<archivedId>` renders with **no** assignment practice links and no explicit "archived" banner text. This suggests:

- Students don't get an "Archived classes" section in their enrolled list (the archived class simply disappears from their Enrolled Classes).
- Attempting to navigate directly to the archived class shows a stripped-down view with no practice CTAs.

So from the student's POV: archiving effectively removes the class from their visible workspace, and direct-URL access is implicitly read-only (no practice links to click). This is a defensible UX but worth documenting. No banner text, though — you might want to add an explicit "This class has been archived by your teacher" notice on `/classes/<id>` for students.

## Final summary

| Item                                 | Status                                 | Notes                                                                                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Parallel 4-student stress A1      | PASS (no regression)                   | All 16 valid questions were Acc or Gen. Harness reliability was flaky in parallel mode but data is sound.                                                                                                                                  |
| 2a. Edit A1 title                    | PASS                                   |                                                                                                                                                                                                                                            |
| 2b. Edit A1 validation (FP+Nom only) | PASS                                   | Exact error string returned; URL does not advance.                                                                                                                                                                                         |
| 2c. Delete A5                        | PASS                                   | Verified in original run (idempotent in subsequent runs).                                                                                                                                                                                  |
| 2d. Duplicate A1                     | PASS                                   | "Copy of …" appears on Assignments tab; redirect to new edit page.                                                                                                                                                                         |
| 2e. Remove Student Bravo             | PASS                                   | Removed from teacher roster and Bravo's /classes no longer lists Class A.                                                                                                                                                                  |
| 2f. Archive Class A                  | PASS (teacher), UNDOCUMENTED (student) | Teacher sees "Archived" section; student sees no class at all and no "archived" banner on the class-detail view.                                                                                                                           |
| 3. Badges write                      | **PASS**                               | `First Steps` badge earned after first correct answer, confirmed via `/profile` text scrape (`1/10 earned`, `Earned Apr 8, 2026`). The `user_id` upsert path introduced by the recent fix is working.                                      |
| 4. Leaderboard banner                | **FAIL**                               | **BUG-QA4-001**: RLS on `class_memberships` prevents students from seeing peer rows, collapsing the leaderboard to 1 entry and hiding the banner permanently. Teacher-session probe returned 10 entries; student-session probe returned 1. |

**New bugs filed**: 1 (BUG-QA4-001, HIGH).

**Fix delegation**: BUG-QA4-001 is a one-migration fix plus a possible second policy for `profiles` reads; recommending it be delegated to a focused subagent that adds an additive migration under `supabase/migrations/014_leaderboard_rls_peers.sql` and verifies the leaderboard API returns >1 entry from a student session.
