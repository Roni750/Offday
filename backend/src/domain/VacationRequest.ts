import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { VacationStatus } from "./enums";
import type { User } from "./User";

/**
 * start_date / end_date keep the names from the brief but store full timestamps (timestamptz),
 * so half days are possible. The range is half-open [start, end): touching requests don't overlap.
 * Overlap between a user's non-rejected requests is also enforced by an exclusion constraint.
 */
@Entity({ name: "vacation_requests" })
export class VacationRequest {
	@PrimaryGeneratedColumn({ type: "integer" })
	id!: number;

	@Column({ type: "integer", name: "user_id" })
	userId!: number;

	@ManyToOne("User", { onDelete: "CASCADE" })
	@JoinColumn({ name: "user_id" })
	user!: User;

	@Column({ type: "timestamptz", name: "start_date" })
	startDate!: Date;

	@Column({ type: "timestamptz", name: "end_date" })
	endDate!: Date;

	@Column({ type: "varchar", length: 240, nullable: true })
	reason!: string | null;

	@Column({ type: "enum", enum: VacationStatus, enumName: "vacation_status", default: VacationStatus.Pending })
	status!: VacationStatus;

	/** Validator's comment; required when the request is rejected. */
	@Column({ type: "varchar", length: 500, nullable: true })
	comments!: string | null;

	@Column({ type: "integer", name: "decided_by", nullable: true })
	decidedById!: number | null;

	@ManyToOne("User", { onDelete: "SET NULL", nullable: true })
	@JoinColumn({ name: "decided_by" })
	decidedBy!: User | null;

	@Column({ type: "timestamptz", name: "decided_at", nullable: true })
	decidedAt!: Date | null;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;

	@UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
	updatedAt!: Date;
}
