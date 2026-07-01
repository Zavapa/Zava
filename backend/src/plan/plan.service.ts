import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Cadence, SavingsPlanEntity, SavingsRange } from './plan.entity';

export interface CreatePlanInput {
  wallet: string;
  cadence: Cadence;
  targetRange: SavingsRange;
  label: string;
}

export interface UpdatePlanInput {
  cadence?: Cadence;
  targetRange?: SavingsRange;
  label?: string;
}

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(SavingsPlanEntity)
    private readonly repo: Repository<SavingsPlanEntity>,
  ) {}

  listByWallet(wallet: string, includeArchived = false): Promise<SavingsPlanEntity[]> {
    return this.repo.find({
      where: includeArchived
        ? { wallet }
        : { wallet, archivedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  async getById(id: string): Promise<SavingsPlanEntity> {
    const plan = await this.repo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException({ id, reason: 'Plan not found.' });
    return plan;
  }

  create(input: CreatePlanInput): Promise<SavingsPlanEntity> {
    return this.repo.save(
      this.repo.create({
        wallet: input.wallet,
        cadence: input.cadence,
        targetRange: input.targetRange,
        label: input.label,
        startedAt: String(Math.floor(Date.now() / 1000)),
        archivedAt: null,
      }),
    );
  }

  async update(id: string, patch: UpdatePlanInput): Promise<SavingsPlanEntity> {
    const plan = await this.getById(id);
    if (patch.cadence)     plan.cadence     = patch.cadence;
    if (patch.targetRange) plan.targetRange = patch.targetRange;
    if (patch.label !== undefined) plan.label = patch.label;
    return this.repo.save(plan);
  }

  async archive(id: string): Promise<SavingsPlanEntity> {
    const plan = await this.getById(id);
    plan.archivedAt = String(Math.floor(Date.now() / 1000));
    return this.repo.save(plan);
  }
}
