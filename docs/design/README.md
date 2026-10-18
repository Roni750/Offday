# Handoff: Offday — Vacation Request Manager

## Overview
Backoffice web app for managing vacation requests, with two roles:
- **Requester** — submits time-off requests, tracks their status, sees the team calendar.
- **Validator** — reviews all requests (filter by status/user, paginated), approves/rejects (comment required on reject), sees analytics + team calendar.

Target stack (from the assignment): **Vue 3 + Vue Router + Axios + Tailwind CSS**, Node.js backend, PostgreSQL/TypeORM, command/event architecture.

## About the Design Files
`Offday.dc.html` is a **design reference built in HTML** — a working prototype showing intended look and behavior, not production code. Open it in a browser (keep `support.js` next to it). Recreate it in Vue + Tailwind using reusable components; do not ship the HTML. All data in the prototype is mocked in the logic class at the bottom of the file (`SEED`, `USERS`) — that's a good reference for seed data.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and copy are final. Recreate closely with Tailwind (extend the theme with the tokens below).

---

## Design Tokens

### Colors
| Token | Value | Use |
|---|---|---|
| canvas | `#F3F2EE` | App background, segmented-control track |
| surface | `#FFFFFF` | Cards, drawer, modal |
| surface-subtle | `#FBFAF8` | Table header rows, input backgrounds, summary box header |
| row-hover | `#FCFBF9` | Table row hover |
| weekend | `#F8F7F4` (cells) / `#F3F2EE` (header) | Calendar weekend columns |
| border | `#E7E5DF` | Card borders |
| border-input | `#E1DFD8` | Inputs, secondary buttons |
| divider | `#EEECE6` | Row dividers inside cards |
| ink | `#17171A` | Primary text, primary buttons, approved bars |
| ink-hover | `#2A2A30` | Primary button hover |
| text-2 | `#55555C` | Secondary text |
| text-3 | `#6B6B72` | Descriptions |
| muted | `#8A8A90` | Labels, mono metadata |
| placeholder | `#A6A6AE` | "No reason given", weekend day numbers |
| accent (lime) | `oklch(0.91 0.17 122)` | Hero KPI card, logo mark, LIVE badge, "Out now" chip |
| accent-tint | `oklch(0.96 0.06 122)` | Current-month chart track |
| accent-row | `oklch(0.985 0.02 122)` | "You" row in the team calendar |
| nav-active-mark | `oklch(0.75 0.17 122)` | Active nav dot (inactive: `#C9C7C0`) |

Status pills (bg / text / dot):
- **Pending**: `oklch(0.95 0.05 85)` / `oklch(0.47 0.11 70)` / `oklch(0.75 0.15 75)`
- **Approved**: `oklch(0.95 0.045 150)` / `oklch(0.44 0.11 150)` / `oklch(0.66 0.15 150)`
- **Rejected**: `oklch(0.95 0.035 25)` / `oklch(0.5 0.15 25)` / `oklch(0.64 0.18 25)`
- Error text `oklch(0.5 0.15 25)`, error border `oklch(0.6 0.17 25)`, rejection comment box `oklch(0.975 0.015 25)`, destructive button `oklch(0.55 0.17 25)` (hover `oklch(0.5 0.17 25)`).
- Chart segments: Approved `#17171A`, Pending `oklch(0.8 0.15 80)`, Rejected `oklch(0.8 0.08 25)`.
- Pending calendar bar: `repeating-linear-gradient(135deg, oklch(0.75 0.15 75) 0 2px, oklch(0.93 0.07 85) 2px 5px)`.
- Avatars: initials on `oklch(0.92 0.045 H)` with text `oklch(0.38 0.09 H)`; a hue H per user (300, 120, 20, 230, 60, 180, 340, 90).

### Typography
- **Geist** (400/500/600/700) for UI; **Geist Mono** (400/500) for dates, counts, labels, metadata. Both from Google Fonts.
- Page title 28px/600, letter-spacing −0.03em. Login title 30px/600.
- KPI numbers 40–48px/600, −0.04em, line-height 1. Card numbers 28px/600.
- Card titles 16px/600, −0.01em. Drawer/modal titles 20px/600, −0.02em.
- Body 14px; secondary 13px; meta 12px.
- Eyebrow / table headers: Geist Mono 11px, uppercase, letter-spacing .05–.06em, color muted.

### Radii, spacing, shadows
- Radii: cards 16px, login shell 20px, modal 18px, buttons/inputs 10px, small buttons 8px, pills 999px, calendar bars 6px.
- Spacing: main padding 24px 32px; card padding 20px; grid gaps 14px; table cell gap 14–16px; row padding 12–14px 20px.
- Shadows: active nav/tab `0 1px 2px rgba(23,23,26,.05–.08)`; toasts `0 12px 40px rgba(23,23,26,.14)`; drawer `-20px 0 60px rgba(23,23,26,.12)`; modal `0 24px 70px rgba(23,23,26,.2)`.
- Overlays: `rgba(23,23,26,.28)` (drawer), `.32` (modal).

### Controls
- Primary button: ink background, white text, 40px tall (44 on login), 0 16px padding, radius 10, weight 500.
- Secondary button: white background, `#E1DFD8` border, hover border ink.
- Segmented tabs: `#F3F2EE` track with 3px padding; active tab white with shadow; each tab shows its count in Geist Mono 11px.

---

## Screens

### 1. Login (`/login`)
Centered card (max-width 1040, 2 columns that wrap below 680px).
- **Left (form):** logo (28px ink square with a 10px lime inner square, plus "Offday"), the title "Sign in", Email, Password and a primary **Sign in** button. An error appears inline below the fields.
- **Demo accounts:** two cards below the form, "Lina Haddad · Requester" and "Omar Benali · Validator". Clicking one signs in directly. Password `demo1234`.
- **Right panel:** ink background with the headline "Time off, without the email thread." and three sample request rows with status pills.

### 2. App shell
- **Sidebar:** 236px wide and sticky. It has the logo, then the "{Role} workspace" eyebrow and nav items (38px tall, active item white with a border). At the bottom are the user card and **Sign out**.
  - Requester nav: My requests, Team calendar.
  - Validator nav: Overview, Requests (with an ink badge showing the pending count), Team calendar.
- **Header:** mono date line plus the page title. On the right is the context action:
  - Requester: **+ New request**.
  - Validator on Overview: **Review N pending**.

### 3. My requests (Requester, `/requests/mine`)
- **KPI row:** auto-fit grid, minimum 240px per card.
  1. **Leave balance:** lime card showing days left out of a 25-day allowance. Its stacked bar shows used days (ink) and pending days (hatched).
  2. **Next time off:** dates, working-day count, how many days away, and a status pill.
  3. **Awaiting decision:** pending count and the number of days requested.
- **Requests card:** status tabs (All/Pending/Approved/Rejected with counts). The table has columns Dates, Days, Reason, Submitted, Status and Action.
  - Pending rows: **Withdraw**.
  - Approved rows: "Locked", because approved requests can't be modified.
  - Rejected rows: **New dates** (reopens the form with the reason pre-filled), plus the validator's comment in a red-tinted box.
- On narrow screens the table scrolls horizontally (min-width 820).

### 4. New request drawer
Right-side drawer, 460px wide.
- **Fields:**
  - **Start:** date plus a time (default 09:00, 15-minute steps).
  - **End:** date plus a time (default 18:00).
  - **Reason:** optional, 240 characters max, with a counter.
- **Validation:** shown live once a field is filled, and for all fields on submit.
  - Start can't be in the past.
  - End must be after start, including the time (same-day partial requests are allowed).
  - Can't overlap the user's own Pending/Approved requests. The error names the conflicting request.
- **Summary box:** working days (or hours for same-day requests), the period with times, balance after approval (red if negative), and which teammates are off in that period.
- **Buttons:** Cancel and **Submit request**. Submitting adds a Pending request and shows a success toast; failed validation shows an error toast.

### 5. Overview (Validator, `/dashboard`)
- **4 KPIs:**
  - Awaiting review: lime card, with the date of the oldest submission.
  - Approval rate: approved ÷ decided.
  - Approved days in 2026, and how many people they cover.
  - People out in the next 14 days, out of the team size.
- **Requested days by month:** stacked bars for Jul–Dec by status, with the current month highlighted. Next to it is **Upcoming absences**: approved requests in the next 3 weeks, each with an "Out now" or "In Nd" chip. The two sit in a flex-wrap row (2:1).
- **Needs your decision:** the 4 pending requests with the soonest start dates, with Reject and Approve buttons, plus **View all**.

### 6. Requests (Validator, `/requests`)
- **Filter bar:**
  - Status tabs with counts; counts respect the user filter.
  - Employee `<select>`.
  - **Reset** link, shown when any filter is active.
  - Default filter is Pending.
- **Table:** Employee (avatar, name, email), Dates (plus an amber "X is off" / "N others off" warning when approved teammates overlap), Days, Reason, Submitted, Status and Decision.
  - Pending rows get **Reject** and **Approve**; decided rows show "on {date}".
  - Rejection comments appear under the row.
  - Sort order: pending first, then newest first.
- **Pagination:** "Showing a–b of n", Prev, page numbers (active page has an ink background) and Next. Page size 6.

### 7. Reject modal
480px wide. It shows a summary of the request (avatar, dates, days, reason) and a **Comment (Required)** textarea. Submitting it empty adds a red border, an inline error and an error toast. The destructive **Reject request** button sits next to Cancel.

### 8. Team calendar (both roles, `/team`)
- **Toolbar:** ‹ › month navigation, the month label, a **Today** button, a legend (Approved solid ink, Pending hatched amber) and the total approved days for the month.
- **Grid:**
  - The left column (200px) shows avatar, name, and "N days off" for that month.
  - Day columns use `flex:1`. Weekends are shaded, and today's column has an ink day number and a vertical line.
  - Bars span consecutive days, with rounded ends only at the start and end. Rejected requests are hidden.
  - For requesters, their own row is pinned first and tinted, with "(you)" after the name.
- Scrolls horizontally below 880px.

### 9. Toasts (global)
- **Placement:** stacked bottom-right, 380px wide, at most 4 at once, each with a × to dismiss.
- **Timing:** auto-dismiss after 4.5s; errors after 6.5s; live toasts after 9s.
- **Variants:**
  - success: green dot.
  - error: red dot.
  - info: grey dot.
  - live: ink card with a lime "LIVE" badge and an optional lime action button such as "Review". Meant for socket or server-push events, e.g. `VacationRequestApprovedEvent` → notify the requester, `VacationRequestCreatedEvent` → notify validators.
- Use one global toast store (Pinia/composable), fed by Axios interceptors for API errors and by event/socket listeners.

---

## Interactions & Business Rules
1. End must be after start.
2. No overlap with the same user's Pending/Approved requests.
3. Approved requests can't be modified (no withdraw or edit, shown as "Locked").
4. No requests in the past.
5. Rejecting requires a comment, enforced in the UI and on the API.
6. Only validators see the Overview/Requests routes and approve/reject actions. Use route guards on role and RBAC on the API.
- Working days skip Saturday and Sunday. Allowance is 25 days per year.

## Suggested Vue components
`AppShell`, `SidebarNav`, `PageHeader`, `KpiCard`, `StatusPill`, `Avatar`, `SegmentedTabs`, `DataTable` (+ `Pagination`), `RequestFormDrawer`, `RejectDialog`, `TeamCalendar`, `MonthlyBarChart`, `ToastStack` (+ `useToast`).

## State
- `auth`: user, role, token (JWT).
- `requests`: list plus filters `{status, userId, page, pageSize}`. The server returns `{items, total, page, pageSize}`.
- UI: drawer open, form, touched; reject target and comment; calendar month offset; toasts[].

## Assets
None. No images or icon fonts are used. The logo mark is two CSS squares; fonts come from Google Fonts (Geist, Geist Mono).

## Files
- `Offday.dc.html`: the full prototype (all screens, mock data and logic in the `<script data-dc-script>` block).
- `support.js`: the runtime needed to open the prototype in a browser.
