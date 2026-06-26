import { ArrayMinSize, IsArray, IsIn, IsInt, IsString, Matches, Min } from 'class-validator';

export type TierWeeks = 8 | 12 | 24;

export class GenerateProofDto {
  // 32-byte hex secret (private input)
  @IsString()
  @Matches(/^(0x)?[0-9a-fA-F]{64}$/)
  secret!: string;

  @IsIn([8, 12, 24])
  consistencyWeeks!: TierWeeks;

  @IsInt()
  @Min(0)
  minWeeklyAmount!: number;

  @IsArray()
  @ArrayMinSize(1)
  weeklyAmounts!: number[];

  @IsArray()
  @ArrayMinSize(1)
  depositTimestamps!: number[];

  @IsArray()
  @ArrayMinSize(1)
  weekNumbers!: number[];

  // Public inputs that must match what's on-chain.
  @IsArray()
  @ArrayMinSize(1)
  commitments!: string[];

  @IsArray()
  @ArrayMinSize(1)
  nullifiers!: string[];
}
