import { Injectable, Logger } from '@nestjs/common';
import { xdr, nativeToScVal } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import { VerifyProofDto } from './dto/verify-proof.dto';

export type CreditTier = 'Medium' | 'Low' | 'VeryLow';

export interface CreditRecord {
  wallet: string;
  tier: CreditTier;
  consistencyWeeks: number;
  verifiedAt: number;
  expiresAt: number;
}

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(private readonly stellar: StellarService) {}

  private get verifierId(): string {
    return this.stellar.contracts.verifier;
  }

  async verifyProof(dto: VerifyProofDto): Promise<{ hash: string; tier: CreditTier }> {
    const publicInputs = this.buildPublicInputsStruct(dto);
    const args = [
      this.stellar.addressScVal(dto.wallet),
      this.stellar.bytesScVal(Buffer.from(stripHex(dto.proof), 'hex')),
      publicInputs,
    ];
    const { hash, returnValue } = await this.stellar.invokeContract(
      this.verifierId,
      'verify_proof',
      args,
    );
    const tier = this.parseTier(returnValue) ?? this.tierForWeeks(dto.consistencyWeeks);
    return { hash, tier };
  }

  async getCreditTier(wallet: string): Promise<CreditRecord | null> {
    const res = (await this.stellar.readContract(this.verifierId, 'get_credit_tier', [
      this.stellar.addressScVal(wallet),
    ])) as
      | {
          wallet: string;
          tier: { tag: CreditTier };
          verified_at: bigint;
          consistency_weeks: number;
          expires_at: bigint;
        }
      | null;
    if (!res) return null;
    return {
      wallet: typeof res.wallet === 'string' ? res.wallet : String(res.wallet),
      tier: res.tier?.tag ?? this.tierForWeeks(Number(res.consistency_weeks)),
      consistencyWeeks: Number(res.consistency_weeks),
      verifiedAt: Number(res.verified_at),
      expiresAt: Number(res.expires_at),
    };
  }

  async isCreditValid(wallet: string): Promise<boolean> {
    const res = (await this.stellar.readContract(this.verifierId, 'is_credit_valid', [
      this.stellar.addressScVal(wallet),
    ])) as boolean | null;
    return Boolean(res);
  }

  private buildPublicInputsStruct(dto: VerifyProofDto): xdr.ScVal {
    return nativeToScVal(
      {
        min_weekly_amount: BigInt(dto.minWeeklyAmount),
        consistency_weeks: dto.consistencyWeeks,
        commitments: dto.commitments.map((c) => Buffer.from(stripHex(c), 'hex')),
        nullifiers: dto.nullifiers.map((n) => Buffer.from(stripHex(n), 'hex')),
      },
      {
        type: {
          min_weekly_amount: ['symbol', 'u64'],
          consistency_weeks: ['symbol', 'u32'],
          commitments: ['symbol', null],
          nullifiers: ['symbol', null],
        },
      },
    );
  }

  private parseTier(v: unknown): CreditTier | null {
    if (!v) return null;
    if (typeof v === 'object' && v !== null && 'tag' in v) {
      const tag = (v as { tag: string }).tag;
      if (tag === 'Medium' || tag === 'Low' || tag === 'VeryLow') return tag;
    }
    if (typeof v === 'string') {
      if (v === 'Medium' || v === 'Low' || v === 'VeryLow') return v as CreditTier;
    }
    return null;
  }

  private tierForWeeks(w: number): CreditTier {
    if (w >= 24) return 'VeryLow';
    if (w >= 12) return 'Low';
    return 'Medium';
  }
}

function stripHex(s: string): string {
  return s.startsWith('0x') ? s.slice(2) : s;
}
