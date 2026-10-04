# UPSHIFT AI

**Get more out of every AI.** An AI utilisation platform that turns vague intentions into a confirmed brief, sharper prompts, audited outputs and targeted fixes, and shows evidence of what improved between versions.

```
INTENT → STRATEGY → CONTEXT → EXECUTION → EVALUATION → IMPROVEMENT → LEARNING
```

UPSHIFT is not a chatbot or a prompt rewriter. A project carries one set of requirements through the whole loop:

1. **Brief.** Your goal and original prompt become an editable brief with an acceptance checklist. Every suggestion is labelled *You said / Inferred / Assumption / Baseline* and only counts once you accept it.
2. **Prompt.** Rule-based checks show what the prompt is missing (with the reason each one fired). The improved prompt keeps your wording and decisions. Earlier versions are never overwritten.
3. **Outputs.** Add the AI's result as a URL, an image or screenshot, or text/code. It is audited against the confirmed checklist with markup checks, a real headless browser at 390px and 1440px, and (when configured) a model review.
4. **Correction.** Selected issues become a targeted correction prompt that lists what already works so it is preserved, and asks the tool to verify each fix.
5. **Compare.** Add the next version and see what improved, regressed, is still failing or is new, lined up by requirement.

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

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

With no configuration, the app uses an embedded Postgres (PGlite under `.data/`) and runs with model features off. Copy `.env.example` to `.env.local` to configure:

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Enables model-drafted briefs, prompt rewrite and refine, and model review of outputs (incl. screenshots). Server-side only. |
| `UPSHIFT_MODEL` | Default `claude-opus-5-5`. |
| `DATABASE_URL` | Use PostgreSQL (`docker compose up -d` gives you one). Required for any multi-instance deployment. |
| `UPSHIFT_CHROMIUM_PATH`, `UPSHIFT_CHROMIUM_NO_SANDBOX` | Browser checks. Without a usable Chromium, audits record browser checks as *not tested*. |
| `UPSHIFT_STORAGE_DIR` | Where uploads and screenshots are written. |

Migrations in `./drizzle` are applied automatically on first request. After changing `src/lib/db/schema.ts`, run `npm run db:generate`.

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
    ai/provider.ts        Provider boundary: schema-constrained JSON, Zod re-validation,
                          timeouts/retries, refusal handling, token + cost recording
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
| Brief (model path) | Implemented; provider layer tested against stubbed HTTP, **not yet run against the live API** |
| Prompt gap checks, structured prompt, edit-as-new-version, copy/export | Implemented, tested |
| Prompt rewrite / refine with model, tool-specific notes | Implemented; stub-tested provider, not live-tested |
| URL audit: markup checks + headless browser (overflow, console, failed requests, screenshots) | Implemented, e2e tested |
| Image and text/code audits (deterministic) | Implemented, e2e tested (image); unit tested (text/code) |
| Model review of requirements (incl. screenshots and images) | Implemented; not live-tested |
| Human verdicts on findings | Implemented, e2e tested |
| Correction prompts, version compare, history, Markdown export | Implemented, e2e tested |
| Playbooks, user-controlled memory, insights, usage and cost view | Implemented; manually exercised, light test coverage |
| Voice | Browser dictation (Web Speech API) where supported, hidden otherwise. Real-time voice provider: **planned** |
| PDF/document parsing, multi-page crawling, interaction testing (clicks/forms) | **Planned** |
| Strategy engine (model/tool recommendations), workflow builder | **Planned.** Not built rather than guessed, because it needs a maintained, sourced capability dataset |
| Connected coding agents / design tools, team workspaces, developer API | **Planned** (P2) |
| Cloud object storage, shared rate-limit store, job queue | Extension points in `storage.ts`, `ratelimit.ts`, `after()`; needed before multi-instance scale |

## Known limitations

- Only the landing URL is loaded. Logged-in areas, other pages and interactions are not exercised, and audits say so.
- The load-time figure is a single sample from the server, labelled as such. It is not a benchmark.
- PGlite and in-memory rate limiting are single-process. Use `DATABASE_URL` and a shared store when scaling out.
- Chromium in containers often needs `--no-sandbox` (`UPSHIFT_CHROMIUM_NO_SANDBOX=true`). Isolate the audit worker accordingly. WebSocket connections opened by audited pages are not filtered by the request guard.

The brand name lives in `src/components/logo.tsx` and the app metadata, so it is easy to change.
