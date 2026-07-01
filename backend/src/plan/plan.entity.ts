import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type Cadence = 'weekly' | 'monthly';
export type SavingsRange = 'R5' | 'R20' | 'R50' | 'R200' | 'R500';

/** A user's declared savings commitment. A wallet may hold many plans. */
@Entity({ name: 'savings_plans' })
@Index(['wallet'])
export class SavingsPlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  wallet!: string;

  @Column({ type: 'varchar', length: 16 })
  cadence!: Cadence;

  @Column({ type: 'varchar', length: 8 })
  targetRange!: SavingsRange;

  /** Human-readable plan name (required in the app; DB allows null for legacy rows). */
  @Column('text', { nullable: true })
  label!: string | null;

  /** Unix seconds when this plan began. */
  @Column('bigint', { name: 'started_at' })
  startedAt!: string;

  /** Unix seconds when the user archived / closed the plan. Null = active. */
  @Column('bigint', { name: 'archived_at', nullable: true })
  archivedAt!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
