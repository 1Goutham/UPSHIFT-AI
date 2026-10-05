# UPSHIFT

**Did the AI build what you asked?** Paste the URL of a site built with Lovable, v0, Bolt, Cursor, Replit or Claude Code. UPSHIFT checks it in a real browser on phone and desktop, against what you asked for, and gives you the exact prompt to fix it. Then it checks whether the fix worked.

**For:** freelancers and agencies handing AI-built sites to clients, and founders iterating on their own.

**The loop**

1. **Audit.** Paste a URL, no account needed. You get:
   - markup checks, plus a crawl of linked pages (broken links, placeholder copy, reused titles);
   - a headless browser at 390px and 1440px: overflow, console errors, failed requests, the mobile menu, screenshots;
   - axe-core WCAG A/AA rules;
   - a model review when configured.
2. **Fix.** Selected issues become a fix prompt shaped for your builder:
   - chat builders get small batched messages;
   - coding agents get one task with self-checks.

   It names what to keep, so working parts aren't touched.
3. **Re-audit.** Add the next version, or call the deploy hook from CI. You see what improved and what regressed, a visual difference against the previous version or your reference images, and **fix success**: how many targeted issues were actually resolved.
4. **Prove it.** Share a read-only report link with a client.

**Optional:** add a brief (your goal, prompt and reference images) to check requirements too, not just quality.

## Honesty rules built into the code

| Status | Meaning | Who can produce it |
|---|---|---|
| Verified pass / fail | A deterministic check, a real browser run, or **you** | `deterministic`, `browser`, `human` |
| Likely met / likely issue | A model's judgement: a lead, not proof | `model` only |
| Recommendation | Matter of taste | any |
| Not tested / unable to verify | No method covered it, or a check could not complete | any |

- `enforceStatus()` downgrades any model "verified" result to "likely". A model can never override a requirement already settled by a check (`linkRequirements` + `modelFindings`).
- A check that only *partly* covers a requirement can fail it but never pass it. The requirement stays "not tested", with the passing evidence attached.
- Requirement coverage is shown as counts per status with the caption "not a measure of overall or creative quality". There is no universal score.
- Every audit lists **how it was checked** (which methods ran, which did not, and why) and **what was not covered**.
- With no AI provider configured, model features say so and stay disabled. Nothing is simulated.
- If the model call fails during an audit, the audit still completes with every automated result and says the model review did not run.

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

With no configuration, the app uses an embedded Postgres (PGlite under `.data/`) and runs with model features off. Copy `.env.example` to `.env.local` to configure:

| Variable | Effect |
|---|---|
| `XAI_API_KEY` | Grok (xAI). Enables model-drafted briefs, prompt rewrite and refine, and model review of outputs (incl. screenshots). Server-side only. `XAI_MODEL` defaults to `grok-4-fast`. |
| `ANTHROPIC_API_KEY` | Claude, as an alternative to Grok. `UPSHIFT_MODEL` defaults to `claude-opus-5-5`. If both keys are set Claude is used, unless `UPSHIFT_PROVIDER=xai`. |
| `XAI_PRICE_INPUT`, `XAI_PRICE_OUTPUT` | Optional USD per million tokens, used only for Settings cost estimates. Without them Grok usage shows tokens and "—" for cost. |
| `DATABASE_URL` | Use PostgreSQL (`docker compose up -d` gives you one). Required for any multi-instance deployment. |
| `UPSHIFT_CHROMIUM_PATH`, `UPSHIFT_CHROMIUM_NO_SANDBOX` | Browser checks. Without a usable Chromium, audits record browser checks as *not tested*. |
| `UPSHIFT_STORAGE_DIR` | Where uploads and screenshots are written. |

Migrations in `./drizzle` are applied automatically on first request. After changing `src/lib/db/schema.ts`, run `npm run db:generate`.

## Deploying (Vercel + Neon)

1. Import the repo in Vercel.
2. **Storage → Neon**: or paste Neon's *pooled* connection string as `DATABASE_URL`. Tables are created on first request.
3. **Storage → Blob**: connect a store; `BLOB_READ_WRITE_TOKEN` is added for you. Uploads and screenshots are stored privately and served only through authenticated routes.
4. Set `XAI_API_KEY` (and optionally `XAI_MODEL`).
5. Deploy, then open `/api/health`: it reports database, model and storage status.

Browser checks use the bundled `@sparticuz/chromium` on Vercel; audit routes allow up to 300 s (`maxDuration`). Rate limits are stored in Postgres, so they hold across instances.

## Tests

```bash
npm test                     # unit + persistence (PGlite) + stubbed provider tests
TEST_DATABASE_URL=postgres://… npm test   # also runs the persistence suite on real PostgreSQL
UPSHIFT_CHROMIUM_PATH=… UPSHIFT_CHROMIUM_NO_SANDBOX=true npm run test:e2e   # full journey in a real browser, desktop + mobile
npm run typecheck && npm run lint && npm run build
```

The e2e suite runs the whole loop through the UI with no AI provider: sign-up → project → brief → accept → structured prompt → URL audit of a deliberately flawed page (with a real browser) → correction prompt → v2 → compare (shows improvements) → human review → history → reopen. It also covers content-based upload validation and cross-account isolation.

## Architecture

```
src/
  app/                    Next.js App Router pages + route handlers (typed with Zod)
  components/             UI (design system in ui.tsx, workspace/* for the project loop)
  lib/
    ai/provider.ts        Provider boundary (Claude SDK or xAI Grok chat completions):
                          schema-constrained JSON, Zod re-validation, timeouts/retries,
                          refusal handling, token + cost recording
    engines/              Pure logic, no I/O; unit tested
      prompt-lint.ts        rule-based prompt gaps
      intent.ts             brief schema + deterministic brief from the user's own words
      prompt-builder.ts     optimizer schemas + structured prompt assembly
      audit/                html-checks, text-checks, browser (Playwright), requirement linking
      improve.ts            prioritisation + correction prompts
      compare.ts            version-to-version change classification
    services/             Orchestration (brief, prompts, artifacts, audit, insights, export)
    repo/                 Data access; every query is scoped to the acting user
    security/             SSRF guard, upload sniffing, rate limits
    db/                   Drizzle schema + driver selection (Postgres / PGlite)
```

Audits run after the response is sent (`after()`), record `running → complete | failed` on the evaluation row, and the client polls. A failed audit never loses the uploaded output.

## Security

- **Auth:** scrypt password hashes, random session tokens stored as SHA-256, httpOnly SameSite=Lax cookies, same-origin check on state-changing requests, rate limits on auth, model and audit calls.
- **Isolation:** every project-scoped route goes through `requireProject(userId, id)`; child rows are only reached through an owned project. Files are served only if their key belongs to an owned project. Covered by e2e and persistence tests.
- **URLs (SSRF):** http/https only, no credentials, standard ports, private/reserved ranges blocked (IPv4, IPv6, mapped forms). The check runs inside the socket's DNS lookup, so the validated address is the connected one. Redirects are re-validated per hop. Size and time are capped. In the browser, every sub-request is checked the same way.
- **Uploads:** the type is decided from the file's bytes, not its name (SVG/HTML posing as images are rejected), size limits apply, keys are server-generated, and files are served with `nosniff` and a sandbox CSP.
- **Prompt injection:** uploaded and fetched content is wrapped as `<untrusted_input>` with a system rule to treat it as data. Model output is schema-constrained, re-validated and stored as suggestions; it never triggers actions.
- **Secrets:** the API key is read server-side only. The code checker flags hard-coded credentials in uploaded code and masks them in evidence.
- **Deletion:** deleting a project removes its rows and stored files. Account deletion (password-confirmed) removes everything.

## Status

| Area | State |
|---|---|
| Accounts, projects (create, reopen, rename, delete), isolation | Implemented, e2e tested |
| Brief + acceptance checklist (deterministic path) | Implemented, e2e tested |
| Brief (model path) | Implemented for Grok and Claude; both providers tested against stubbed HTTP, **not yet run against the live APIs** |
| Prompt gap checks, structured prompt, edit-as-new-version, copy/export | Implemented, tested |
| Prompt rewrite / refine with model, tool-specific notes | Implemented; stub-tested provider, not live-tested |
| URL audit: markup checks + headless browser (overflow, console, failed requests, screenshots) | Implemented, e2e tested |
| Image and text/code audits (deterministic) | Implemented, e2e tested (image); unit tested (text/code) |
| Model review of requirements (incl. screenshots and images) | Implemented; not live-tested |
| Human verdicts on findings | Implemented, e2e tested |
| Free URL audit without sign-up (guest accounts, upgraded on sign-up, merged on sign-in, cleaned after 7 days) | Implemented, e2e tested |
| Crawl of linked pages, axe-core rules, mobile-menu interaction check | Implemented, e2e tested against a fixture site |
| Builder-specific fix prompts (batched for chat builders), fix-success tracking | Implemented, unit + e2e tested |
| Visual difference (versions and references) | Implemented, e2e tested |
| Re-audit on deploy (`POST /api/hooks/:token`) | Implemented, e2e tested |
| Reference images (used in model brief + visual audit) | Upload/remove e2e tested; model use not live-tested |
| Correction prompts, version compare (+ inline delta vs previous), history, Markdown export | Implemented, e2e tested |
| Read-only share links (hashed, rotatable, revocable, noindex) | Implemented, e2e + unit tested |
| Password change, account deletion | Implemented, e2e tested (change) |
| Playbooks, user-controlled memory, insights, usage and cost view | Implemented; manually exercised, light test coverage |
| Voice | Browser dictation (Web Speech API) where supported, hidden otherwise. Real-time voice provider: **planned** |
| PDF/document parsing, multi-page crawling, interaction testing (clicks/forms) | **Planned** |
| Strategy engine (model/tool recommendations), workflow builder | **Planned.** Not built rather than guessed, because it needs a maintained, sourced capability dataset |
| Connected coding agents / design tools, team workspaces, developer API | **Planned** (P2) |
| Vercel Blob storage, Postgres-backed rate limits, serverless Chromium | Implemented; Blob and serverless Chromium not yet exercised on a live Vercel deployment |
| Password reset by email, OAuth sign-in | **Planned** (needs an email/OAuth provider) |

## Known limitations

- Only the landing URL is loaded. Logged-in areas, other pages and interactions are not exercised, and audits say so.
- The load-time figure is a single sample from the server, labelled as such. It is not a benchmark.
- PGlite is single-process; set `DATABASE_URL` for any deployment (it is required on Vercel).
- Chromium in containers often needs `--no-sandbox` (`UPSHIFT_CHROMIUM_NO_SANDBOX=true`). Isolate the audit worker accordingly. WebSocket connections opened by audited pages are not filtered by the request guard.

The brand name lives in `src/components/logo.tsx` and the app metadata, so it is easy to change.
