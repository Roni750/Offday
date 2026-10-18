import { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import { z } from "zod";
import { ValidationError } from "../core/errors";
import { verifyBearer } from "../auth/tokens";

/**
 * Helpers for inputParsers ("the front door"). They only look at the incoming request and the clock;
 * anything that needs the database belongs in a command handler. All of them are synchronous,
 * because CEF calls inputParsers without awaiting them.
 */

/**
 * Readable defaults for Zod's built-in checks (instead of e.g. "Too big: expected string to have <=240 characters").
 * Messages set on a schema still take precedence.
 */
z.config({
	customError: (issue) => {
		switch (issue.code) {
			case "invalid_type":
				return issue.input === undefined ? "Required" : `Must be a ${issue.expected}`;
			case "too_small":
				return issue.origin === "string"
					? Number(issue.minimum) <= 1 ? "Can't be empty" : `Must be at least ${issue.minimum} characters`
					: `Must be at least ${issue.minimum}`;
			case "too_big":
				return issue.origin === "string" ? `Must be at most ${issue.maximum} characters` : `Must be at most ${issue.maximum}`;
			case "invalid_value":
				return `Must be one of: ${issue.values.join(", ")}`;
			case "invalid_format":
				return issue.format === "email" ? "Must be a valid email address" : "Invalid format";
			default:
				return undefined;
		}
	},
});

const toFieldErrors = (error: z.ZodError): Record<string, string> => {
	const fields: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path.join(".") || "_";
		fields[key] ??= issue.message;
	}
	return fields;
};

export const validate = <S extends z.ZodType>(schema: S, value: unknown): z.infer<S> => {
	const result = schema.safeParse(value);
	if (!result.success) {
		const fields = toFieldErrors(result.error);
		const entries = Object.entries(fields);
		// One problem: say what it is. Several: point at the fields.
		const message = entries.length === 1 ? (entries[0][0] === "_" ? entries[0][1] : `${entries[0][0]}: ${entries[0][1]}`) : "Some fields are invalid";
		throw new ValidationError(message, fields);
	}
	return result.data;
};

export const bothDates = (a: unknown, b: unknown): boolean => a instanceof Date && b instanceof Date;

export const parseJsonBody = (event: CommonEvent): unknown => {
	if (!event.body) return {};
	const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
	try {
		return JSON.parse(raw);
	} catch {
		throw new ValidationError("Request body must be valid JSON");
	}
};

/** Header names are lowercase on the dev server but can keep their casing on API Gateway / Function URLs. */
export const getHeader = (event: CommonEvent, name: string): string | undefined => {
	const entry = Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
	return entry?.[1];
};

/** Authentication at the front door: verifies the token and returns the caller's id. */
export const authenticate = (event: CommonEvent): number => verifyBearer(getHeader(event, "authorization"));

/**
 * Query parameters. API Gateway and Function URLs deliver them decoded, but CEF's dev server passes them
 * through still URL-encoded (e.g. "%2B03%3A00"), so dev-server events are decoded here.
 */
export const getQuery = (event: CommonEvent): Record<string, string | undefined> => {
	const params = event.queryStringParameters ?? {};
	if (event.version !== "commonEvent") return params;
	const decode = (value: string) => {
		try {
			return decodeURIComponent(value.replace(/\+/g, " "));
		} catch {
			return value;
		}
	};
	return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value === undefined ? value : decode(value)]));
};

export const parseIdParam = (event: CommonEvent, name = "id"): number =>
	validate(z.coerce.number().int().positive(), event.pathParameters?.[name]);

export const pagination = z.object({
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(6),
});
