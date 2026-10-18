import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { INVITE_TOKEN_PATTERN, generateInviteToken, hashInviteToken, isWellFormedInviteToken } from "./inviteTokens";

describe("invite tokens", () => {
	it("are 43 base64url characters (32 random bytes)", () => {
		const token = generateInviteToken();
		expect(token).toHaveLength(43);
		expect(token).toMatch(INVITE_TOKEN_PATTERN);
		expect(Buffer.from(token, "base64url")).toHaveLength(32);
	});

	it("are unique", () => {
		const tokens = new Set(Array.from({ length: 500 }, generateInviteToken));
		expect(tokens.size).toBe(500);
	});

	it("accept only the exact format", () => {
		const token = generateInviteToken();
		expect(isWellFormedInviteToken(token)).toBe(true);
		expect(isWellFormedInviteToken(token.slice(1))).toBe(false);
		expect(isWellFormedInviteToken(`${token}A`)).toBe(false);
		expect(isWellFormedInviteToken(`${token.slice(1)}=`)).toBe(false);
		expect(isWellFormedInviteToken(`${token.slice(1)}+`)).toBe(false);
		expect(isWellFormedInviteToken(` ${token.slice(1)}`)).toBe(false);
		expect(isWellFormedInviteToken(undefined)).toBe(false);
		expect(isWellFormedInviteToken(42)).toBe(false);
		expect(isWellFormedInviteToken({ token })).toBe(false);
	});

	it("hash to the 32-byte sha256 digest, deterministically", () => {
		const token = generateInviteToken();
		const hash = hashInviteToken(token);
		expect(hash).toHaveLength(32);
		expect(hash.equals(createHash("sha256").update(token).digest())).toBe(true);
		expect(hash.equals(hashInviteToken(token))).toBe(true);
		expect(hash.equals(hashInviteToken(generateInviteToken()))).toBe(false);
	});
});
