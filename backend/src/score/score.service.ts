import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ScoreReportEntity } from './score-report.entity';

export interface ScoreReportInput {
  wallet: string;
  score: number;
  tier: string;
  loanEligibleStroops: string;
  factors: ScoreReportEntity['factors'];
  signals: ScoreReportEntity['signals'];
  plan: ScoreReportEntity['plan'];
  streak: number;
  /** Optional override — defaults to 7 days. */
  ttlSeconds?: number;
}

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

function randomToken(): string {
  // 24 random bytes → ~32 base64 chars → ~190 bits of entropy.
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

@Injectable()
export class ScoreService {
  constructor(
    @InjectRepository(ScoreReportEntity)
    private readonly repo: Repository<ScoreReportEntity>,
  ) {}

  async issue(input: ScoreReportInput): Promise<ScoreReportEntity> {
    const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const expiresAt = String(Math.floor(Date.now() / 1000) + ttl);
    return this.repo.save(
      this.repo.create({
        token: randomToken(),
        wallet: input.wallet,
        score: input.score,
        tier: input.tier,
        loanEligibleStroops: input.loanEligibleStroops,
        factors: input.factors,
        signals: input.signals,
        plan: input.plan,
        streak: input.streak,
        expiresAt,
      }),
    );
  }

  /** Get a non-expired report by token. */
  async getByToken(token: string): Promise<ScoreReportEntity> {
    const report = await this.repo.findOne({ where: { token } });
    if (!report) {
      throw new NotFoundException({ token, reason: 'Report not found.' });
    }
    if (Number(report.expiresAt) < Math.floor(Date.now() / 1000)) {
      throw new NotFoundException({
        token,
        reason: 'Report expired. Ask the borrower to issue a new sharing link.',
      });
    }
    return report;
  }
}
