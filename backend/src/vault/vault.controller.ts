import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StellarService } from '../stellar/stellar.service';
import { VaultEventEntity } from './vault-event.entity';
import { VaultIndexerService } from './vault-indexer.service';

@Controller('vault')
export class VaultController {
  constructor(
    private readonly stellar: StellarService,
    private readonly indexer: VaultIndexerService,
    @InjectRepository(VaultEventEntity)
    private readonly repo: Repository<VaultEventEntity>,
  ) {}

  /**
   * Return all indexed deposit events for the current vault.
   * The client decrypts `encryptedNote` locally with their scanKey to read
   * the amount, nonce, week, and asset — the backend never sees plaintext.
   */
  @Get('events')
  async events(
    @Query('sinceLeaf') sinceLeaf: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('contractId') contractIdParam: string | undefined,
  ) {
    // Default to XLM vault for back-compat with single-vault callers.
    const contractId = contractIdParam ?? this.stellar.contracts.vault;
    const sinceLeafN = parseInt(sinceLeaf ?? '0', 10) || 0;
    const limitN = Math.min(parseInt(limit ?? '500', 10) || 500, 1000);

    const events = await this.repo
      .createQueryBuilder('e')
      .where('e.contractId = :contractId', { contractId })
      .andWhere('e.leafIndex >= :sinceLeafN', { sinceLeafN })
      .orderBy('e.leafIndex', 'ASC')
      .limit(limitN)
      .getMany();

    return {
      contractId,
      count: events.length,
      events: events.map((e) => ({
        leafIndex: e.leafIndex,
        commitment: e.commitment,
        encryptedNote: e.encryptedNote,
        txHash: e.txHash,
        ledger: e.ledger,
        timestamp: Number(e.ledgerCloseTime),
      })),
    };
  }

  /** Force one indexer run — useful for tests / "rescan now" buttons. */
  @Get('sync')
  async sync() {
    const result = await this.indexer.indexOnce();
    return { ok: true, ...result };
  }
}
