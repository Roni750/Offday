import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

/** Append-only record of domain events, written by the audit subscriber. */
@Entity({ name: "audit_log" })
export class AuditLogEntry {
	@PrimaryGeneratedColumn({ type: "bigint" })
	id!: string;

	@Column({ type: "integer", name: "office_id" })
	officeId!: number;

	@Column({ type: "integer", name: "actor_id", nullable: true })
	actorId!: number | null;

	@Column({ type: "varchar", length: 80, name: "event_type" })
	eventType!: string;

	@Column({ type: "varchar", length: 40, name: "entity_type" })
	entityType!: string;

	@Column({ type: "integer", name: "entity_id" })
	entityId!: number;

	@Column({ type: "jsonb" })
	payload!: Record<string, unknown>;

	@Column({ type: "timestamptz", name: "occurred_at", default: () => "now()" })
	occurredAt!: Date;
}
