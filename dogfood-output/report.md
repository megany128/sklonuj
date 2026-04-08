# Dogfood Report: Sklonuj (multi-student class flow)

| Field       | Value                                                                                                                                                                                                                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**    | 2026-04-08                                                                                                                                                                                                                                                                                                                         |
| **App URL** | http://localhost:5173                                                                                                                                                                                                                                                                                                              |
| **Session** | sklonuj-classflow                                                                                                                                                                                                                                                                                                                  |
| **Scope**   | Teacher signup → create class (modal) → create 3 assignments → 2 students sign up → join via modal → multi-student × multi-assignment practice → completion → teacher dashboard verification. Regression-tested welcome modal sessionStorage gate, concurrent-join error handling, tooltip on level field, 3-tab layout stability. |

## Summary

| Severity  | Count |
| --------- | ----- |
| Critical  | 0     |
| High      | 1     |
| Medium    | 0     |
| Low       | 1     |
| **Total** | **2** |

## Verified Steps (passed)

| #   | Step                                                                                                                 | Result                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Teacher signup via email                                                                                             | ✅ logs in directly (email confirmation off)                                  |
| 2   | /classes "Create Class" opens modal (not new page)                                                                   | ✅                                                                            |
| 3   | Tooltip on "?" icon next to Level                                                                                    | ✅ button exists, accessible name "Why we ask for level"                      |
| 4   | Create class submission lands on /classes/{id} with 3 tabs                                                           | ✅ Overall, Students, Assignments                                             |
| 5   | Tab bar does not shift between clicks                                                                                | ✅ all 3 tabs use min-w action area                                           |
| 6   | Overall tab empty state with no students                                                                             | ✅ "No students have joined yet. Share the class code ABAX7U to get started." |
| 7   | Students tab empty state has no redundant "Students (0)" h2                                                          | ✅                                                                            |
| 8   | Create assignment via "+ New" modal                                                                                  | ✅ all 3 assignments created                                                  |
| 9   | Assignments tab shows count + filter chips + search                                                                  | ✅                                                                            |
| 10  | Student signup → /classes "Join Class" opens modal                                                                   | ✅                                                                            |
| 11  | Submitting class code via modal redirects to /classes with welcome modal                                             | ✅                                                                            |
| 12  | Welcome modal asks for display name on first join                                                                    | ✅ "What should your teacher call you?"                                       |
| 13  | Saving display name dismisses name form, shows "Got it!"                                                             | ✅                                                                            |
| 14  | All 3 assignments visible in inline single-class view after join                                                     | ✅                                                                            |
| 15  | **Welcome modal does NOT re-fire** when manually navigating to /classes?joined=... after dismissal                   | ✅ sessionStorage gate works                                                  |
| 16  | Second student signup + join works the same way                                                                      | ✅                                                                            |
| 17  | **Concurrent join error**: existing member tries to join again → "You are already a member of this class." (NOT 500) | ✅                                                                            |
| 18  | Assignment marks as "Completed" when target_questions reached                                                        | ✅ Student 1 + Assignment 1                                                   |
| 19  | Two students can practice different assignments simultaneously                                                       | ✅                                                                            |
| 20  | Teacher Overall tab shows Class Accuracy grid + chart with both students                                             | ✅                                                                            |
| 21  | Teacher Students tab shows roster with display names "Student One" / "Student Two"                                   | ✅                                                                            |
| 22  | Teacher Assignments tab shows completion counts (e.g. 1/2 completed)                                                 | ✅                                                                            |
| 23  | Display names propagate from saveName upsert action all the way to teacher dashboard                                 | ✅                                                                            |

## Issues

### ISSUE-001: Practice page ignores assignment.selected_cases (HIGH)

| Field           | Value                                  |
| --------------- | -------------------------------------- |
| **Severity**    | high                                   |
| **Category**    | functional                             |
| **URL**         | http://localhost:5173/?assignment={id} |
| **Repro Video** | N/A (multi-step screenshots)           |

**Description**

When a student starts an assignment, the practice page does not honor the `selected_cases` filter from the assignment.

QA Assignment 1 was created with `selected_cases = ['nom', 'acc']` and `selected_drill_types = ['form_production']`, target 5. The assignment detail page (`/classes/{id}/assignments/{aid}`) correctly displays "Nominative · Accusative · Form Production". But when the student clicks Start Practice and lands on `/?assignment=...`, the very first question is "Type the Genitive plural form of fotografka" — Genitive is not in the assignment's case set. Subsequent questions use Locative, Instrumental, etc.

This means students are being asked to practice cases that aren't part of their assignment, AND any answer they give counts toward `questions_attempted`/`questions_correct` for the assignment regardless of which case it actually drilled. So a student can "complete" a Nominative+Accusative assignment without ever answering a Nominative or Accusative question.

Same behavior was reproduced on QA Assignment 2 (Genitive only) and QA Assignment 3 (Locative + Instrumental, Case Identification).

**Repro Steps**

1. Sign in as a teacher and create a class
2. Create an assignment with only Nominative + Accusative selected, drill type Form Production, target 5 → save
3. In another browser (incognito), sign up as a student and join the class
4. Click "Start Practice" on the assignment
5. **Observe:** the prompt asks for Genitive, Locative, Instrumental, etc. — never Nominative or Accusative

![Assignment detail showing Nominative + Accusative only](screenshots/16-assignment-created.png)
![Practice page asking for Genitive instead](screenshots/24-student1-practice.png)

---

### ISSUE-002: SvelteKit `replaceState` does not clear `?joined=` from the URL (LOW)

| Field           | Value                                    |
| --------------- | ---------------------------------------- |
| **Severity**    | low                                      |
| **Category**    | ux                                       |
| **URL**         | http://localhost:5173/classes?joined=... |
| **Repro Video** | N/A                                      |

**Description**

After joining a class, the welcome modal `$effect` in `src/routes/classes/+page.svelte` calls `replaceState(cleanPath, {})` (from `$app/navigation`) to strip the `?joined=` and `?needsName=` params from the URL. The session-storage gate to suppress the welcome modal works correctly (verified — modal does not re-fire on revisit), but the URL bar still shows the `?joined=...` params after `replaceState` runs.

This is likely either pre-existing (unchanged by recent fix) or a quirk of SvelteKit's `replaceState` not actually persisting the path change to the browser URL. It does not affect functionality (the gate prevents re-firing), but it leaves the URL ugly and bookmarkable.

**Repro Steps**

1. As a logged-in student, join a class via the modal
2. Welcome modal appears, dismiss it
3. Look at the URL bar — `?joined=...` is still present even though the effect supposedly cleaned it
4. Navigate elsewhere and back via browser back — URL stays the same (the gate prevents the modal from re-firing)

![URL still has ?joined= after replaceState](screenshots/22-rejoin-state.png)

---
