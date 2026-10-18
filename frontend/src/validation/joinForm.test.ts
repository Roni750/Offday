import { describe, expect, it } from 'vitest';
import { INVITE_TOKEN_PATTERN, type JoinFormValues, buildJoinFormSchema, toFieldErrors, utf8Length } from './joinForm';

const values = (overrides: Partial<JoinFormValues> = {}): JoinFormValues => ({
  name: 'Zoé Martin',
  email: 'zoe@acme.io',
  password: 'correct horse battery',
  ...overrides,
});

const validate = (form: JoinFormValues) => {
  const result = buildJoinFormSchema().safeParse(form);
  return { result, errors: result.success ? {} : toFieldErrors(result.error) };
};

describe('join form schema', () => {
  it('accepts a valid form, trimming the name and lowercasing the email', () => {
    const { result } = validate(values({ name: '  Zoé Martin  ', email: '  Zoe@Acme.IO ' }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({ name: 'Zoé Martin', email: 'zoe@acme.io', password: 'correct horse battery' });
  });

  it('requires every field', () => {
    const { errors } = validate({ name: '  ', email: '', password: '' });
    expect(errors).toEqual({ name: 'Enter your name', email: 'Enter your email address', password: 'Choose a password' });
  });

  it('checks the name length and the email format', () => {
    expect(validate(values({ name: 'x'.repeat(121) })).errors.name).toMatch(/120/);
    expect(validate(values({ name: 'x'.repeat(120) })).result.success).toBe(true);
    expect(validate(values({ email: 'not-an-email' })).errors.email).toBe('Enter a valid email address');
    expect(validate(values({ email: `${'a'.repeat(250)}@b.io` })).errors.email).toMatch(/254/);
  });

  it('needs at least 10 characters in the password', () => {
    expect(validate(values({ password: '123456789' })).errors.password).toBe('Use at least 10 characters');
    expect(validate(values({ password: '1234567890' })).result.success).toBe(true);
  });

  it('limits the password to 72 bytes, counting accents and emoji as several', () => {
    expect(utf8Length('é')).toBe(2);
    expect(validate(values({ password: 'é'.repeat(36) })).result.success).toBe(true);
    expect(validate(values({ password: 'é'.repeat(37) })).errors.password).toMatch(/72/);
    expect(validate(values({ password: 'a'.repeat(73) })).errors.password).toMatch(/72/);
  });

  it("refuses the email address as the password, in any letter case", () => {
    const { errors } = validate(values({ email: 'zoe.martin@acme.io', password: 'Zoe.Martin@Acme.io' }));
    expect(errors.password).toBe("Your password can't be your email address");
  });
});

describe('invite token format', () => {
  it('matches 43 base64url characters only', () => {
    expect(INVITE_TOKEN_PATTERN.test('A'.repeat(43))).toBe(true);
    expect(INVITE_TOKEN_PATTERN.test('a-_'.repeat(14) + 'Z')).toBe(true);
    expect(INVITE_TOKEN_PATTERN.test('A'.repeat(42))).toBe(false);
    expect(INVITE_TOKEN_PATTERN.test('A'.repeat(42) + '=')).toBe(false);
    expect(INVITE_TOKEN_PATTERN.test('A'.repeat(42) + '+')).toBe(false);
  });
});
