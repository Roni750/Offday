import { Response } from "commoneventframework";
import { DomainError } from "../core/errors";

/** Maps any thrown error to the contract's error format. Unknown errors never leak internals. */
export const toErrorResponse = (err: unknown): Response => {
	if (err instanceof DomainError) {
		return new Response(err.status, { error: { code: err.code, message: err.message, details: err.details } });
	}
	console.error("Unhandled error", err);
	return new Response(500, { error: { code: "INTERNAL", message: "Something went wrong" } });
};
