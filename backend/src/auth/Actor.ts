import { Role } from "../domain/enums";
import { OfficeCalendar } from "../domain/officeTime";

/**
 * The authenticated caller, loaded fresh from the database on every request.
 * Role and office come from here, never from the token or the client, so role changes apply immediately.
 */
export interface Actor extends OfficeCalendar {
	id: number;
	name: string;
	email: string;
	role: Role;
	officeId: number;
	officeName: string;
	timezone: string;
	workDays: number[];
	workspaceId: number;
	workspaceName: string;
}
