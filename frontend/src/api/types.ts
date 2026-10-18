/**
 * Types mirroring docs/api-contract.md one to one.
 * All timestamps are ISO 8601 strings; the server returns UTC (`...Z`).
 */

export const ROLES = ['Requester', 'Validator', 'WorkspaceAdmin'] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export type Status = (typeof STATUSES)[number];

export interface Office {
  id: number;
  name: string;
  timezone: string;
  /** Working days as ISO weekdays (1 = Monday ... 7 = Sunday). */
  workDays: number[];
}

export interface Workspace {
  id: number;
  name: string;
}

export interface Me {
  id: number;
  name: string;
  email: string;
  role: Role;
  office: Office;
  workspace: Workspace;
}

export interface UserSummary {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface VacationRequest {
  id: number;
  user: { id: number; name: string; email: string };
  startDate: string;
  endDate: string;
  reason: string | null;
  status: Status;
  /** Rejection comment. */
  comments: string | null;
  days: number;
  decidedBy: { id: number; name: string } | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StatusCounts {
  all: number;
  Pending: number;
  Approved: number;
  Rejected: number;
}

/** `GET /requests` (review list) also returns tab counts that respect `userId`. */
export interface ReviewPage extends Paginated<VacationRequest> {
  counts: StatusCounts;
  /** Pending requests the caller can decide (excludes their own). */
  awaitingMyReview: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface MineQuery extends PageQuery {
  status?: Status;
}

export interface ReviewQuery extends PageQuery {
  status?: Status;
  userId?: number;
}

export interface LoginResponse {
  token: string;
  user: Me;
}

export interface Balance {
  year: number;
  allowance: number;
  usedDays: number;
  pendingDays: number;
  /** Pending requests starting in `year`. */
  pendingRequests: number;
  remainingDays: number;
}

/** Body of `POST /requests` and `PUT /requests/:id`. Times carry the office offset. */
export interface RequestPayload {
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface MonthlyStat {
  /** `"2026-07"` */
  month: string;
  approved: number;
  pending: number;
  rejected: number;
}

export interface Overview {
  pendingCount: number;
  oldestPendingCreatedAt: string | null;
  /** approved / decided, 0..1 */
  approvalRate: number | null;
  approvedDays: number;
  approvedPeople: number;
  outNext14Days: number;
  teamSize: number;
  monthly: MonthlyStat[];
}

export interface TeamCalendar {
  users: UserSummary[];
  /** Pending + Approved requests overlapping the range. */
  requests: VacationRequest[];
}

export interface OfficeDetails extends Office {
  workspace: Workspace;
}

/** `GET /workspace/offices`: an office of the caller's workspace with its headcount. */
export interface WorkspaceOffice extends OfficeDetails {
  people: { total: number } & Record<Role, number>;
  /** The caller's own office. */
  isMine: boolean;
}

export const HOLIDAY_CALENDAR_IDS = ['jewish', 'christian', 'muslim', 'hindu'] as const;
export type HolidayCalendarId = (typeof HOLIDAY_CALENDAR_IDS)[number];

export interface Holiday {
  calendar: HolidayCalendarId;
  name: string;
  /** Calendar dates (`"2026-10-03"`), both inclusive; holidays have no time zone. */
  startDate: string;
  endDate: string;
  /** The date depends on a moon sighting and may still move (Islamic calendar). */
  tentative: boolean;
}

export interface HolidaysResponse {
  calendars: { id: HolidayCalendarId; label: string }[];
  holidays: Holiday[];
  /** Calendars whose source couldn't be reached right now. */
  unavailable: HolidayCalendarId[];
}

// ---- Errors -----------------------------------------------------------------

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'OVERLAP'
  | 'INVALID_STATE'
  | 'INTERNAL';

export interface OverlapConflict {
  id: number;
  startDate: string;
  endDate: string;
  status: Status;
}

export interface ApiErrorDetails {
  /** VALIDATION_ERROR: field → message. */
  fields?: Record<string, string>;
  /** OVERLAP: the request that clashes. */
  conflict?: OverlapConflict;
  [key: string]: unknown;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: ApiErrorDetails;
  };
}
