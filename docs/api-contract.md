# Offday API contract

Shared contract between `backend/` and `frontend/`. Base URL: `VITE_API_URL` (local default `http://localhost:8888`).
All bodies are JSON. Protected endpoints need `Authorization: Bearer <token>`.

## Conventions

- **Times:** ISO 8601 strings. The client sends times with an offset (`2026-11-03T09:00:00+02:00`), and the server returns UTC (`...Z`).
  The UI converts in both directions using the caller's **office time zone** (`office.timezone`, IANA name, e.g. `Asia/Jerusalem`).
- **Pagination:** `?page=1&pageSize=6`. The response is `{ items, total, page, pageSize }`.
- **Errors:** an HTTP status plus `{ "error": { "code": string, "message": string, "details"?: object } }`.
  | Status | code | When |
  |---|---|---|
  | 400 | `VALIDATION_ERROR` | Bad input; `details.fields` maps field → message |
  | 401 | `UNAUTHENTICATED` | Missing, invalid or expired token; bad login |
  | 403 | `FORBIDDEN` | Role not allowed, or the resource is in another office |
  | 404 | `NOT_FOUND` | Resource doesn't exist (or isn't visible to the caller) |
  | 409 | `OVERLAP` | Overlaps the caller's Pending/Approved request; `details.conflict` = `{ id, startDate, endDate, status }`. For a trip, colleagues with approved time off then: `details.conflicts` = `ParticipantConflict[]` (rule 7). Approving a request that overlaps another approved one of that person: `details.conflict` |
  | 409 | `INVALID_STATE` | E.g. modifying an approved request, deciding an already-decided one, editing a trip you don't organize |
  | 409 | `EMAIL_TAKEN` | Accepting an invite with an email that already has an account; `details.fields.email` |
  | 500 | `INTERNAL` | Generic message, no internals |

## Roles and tenancy

Workspace (company) → Offices → Users. Vacation requests are scoped to the **caller's office**; there is no cross-office access to requests.
Workspace admins administer **every office of their workspace** (time zone, work week, roles). The workspace is the hard tenant boundary: anything in another workspace answers `404`.

| Capability | Requester | Validator | WorkspaceAdmin |
|---|---|---|---|
| Submit / edit / withdraw own Pending requests | ✅ | ✅ | ✅ |
| Submit a request together with colleagues of their office (a trip), leave a trip they were added to | ✅ | ✅ | ✅ |
| Team calendar | ✅ | ✅ | ✅ |
| See all office requests, approve / reject (not their own, not a trip they're on), approve / reject a whole trip | | ✅ | ✅ |
| Overview stats | | ✅ | ✅ |
| Religious holidays next to the team calendar | ✅ | ✅ | ✅ |
| Change user roles, office time zone and work week (any office of the workspace) | | | ✅ |
| Create, list and revoke invite links (any office of the workspace) | | | ✅ |

## Business rules (enforced by the API; the UI mirrors them for UX)

1. `endDate` > `startDate` (same-day partial requests allowed, e.g. a half day). Times on 15-minute steps (`:00`, `:15`, `:30`, `:45`).
2. No overlap with the user's own Pending/Approved requests (trip rows included). Touching is allowed (13:00 end / 13:00 start).
3. Approved and rejected requests can't be modified or withdrawn.
4. The start must be on an office-local date **after today** (today itself isn't allowed).
5. Reject requires a non-empty `comment`.
6. Only Validator/WorkspaceAdmin can approve/reject, only within their office, never their own requests.
7. **Vacation with colleagues (a trip, decisions.md #15).** `POST /requests` with `colleagueIds` creates one Pending request per
   person (the caller and each colleague), with the same dates and reason, linked by one `group`.
   - **Who:** up to **9** colleagues (10 people), each once, never the caller (400 on `colleagueIds`). Colleagues must be in the
     **caller's office** (UX decision: one set of dates, one time zone and work week, one review queue). An unknown user, a user of
     another office and a user of another workspace all get the **same** `400` (`fields.colleagueIds`), and nothing is created.
   - **Added automatically:** no invite or accept step. The colleague's request has `addedBy` = the organizer.
   - **Overlaps:** a colleague's **Approved** time off in the range blocks the whole trip: `409 OVERLAP`, `details.conflicts` lists
     **every** blocked colleague, e.g. "Dana Cohen can't join from 10 Oct to 20 Oct 2026: they already have approved time off 12–14 Oct."
     A colleague's **Pending** overlap doesn't block: the `201` carries `warnings: ParticipantConflict[]` naming them. Rejected
     requests never block. The caller's own rule 2 doesn't change (`details.conflict`).
   - **Leaving:** a colleague withdraws their own Pending row (`DELETE /requests/:id`); the rest of the trip stays. They can't edit it
     (`409 INVALID_STATE` "The trip's dates are set by Lina Haddad. Leave the trip to request your own dates.").
   - **Editing:** only the organizer, only while **every** row of the trip is Pending (otherwise `409 INVALID_STATE`). The new dates
     and reason apply to everyone, with the same checks as on create (approved overlap → 409, pending → `warnings`).
   - **Cancelling:** the organizer's `DELETE /requests/:id?scope=group` removes every Pending row of the trip; decided rows stay.
     `scope=group` by anyone else is `403`. The default `scope=self` withdraws only the caller's row.
   - **Deciding:** each person is decided separately, as before. A reviewer who is **on the trip** can't decide **any** row of it (`403`).
     `POST /groups/:id/approve` and `POST /groups/:id/reject { comment }` decide all Pending rows of the trip at once, atomically
     (`403` if the caller is on the trip, `404` for another office's trip, `409 INVALID_STATE` if nobody is pending; the comment is
     copied to every rejected row).
   - **Never approved twice:** approving a request that overlaps another approved request of the same person is `409 OVERLAP`
     ("Tom Becker already has approved time off that overlaps this request"), per row and for "approve all" (then nobody is approved
     and `details.conflicts` names them). Postgres enforces it too.
- A request must include at least one of the office's working days.
- `reason` is optional, max 240 chars. `comment` max 500 chars.
- **Day count (`days`)**, computed by the server in office time: the number of the office's working dates the request covers (`office.workDays`, e.g. Sun–Thu in Tel Aviv). A request inside a single working day that lasts under 6h counts as `0.5`.
- Annual allowance: 25 days.

## Objects

```ts
type Role = "Requester" | "Validator" | "WorkspaceAdmin";
type Status = "Pending" | "Approved" | "Rejected";

interface Me {
  id: number; name: string; email: string; role: Role;
  office: { id: number; name: string; timezone: string; workDays: number[] /* ISO weekdays, 1 = Mon ... 7 = Sun */ };
  workspace: { id: number; name: string };
}

interface UserSummary { id: number; name: string; email: string; role: Role }

interface VacationRequest {
  id: number;
  user: { id: number; name: string; email: string };
  startDate: string; endDate: string;   // ISO, UTC
  reason: string | null;
  status: Status;
  comments: string | null;               // rejection comment
  days: number;
  decidedBy: { id: number; name: string } | null;
  decidedAt: string | null;
  addedBy: { id: number; name: string } | null;   // a colleague put this person on their trip; null = the owner created it
  group: VacationGroup | null;                     // the trip, when submitted together with colleagues
  createdAt: string; updatedAt: string;
}

interface VacationGroup {
  id: number;
  organizer: { id: number; name: string } | null;  // who submitted the trip
  members: { userId: number; name: string; requestId: number; status: Status }[];   // organizer first, then by name
}

/** A colleague whose time off overlaps a trip: in `details.conflicts` (Approved, 409) or `warnings` (Pending, 201/200). */
interface ParticipantConflict {
  userId: number; name: string;
  conflict: { id: number; startDate: string; endDate: string; status: Status };
}
```

`group.members` is loaded with one batched query per page (list, review queue, team calendar, single responses).

## Endpoints

### Auth
| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ token, user: Me }` |
| GET | `/me` | | `Me` |
| GET | `/me/balance?year=2026` | | `{ year, allowance, usedDays, pendingDays, pendingRequests, remainingDays }` (pending counted for `year` only) |

### Own requests (all roles)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/requests/mine?status=&page=&pageSize=` | | `Paginated<VacationRequest>`, newest first, plus `counts: { all, Pending, Approved, Rejected }` (ignores `status`) |
| POST | `/requests` | `{ startDate, endDate, reason?, colleagueIds? }` | `201 VacationRequest & { warnings: ParticipantConflict[] }` (the caller's row; `warnings` is `[]` when none; rule 7) |
| PUT | `/requests/:id` | `{ startDate, endDate, reason? }` | `VacationRequest & { warnings }` (own, Pending only; a trip's organizer moves everyone) |
| DELETE | `/requests/:id?scope=self\|group` | | `204` withdraw (own, Pending only). A trip member leaves the trip; `scope=group`: the organizer cancels it for everyone still pending |

### Review (Validator, WorkspaceAdmin)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/requests?status=&userId=&page=&pageSize=` | | `Paginated<VacationRequest>` for the office; Pending first, then newest. Response also has `counts: { all, Pending, Approved, Rejected }` respecting `userId`, and `awaitingMyReview` (Pending requests the caller can decide, i.e. not their own) |
| POST | `/requests/:id/approve` | | `VacationRequest` |
| POST | `/requests/:id/reject` | `{ comment }` | `VacationRequest` |
| POST | `/groups/:id/approve` | | `VacationRequest[]`: every Pending row of the trip, approved atomically (rule 7) |
| POST | `/groups/:id/reject` | `{ comment }` | `VacationRequest[]`: every Pending row of the trip, rejected with the comment (rule 7) |
| GET | `/stats/overview?year=2026` | | see below |

```ts
interface Overview {
  pendingCount: number; oldestPendingCreatedAt: string | null;   // excluding the caller's own requests
  approvalRate: number | null;             // approved / decided, 0..1
  approvedDays: number; approvedPeople: number;   // in `year`
  outNext14Days: number; teamSize: number;
  monthly: { month: string /* "2026-07" */; approved: number; pending: number; rejected: number }[]; // days, 3 months back + current + 2 ahead
}
```

### Office (all roles unless noted)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/team/calendar?from=&to=` | | `{ users: UserSummary[], requests: VacationRequest[] }` Pending + Approved overlapping the range |
| GET | `/office/users` | | `UserSummary[]` (Validator, WorkspaceAdmin) |
| PUT | `/users/:id/role` | `{ role }` | `UserSummary` (WorkspaceAdmin; user in any office of the workspace; can't change own role) |
| GET | `/office` | | `{ id, name, timezone, workDays, workspace: { id, name } }` |
| PUT | `/office/timezone` | `{ timezone }` | same as GET `/office` (WorkspaceAdmin; must be a valid IANA zone, stored in canonical spelling) |
| PUT | `/office/work-week` | `{ workDays }` | same as GET `/office` (WorkspaceAdmin; 1–7 distinct ISO weekdays) |
| GET | `/holidays?from=&to=&calendars=` | | `{ calendars: { id, label }[], holidays: Holiday[], unavailable: HolidayCalendarId[] }` (all roles; see below) |

### Workspace administration (WorkspaceAdmin)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/workspace/offices` | | `WorkspaceOffice[]`, by name: GET `/office` shape plus `people: { total, Requester, Validator, WorkspaceAdmin }` and `isMine` |
| GET | `/offices/:id` | | same as GET `/office`, for any office of the workspace |
| GET | `/offices/:id/users` | | `UserSummary[]` |
| PUT | `/offices/:id/timezone` | `{ timezone }` | same as PUT `/office/timezone` |
| PUT | `/offices/:id/work-week` | `{ workDays }` | same as PUT `/office/work-week` |

### Invitations
A workspace admin creates an invite **link** for an office of their workspace and shares it however they like (no
email is sent). The invitee opens `/join/<token>` in the web app, creates their account and is signed in, in that
office with the link's role.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/offices/:id/invitations` | `{ kind, role?, email?, maxUses?, expiresInDays?, label? }` | `201 { invitation: InvitationSummary, token }` (WorkspaceAdmin) |
| GET | `/offices/:id/invitations` | | `InvitationSummary[]`, newest first, all statuses (WorkspaceAdmin) |
| DELETE | `/offices/:officeId/invitations/:invitationId` | | `204`, idempotent (WorkspaceAdmin) |
| POST | `/invitations/preview` | `{ token }` | `InvitationPreview` (public) |
| POST | `/invitations/accept` | `{ token, name, email, password }` | `201 { token, user: Me }`, same shape as `/auth/login` (public) |

- **Kinds.** `personal`: `email` required, single use. `team`: no email, `maxUses` 1–200 (default 25).
  `expiresInDays` 1–30 (default 7). `label` ≤ 80 chars, only admins see it. `role` defaults to `Requester`.
- **Admin links.** `role: "WorkspaceAdmin"` only on a personal link that expires within 72 hours
  (`expiresInDays` ≤ 3, default 3). Also enforced by a database `CHECK`.
- **The token is shown once.** Only `sha256(token)` is stored, so `token` is in the create response and nowhere else.
  A lost link is revoked and replaced. Tokens are 43 base64url characters.
- **The token travels in the request body**, never in an API URL (it would end up in access logs and caches).
- **One answer for every unusable link.** Unknown, malformed, revoked, expired, used up, or created by someone who is no
  longer a workspace admin of that workspace: `404 NOT_FOUND` with the same body, byte for byte:
  `"This invite link is invalid or has expired. Ask your admin for a new one."`
- **Accepting** ignores any `Authorization` header. A personal link only accepts its own email (case-insensitive),
  otherwise `403` "This invite is for a different email address.". An email that already has an account answers
  `409 EMAIL_TAKEN` "An account already exists for this email. Sign in instead." (users belong to one office).
  Name 1–120 chars (trimmed); password at least 10 characters, at most 72 bytes in UTF-8 (bcrypt's limit), not the email.
- **Concurrency.** Accepts of the same link are serialized on the invitation row: a link never goes past `maxUses`.
- Invitation responses (errors included) carry `Cache-Control: no-store`. Another workspace's office answers `404`.

```ts
interface InvitationSummary {
  id: number;
  kind: "personal" | "team";
  label: string | null;
  role: Role;
  email: string | null;                 // personal links
  maxUses: number; useCount: number;
  expiresAt: string; revokedAt: string | null;
  createdBy: { id: number; name: string } | null;
  createdAt: string;
  status: "Active" | "Expired" | "Revoked" | "UsedUp";   // Revoked > UsedUp > Expired
}

interface InvitationPreview {           // names only, no ids
  workspace: { name: string };
  office: { name: string };
  role: Role;
  email: string | null;                 // set when the link is for one email
  expiresAt: string;
}
```

### Holidays
Source: Google Calendar's public religious-holiday calendars (iCalendar feeds), read by the server and cached for 12h per container.
`from` / `to` are calendar dates (`2026-10-01`), both inclusive, at most 400 days apart. `calendars` is a comma list of
`jewish`, `christian`, `muslim`, `hindu` (none: no holidays, only the list of calendars). A feed that can't be reached
doesn't fail the request; it's listed in `unavailable`.

```ts
interface Holiday {
  calendar: "jewish" | "christian" | "muslim" | "hindu";
  name: string;
  startDate: string; endDate: string;   // "2026-10-03", inclusive, no time zone
  tentative: boolean;                   // date depends on a moon sighting (Islamic calendar)
}
```

## Demo accounts (seeded, password `demo1234`)
The login screen shows one card per role (Acme · Tel Aviv):
| Name | Email | Role | Office |
|---|---|---|---|
| Lina Haddad | `lina@acme.io` | Requester | Acme · Tel Aviv (`Asia/Jerusalem`) |
| Omar Benali | `omar@acme.io` | Validator | Acme · Tel Aviv |
| Noa Levi | `noa@acme.io` | WorkspaceAdmin | Acme · Tel Aviv |

Also seeded: the rest of the Tel Aviv team from the prototype (`sara@`, `mehdi@`, `julia@`, `tom@`, `aya@`, `diego@acme.io`),
a Pending trip (Julia with Lina and Tom, so Lina sees "Added by Julia" and Omar can approve it all at once),
an Acme · Paris office (`Europe/Paris`), and a separate Globex workspace with a Montreal office (`America/Toronto`) to demonstrate tenant isolation.
