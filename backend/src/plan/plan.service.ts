import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cadence, SavingsPlanEntity, SavingsRange } from './plan.entity';

export interface UpsertPlanInput {
  wallet: string;
  cadence: Cadence;
  targetRange: SavingsRange;
  label?: string | null;
}

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(SavingsPlanEntity)
    private readonly repo: Repository<SavingsPlanEntity>,
  ) {}

  async getByWallet(wallet: string): Promise<SavingsPlanEntity | null> {
    return this.repo.findOne({ where: { wallet } });
  }

  /** Create or replace the user's plan. Latest declaration wins. */
  async upsert(input: UpsertPlanInput): Promise<SavingsPlanEntity> {
    const existing = await this.getByWallet(input.wallet);
    if (existing) {
      existing.cadence = input.cadence;
      existing.targetRange = input.targetRange;
      existing.label = input.label ?? null;
      return this.repo.save(existing);
    }
    return this.repo.save(
      this.repo.create({
        wallet: input.wallet,
        cadence: input.cadence,
        targetRange: input.targetRange,
        label: input.label ?? null,
        startedAt: String(Math.floor(Date.now() / 1000)),
      }),
    );
  }
}
