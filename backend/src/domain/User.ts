import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Role } from "./enums";
import type { Office } from "./Office";

@Entity({ name: "users" })
export class User {
	@PrimaryGeneratedColumn({ type: "integer" })
	id!: number;

	@Column({ type: "integer", name: "office_id" })
	officeId!: number;

	@ManyToOne("Office", (office: Office) => office.users, { onDelete: "RESTRICT" })
	@JoinColumn({ name: "office_id" })
	office!: Office;

	@Column({ type: "varchar", length: 120 })
	name!: string;

	/** Stored lowercase; unique across all workspaces so login needs only email + password. */
	@Column({ type: "varchar", length: 254 })
	email!: string;

	/** bcrypt hash, never the plain password. Excluded from default selects. */
	@Column({ type: "varchar", length: 100, select: false })
	password!: string;

	@Column({ type: "enum", enum: Role, enumName: "user_role", default: Role.Requester })
	role!: Role;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;
}
