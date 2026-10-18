import { createHash, randomBytes } from "node:crypto";

/**
 * Invite tokens: 32 random bytes as base64url (43 characters, 256 bits). Only sha256(token) is stored.
 * With that much entropy a fast hash is enough: there is nothing to brute-force, and a lookup by hash
 * stays an indexed equality match (a salted slow hash like bcrypt couldn't be looked up).
 */

export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const generateInviteToken = (): string => randomBytes(32).toString("base64url");

export const isWellFormedInviteToken = (value: unknown): value is string =>
	typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);

export const hashInviteToken = (token: string): Buffer => createHash("sha256").update(token, "utf8").digest();
