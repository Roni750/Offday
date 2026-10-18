import { http } from './http';
import type {
  MineQuery,
  Paginated,
  RequestPayload,
  ReviewPage,
  ReviewQuery,
  StatusCounts,
  VacationRequest,
} from './types';

// ---- Own requests (all roles) ------------------------------------------------

/** Own requests with tab counts (counts ignore the status filter). */
export type MinePage = Paginated<VacationRequest> & { counts: StatusCounts };

export async function listMyRequests(query: MineQuery = {}): Promise<MinePage> {
  const { data } = await http.get<MinePage>('/requests/mine', { params: query });
  return data;
}

export async function createRequest(payload: RequestPayload): Promise<VacationRequest> {
  const { data } = await http.post<VacationRequest>('/requests', payload);
  return data;
}

/** Edit an own Pending request. */
export async function updateRequest(id: number, payload: RequestPayload): Promise<VacationRequest> {
  const { data } = await http.put<VacationRequest>(`/requests/${id}`, payload);
  return data;
}

/** Withdraw an own Pending request. */
export async function withdrawRequest(id: number): Promise<void> {
  await http.delete(`/requests/${id}`);
}

// ---- Review (Validator, OfficeAdmin) -----------------------------------------

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
