# Architecture decisions

The decisions that shaped Offday, why I made them, and what each one costs.
Each entry follows a short ADR format: **context → decision → alternatives → consequences**.

| # | Decision | Area |
|---|---|---|
| 1 | Vacation periods are timestamps on 15-minute steps, not dates | Domain / UX |
| 2 | The office time zone is the single source of truth for "when" | Domain |
| 3 | Every business rule is enforced at the layer that can actually see the truth | Validation |
| 4 | Overlap is guaranteed by a Postgres exclusion constraint, not by application code | Concurrency |
| 5 | Command handlers return events; the bus publishes them inside the command's transaction | Architecture |
| 6 | The JWT carries identity only; permissions are reloaded from the DB on every request | Security |
| 7 | Multi-tenant from day one: tenancy is derived from the caller, never from the request | Security / Data |
| 8 | Writes go through the command bus; reads bypass it (CQRS-lite) | Architecture |
| 9 | Deployed to AWS Lambda, which CEF is built for; one handler for local and cloud | Infrastructure |
| 10 | The API is the only path to the data | Security |
| 11 | One error contract, including for errors raised by the database | API |
| 12 | No self-registration: accounts belong to an office and are provisioned by an admin | Security / Product |
| 13 | One ordered release: API before the web app, with backwards-compatible migrations | Delivery |

---

## 1. Vacation periods are timestamps on 15-minute steps, not dates

**Context.** The brief models `start_date` / `end_date` as dates. In practice people take half days: they leave
at 13:00 on a Thursday, or they come back on Monday afternoon. With date-only fields, a half day is impossible
to request, and the "end must be after start" rule forbids even a one-day vacation.

**Decision.** Store `start_date` / `end_date` as `timestamptz`.
- The UI offers a date plus a time on 15-minute steps (`:00`, `:15`, `:30`, `:45`), and the API enforces the same steps.
- One-day and partial-day requests are allowed: rule 1 becomes `end > start` on instants.
- Ranges are **half-open `[start, end)`**: a request ending at 13:00 and one starting at 13:00 don't overlap,
  so a morning off and an afternoon off can coexist.
- The day count is computed **by the server**, in office time: the number of the office's working dates covered.
  A request inside a single working day that lasts under 6 hours counts as **0.5**.
- A request must cover at least one working day (no weekend-only requests that cost 0 days).

**Alternatives.** Dates plus an `am/pm` flag. That covers half days but not "leaving at 15:00", and it pushes
the special cases into every query. Timestamps keep the model uniform: one range type and one overlap operator.

**Consequences.** Better UX and a simpler model, but time zones become a real concern (see #2).
The client never computes a day count for a saved request; it always uses the server's `days`.

## 2. The office time zone is the single source of truth for "when"

**Context.** With timestamps, "today", "on Thursday" and "half a day" depend on *where* you are. A validator in
Paris reviewing a Tel Aviv request must see Tel Aviv dates. The browser's time zone is the wrong anchor.

**Decision.** Each office has an IANA time zone (`Asia/Jerusalem`) and a work week (Tel Aviv is Sun–Thu),
set by a workspace admin.
- The API stores and returns UTC. The client sends ISO strings with an explicit offset.
- Everything human-facing is computed in **office time**: display, the date pickers, rule 4 ("the start must
  fall on an office-local date after today"), working-day detection and day counts.
- Time zones are validated and stored in their canonical spelling (`europe/paris` → `Europe/Paris`).

**Consequences.** DST and cross-zone teams are handled correctly (verified with mocked clocks in QA).
Changing an office's zone or work week changes future calculations, so the UI asks for confirmation.

## 3. Every business rule is enforced at the layer that can actually see the truth

**Context.** "Validate input" is too vague. A rule can only be enforced where its inputs are trustworthy.

**Decision.** Three layers, each with a clear contract:

| Layer | Sees | Owns |
|---|---|---|
| **inputParser** (`http/parse.ts`) | The request and the clock. Synchronous, no DB | Shape, types, `end > start`, 15-minute steps, a reject comment is required |
| **Command handler** | The database, inside a transaction | Rules that depend on stored state: overlap, "approved can't be modified", same office, "can't decide your own request" |
| **Postgres constraints** | Every write, from any code path | Invariants that must hold even under concurrency or bugs |

The DB-level invariants (initial migration):
- `CHECK (end_date > start_date)`
- `CHECK (status <> 'Rejected' OR comments is non-empty)`
- `CHECK ((status = 'Pending') = (decided_at IS NULL))`: every decision records who and when.
- The overlap exclusion constraint (#4).

**The guiding question** is not "can the client tamper with this layer?" (the inputParser runs on the server).
It is "does this check rely on a client's claim about server state?" Example: "approved requests can't be
modified" can't trust an `isApproved` flag from the client; it must read the row, under a lock.

**Consequences.** The UI mirrors the rules for fast feedback, but the API stays the authority. One documented
quirk: input validation runs before the role check, so a Requester who sends malformed input gets 400, not 403.

## 4. Overlap is guaranteed by a Postgres exclusion constraint, not by application code

**Context.** "Requests can't overlap for the same user" is a classic race. Two concurrent submissions both run
`SELECT … overlapping`, both see nothing, and both insert. A row lock doesn't help, because the conflicting row
doesn't exist yet.

**Alternatives considered.**

| Option | Verdict |
|---|---|
| Lock the user row (`SELECT … FOR UPDATE` on `users`) | Works, but every writer has to remember to take it. It serializes all of a user's writes |
| `SERIALIZABLE` isolation | Correct, but forces retry logic on every command and costs throughput |
| **Exclusion constraint** | Declarative, enforced for every writer, backed by an index |

**Decision.**
```sql
CONSTRAINT vacation_no_overlap EXCLUDE USING gist (
  user_id WITH =,
  tstzrange(start_date, end_date, '[)') WITH &&
) WHERE (status <> 'Rejected')
```
- `btree_gist` lets a single GiST index combine `=` on `user_id` with range overlap `&&`.
- The partial `WHERE` means rejected requests don't block new ones.
- The handler still pre-checks so it can return a helpful `409 OVERLAP` with `details.conflict`. If a race slips
  past the pre-check, the constraint's error (`23P01`) is mapped to the **same** 409. The client can't tell which
  layer caught it.

State transitions on existing rows (approve, reject, edit, withdraw, role and office changes) use
`SELECT … FOR UPDATE`. Two validators deciding the same request at once are serialized, and the second one
gets `409 INVALID_STATE`.

## 5. Command handlers return events; the bus publishes them inside the command's transaction

**Context.** The brief asks for a visible command/event architecture. The interesting questions are *who*
publishes events and *when*.

**Decision.**
- **Commands** are plain, immutable data (`ApproveVacationRequestCommand(actor, requestId)`). The `CommandBus`
  maps each one to exactly one handler (registering a second one throws) and **opens one transaction per command**.
- **Handlers don't publish.** They return `{ result, events }`. A handler describes what happened; the bus decides
  when it becomes visible. This keeps handlers easy to test and keeps publishing consistent.
- The bus publishes the events **in the same transaction**, then commits. The `AuditLogSubscriber` subscribes
  to the base `DomainEvent` class and writes `audit_log` atomically with the change. The audit trail can't
  disagree with the data: if the change rolls back, so does its log entry.
- **The composition root is explicit** (`app.ts`): every handler and subscriber is wired in one file. There are
  no decorators or auto-discovery, so the architecture is readable in one place.

**The deliberate boundary: side effects.** A real notification (email or push) must **not** run inside that
transaction. A slow provider would hold row locks, a failed send would undo a valid decision, and a rolled-back
decision could still have sent an email. `DecisionNotificationSubscriber` is a placeholder for that reason.
The production design is a **transactional outbox**: write the message in the same transaction, deliver it
after commit, with retries.

**Consequences.** In-process, synchronous and consistent, which is the right trade-off for a single service.
The `EventBus` interface allows an async transport (SQS, EventBridge) later without changing any handler.

## 6. The JWT carries identity only; permissions are reloaded from the DB on every request

**Context.** A stateless JWT that embeds the role can't be revoked. If a WorkspaceAdmin demotes a validator, the
old token keeps approving requests until it expires.

**Decision.** The token contains only `sub` (the user id): HS256, an 8h expiry and nothing else. `withActor` loads
the caller from the DB on every request (role, office, time zone, work week, workspace) and builds an `Actor`.
Routes apply a coarse role gate; commands apply fine-grained rules on the `Actor`.

**Consequences.**
- Role changes and user deletion take effect **immediately** (a valid token for a deleted user is treated as invalid).
- The cost is one indexed primary-key lookup per request.
- The client refetches `/me` on 403, on window focus and on navigation, so the UI follows role changes too.
- Remaining limitation: sign-out is client-side. Real token revocation would need server state
  (a `tokenVersion` column or a denylist). That isn't needed for privilege changes, because those already
  apply immediately.

## 7. Multi-tenant from day one: tenancy is derived from the caller, never from the request

**Context.** A vacation tool is naturally SaaS: companies, each with offices in different countries.
Retrofitting tenancy later is one of the most expensive migrations there is.

**Decision.** `Workspace → Office → User → VacationRequest`, plus a third role, **WorkspaceAdmin**, who manages roles,
time zones and work weeks in every office of their workspace. Requests, reviews and the calendar are scoped by
`actor.officeId`; administration is scoped by `actor.workspaceId`. Both come from the database (#6), never from a
URL or body parameter. Anything in another workspace returns 404.

The role started as *OfficeAdmin*, limited to one office. Once admins could manage every office of the workspace,
the name no longer matched what the role does, so it was renamed (migration `WorkspaceAdminRole`, which renames the
Postgres enum value in place). Admins can't change their own role, so a workspace always keeps at least one admin.

**Consequences.** Cross-tenant access is impossible by construction, not by convention. The seed data includes
a second office and a separate workspace specifically to demonstrate (and test) isolation.

## 8. Writes go through the command bus; reads bypass it (CQRS-lite)

**Decision.** Commands carry transactions, locks and events. Reads (`queries/`) are plain, office-scoped query
builders with serializers, and they never touch the bus.

- Offset pagination `{ items, total, page, pageSize }`. It's safe because every join is many-to-one, so rows
  can't be duplicated.
- The review queue sorts Pending first, then newest. Status counts and `awaitingMyReview` come back in the same
  response, so the UI never needs N extra calls. They exclude the caller's own requests, which the caller can't decide.
- Indexes match the access paths: `(user_id, start_date DESC)` for "my requests" and overlap checks, `status`
  for the queue, `(office_id, occurred_at DESC)` for the audit log.

**Why.** Pushing reads through a command bus adds ceremony and no guarantees. Separating them keeps the write
model strict and the read model fast and shaped for the UI.

## 9. Deployed to AWS Lambda, with one handler for local and cloud

**Context.** The brief only requires the app to run locally. I still took the time to deploy the API to
AWS Lambda, because the required framework, `commoneventframework` (CEF), is built around the Lambda event
model. Running it only as a local server would use half of what the framework is designed for.

**Why Lambda, specifically:**
- **CEF is Lambda-native.** Its handler signature is the Lambda signature `(event, context)`.
  `buildCommonEvent` normalizes the Lambda/API Gateway payload into one `CommonEvent`, `setLambdaContext` exposes
  the invocation context, and `cef-build` bundles the service (esbuild) into the exact zip Lambda expects.
  The integration code is a few lines, not an adapter layer.
- **The same code runs everywhere.** CEF's dev server wraps the same exported `handler`, so the local server and
  Lambda run identical code. Nothing is compiled differently for production, and "works locally" means
  "works on Lambda".
- **Low operational cost and fast to integrate.** Lambda, a Function URL and an IAM role were all that was needed:
  no servers, containers, load balancer or API Gateway to configure. The deploy is one idempotent command,
  `npm run deploy`. It builds the bundle, creates the function or updates its code and configuration,
  creates the public Function URL and its permissions on the first run, and injects the environment and the DB CA
  certificate from `.env.lambda`. Going from "works on my machine" to a live HTTPS endpoint took one script.
- **Good fit for the workload.** Vacation requests are low-traffic and bursty. Lambda scales to zero when idle,
  stays within the free tier for a demo, and scales out without any change if traffic grows.
- **A reviewer can try it with no setup.** The API is live at a public URL, so the frontend can be pointed at it
  without installing Postgres or running migrations.

**Decision.** A single `index.ts` handler serves both the local dev server and the Lambda Function URL.
Routing is declared in `root.yaml`, an OpenAPI 3 document that is **both the API documentation and the router**,
so the docs can't drift from the code.

Serverless-specific choices:
- **Connections:** Lambda uses the transaction pooler (port 6543) because many short-lived containers would
  exhaust direct connections. Local development and migrations use the session pooler.
- **Pool size per runtime** (`DB_POOL_MAX`): 2 on Lambda, where one container serves one request at a time;
  10 locally, where one process serves many. A Lambda-sized pool on the dev server had caused 30-second stalls.
- **The DataSource is created lazily** and reused across warm invocations.
- **Env vars are read at call time**, because CEF's `loadEnv()` is async.
- **`pg` is imported statically** so esbuild bundles it (TypeORM's own `require` is dynamic).
- CORS preflight is answered in the handler, and CEF's debug routes are disabled on Lambda.

**Accepted cost.** Function URLs don't hold sockets, so there's no server push. The UI refreshes across pages
from local revision counters instead.

## 10. The API is the only path to the data

**Decision.** The database is Supabase Postgres, but Supabase's auto-generated Data API is **disabled**. No
anon-key client can skip the business rules. TLS is verified against the Supabase root CA (not just
`ssl: true`, which accepts any certificate). The schema is managed only by versioned migrations
(`synchronize: false`). Roles and statuses are Postgres `ENUM`s, and emails are forced to lowercase by a `CHECK`
plus a unique index.

## 11. One error contract, including for errors raised by the database

**Decision.** Every failure has the form `{ error: { code, message, details? } }`, produced from typed
`DomainError` subclasses in one place (`http/respond.ts`):
`VALIDATION_ERROR` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `OVERLAP` / `INVALID_STATE` 409.
- `details.fields` maps field → message, so forms show errors inline. The messages are written to match the UI copy.
- Constraint violations are translated into the same contract (`23P01` → `OVERLAP`), so the DB's safety net is
  invisible to clients.
- Unknown errors return a generic 500 and are logged server-side, so internals never leak.
- Login failures return one generic message: no account enumeration.

## 12. No self-registration: accounts belong to an office and are provisioned by an admin

**Context.** The brief asks for a login endpoint, protected routes and role-based access, and states that seeded
demo users are acceptable. The obvious extra would be a sign-up page. In a multi-tenant B2B tool (#7), open
sign-up raises questions it can't answer safely: *which workspace and office* does a new user join, and *which
role* do they get? A stranger must not be able to pick either.

**Decision.** There is no public registration endpoint. Every account is created inside an office, with a role,
by someone who already has authority over that workspace. For the demo, the seed creates these accounts.
- Login is a real email + password flow: bcrypt-hashed passwords, a generic error on failure (#11) and a JWT
  carrying identity only (#6). An unknown email is still compared against a dummy bcrypt hash, so response
  timing doesn't reveal which emails have accounts.
- The login screen also offers one-click demo cards, one per role. They call the **same** login endpoint with the
  seeded credentials, so a reviewer can switch roles in one click without bypassing authentication.

**Alternatives.**

| Option | Verdict |
|---|---|
| Open sign-up, user picks the office | Anyone can join any company's tenant. Breaks isolation |
| Open sign-up into a "pending" state, admin approves | Workable, but it's an invite flow with extra steps and a spam surface |
| **Admin-provisioned accounts (invites)** | Matches how B2B tools onboard staff; tenancy and role are set by someone authorized |
| SSO (Google Workspace, Okta via OIDC) | The long-term answer for companies; out of scope for the brief |

**Consequences.** No account can enter a tenant without an authorized person placing it there, and no role can
be self-assigned. The missing piece for production is the **invite flow**: a WorkspaceAdmin enters an email,
office and role; the backend issues a single-use, expiring invite token (stored hashed); the invitee sets their
own password. This fits the existing architecture as an `InviteUserCommand` and an `AcceptInviteCommand`, with a
`UserInvitedEvent` delivered by the outbox (#5).

## 13. One ordered release: API before the web app, with backwards-compatible migrations

**Context.** The first setup had two pipelines that didn't know about each other. Netlify built and published the
frontend on every push to `main` within a minute or two, without waiting for tests. GitHub Actions tested the
backend and deployed it minutes later. That leaves two ways to break production:
- **A window:** for a few minutes after each push, the new web app talks to the old API.
- **A permanent split:** when the backend deploy fails, the new web app keeps running against the old API until
  someone notices. This actually happened during development. The `OfficeAdmin` → `WorkspaceAdmin` rename went
  live on Netlify while the API deploy failed on missing credentials, so the live web app checked for a role the
  live API didn't return yet.

**Decision.** One pipeline owns production, and it releases in dependency order:

```
Checks (all green) → DB migrations → API → API smoke test → web build → Netlify publish → web smoke test
```

- Netlify's own production builds are switched off (`frontend/netlify.toml`). The pipeline publishes with the
  Netlify CLI after the API's smoke test passes. Pull request previews still come from Netlify.
- `checks.yml` calls `deploy.yml` with only the parts that changed. A docs-only push deploys nothing.
- Deploys are serialized and never cancelled halfway. Production lives in one GitHub environment, which holds the
  secrets and is where required reviewers can be added.
- AWS access uses OIDC: a short-lived role that can only update the existing function. No AWS keys are stored.

**Ordering removes the permanent split, not the window.** Between "migrations ran" and "the new Lambda is live",
the old API runs against the new schema. Between "the new API is live" and "Netlify published", the old web app
talks to the new API. So every change has to work with the version before it, which is the
**expand/contract** pattern:

| Step | Release | Example: renaming a role |
|---|---|---|
| Expand | N | Add the new enum value. The API accepts and returns both names |
| Migrate | N+1 | Move the rows to the new value. The web app switches to the new name |
| Contract | N+2 | Drop the old value once no deployed code uses it |

**The honest exception.** The role rename (#7) was shipped as a single in-place `ALTER TYPE … RENAME VALUE`,
which breaks the old Lambda the moment the migration runs. That was acceptable here, with no real users and a
deploy measured in seconds. With real traffic it would be the three-step sequence above.

**Rollback.** Running *Deploy* by hand with an older commit SHA redeploys that commit's API and web app; Netlify
can also restore any previous web deploy in one click. Migrations only move forward, never down, and expand/contract
is what makes it safe to roll the code back without rolling the schema back.

**Alternatives.**

| Option | Verdict |
|---|---|
| Keep two independent pipelines | Simple, but the web app can run ahead of the API indefinitely |
| Netlify build hook triggered after the API deploy | Ordered, but Netlify builds with its own environment, so the commit and settings tested in CI aren't what ships |
| **Publish the CI-built web app from the same pipeline** | One commit, one build, one order; Netlify stays the CDN and preview host |
| Lambda versions behind an alias for instant API rollback | Would move the Function URL to the alias and change the public API URL; worth it with real traffic |

**Consequences.** A release is one commit moving through one pipeline, and either all of it ships or the part that
depends on a failure doesn't. The cost is that a frontend-only change now waits for the checks (a couple of
minutes) instead of publishing immediately.

---

## Known limitations and next steps

| Limitation | Next step |
|---|---|
| Notifications are a logging placeholder | Transactional outbox and a delivery worker (#5) |
| Sign-out doesn't revoke the token (privilege changes already apply immediately) | `tokenVersion` on `users` |
| Accounts exist only through the seed | Invite flow for WorkspaceAdmins, then SSO (#12) |
| No login rate limiting | Throttling per IP and per account (API Gateway or a DB counter) |
| No live updates for other users | WebSocket API or polling of a lightweight "revision" endpoint |
| Offset pagination | Keyset pagination if the review queue grows large |
