import { describe, expect, it } from 'vitest';
import { type InviteFormValues, buildInviteFormSchema, defaultInviteFormValues, expiryChoicesFor, toInviteFieldErrors } from './inviteForm';

const values = (overrides: Partial<InviteFormValues> = {}): InviteFormValues => ({ ...defaultInviteFormValues(), ...overrides });

const validate = (form: InviteFormValues) => {
  const result = buildInviteFormSchema().safeParse(form);
  return { result, errors: result.success ? {} : toInviteFieldErrors(result.error) };
};

describe('invite link form schema', () => {
  it('builds a personal link payload without uses', () => {
    const { result } = validate(values({ email: ' New.Hire@Acme.io ', label: '  ' }));
    expect(result.success && result.data).toEqual({ kind: 'personal', role: 'Requester', email: 'new.hire@acme.io', expiresInDays: 7 });
  });

  it('builds a team link payload without an email', () => {
    const { result } = validate(values({ kind: 'team', email: 'ignored@acme.io', maxUses: '40', label: 'Autumn hires', role: 'Validator' }));
    expect(result.success && result.data).toEqual({ kind: 'team', role: 'Validator', maxUses: 40, expiresInDays: 7, label: 'Autumn hires' });
  });

  it('requires a valid email on a personal link', () => {
    expect(validate(values()).errors.email).toBe('Enter the email this link is for');
    expect(validate(values({ email: 'nope' })).errors.email).toBe('Enter a valid email address');
  });

  it('keeps team uses between 1 and 200', () => {
    for (const maxUses of ['', '0', '201', '2.5', 'many']) {
      expect(validate(values({ kind: 'team', maxUses })).errors.maxUses).toMatch(/1 to 200/);
    }
    expect(validate(values({ kind: 'team', maxUses: '200' })).result.success).toBe(true);
  });

  it('only allows workspace admin links as personal links within 72 hours', () => {
    expect(validate(values({ kind: 'team', role: 'WorkspaceAdmin' })).errors.role).toMatch(/personal/);
    expect(validate(values({ role: 'WorkspaceAdmin', email: 'boss@acme.io', expiresInDays: 7 })).errors.expiresInDays).toMatch(/72 hours/);
    expect(validate(values({ role: 'WorkspaceAdmin', email: 'boss@acme.io', expiresInDays: 3 })).result.success).toBe(true);
    expect(expiryChoicesFor('WorkspaceAdmin')).toEqual([1, 3]);
    expect(expiryChoicesFor('Requester')).toEqual([1, 7, 14, 30]);
  });

  it('limits the label to 80 characters', () => {
    expect(validate(values({ email: 'a@acme.io', label: 'x'.repeat(81) })).errors.label).toMatch(/80/);
  });
});
