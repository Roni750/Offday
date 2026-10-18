import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import type { Workspace } from "./Workspace";
import type { User } from "./User";

/** A physical office inside a workspace. All access is scoped to an office. */
@Entity({ name: "offices" })
export class Office {
	@PrimaryGeneratedColumn({ type: "integer" })
	id!: number;

	@Column({ type: "integer", name: "workspace_id" })
	workspaceId!: number;

	@ManyToOne("Workspace", (workspace: Workspace) => workspace.offices, { onDelete: "CASCADE" })
	@JoinColumn({ name: "workspace_id" })
	workspace!: Workspace;

	@Column({ type: "varchar", length: 120 })
	name!: string;

	/** IANA time zone, e.g. "Asia/Jerusalem". Dates are entered and displayed in this zone. */
	@Column({ type: "varchar", length: 64 })
	timezone!: string;

	/** ISO weekdays the office works (1 = Monday ... 7 = Sunday), e.g. Sun–Thu in Tel Aviv. */
	@Column({ type: "smallint", array: true, name: "work_days", default: () => "'{1,2,3,4,5}'" })
	workDays!: number[];

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;

	@OneToMany("User", (user: User) => user.office)
	users!: User[];
}
