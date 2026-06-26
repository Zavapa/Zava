import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class VerifyProofDto {
  @IsString()
  @Length(56, 56)
  @Matches(/^G[A-Z2-7]{55}$/)
  wallet!: string;

  @IsString()
  @Matches(/^(0x)?[0-9a-fA-F]+$/)
  proof!: string;

  @IsInt()
  @Min(0)
  minWeeklyAmount!: number;

  @IsIn([8, 12, 24])
  consistencyWeeks!: 8 | 12 | 24;

  @IsArray()
  @ArrayMinSize(1)
  commitments!: string[];

  @IsArray()
  @ArrayMinSize(1)
  nullifiers!: string[];
}
