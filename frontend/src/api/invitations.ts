import { http } from './http';
import type {
  AcceptInvitationForm,
  CreateInvitationPayload,
  CreatedInvitation,
  InvitationPreview,
  InvitationSummary,
  LoginResponse,
} from './types';

// ---- Workspace admins: links of any office of their workspace -----------------

/** The response is the only time the link's token is available. */
export async function createInvitation(officeId: number, payload: CreateInvitationPayload): Promise<CreatedInvitation> {
  const { data } = await http.post<CreatedInvitation>(`/offices/${officeId}/invitations`, payload);
  return data;
}

/** Newest first, including expired, revoked and used-up links. */
export async function listInvitations(officeId: number): Promise<InvitationSummary[]> {
  const { data } = await http.get<InvitationSummary[]>(`/offices/${officeId}/invitations`);
  return data;
}

/** Idempotent. */
export async function revokeInvitation(officeId: number, invitationId: number): Promise<void> {
  await http.delete(`/offices/${officeId}/invitations/${invitationId}`);
}

// ---- Public: the join page --------------------------------------------------
// The token travels in the body, never in an API URL. The join page renders every error itself.

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const { data } = await http.post<InvitationPreview>(
    '/invitations/preview',
    { token },
    { skipAuthRedirect: true, skipErrorToast: true },
  );
  return data;
}

/** Creates the account and returns a session, like `POST /auth/login`. */
export async function acceptInvitation(token: string, form: AcceptInvitationForm): Promise<LoginResponse> {
  const { data } = await http.post<LoginResponse>(
    '/invitations/accept',
    { token, ...form },
    { skipAuthRedirect: true, skipErrorToast: true },
  );
  return data;
}
