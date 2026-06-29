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

/** A user's declared savings commitment. One per wallet (latest one wins). */
@Entity({ name: 'savings_plans' })
export class SavingsPlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column('text')
  wallet!: string;

  @Column({ type: 'varchar', length: 16 })
  cadence!: Cadence;

  @Column({ type: 'varchar', length: 8 })
  targetRange!: SavingsRange;

  /** Optional human label like "Emergency fund". */
  @Column('text', { nullable: true })
  label!: string | null;

  /** Unix seconds when this plan began. */
  @Column('bigint', { name: 'started_at' })
  startedAt!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
