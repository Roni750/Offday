import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import type { User } from "./User";

/**
 * A trip: requests of several people of one office, submitted together (decisions.md #15).
 * Each person keeps their own VacationRequest row (own status and decision); the group only links them.
 */
@Entity({ name: "vacation_groups" })
export class VacationGroup {
	@PrimaryGeneratedColumn({ type: "integer" })
	id!: number;

	@Column({ type: "integer", name: "office_id" })
	officeId!: number;

	/** Who submitted the trip; the only one who can change its dates or cancel it for everyone. */
	@Column({ type: "integer", name: "organizer_id", nullable: true })
	organizerId!: number | null;

	@ManyToOne("User", { onDelete: "SET NULL", nullable: true })
	@JoinColumn({ name: "organizer_id" })
	organizer!: User | null;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;
}
