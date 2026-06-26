import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateDepositDto {
  @IsString()
  @Length(56, 56)
  @Matches(/^G[A-Z2-7]{55}$/)
  wallet!: string;

  @IsString()
  @Matches(/^(0x)?[0-9a-fA-F]{64}$/, {
    message: 'commitment must be 32-byte hex',
  })
  commitment!: string;

  @IsString()
  @Matches(/^(0x)?[0-9a-fA-F]{64}$/, {
    message: 'nullifier must be 32-byte hex',
  })
  nullifier!: string;

  @IsInt()
  @Min(0)
  @Max(10_000)
  weekNumber!: number;
}
