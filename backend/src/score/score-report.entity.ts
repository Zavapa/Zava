import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A snapshot of a user's Zava Credit Score (ZCS) at a point in time.
 * Computed entirely client-side by the borrower (with full access to their
 * own scanKey + on-chain data) and stored here by short, unguessable token.
 *
 * The lender retrieves the report by token — no permission ever leaks the
 * underlying transaction history.
 */
@Entity({ name: 'score_reports' })
export class ScoreReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Short random token the borrower shares with the lender. */
  @Index({ unique: true })
  @Column('text')
  token!: string;

  @Column('text')
  wallet!: string;

  /** Final ZCS in 300–850. */
  @Column('int')
  score!: number;

  /** Excellent / Very Good / Good / Fair / Poor. */
  @Column({ type: 'varchar', length: 16 })
  tier!: string;

  /** Eligible loan amount in stroops. */
  @Column('bigint', { name: 'loan_eligible_stroops' })
  loanEligibleStroops!: string;

  /** Five-factor breakdown — JSON: { consistency, inflow, withdrawal, tenure, diversification }. */
  @Column('jsonb')
  factors!: {
    consistency: number;
    inflow: number;
    withdrawal: number;
    tenure: number;
    diversification: number;
  };

  /** Booleans the lender can render as a checklist. */
  @Column('jsonb')
  signals!: {
    meetsSavingsGoal: boolean;
    monthlyInflowAbove500: boolean;
    lowWithdrawalRatio: boolean;
    tenureAbove90d: boolean;
    diversifiedPayers: boolean;
  };

  /** Optional declared plan label so the lender sees the user's goal. */
  @Column('jsonb', { nullable: true })
  plan!: {
    cadence: string;
    targetRange: string;
    label?: string | null;
  } | null;

  /** Streak count at time of issuance (number of consecutive periods met). */
  @Column('int', { default: 0 })
  streak!: number;

  @CreateDateColumn({ name: 'issued_at' })
  issuedAt!: Date;

  /** Unix seconds when this report stops being valid. */
  @Column('bigint', { name: 'expires_at' })
  expiresAt!: string;
}
