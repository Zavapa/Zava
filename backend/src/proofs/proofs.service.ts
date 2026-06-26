import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { GenerateProofDto, TierWeeks } from './dto/generate-proof.dto';

export interface ProofPayload {
  proof: string; // hex
  publicInputs: {
    minWeeklyAmount: number;
    consistencyWeeks: TierWeeks;
    commitments: string[];
    nullifiers: string[];
  };
  isStub: boolean;
}

@Injectable()
export class ProofsService {
  private readonly logger = new Logger(ProofsService.name);

  constructor(private readonly config: ConfigService) {}

  async generate(dto: GenerateProofDto): Promise<ProofPayload> {
    this.validateShape(dto);

    const useStub = this.config.get<boolean>('circuits.useStubProofs') ?? true;
    if (useStub) {
      return this.stubProof(dto);
    }
    try {
      return await this.realProof(dto);
    } catch (err) {
      this.logger.warn(
        `Real proof generation failed (${(err as Error).message}). Falling back to stub.`,
      );
      return this.stubProof(dto);
    }
  }

  private validateShape(dto: GenerateProofDto): void {
    const n = dto.consistencyWeeks;
    const arrays = [
      ['weeklyAmounts', dto.weeklyAmounts],
      ['depositTimestamps', dto.depositTimestamps],
      ['weekNumbers', dto.weekNumbers],
      ['commitments', dto.commitments],
      ['nullifiers', dto.nullifiers],
    ] as const;
    for (const [name, arr] of arrays) {
      if (arr.length !== n) {
        throw new BadRequestException(
          `${name} must have exactly ${n} entries (got ${arr.length})`,
        );
      }
    }
  }

  private stubProof(dto: GenerateProofDto): ProofPayload {
    // Deterministic-ish stub: 256-byte random blob. The on-chain verifier is
    // currently structural, so this passes the proof-length sanity check.
    const proof = randomBytes(256).toString('hex');
    return {
      proof,
      publicInputs: {
        minWeeklyAmount: dto.minWeeklyAmount,
        consistencyWeeks: dto.consistencyWeeks,
        commitments: dto.commitments.map(stripHexPrefix),
        nullifiers: dto.nullifiers.map(stripHexPrefix),
      },
      isStub: true,
    };
  }

  private async realProof(dto: GenerateProofDto): Promise<ProofPayload> {
    const circuitsRoot = resolve(
      process.cwd(),
      this.config.getOrThrow<string>('circuits.root'),
    );
    const circuitDir = join(circuitsRoot, `zava_${dto.consistencyWeeks}w`);

    const workDir = await mkdir(
      join(tmpdir(), `zava-proof-${Date.now()}-${randomBytes(4).toString('hex')}`),
      { recursive: true },
    ).then(
      (p) =>
        p ?? join(tmpdir(), `zava-proof-${Date.now()}-${randomBytes(4).toString('hex')}`),
    );

    try {
      const proverToml = this.buildProverToml(dto);
      await writeFile(join(circuitDir, 'Prover.toml'), proverToml);

      await this.run('nargo', ['execute', 'witness'], circuitDir);

      const acirPath = join(circuitDir, 'target', `zava_${dto.consistencyWeeks}w.json`);
      const witnessPath = join(circuitDir, 'target', 'witness.gz');
      const proofOut = join(circuitDir, 'target', 'proof');

      await this.run(
        'bb',
        ['prove', '-b', acirPath, '-w', witnessPath, '-o', proofOut],
        circuitDir,
      );

      const proofBytes = await readFile(proofOut);
      return {
        proof: proofBytes.toString('hex'),
        publicInputs: {
          minWeeklyAmount: dto.minWeeklyAmount,
          consistencyWeeks: dto.consistencyWeeks,
          commitments: dto.commitments.map(stripHexPrefix),
          nullifiers: dto.nullifiers.map(stripHexPrefix),
        },
        isStub: false,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private buildProverToml(dto: GenerateProofDto): string {
    const arrToToml = (arr: Array<string | number>) =>
      `[${arr.map((v) => (typeof v === 'string' ? `"${v}"` : `${v}`)).join(', ')}]`;
    return [
      `secret = "0x${stripHexPrefix(dto.secret)}"`,
      `min_weekly_amount = "${dto.minWeeklyAmount}"`,
      `consistency_weeks = "${dto.consistencyWeeks}"`,
      `weekly_amounts = ${arrToToml(dto.weeklyAmounts.map(String))}`,
      `deposit_timestamps = ${arrToToml(dto.depositTimestamps.map(String))}`,
      `week_numbers = ${arrToToml(dto.weekNumbers.map(String))}`,
      `commitments = ${arrToToml(dto.commitments.map((c) => `0x${stripHexPrefix(c)}`))}`,
      `nullifiers = ${arrToToml(dto.nullifiers.map((c) => `0x${stripHexPrefix(c)}`))}`,
      '',
    ].join('\n');
  }

  private run(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((res, rej) => {
      const child = spawn(cmd, args, { cwd, stdio: 'pipe' });
      let stderr = '';
      child.stderr.on('data', (b) => (stderr += b.toString()));
      child.on('error', rej);
      child.on('exit', (code) => {
        if (code === 0) return res();
        rej(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr.slice(0, 500)}`));
      });
    });
  }
}

function stripHexPrefix(s: string): string {
  return s.startsWith('0x') ? s.slice(2) : s;
}
