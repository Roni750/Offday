import jwt from "jsonwebtoken";
import { UnauthenticatedError } from "../core/errors";

const secret = (): string => {
	const value = process.env.JWT_SECRET;
	if (!value) throw new Error("JWT_SECRET is not configured");
	return value;
};

/** The token identifies the user only. Permissions are resolved from the database per request. */
export const signToken = (userId: number): string =>
	jwt.sign({}, secret(), {
		subject: String(userId),
		expiresIn: (process.env.JWT_EXPIRES_IN ?? "8h") as jwt.SignOptions["expiresIn"],
		algorithm: "HS256",
	});

/** Verifies the signature and expiry of a "Bearer <token>" header and returns the user id. Synchronous. */
export const verifyBearer = (authorization: string | undefined): number => {
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	if (!match) throw new UnauthenticatedError("Missing bearer token");

	try {
		const payload = jwt.verify(match[1], secret(), { algorithms: ["HS256"] });
		const userId = Number(typeof payload === "object" ? payload.sub : NaN);
		if (!Number.isInteger(userId)) throw new Error("Invalid subject");
		return userId;
	} catch {
		throw new UnauthenticatedError("Invalid or expired token");
	}
};
