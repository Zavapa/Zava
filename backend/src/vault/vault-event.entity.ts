import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Indexed copy of a `zava-deposit` event emitted by ZavaVault.
 * Stored forever so notes survive Soroban RPC's 24h event retention.
 * Only encrypted payloads are stored — only the recipient (holder of the
 * scanKey) can decrypt and read the amount.
 */
@Entity({ name: 'vault_events' })
@Unique('uq_vault_event', ['contractId', 'leafIndex'])
@Index('ix_vault_event_contract_ledger', ['contractId', 'ledger'])
export class VaultEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { name: 'contract_id' })
  contractId!: string;

  @Column('int', { name: 'leaf_index' })
  leafIndex!: number;

  @Column('text')
  commitment!: string; // hex, 64 chars

  @Column('text', { name: 'encrypted_note' })
  encryptedNote!: string; // hex — AES-GCM ciphertext only the recipient can decrypt

  @Column('text', { name: 'tx_hash' })
  txHash!: string;

  @Column('int')
  ledger!: number;

  @Column('bigint', { name: 'ledger_close_time' })
  ledgerCloseTime!: string; // unix seconds (bigint to avoid JS int overflow)

  @CreateDateColumn({ name: 'indexed_at' })
  indexedAt!: Date;
}
