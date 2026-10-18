/**
 * Domain errors carry their HTTP meaning, so every layer can throw them and the entry point maps them
 * to a response in one place (see http/respond.ts). The shape matches docs/api-contract.md.
 */
export abstract class DomainError extends Error {
	abstract readonly status: number;
	abstract readonly code: string;

	constructor(message: string, readonly details?: Record<string, unknown>) {
		super(message);
		this.name = new.target.name;
	}
}

export class ValidationError extends DomainError {
	readonly status = 400;
	readonly code = "VALIDATION_ERROR";

	constructor(message: string, fields?: Record<string, string>) {
		super(message, fields ? { fields } : undefined);
	}
}

export class UnauthenticatedError extends DomainError {
	readonly status = 401;
	readonly code = "UNAUTHENTICATED";
}

export class ForbiddenError extends DomainError {
	readonly status = 403;
	readonly code = "FORBIDDEN";
}

export class NotFoundError extends DomainError {
	readonly status = 404;
	readonly code = "NOT_FOUND";
}

/** The request overlaps another Pending/Approved request of the same user. */
export class OverlapError extends DomainError {
	readonly status = 409;
	readonly code = "OVERLAP";
}

/** An account already exists for this email (emails are unique across all workspaces). */
export class EmailTakenError extends DomainError {
	readonly status = 409;
	readonly code = "EMAIL_TAKEN";
}

/** The action isn't allowed in the resource's current state (e.g. modifying an approved request). */
export class InvalidStateError extends DomainError {
	readonly status = 409;
	readonly code = "INVALID_STATE";
}
