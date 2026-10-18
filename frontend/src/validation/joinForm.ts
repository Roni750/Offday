import { z } from 'zod';
import type { AcceptInvitationForm } from '@/api/types';

/**
 * Client-side rules for creating an account through an invite link. They mirror the API's
 * (`POST /invitations/accept`) so the form explains problems before submitting; the API still checks everything.
 */

export const NAME_MAX = 120;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 10;
/** bcrypt only uses the first 72 bytes, so longer passwords are refused rather than silently cut. */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters, and not your email address.`;

/** Invite tokens are 32 random bytes in base64url. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type JoinFormValues = AcceptInvitationForm;
export type JoinFormField = keyof JoinFormValues;
export type JoinFormErrors = Partial<Record<JoinFormField, string>>;

export const utf8Length = (value: string): number => new TextEncoder().encode(value).length;

export function buildJoinFormSchema() {
  return z
    .object({
      name: z.string().trim().min(1, 'Enter your name').max(NAME_MAX, `Keep your name to ${NAME_MAX} characters or fewer`),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .min(1, { message: 'Enter your email address', abort: true })
        .max(EMAIL_MAX, `Keep the email to ${EMAIL_MAX} characters or fewer`)
        .pipe(z.email('Enter a valid email address')),
      password: z
        .string()
        .min(1, { message: 'Choose a password', abort: true })
        .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
        .refine((value) => utf8Length(value) <= PASSWORD_MAX_BYTES, 'Too long: keep it to 72 characters (fewer with accents or emoji)'),
    })
    .superRefine((values, ctx) => {
      if (values.password && values.password.trim().toLowerCase() === values.email) {
        ctx.addIssue({ code: 'custom', path: ['password'], message: "Your password can't be your email address" });
      }
    })
    .transform((values): AcceptInvitationForm => values);
}

/** First message per field, in schema order. */
export function toFieldErrors(error: z.ZodError): JoinFormErrors {
  const errors: JoinFormErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as JoinFormField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
