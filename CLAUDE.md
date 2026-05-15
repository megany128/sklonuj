# CLAUDE.md

## Project

**Sklonuj** — Czech noun/adjective/pronoun declension drill app for CEFR A1–B2 learners. SvelteKit 5 + Svelte 5 runes, Tailwind v4, Supabase (auth + progress sync), deployed to Cloudflare Pages. Audio served from R2 (`audio.sklonuj.com`).

License: project is CC BY-NC-SA 4.0; data inherits CC BY-NC-SA 3.0 from MorphoDiTa. See `DATA_SOURCES.md` before touching licensing.

## General rules

- Ask clarifying questions when the prompt or proposed approach is unsound.
- Fix errors and warnings you encounter, even pre-existing ones, unless you genuinely lack context.
- Never use `any` or `as` casts. Fix the types (or schema).
- Never leave `TODO`s. Implement features completely.
- Only commit or open PRs when explicitly asked. Never force-push, amend published commits, or use `--no-verify`.

## Task delegation

Default to delegating cohesive multi-file, mechanical, or long-running work to background subagents. Tell each subagent what to change, which files, the pattern, and to run typecheck + lint + format. Reserve the main conversation for decisions and review.

## Verification

```sh
pnpm check            # svelte-kit sync && svelte-check  (this repo's typecheck — NOT "typecheck")
pnpm lint             # prettier --check + eslint
pnpm format           # prettier --write (use this, not `npx prettier`)
pnpm build            # may be needed after cross-package changes
pnpm test             # vitest --run
```

## Svelte 5 conventions (strict)

- Runes only: `$state`, `$props`, `$derived`, `$effect`. Never `export let`, `$:`, `on:click`.
- Event handlers: `onclick={...}`.
- Use `$app/state` (not the deprecated `$app/stores`) — enforced by ESLint.
- Use `resolve()` from `$app/paths` for every `href` and `goto` — enforced by `svelte/no-navigation-without-resolve`.
- Old syntax in this repo is a bug; fix it rather than mirror it.

## Czech / pedagogy essentials

- **7 cases**: nom, gen, dat, acc, voc, loc, ins. Internally stored as a 7-tuple (`CaseForms`) indexed in that order — see `CASE_INDEX` in `src/lib/types.ts`.
- **Numbers**: `sg` / `pl`. Some lemmas are `pluralOnly`.
- **14 noun paradigms**: hrad, pán, muž, stroj, soudce, předseda, žena, růže, píseň, kost, město, moře, kuře, stavení. Determined by gender + animacy + ending. `paradigms.json` maps each to `whyNotes` shown in feedback.
- **Animacy** (`animate: boolean`) only matters for masculine: m-anim acc = gen ("vidím muže"); m-inanim acc = nom ("vidím hrad").
- **Adjectives**: `paradigmType` is hard | soft; forms keyed by `m_anim | m_inanim | f | n` × `sg | pl`.
- **Pronouns**: each case has `prep` and `bare` (enclitic/standalone) forms. `PronounFormContext = 'prep' | 'bare' | 'either'`. Native review pending — some templates may use prepositional forms without prepositions.
- **Preposition voicing** (`v→ve`, `s→se`, `k→ke`, `z→ze`) is applied at runtime by `applyPrepositionVoicing` in `src/lib/engine/preposition-voicing.ts`. Pure module with no deps — any text pipeline (TTS pre-gen, admin audits) must apply it so the surface form matches what learners see.
- **Diacritics-aware grading**: missing diacritic (`zenu` vs `ženu`) is a near-miss, not a wrong answer.
- **Variant forms**: `variantForms` on word/adjective entries holds accepted alternates per case (e.g. dat sg `pánovi`/`pánu`). Grading accepts any listed variant; the primary form is what's shown as "the answer". Add new variants here, not by duplicating entries.
- **CEFR gating**: `curriculum.json` + `kzk_chapters.json` control which cases, difficulties, plural, adjectives, pronouns unlock at A1/A2/B1/B2 and per textbook chapter. **Update curriculum.json whenever you add a new content type or difficulty.**

## Drill engine (`src/lib/engine/`)

- `drill.ts` — noun drills. Three types: `form_production`, `case_identification`, `sentence_fill_in`, plus `multi_step` for adjective-noun agreement.
- `adjective-drill.ts` — adjective drills (hard/soft × gender × number).
- `pronoun-drill.ts` — pronoun drills; validates prep vs bare context against `pronoun_templates.json`.
- `preposition-voicing.ts` — pure voicing rules.
- `lemma-blocks.ts` — O(1) lookup over baked admin-curated block list.
- `progress.ts` — Svelte writable + localStorage; `caseScores`, `paradigmScores`, `longestStreak`, `level`, `lastSession`.
- `progress-merge.ts` — max-wins merge of local + remote on login (preserves longest streak, sums attempts safely).
- `mistakes.ts`, `streak.ts`, `achievements.ts`, `guest-sessions.ts` — supporting state.

Core types in `src/lib/types.ts`: `Case`, `Difficulty`, `Gender`, `Number_`, `DrillType`, `WordEntry`, `AdjectiveEntry`, `PronounEntry`, `SentenceTemplate`, `DrillQuestion`, `MultiStepQuestion`, `DrillResult`, `Progress`, `KzkChaptersConfig`.

## Data files (`src/lib/data/`)

Curated banks — **do not hand-edit**; regenerate via pipeline:

- `word_bank.json` (~2.8k nouns), `adjective_bank.json` (~1.2k), `pronoun_bank.json` (~20).
- `sentence_templates.json`, `adjective_templates.json`, `pronoun_templates.json` — plain JSON, append-able. Each template: `requiredCase`, `number`, `lemmaCategory`, `difficulty`, `trigger`, `why`, optional `semanticTags` / `excludesCategories` / `requiredGender` / `requiredAnimate`.
- `paradigms.json` — paradigm → `whyNotes`.
- `curriculum.json`, `kzk_chapters.json` — level/chapter gating.
- `blocked_template_noun_pairs.json`, `blocked_adj_noun_pairs.json`, `lemma_blocks.json` — three layers of "don't pair these" filters. `lemma_blocks.json` is **baked from Supabase** via `pnpm audit:bake-blocks`; commit the regenerated file.
- `dictionary.json` (~200k) — read-only lookup reference, not drilled.

**`lemmaCategory`** is the join key between templates and nouns/adjectives/pronouns (e.g. `objects`, `animals`, `places`). A word's `categories: string[]` must include the template's `lemmaCategory` to match.

## Adding words (pipeline, not manual edits)

```sh
python3 scripts/add-word.py <lemma> [<lemma>...]      # appends to starter_lemmas.txt + starter_nouns_meta.csv
python3 scripts/build_word_bank_morphodita.py         # regenerates word_bank.json via MorphoDiTa + kaikki.org
pnpm tts:generate                                     # generates audio for new forms (resumable)
```

**Fixing a wrong declension**: edit `scripts/form_overrides.json`, re-run the builder. Never hand-patch `word_bank.json` — the next build overwrites it. Adjective bank has its own builder (`build_adjective_bank_morphodita.py`).

## Audio / TTS

- Pre-generated MP3s in `static/audio/` keyed by `sha1(voice|text)[:16]`, indexed via `static/audio/index.json` (the contract — don't change the scheme without migrating files).
- Runtime fallback chain in `src/lib/audio.ts`: manifest MP3 → Web Speech API (Czech voice, with `voiceschanged` warmup for Chrome). 500 ms manifest timeout; sentences (>25 chars or with spaces) skip lookup and go straight to Web Speech.
- Regenerate with `pnpm tts:generate` after any bank change. Voicing must be applied before hashing.

## Auth / sync

- Anonymous users: `localStorage` only. Logged-in: Supabase `user_progress` (debounced upsert per result), merged with local on first login.
- Browser client: `src/lib/supabase.ts` (PKCE flow; password reset uses implicit flow because PKCE breaks on tab-switch).
- Server client: `src/lib/supabase-server.ts`; session attached to `event.locals` in `src/hooks.server.ts` (also sets CSP, HSTS, frame-deny).

## Content reports

Three-dot menu → `content_reports` table + Discord webhook. Files: `ReportMenu.svelte`, `src/routes/api/report/+server.ts`, migration 023. RLS on with **no client policies** — server-only inserts via `locals.supabase` (mirrors `contact_messages`). Don't add client-side RLS here.

## Figma MCP integration

Every Figma-driven change:

1. `get_design_context` for the exact node(s). If truncated, `get_metadata` first, then re-fetch.
2. `get_screenshot` for visual reference.
3. Only after both, download assets and start.
4. Translate Figma React+Tailwind into this project's framework and tokens — treat output as design intent, not final code.
5. Validate against the screenshot 1:1.

Rules: reuse existing components, use project tokens, respect routing/state/data patterns, prefer tokens over pixel-perfect parity, use localhost asset URLs from the MCP payload directly (no new icon packages, no placeholders).

## Watch out for

- **Enumeration drift**: drill engine template filters live in `engine/drill.ts`; any pre-gen pipeline (TTS, audit) must stay lock-step. Don't pre-generate sentence audio without solving this.
- **Voicing must be applied wherever you render or hash Czech text** — engine + TTS + audits.
- **Three layers of blocked pairs** can hide a "missing combo" bug. Check all three before concluding a template is broken.
- **Content quality**: wrong/missing `semanticTags`, `lemmaCategory`, or `excludesCategories` produce awkward sentence-noun pairings (e.g. "drink the chair"). When adding templates or words, double-check tags + categories and add blocks for any nonsense pairs surfaced.
- **Pronoun grammar is under native review** — possessives, demonstratives, and interrogatives are not yet implemented; some existing templates may misuse prep forms.
- **SRS isn't real yet** — selection is weighted random, not SM-2/Leitner.
- **CSP allows `unsafe-inline`** because of GTM; can't be removed without a GTM refactor.

## Things NOT to do

- Don't re-add old Svelte syntax (`export let`, `$:`, `on:click`).
- Don't hand-edit the curated JSON banks — use the pipeline.
- Don't commit `scripts/.venv-tts/`, `.env`, or any secret.
- Don't change `static/audio/index.json`'s filename scheme without migrating existing files.
- Don't add client-side RLS policies to `content_reports`.
- Don't pre-generate sentence audio without first solving enumeration drift with `engine/drill.ts`.
