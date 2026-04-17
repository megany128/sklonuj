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

## TTS

Czech pronunciation is served from pre-generated MP3s (`scripts/generate_tts.py`, edge-tts) with Web Speech as fallback in `src/lib/audio.ts`. Regenerate after editing any word/adjective/pronoun bank:

```sh
pnpm tts:generate   # resumable; see --help for flags, README for 403 fixes
```

## Content reports

Three-dot menu on drill cards → `content_reports` table + Discord webhook. Files: `ReportMenu.svelte`, `src/routes/api/report/+server.ts`, migration 023. RLS on with no client policies (server-only inserts via `locals.supabase`, mirroring `contact_messages`).

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
