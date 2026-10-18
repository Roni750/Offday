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
  | 409 | `OVERLAP` | Overlaps the caller's Pending/Approved request; `details.conflict` = `{ id, startDate, endDate, status }` |
  | 409 | `INVALID_STATE` | E.g. modifying an approved request, deciding an already-decided one |
  | 500 | `INTERNAL` | Generic message, no internals |

## Roles and tenancy

Workspace (company) → Offices → Users. Vacation requests are scoped to the **caller's office**; there is no cross-office access to requests.
Workspace admins administer **every office of their workspace** (time zone, work week, roles). The workspace is the hard tenant boundary: anything in another workspace answers `404`.

| Capability | Requester | Validator | WorkspaceAdmin |
|---|---|---|---|
| Submit / edit / withdraw own Pending requests | ✅ | ✅ | ✅ |
| Team calendar | ✅ | ✅ | ✅ |
| See all office requests, approve / reject (not their own) | | ✅ | ✅ |
| Overview stats | | ✅ | ✅ |
| Religious holidays next to the team calendar | | ✅ | ✅ |
| Change user roles, office time zone and work week (any office of the workspace) | | | ✅ |

## Business rules (enforced by the API; the UI mirrors them for UX)

1. `endDate` > `startDate` (same-day partial requests allowed, e.g. a half day). Times on 15-minute steps (`:00`, `:15`, `:30`, `:45`).
2. No overlap with the user's own Pending/Approved requests. Touching is allowed (13:00 end / 13:00 start).
3. Approved and rejected requests can't be modified or withdrawn.
4. The start must be on an office-local date **after today** (today itself isn't allowed).
5. Reject requires a non-empty `comment`.
6. Only Validator/WorkspaceAdmin can approve/reject, only within their office, never their own requests.
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
  createdAt: string; updatedAt: string;
}
```

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
| POST | `/requests` | `{ startDate, endDate, reason? }` | `201 VacationRequest` |
| PUT | `/requests/:id` | `{ startDate, endDate, reason? }` | `VacationRequest` (own, Pending only) |
| DELETE | `/requests/:id` | | `204` withdraw (own, Pending only) |

### Review (Validator, WorkspaceAdmin)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/requests?status=&userId=&page=&pageSize=` | | `Paginated<VacationRequest>` for the office; Pending first, then newest. Response also has `counts: { all, Pending, Approved, Rejected }` respecting `userId`, and `awaitingMyReview` (Pending requests the caller can decide, i.e. not their own) |
| POST | `/requests/:id/approve` | | `VacationRequest` |
| POST | `/requests/:id/reject` | `{ comment }` | `VacationRequest` |
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
| GET | `/holidays?from=&to=&calendars=` | | `{ calendars: { id, label }[], holidays: Holiday[], unavailable: HolidayCalendarId[] }` (Validator, WorkspaceAdmin; see below) |

### Workspace administration (WorkspaceAdmin)
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/workspace/offices` | | `WorkspaceOffice[]`, by name: GET `/office` shape plus `people: { total, Requester, Validator, WorkspaceAdmin }` and `isMine` |
| GET | `/offices/:id` | | same as GET `/office`, for any office of the workspace |
| GET | `/offices/:id/users` | | `UserSummary[]` |
| PUT | `/offices/:id/timezone` | `{ timezone }` | same as PUT `/office/timezone` |
| PUT | `/offices/:id/work-week` | `{ workDays }` | same as PUT `/office/work-week` |

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
an Acme · Paris office (`Europe/Paris`), and a separate Globex workspace with a Montreal office (`America/Toronto`) to demonstrate tenant isolation.
