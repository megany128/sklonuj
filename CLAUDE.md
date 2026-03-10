## General Rules
Ask as many questions as you deem necessary or helpful to receive better context, or if you are not sure my prompt or implementation idea is sound.

## Task Delegation Rules
I want background subagents to be spun up whenever possible or recommended. When a task involves a cohesive task that requires multiple files to be edited / thought about together, or mechanical/repetitive changes across many files (e.g., threading a parameter through 10+ navigation call sites, adding a property to many event tracking calls, renaming across the codebase), delegate it to a subagent to run in the background rather than doing it inline in the main conversation. Reserve the main conversation for decision-making, proposals, and reviewing results. The subagent should be given clear instructions including: what to change, which files to touch, the pattern to follow, and to run typecheck/lint/format at the end.
This branch attempts to comprehensively connect @apps/api, our backend, with @apps/mobile, the frontend. This is accomplished via a shared types package with schemas based on @packages/types/database.types.ts, i.e. @packages/types.

Unfortunately, many logical and loading errors were introduced as a part of this migration, with HTTP 400 or 500 codes being particularly frequent, alongside potential incorrectly set URLs, logical flaws, and so forth. I am going through and iteratively fixing these, and the above is provided to you as context.

To look at the endpoints, see @apps/api/index.ts. Feel free to modify the backend endpoints, and then corresponding schema types I suppose, as needed if they are not providing enough data, but generally I suspect that more of the changes will be on the frontend. NEVER modify database.types.ts, as this is auto-generated and the SQL should be ready; all the data we need should be in the DB, maybe in other tables and stuff. Also be sure to ask and use logs from the api or mobile as needed. And be sure to use @apps/mobile/lib/api/client.ts / React Query for calls and all.

Note that it may be necessary to call `pnpm build` after making changes to other packages.

Ensure that `pnpm typecheck` passes and there are no `pnpm lint` or `pnpm format:check` errors or warnings. To fix formatting issues, run `pnpm format` (not `npx prettier` directly).

It does not matter if errors/warnings were pre-existing and not cauesd by the current session's changes. Still fix them, unless you do not have the necessary context and absolutely need it.

AVOID using `any` or ` as ` casts AT ALL COSTS as these are unsafe and often introduce new issues, better to properly set the types or change the schema in these situations if needed.

Also do NOT leave TODOs in the codebase, you should implement everything comprehensively.

## Figma MCP Integration Rules
These rules define how to translate Figma inputs into code for this project and must be followed for every Figma-driven change.

### Required flow (do not skip)
1. Run get_design_context first to fetch the structured representation for the exact node(s).
2. If the response is too large or truncated, run get_metadata to get the high‑level node map and then re‑fetch only the required node(s) with get_design_context.
3. Run get_screenshot for a visual reference of the node variant being implemented.
4. Only after you have both get_design_context and get_screenshot, download any assets needed and start implementation.
5. Translate the output (usually React + Tailwind) into this project's conventions, styles and framework.  Reuse the project's color tokens, components, and typography wherever possible.
6. Validate against Figma for 1:1 look and behavior before marking complete.

### Implementation rules
- Treat the Figma MCP output (React + Tailwind) as a representation of design and behavior, not as final code style.
- Replace Tailwind utility classes with the project's preferred utilities/design‑system tokens when applicable.
- Reuse existing components (e.g., buttons, inputs, typography, icon wrappers) instead of duplicating functionality.
- Use the project's color system, typography scale, and spacing tokens consistently.
- Respect existing routing, state management, and data‑fetch patterns already adopted in the repo.
- Strive for 1:1 visual parity with the Figma design. When conflicts arise, prefer design‑system tokens and adjust spacing or sizes minimally to match visuals.
- Validate the final UI against the Figma screenshot for both look and behavior.

### Figma MCP server rules
  - The Figma MCP server provides an assets endpoint which can serve image and SVG assets
  - IMPORTANT: If the Figma MCP server returns a localhost source for an image or an SVG, use that image or SVG source directly
  - IMPORTANT: DO NOT import/add new icon packages, all the assets should be in the Figma payload
  - IMPORTANT: do NOT use or create placeholders if a localhost source is provided