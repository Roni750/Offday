import { http } from './http';
import type { OfficeDetails, Role, TeamCalendar, UserSummary, WorkspaceOffice } from './types';

/** Pending + Approved requests overlapping `[from, to)`. Both are ISO timestamps (sent as UTC). */
/** `quiet`: a background load whose failure the caller handles itself (no error toast). */
export async function getTeamCalendar(from: string, to: string, options: { quiet?: boolean } = {}): Promise<TeamCalendar> {
  const { data } = await http.get<TeamCalendar>('/team/calendar', { params: { from, to }, skipErrorToast: options.quiet });
  return data;
}

/** Validator, WorkspaceAdmin. */
export async function listOfficeUsers(): Promise<UserSummary[]> {
  const { data } = await http.get<UserSummary[]>('/office/users');
  return data;
}

/** WorkspaceAdmin; can't change their own role. */
export async function updateUserRole(id: number, role: Role): Promise<UserSummary> {
  const { data } = await http.put<UserSummary>(`/users/${id}/role`, { role });
  return data;
}

export async function getOffice(): Promise<OfficeDetails> {
  const { data } = await http.get<OfficeDetails>('/office');
  return data;
}

/** WorkspaceAdmin; `timezone` must be a valid IANA zone. */
export async function updateOfficeTimezone(timezone: string): Promise<OfficeDetails> {
  const { data } = await http.put<OfficeDetails>('/office/timezone', { timezone });
  return data;
}

/** Working days as ISO weekdays (1 = Monday ... 7 = Sunday). WorkspaceAdmin only. */
export async function updateOfficeWorkWeek(workDays: number[]): Promise<OfficeDetails> {
  const { data } = await http.put<OfficeDetails>('/office/work-week', { workDays });
  return data;
}

// ---- Workspace administration (WorkspaceAdmin): any office of the caller's workspace ----

export async function listWorkspaceOffices(): Promise<WorkspaceOffice[]> {
  const { data } = await http.get<WorkspaceOffice[]>('/workspace/offices');
  return data;
}

export async function getWorkspaceOffice(officeId: number): Promise<OfficeDetails> {
  const { data } = await http.get<OfficeDetails>(`/offices/${officeId}`);
  return data;
}

export async function listUsersOfOffice(officeId: number): Promise<UserSummary[]> {
  const { data } = await http.get<UserSummary[]>(`/offices/${officeId}/users`);
  return data;
}

export async function updateTimezoneOf(officeId: number, timezone: string): Promise<OfficeDetails> {
  const { data } = await http.put<OfficeDetails>(`/offices/${officeId}/timezone`, { timezone });
  return data;
}

export async function updateWorkWeekOf(officeId: number, workDays: number[]): Promise<OfficeDetails> {
  const { data } = await http.put<OfficeDetails>(`/offices/${officeId}/work-week`, { workDays });
  return data;
}
