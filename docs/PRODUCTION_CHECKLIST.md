# Production checklist (Stage 10)

Objective, in order. Nothing here was done in Stage 9 (no PROD exists yet). Tick each item with the
evidence (screenshot, command output) in docs/PROGRESS.md.

## 1. Supabase PROD project

- [ ] Create a new project (not the DEV one), region near the users (sa-east-1), strong database
      password stored only in a password manager.
- [ ] Apply **every** file in `supabase/migrations/` in filename order to the empty database
      (`npx supabase link --project-ref <prod>` + `npx supabase db push`, or the MCP
      `apply_migration` per file). No squashing, no manual edits.
- [ ] Check the result: `list_migrations` shows exactly the repository files; the pgTAP suites pass
      against PROD (they roll back) — or at minimum the Stage 9 privilege block of
      `stage9_integrity.test.sql`.
- [ ] **Never** apply `supabase/dev/*.sql` to PROD. Verify:
      `select proname from pg_proc where proname like 'dev\_%';` returns no row.
- [ ] Regenerate types against PROD and diff with `src/types/database.ts` (only formatting may
      differ).

## 2. Supabase dashboard settings (manual gates)

The first two are the **MANUAL STAGE 10 PRODUCTION GATES** left open by Stage 9 (dashboard-only
settings; the Stage 9 tools could neither read nor change them, and no code depends on them).

- [ ] **MANUAL STAGE 10 PRODUCTION GATE — Realtime public access OFF.** Supabase Dashboard → the
      PROD project → **Project Settings → Realtime** → turn **"Allow public access"** OFF → Save.
      Evidence: screenshot of the setting. Then, against a PROD-like config (same setting), run the
      realtime e2e and confirm it passes (the app only uses private channels, so nothing should
      change):

      ```bash
      npx playwright test --project=setup --project=stage5 --project=stage9
      ```

- [ ] **MANUAL STAGE 10 PRODUCTION GATE — Leaked password protection ON.** Supabase Dashboard → the
      PROD project → **Authentication → Providers → Email** (or **Auth → Password security**,
      depending on the dashboard version; see
      https://supabase.com/docs/guides/auth/password-security) → enable **"Prevent use of leaked
      passwords"** → Save.
      Requires the Pro plan or above; if the plan does not offer it, record "leaked password
      protection unavailable on plan X" as an accepted risk in docs/SECURITY.md. Evidence: the
      security advisor no longer lists `auth_leaked_password_protection`.
- [ ] Auth → Password minimum length ≥ 8 (the app also enforces 8).
- [ ] Auth → Email confirmation ON.
- [ ] Auth → URL configuration: **Site URL** = the production origin; **Redirect URLs** = exactly
      `https://<domain>/auth/confirm` (no wildcards, no localhost).
- [ ] Auth → SMTP: custom SMTP (sender domain with SPF / DKIM); the built-in sender is rate-limited
      and not for production.
- [ ] Auth rate limits reviewed (sign-in, sign-up, email).
- [x] Auth → Emails → templates in pt-BR (ADR-054): "Confirm sign up" (subject "Confirme seu e-mail · LOCKED IN",
      link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`) and "Reset password" (subject
      "Redefina sua senha · LOCKED IN", link `…&type=recovery&next=/reset-password`). Keep the token_hash links.
- [ ] Run the Security and Performance advisors: only the items classified ACCEPTED in
      docs/SECURITY.md → "Supabase advisors" may remain (and no `dev_fixture_*` finding at all).
- [ ] Point-in-time recovery / backups enabled per plan.

## 3. Vercel

- [ ] Project linked to the repository, production branch `main`.
- [ ] Environment variables (Production): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (PROD project), `SITE_URL` (the production origin,
      server-only). No service-role / secret key anywhere.
- [ ] Preview deployments do **not** use PROD keys.
- [ ] Custom domain (if any) with HTTPS; confirm `Strict-Transport-Security` is present.
- [ ] Response headers on the production URL: CSP (`connect-src` lists the PROD Supabase host),
      `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## 4. Smoke tests on production

- [ ] `/today` signed out → `/login?next=%2Ftoday`, no private content.
- [ ] Sign up with a real address → confirmation email → link lands on `/today` → onboarding.
- [ ] Password reset email → link → new password → sign in.
- [ ] `/login?next=https://evil.example` → after sign-in stays on the site.
- [ ] Manifest and icons load; the app installs; no service worker is registered.
- [ ] Browser console: no errors on Today, Partner, Focus, Progress, Settings.

## 5. Real two-user acceptance (Brendon + Lucas)

- [ ] Both sign up on their own phones, finish onboarding, form the duo with the invite code.
- [ ] Routine, Today, complete / undo, Quick Add; partner sees it live; a reaction arrives.
- [ ] Focus session on one phone; the other sees FOCUSING; end with a reflection (private).
- [ ] Progress, streak, weekly comparison; a challenge together; settings and notifications.
- [ ] Next day: yesterday is read-only; the streak and the week are unchanged by any attempt.
- [ ] Sign out / sign in on each device; nothing lost.

## 6. After go-live

- [ ] Monitoring: Vercel runtime logs, Supabase logs / advisors weekly for the first month.
- [ ] Remove the DEV test users' access to anything production (they only exist in DEV).
