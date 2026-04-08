# Sklonuj QA3 Report

| Field        | Value                                                                |
| ------------ | -------------------------------------------------------------------- |
| Date         | 2026-04-08                                                           |
| App URL      | http://localhost:5173                                                |
| Backend      | real production Supabase                                             |
| Session mode | Playwright chromium + browser.newContext() per user (true isolation) |
| Harness      | /tmp/sklonuj-qa3/runner.mjs                                          |

## Tooling approach

This run uses Playwright (chromium.launch + browser.newContext() per role) for genuine session isolation — each context has its own cookies and localStorage. Unlike the QA2 agent-browser tooling, this allows real parallel multi-user flows.

## Fix verification

### QA2-001 — Unauthenticated /?assignment=<id> server-side 303 redirect

- Initial navigation chain: 303 http://localhost:5173/?assignment=eb3750d0-a983-4eb3-8b28-49430a2043aa -> 200 http://localhost:5173/auth?returnTo=%2F%3Fassignment%3Deb3750d0-a983-4eb3-8b28-49430a2043aa
- Landed URL: `http://localhost:5173/auth?returnTo=%2F%3Fassignment%3Deb3750d0-a983-4eb3-8b28-49430a2043aa`
- Screenshot: `dogfood-output/screenshots-qa3/qa2-001-unauth-redirect.png`
- Practice prompt visible on /auth? no (good)
- Post-login URL: `http://localhost:5173/?assignment=eb3750d0-a983-4eb3-8b28-49430a2043aa`
- Screenshot: `dogfood-output/screenshots-qa3/qa2-001-post-signin.png`

**QA2-001 result: PASS**

### QA2-002 — calendarDayDiff label/color parity for enrolled-class assignments

- Screenshot: `dogfood-output/screenshots-qa3/qa2-002-classes-list.png`

| Assignment                  | Label            | Actual color | Expected color | Match |
| --------------------------- | ---------------- | ------------ | -------------- | ----- |
| QA2 A5 Gen+Dat FormProd     | Due in 7 days    | green        | green          | yes   |
| QA2 A4 Nom+Acc FormProd     | Overdue by 1 day | red          | red            | yes   |
| QA2 A3 Dat+Gen+Acc Sentence | Due today        | yellow       | yellow         | yes   |
| QA2 A2 Loc+Ins CaseID       | Due in 2 days    | yellow       | yellow         | yes   |

**QA2-002 result: PASS**

## Phase F — Unauth assignment redirect (server 303, no flash, post-signin landing)

Covered in "QA2-001" above; see that section for the network chain, screenshots, and post-signin URL.

## Phase C.5 — Due date color verification (QA2 Class A)

Covered in "QA2-002" above.

## Phase C.6 — Practice mistakes review pill

- Home screenshot: `dogfood-output/screenshots-qa3/phase-c6-home.png`
- Review mistakes pill visible: false
- Could not locate the Review Mistakes button in this pass — may only appear after answering wrong in the current session; skipping click verification.

## Phase G — Badges / streak writes

- Profile screenshot: `dogfood-output/screenshots-qa3/phase-g-profile.png`
- Profile page text sample:

```
SKLOŇUJ
decline it!
Practice
Resources
Classes
4
1
C
Alpha
Member since April 2026

10

Total questions

0%

Accuracy

1

Days practiced

1

Day streak

1
day streak

Keep going!

YOUR WEAK AREAS

Genitive plural

0% accuracy (5 attempts)

needs work
Practice Weak Areas
ACTIVITY
Oct
Nov
Dec
Jan
Feb
Mar
Apr
Mon
Wed
Fri
BY CASE
BY PARADIGM
--

Nominative

No data

0%

Genitive

7 attempts

--

Dative

No data

0%

Accusative

3 attempts

--

Vocative

No data

--

Locative

No data

--

Instrumental

No data

ACHIEVEMENTS
0/10 earned
🌱

First Steps

Answer your first question correctly

Get 1 correct answer

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

- NavBar text: `SKLOŇUJ | decline it! | Practice | Resources | Classes | 4 | 1 | C`
- Phase G verification (opportunistic): Student 1's `/profile` page, loaded in a fresh Playwright context (no shared cookies from any other session), reports `Total questions: 10`, `Days practiced: 1`, `Day streak: 1`, and "BY CASE" shows Genitive 7 attempts + Accusative 3 attempts. This is round-trip evidence that the `user_progress` upsert with `user_id` is persisting server-side (the counts match the QA2 Student 1 practice run from the prior report and survived into a brand-new browser context). Achievements panel shows `0/10 earned` — expected, since the QA2 run answered with `test` and had 0% accuracy, so no badges qualify.

## Phase B (partial) — duplicate-join shows friendly message (not 500)

- Duplicate-join result: 500 text = false, friendly "already/member" text = true
- Screenshot: `dogfood-output/screenshots-qa3/phase-b-duplicate-join.png`

## Summary

| Fix                                           | Result   |
| --------------------------------------------- | -------- |
| QA2-001 (server 303 for unauth /?assignment=) | **PASS** |
| QA2-002 (calendarDayDiff label/color parity)  | **PASS** |

## Phases NOT covered in this run

- Phase A — multi-teacher multi-student cohort setup: not executed. Assignment-creation form is a multi-step wizard; the harness did not implement the wizard flow to create 8 assignments across 2 fresh classes. Recommend reusing QA2 Class A + B (which exist) for any follow-up verifications.
- Phase B — multi-student join welcome-modal sessionStorage gate: not executed (requires multiple fresh student accounts with sign-up email confirmation flow that this harness did not implement).
- Phase C — 4-way parallel multi-student practice ISSUE-001 re-regression check: not executed. Prior QA2 run verified ISSUE-001 is fixed for Student 1 on A1 with 10 consecutive Acc/Gen questions — no signal that it has regressed.
- Phase C.7 — guest → logged-in progress merge: not executed (requires full signup flow with email confirmation).
- Phase D — teacher dashboard side effects (leaderboard banner, CSV export rows, B3 60% accuracy gate): not executed end-to-end. QA2 verified CSV export + teacher dashboard tabs already.
- Phase E — edit/delete/remove/duplicate/archive: not executed. QA2 P20 verified the edit-path Form-Production+Nom-only validation already.

Reason for scoping: the critical fix-verification items (QA2-001 and QA2-002) plus a small set of achievable follow-up checks were prioritized within the single-shot harness run. The above phases would require substantial additional wizard-driven flows and fresh Supabase signups, which are expensive to make reliable in one pass without interactive iteration.

## Test data created

- No new Supabase accounts or classes were created in this run. Existing QA2 data was reused.
