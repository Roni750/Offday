import { z } from 'zod';
import type { CreateInvitationPayload, InvitationKind, Role } from '@/api/types';

/**
 * Client-side rules for the "New invite link" form. They mirror the API and the database constraints:
 * personal links are for one email and single use, team links have 1–200 uses, links expire within 30 days,
 * and a workspace admin link must be personal and expire within 72 hours.
 */

export const MAX_USES = 200;
export const DEFAULT_TEAM_USES = 25;
export const LABEL_MAX = 80;
export const EXPIRY_DAYS = [1, 7, 14, 30] as const;
export const ADMIN_EXPIRY_DAYS = [1, 3] as const;
export const DEFAULT_EXPIRY_DAYS = 7;
export const ADMIN_MAX_DAYS = 3;

export interface InviteFormValues {
  kind: InvitationKind;
  role: Role;
  email: string;
  /** Text from the number input; parsed by the schema. */
  maxUses: string;
  expiresInDays: number;
  label: string;
}

export type InviteFormField = keyof InviteFormValues;
export type InviteFormErrors = Partial<Record<InviteFormField, string>>;

export const defaultInviteFormValues = (): InviteFormValues => ({
  kind: 'personal',
  role: 'Requester',
  email: '',
  maxUses: String(DEFAULT_TEAM_USES),
  expiresInDays: DEFAULT_EXPIRY_DAYS,
  label: '',
});

/** The expiry choices for a role: admin links can't outlive 72 hours. */
export const expiryChoicesFor = (role: Role): readonly number[] => (role === 'WorkspaceAdmin' ? ADMIN_EXPIRY_DAYS : EXPIRY_DAYS);

export function buildInviteFormSchema() {
  return z
    .object({
      kind: z.enum(['personal', 'team']),
      role: z.enum(['Requester', 'Validator', 'WorkspaceAdmin']),
      email: z.string().trim().toLowerCase().max(254, 'Keep the email to 254 characters or fewer'),
      maxUses: z.string().trim(),
      expiresInDays: z.number().int().min(1).max(30, 'Links expire within 30 days'),
      label: z.string().trim().max(LABEL_MAX, `Keep the label to ${LABEL_MAX} characters or fewer`),
    })
    .transform((values, ctx): CreateInvitationPayload => {
      const personal = values.kind === 'personal';
      const payload: CreateInvitationPayload = { kind: values.kind, role: values.role, expiresInDays: values.expiresInDays };
      if (values.label) payload.label = values.label;

      if (personal) {
        if (!values.email) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter the email this link is for' });
        else if (!z.email().safeParse(values.email).success) {
          ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address' });
        } else payload.email = values.email;
      } else {
        const uses = Number(values.maxUses);
        if (!values.maxUses || !Number.isInteger(uses) || uses < 1 || uses > MAX_USES) {
          ctx.addIssue({ code: 'custom', path: ['maxUses'], message: `Enter a whole number from 1 to ${MAX_USES}` });
        } else payload.maxUses = uses;
      }

      if (values.role === 'WorkspaceAdmin') {
        if (!personal) ctx.addIssue({ code: 'custom', path: ['role'], message: 'Workspace admin links must be personal: one email, used once' });
        if (values.expiresInDays > ADMIN_MAX_DAYS) {
          ctx.addIssue({ code: 'custom', path: ['expiresInDays'], message: 'Workspace admin links expire within 72 hours (3 days)' });
        }
      }
      return payload;
    });
}

/** First message per field, in schema order. */
export function toInviteFieldErrors(error: z.ZodError): InviteFormErrors {
  const errors: InviteFormErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as InviteFormField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
