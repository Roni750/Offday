import { http } from './http';
import type {
  MineQuery,
  Paginated,
  RequestPayload,
  ReviewPage,
  ReviewQuery,
  SavedRequest,
  StatusCounts,
  VacationRequest,
  WithdrawScope,
} from './types';

// ---- Own requests (all roles) ------------------------------------------------

/** Own requests with tab counts (counts ignore the status filter). */
export type MinePage = Paginated<VacationRequest> & { counts: StatusCounts };

export async function listMyRequests(query: MineQuery = {}): Promise<MinePage> {
  const { data } = await http.get<MinePage>('/requests/mine', { params: query });
  return data;
}

/** Alone, or with `colleagueIds` (a trip). `warnings` lists colleagues whose pending plans overlap. */
export async function createRequest(payload: RequestPayload): Promise<SavedRequest> {
  const { data } = await http.post<SavedRequest>('/requests', payload);
  return data;
}

/** Edit an own Pending request; a trip's organizer moves everyone's dates. */
export async function updateRequest(id: number, payload: RequestPayload): Promise<SavedRequest> {
  const { colleagueIds: _ignored, ...body } = payload;
  const { data } = await http.put<SavedRequest>(`/requests/${id}`, body);
  return data;
}

/** Withdraw an own Pending request (or leave a trip). `group`: cancel the trip for everyone still pending. */
export async function withdrawRequest(id: number, scope: WithdrawScope = 'self'): Promise<void> {
  await http.delete(`/requests/${id}`, { params: scope === 'group' ? { scope } : undefined });
}

// ---- Review (Validator, WorkspaceAdmin) -----------------------------------------

/** Office requests, Pending first then newest, with tab counts. */
export async function listOfficeRequests(query: ReviewQuery = {}): Promise<ReviewPage> {
  const { data } = await http.get<ReviewPage>('/requests', { params: query });
  return data;
}

export async function approveRequest(id: number): Promise<VacationRequest> {
  const { data } = await http.post<VacationRequest>(`/requests/${id}/approve`);
  return data;
}

export async function rejectRequest(id: number, comment: string): Promise<VacationRequest> {
  const { data } = await http.post<VacationRequest>(`/requests/${id}/reject`, { comment });
  return data;
}

/** Approve every Pending request of a trip at once. Returns the rows that were approved. */
export async function approveGroup(groupId: number): Promise<VacationRequest[]> {
  const { data } = await http.post<VacationRequest[]>(`/groups/${groupId}/approve`);
  return data;
}

/** Reject every Pending request of a trip with one comment. Returns the rows that were rejected. */
export async function rejectGroup(groupId: number, comment: string): Promise<VacationRequest[]> {
  const { data } = await http.post<VacationRequest[]>(`/groups/${groupId}/reject`, { comment });
  return data;
}
