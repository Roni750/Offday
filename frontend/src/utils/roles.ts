import type { Role } from '@/api/types';

/** Roles that can see office requests, approve / reject and read stats. */
export const REVIEWER_ROLES: readonly Role[] = ['Validator', 'WorkspaceAdmin'];
export const ADMIN_ROLES: readonly Role[] = ['WorkspaceAdmin'];
export const ALL_ROLES: readonly Role[] = ['Requester', 'Validator', 'WorkspaceAdmin'];

export function canReview(role: Role | null | undefined): boolean {
  return !!role && REVIEWER_ROLES.includes(role);
}

export function isAdmin(role: Role | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

/** Landing page after sign-in, and where a disallowed route redirects. */
export function homePathFor(role: Role | null | undefined): string {
  return canReview(role) ? '/dashboard' : '/requests/mine';
}

const LABELS: Record<Role, string> = {
  Requester: 'Requester',
  Validator: 'Validator',
  WorkspaceAdmin: 'Workspace admin',
};

export function roleLabel(role: Role): string {
  return LABELS[role];
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Requester: 'Submits and withdraws their own requests, sees the team calendar.',
  Validator: 'Everything a requester can do, plus reviewing office requests and the overview.',
  WorkspaceAdmin: 'Everything a validator can do, plus managing roles and office settings.',
};
