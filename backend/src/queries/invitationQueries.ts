import { EntityManager } from "typeorm";
import { Actor } from "../auth/Actor";
import { Invitation, creatorCanVouch, invitationKind, invitationStatus } from "../domain/Invitation";
import { UsableInvitation } from "../commands/invitation/invitationRules";
import { findWorkspaceOffice } from "./officeQueries";

/** What admins see of a link. Never the token or its hash (the hash isn't even selected). */
export const toInvitationSummary = (
	invitation: Invitation,
	createdBy: { id: number; name: string } | null,
	now = new Date(),
	creatorValid = true,
) => ({
	id: invitation.id,
	kind: invitationKind(invitation),
	label: invitation.label,
	role: invitation.role,
	email: invitation.email,
	maxUses: invitation.maxUses,
	useCount: invitation.useCount,
	expiresAt: invitation.expiresAt.toISOString(),
	revokedAt: invitation.revokedAt?.toISOString() ?? null,
	createdBy: createdBy ? { id: createdBy.id, name: createdBy.name } : null,
	createdAt: invitation.createdAt.toISOString(),
	status: invitationStatus(invitation, now, creatorValid),
});

/** Every link of an office of the caller's workspace, newest first. */
export const listOfficeInvitations = async (em: EntityManager, actor: Actor, officeId: number) => {
	const office = await findWorkspaceOffice(em, actor, officeId);
	const invitations = await em.find(Invitation, {
		where: { officeId: office.id },
		relations: { createdBy: { office: true } },
		order: { createdAt: "DESC", id: "DESC" },
	});
	const now = new Date();
	return invitations.map((invitation) =>
		toInvitationSummary(invitation, invitation.createdBy, now, creatorCanVouch(invitation.createdBy, office.workspaceId)));
};

/** What the invitee sees before creating an account: names only, no ids. */
export const toInvitationPreview = ({ invitation, office }: UsableInvitation) => ({
	workspace: { name: office.workspace.name },
	office: { name: office.name },
	role: invitation.role,
	email: invitation.email,
	expiresAt: invitation.expiresAt.toISOString(),
});
