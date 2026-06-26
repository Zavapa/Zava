import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { CreateDepositDto } from './dto/deposit.dto';

export interface CommitmentRow {
  hash: string;
  nullifier: string;
  weekNumber: number;
  timestamp: number;
}

@Injectable()
export class SavingsService {
  private readonly logger = new Logger(SavingsService.name);

  constructor(private readonly stellar: StellarService) {}

  private get savingsId(): string {
    return this.stellar.contracts.savings;
  }

  async getCount(): Promise<number> {
    const res = await this.stellar.readContract(this.savingsId, 'get_commitment_count');
    return Number(res ?? 0);
  }

  async getMerkleRoot(): Promise<string> {
    const res = (await this.stellar.readContract(
      this.savingsId,
      'get_merkle_root',
    )) as Buffer | Uint8Array | null;
    if (!res) return '';
    return Buffer.from(res).toString('hex');
  }

  async getCommitmentsByRange(start: number, end: number): Promise<CommitmentRow[]> {
    const res = (await this.stellar.readContract(
      this.savingsId,
      'get_commitments_by_range',
      [this.stellar.u32ScVal(start), this.stellar.u32ScVal(end)],
    )) as Array<{
      hash: Buffer;
      nullifier: Buffer;
      week_number: number;
      timestamp: bigint;
    }> | null;
    if (!res) return [];
    return res.map((r) => ({
      hash: Buffer.from(r.hash).toString('hex'),
      nullifier: Buffer.from(r.nullifier).toString('hex'),
      weekNumber: Number(r.week_number),
      timestamp: Number(r.timestamp),
    }));
  }

  async deposit(dto: CreateDepositDto): Promise<{ hash: string }> {
    if (!this.stellar.hasSubmitter()) {
      throw new BadRequestException(
        'No submitter configured. Set STELLAR_SUBMITTER_SECRET to enable server-signed deposits.',
      );
    }
    const { hash } = await this.stellar.invokeContract(this.savingsId, 'deposit', [
      this.stellar.bytesN32ScVal(dto.commitment),
      this.stellar.bytesN32ScVal(dto.nullifier),
      this.stellar.u32ScVal(dto.weekNumber),
    ]);
    return { hash };
  }
}
