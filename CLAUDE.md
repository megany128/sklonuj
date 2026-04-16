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

Sklonuj: Czech noun/adjective/pronoun declension drill app. SvelteKit 5 + Svelte 5 runes, Tailwind v4, Supabase (auth + progress sync), deployed to Cloudflare Pages. Data in `src/lib/data/` (word / adjective / pronoun banks, sentence templates, dictionary).

## Svelte conventions (strict)

- Svelte 5 runes only: `$state`, `$props`, `$derived`, `$effect`. Never `export let`, `$:`, `on:click`.
- Event handlers use the attribute form: `onclick={...}`.
- If you see old syntax in this repo, it's a bug — fix it, don't mirror it.

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

Three-dot menu on each drill card lets users flag issues.

- `src/lib/components/ReportMenu.svelte` — button + dropdown + modal. Wired into `DrillCard.svelte` top-right.
- `src/routes/api/report/+server.ts` — POST endpoint: validates, inserts into `content_reports`, fire-and-forgets a Discord webhook.
- `supabase/migrations/023_create_content_reports.sql` — schema. RLS enabled with **no client policies** — only the server (via `locals.supabase`) can insert. Mirrors the `contact_messages` precedent (migration 004). Don't add client policies.

Env: `DISCORD_REPORT_WEBHOOK_URL` (in `.env` for dev, Cloudflare Pages env vars for prod/preview). Unset = DB insert still works, no Discord ping.

Webhook setup:

1. Discord channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy URL.
2. Cloudflare Pages → Settings → Environment variables → add to Production + Preview (encrypted).
3. Redeploy — env var changes only apply to new deployments.
4. Mirror in local `.env`, restart `pnpm dev`.

Apply the migration with `supabase db push` or by pasting the SQL into the Supabase dashboard SQL editor.

## Git workflow

- Default branch: `main`. Feature work on `claude/...` branches.
- Never force-push, amend published commits, or use `--no-verify`. If a hook fails, fix the root cause and make a new commit.
- Only create commits or open PRs when explicitly asked.

## Things NOT to do

- Don't re-add old Svelte syntax.
- Don't commit `scripts/.venv-tts/`, `.env`, or any secret.
- Don't pre-generate sentence audio without solving enumeration drift first — the drill engine's template filters live in `src/lib/engine/drill.ts` and any generator has to stay in lock-step.
- Don't change the `static/audio/index.json` filename scheme without migrating existing files — `audio.ts` depends on `sha1(voice|text)[:16]`.
- Don't add client-side RLS policies to `content_reports`.
