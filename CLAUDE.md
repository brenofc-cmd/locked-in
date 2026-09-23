@AGENTS.md

# LOCKED IN

Mobile-first accountability application for two people. _No hype. Just proof._

Read before working: `docs/PROGRESS.md` (current stage and status), `docs/ROADMAP.md` (what belongs to
which stage), `docs/DESIGN_REFERENCE.md` (visual source of truth), `docs/ARCHITECTURE.md`,
`docs/DECISIONS.md`.

## Product priorities

1. Today
2. Partner
3. Focus
4. Progress
5. Simplicity

## Core principle

OPEN → UNDERSTAND → ACT

The user must understand their state and take the main action in about 3 seconds.

## Development rules

- Mobile-first.
- Preserve the approved design (`design-reference/export/Locked In v3.dc.html`; behaviour in v2).
- Never redesign without explicit instruction.
- Never edit anything in `design-reference/`.
- TypeScript strict.
- Avoid `any`.
- Prefer simple code.
- Avoid premature abstraction.
- Do not add features outside the current stage.
- Do not add dependencies without a real reason.
- Supabase is the only backend.
- PostgreSQL is the database.
- Vercel is production hosting.
- All future exposed database tables must use RLS.
- Never expose private Supabase keys.
- Never commit secrets.
- Never place server secrets in NEXT_PUBLIC_* variables.
- Realtime must eventually work between two users.
- Do not fake backend functionality once backend implementation begins.
- Test behavior before declaring work complete.
- Preserve mobile usability.
- Frequent controls should remain thumb-friendly.
- Avoid excessive cards and visual noise.
- Do not create a generic dashboard aesthetic.
- Keep LOCKED IN dark, serious, minimal and premium.
- This Next.js version (16) may differ from training data: check `node_modules/next/dist/docs/`
  before using an API you are unsure about.
- Record important technical decisions in `docs/DECISIONS.md`; update `docs/PROGRESS.md` at the end
  of each stage.

## Definition of done

CODE WRITTEN ≠ DONE.

A task is done only when its behavior has been verified.

## Standard verification commands

All verified working (Windows, Node 22; last run at the end of Stage 2):

```bash
npm install
npm run dev            # http://localhost:3000
npm run lint           # ESLint
npm run typecheck      # next typegen && tsc --noEmit
npm test               # Vitest, tests/unit
npm run build          # production build
npm run test:e2e       # Playwright, builds and serves on :3100; 390 + 1440 full suite, 375 + 430 layout
                       #   (first run: npx playwright install chromium)
npm run format:check   # Prettier (npm run format to fix)
```

Run lint, typecheck, test and build before declaring any stage complete; run test:e2e when UI or
routing changed.

## Working with the mock UI (Stage 2)

- Mock data: only `src/lib/mock-data.ts`. Mock state: only `src/components/app-state.tsx`.
- Dev simulation of the partner / connection: `npm run dev`, open `/today?dev=1`, use the DEV button.
- Breakpoints: `desk:` = 780px (sidebar), `wide:` = 1180px (two columns). Do not change them without
  checking `design-reference/`.
