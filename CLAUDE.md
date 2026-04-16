# CLAUDE.md

## General rules

- Ask questions whenever more context would help, or when you suspect the prompt or proposed implementation is unsound.
- Fix errors and warnings you encounter, including pre-existing ones, unless you genuinely lack the context to do so safely.
- Never use `any` or `as` casts. Fix the types (or the schema) instead.
- Never leave `TODO`s. Implement features completely.

## Task delegation

Default to delegating work to background subagents. Reserve the main conversation for decisions, proposals, and reviewing results.

Delegate when a task is cohesive across multiple files, mechanical/repetitive (threading a param through N call sites, renames, event-tracking property additions), or long-running.

Give the subagent: what to change, which files to touch, the pattern to follow, and instructions to run typecheck + lint + format at the end.

## Verification (run before declaring done)

```sh
pnpm check            # typecheck (svelte-kit sync && svelte-check)
pnpm lint             # prettier --check + eslint
pnpm format:check     # prettier only
pnpm format           # prettier --write — use this to fix formatting (not npx prettier)
pnpm build            # may be needed after changes across packages
```

This repo's typecheck script is `check`, not `typecheck`.

## Figma MCP integration

Every Figma-driven change must follow this flow:

1. `get_design_context` for the exact node(s).
2. If the response is truncated, `get_metadata` first, then re-fetch the needed nodes.
3. `get_screenshot` for visual reference.
4. Only after you have both `get_design_context` and `get_screenshot`, download assets and start implementation.
5. Translate the Figma output (React + Tailwind) into this project's framework and tokens — treat the output as design intent, not final code style.
6. Validate against the screenshot for 1:1 look and behavior before marking complete.

Rules:

- Reuse existing components (buttons, inputs, typography, icon wrappers) — don't duplicate.
- Use the project's color, typography, and spacing tokens.
- Respect existing routing, state, and data-fetch patterns.
- Prefer design-system tokens over pixel-perfect parity when the two conflict; adjust minimally to match visuals.
- If the Figma MCP payload contains localhost asset sources, use them directly. Don't add new icon packages, don't substitute placeholders.

## Project

Sklonuj: Czech noun/adjective/pronoun declension drill app. SvelteKit 5 + Svelte 5 runes, Tailwind v4, Supabase (auth + progress sync), deployed to Cloudflare Pages.

Data is CC BY-NC-SA 3.0 (inherited from MorphoDiTa); project is CC BY-NC-SA 4.0. See `DATA_SOURCES.md` before changing the license.

## Svelte conventions (strict)

- Svelte 5 runes only: `$state`, `$props`, `$derived`, `$effect`. Never `export let`, `$:`, `on:click`.
- Event handlers use the attribute form: `onclick={...}`.
- If you see old syntax in this repo, it's a bug — fix it, don't mirror it.

## Data files (`src/lib/data/`)

- `word_bank.json`, `adjective_bank.json`, `pronoun_bank.json` — curated drill vocabulary with full declension forms. **Do not hand-edit** — regenerate via the pipeline below.
- `dictionary.json` — 18k noun lookup (read-only reference, not drilled).
- `sentence_templates.json` — each template has `requiredCase`, `number`, `lemmaCategory`, `difficulty`, `trigger`, `why`. Drill engine filters by these. Plain JSON — append to add new ones.
- `paradigms.json` — ties each word's `paradigm` field (`hrad`, `pán`, `muž`, `stroj`, `žena`, `růže`, `město`, `moře`, `kuře`, …) to `whyNotes` shown in feedback.
- `curriculum.json` — A1/A2/B1/B2 level gating. Controls which cases, difficulties, plural, adjectives, pronouns are unlocked. **Update this whenever you add a new content type or difficulty.**

## Adding words (pipeline, not manual edits)

```sh
python3 scripts/add-word.py <lemma> [<lemma>...]
# → appends to scripts/starter_lemmas.txt + starter_nouns_meta.csv
python3 scripts/build_word_bank_morphodita.py
# → regenerates src/lib/data/word_bank.json via MorphoDiTa API + kaikki.org
pnpm tts:generate
# → generates audio for new forms
```

**Fixing a wrong declension:** edit `scripts/form_overrides.json`, then re-run the builder. Don't hand-patch `word_bank.json` — the next build will overwrite it.

## Drill engine

Main files: `src/lib/engine/drill.ts` (nouns), `adjective-drill.ts`, `pronoun-drill.ts`. Types in `src/lib/types.ts` (`DrillQuestion`, `DrillResult`, `Case`, `Number_`, `Difficulty`, `DrillType`).

Three drill types: `form_production`, `case_identification`, `sentence_fill_in`, plus `multi_step` for adjective-noun agreement.

**Preposition voicing** (`s/se`, `v/ve`, `k/ke`, `z/ze`) is applied at runtime by `applyPrepositionVoicing` in `drill.ts`. Any text pipeline (like TTS pre-gen) needs to handle both forms.

## Progress sync

- Anonymous users: `localStorage`.
- Logged-in users: Supabase.
- On login, local and remote progress are merged by `src/lib/engine/progress-merge.ts`.

## TTS pipeline

Czech pronunciation is served from pre-generated MP3s (Microsoft Edge TTS, `cs-CZ-AntoninNeural`). Web Speech API is a fallback only — the whole point is to support browsers without Web Speech (older Safari/Firefox).

Pieces:

- `scripts/generate_tts.py` — walks word/adjective/pronoun banks, dedupes, synthesizes MP3s to `static/audio/cs/<shard>/<hash>.mp3`, writes manifest to `static/audio/index.json`.
- `scripts/requirements-tts.txt` — `edge-tts>=7.0.0` (6.x gets 403s from Microsoft's rotated `Sec-MS-GEC` DRM token).
- `scripts/.venv-tts/` — auto-bootstrapped, gitignored.
- `src/lib/audio.ts` — client. Lazily loads `/audio/index.json`, plays the matching MP3 via `HTMLAudioElement`. Falls back to Web Speech on miss, playback error, or sentence-shaped input (has spaces or >25 chars).
- Sentences are **not** pre-generated (combinatorial explosion) — they always hit Web Speech.

Regenerate:

```sh
pnpm tts:generate                            # full run, resumable (skips existing)
pnpm tts:generate -- --only "nový,nová"      # regenerate specific strings, merge into manifest
pnpm tts:generate -- --prune                 # full run + delete orphan MP3s
pnpm tts:generate -- --limit 20              # smoke test first N
pnpm tts:generate -- --voice cs-CZ-VlastaNeural
pnpm tts:generate -- --dry-run               # count without generating
pnpm tts:generate -- --force                 # rebuild all (slow)
```

Filename is `sha1(voice|text)[:16]`. Editing a string produces a new file; the old one becomes an orphan until `--prune`.

Regenerate whenever `word_bank.json`, `adjective_bank.json`, or `pronoun_bank.json` changes. The script is resumable, so re-runs after small edits take seconds.

If edge-tts returns 403: Microsoft rotated the DRM token again. Bump `edge-tts` in `scripts/requirements-tts.txt`, `rm -rf scripts/.venv-tts`, re-run.

## Content report feature

Three-dot menu on each drill card. Reports go to the `content_reports` Supabase table and (if `DISCORD_REPORT_WEBHOOK_URL` is set) ping a Discord channel.

- `src/lib/components/ReportMenu.svelte` — button + dropdown + modal. Wired into `DrillCard.svelte` top-right.
- `src/routes/api/report/+server.ts` — POST endpoint: validates, inserts, fire-and-forgets the webhook.
- `supabase/migrations/023_create_content_reports.sql` — RLS enabled with **no client policies** (server-only inserts via `locals.supabase`). Mirrors the `contact_messages` precedent from migration 004.

## Git workflow

- Default branch: `main`. Feature work on `claude/...` branches.
- Never force-push, amend published commits, or use `--no-verify`. If a hook fails, fix the root cause and make a new commit.
- Only create commits or open PRs when explicitly asked.

## Things NOT to do

- Don't re-add old Svelte syntax.
- Don't hand-edit `word_bank.json` / `adjective_bank.json` / `pronoun_bank.json` — use the pipeline.
- Don't commit `scripts/.venv-tts/`, `.env`, or any secret.
- Don't pre-generate sentence audio without solving enumeration drift first — the drill engine's template filters live in `engine/drill.ts` and any generator has to stay in lock-step.
- Don't change the `static/audio/index.json` filename scheme without migrating existing files — `audio.ts` depends on `sha1(voice|text)[:16]`.
- Don't add client-side RLS policies to `content_reports`.
