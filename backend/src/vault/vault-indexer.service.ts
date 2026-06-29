import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { rpc, scValToNative } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import { VaultEventEntity } from './vault-event.entity';

const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 200;

/**
 * Polls Soroban RPC for `zava-deposit` events from the configured vault contract
 * and stores them in Postgres. Survives RPC's 24h event retention so users can
 * always find and decrypt their notes.
 *
 * Cursor is the last ledger we successfully indexed. On startup we either
 * resume from the database max ledger, or start from (latest - 17000) — about
 * the maximum lookback Soroban testnet RPC allows.
 */
@Injectable()
export class VaultIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VaultIndexerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly stellar: StellarService,
    @InjectRepository(VaultEventEntity)
    private readonly repo: Repository<VaultEventEntity>,
  ) {}

  onModuleInit(): void {
    void this.indexOnce()
      .catch((e) => this.logger.error(`initial index failed: ${e}`))
      .finally(() => this.scheduleNext());
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.indexOnce()
        .catch((e) => this.logger.error(`indexer iteration failed: ${e}`))
        .finally(() => this.scheduleNext());
    }, POLL_INTERVAL_MS);
  }

  /** Vault contract IDs the indexer monitors (one per asset). */
  private vaultContractIds(): string[] {
    const ids = new Set<string>();
    const xlm = this.stellar.contracts.vaultXLM;
    const usdc = this.stellar.contracts.vaultUSDC;
    if (xlm)  ids.add(xlm);
    if (usdc) ids.add(usdc);
    if (ids.size === 0 && this.stellar.contracts.vault) {
      ids.add(this.stellar.contracts.vault);
    }
    return [...ids];
  }

  /** One polling iteration across ALL configured vaults. */
  async indexOnce(): Promise<{ scanned: number; inserted: number }> {
    if (this.running) return { scanned: 0, inserted: 0 };
    this.running = true;
    try {
      const vaults = this.vaultContractIds();
      if (vaults.length === 0) {
        this.logger.warn('No vault contracts configured — skipping index');
        return { scanned: 0, inserted: 0 };
      }

      let totalScanned = 0;
      let totalInserted = 0;
      for (const contractId of vaults) {
        const startLedger = await this.resolveStartLedger(contractId);
        const events = await this.stellar.server.getEvents({
          startLedger,
          filters: [{ type: 'contract', contractIds: [contractId] }],
          limit: PAGE_SIZE,
        });

        totalScanned += events.events?.length ?? 0;
        for (const ev of events.events ?? []) {
          const note = this.decodeDepositEvent(ev);
          if (!note) continue;

          const exists = await this.repo.findOne({
            where: { contractId, leafIndex: note.leafIndex },
          });
          if (exists) continue;

          await this.repo.save(
            this.repo.create({
              contractId,
              leafIndex: note.leafIndex,
              commitment: note.commitment,
              encryptedNote: note.encryptedNote,
              txHash: ev.txHash ?? '',
              ledger: ev.ledger ?? 0,
              ledgerCloseTime: String(toUnix(ev.ledgerClosedAt)),
            }),
          );
          totalInserted += 1;
        }
      }

      if (totalInserted > 0) {
        this.logger.log(`indexed ${totalInserted} new vault events across ${vaults.length} vault(s)`);
      }
      return { scanned: totalScanned, inserted: totalInserted };
    } finally {
      this.running = false;
    }
  }

  /**
   * Find a safe starting ledger. Soroban testnet RPC silently caps how far
   * back getEvents will return data (empirically ~8 000 ledgers, NOT the 17 000
   * implied by `ledgerRetentionWindow`). Falling back too far makes the call
   * return zero events even when matching ones exist nearer the latest tip.
   *
   * Resume strategy:
   *   - If we have indexed events for this contract before, start from
   *     `max_ledger + 1` so we only fetch new ones.
   *   - Otherwise, look back a conservative 7 200 ledgers (~10 hours at
   *     5 s/ledger) which stays inside the RPC's actual return window.
   */
  private async resolveStartLedger(contractId: string): Promise<number> {
    const max = await this.repo
      .createQueryBuilder('e')
      .select('MAX(e.ledger)', 'max')
      .where('e.contractId = :contractId', { contractId })
      .getRawOne<{ max: number | string | null }>();

    const latest = await this.stellar.server.getLatestLedger();
    const fallback = Math.max(1, latest.sequence - 7_200);
    if (max?.max) {
      return Math.max(Number(max.max) + 1, fallback);
    }
    return fallback;
  }

  private decodeDepositEvent(
    ev: rpc.Api.EventResponse,
  ): { leafIndex: number; commitment: string; encryptedNote: string } | null {
    try {
      const topicNames = (ev.topic ?? []).map((t) => {
        try {
          return scValToNative(t);
        } catch {
          return null;
        }
      });
      if (!topicNames.some((n) => n === 'deposit')) return null;

      const decoded = scValToNative(ev.value) as {
        leaf_index?: number | bigint;
        commitment?: Uint8Array;
        encrypted_note?: Uint8Array;
      };
      if (!decoded?.commitment || !decoded?.encrypted_note) return null;
      return {
        leafIndex: Number(decoded.leaf_index ?? 0),
        commitment: Buffer.from(decoded.commitment).toString('hex'),
        encryptedNote: Buffer.from(decoded.encrypted_note).toString('hex'),
      };
    } catch (e) {
      this.logger.warn(`malformed vault event: ${(e as Error).message}`);
      return null;
    }
  }
}

function toUnix(iso: string | Date | undefined): number {
  if (!iso) return Math.floor(Date.now() / 1000);
  const ms = iso instanceof Date ? iso.getTime() : Date.parse(iso);
  return Math.floor(ms / 1000);
}
