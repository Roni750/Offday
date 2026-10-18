export enum Role {
	Requester = "Requester",
	Validator = "Validator",
	WorkspaceAdmin = "WorkspaceAdmin",
}

export enum VacationStatus {
	Pending = "Pending",
	Approved = "Approved",
	Rejected = "Rejected",
}

/** Roles allowed to review (approve/reject) requests in their office. */
export const REVIEWER_ROLES: readonly Role[] = [Role.Validator, Role.WorkspaceAdmin];

/** Roles that administer the offices of their workspace (time zone, work week, roles). */
export const ADMIN_ROLES: readonly Role[] = [Role.WorkspaceAdmin];
