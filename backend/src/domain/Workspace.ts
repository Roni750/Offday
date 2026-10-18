import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import type { Office } from "./Office";

/** A tenant: one company using the app. */
@Entity({ name: "workspaces" })
export class Workspace {
	@PrimaryGeneratedColumn({ type: "integer" })
	id!: number;

	@Column({ type: "varchar", length: 120 })
	name!: string;

	@Column({ type: "varchar", length: 60, unique: true })
	slug!: string;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;

	@OneToMany("Office", (office: Office) => office.workspace)
	offices!: Office[];
}
