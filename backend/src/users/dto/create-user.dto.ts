import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @Length(56, 56)
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'Invalid Stellar wallet address' })
  wallet!: string;

  @IsString()
  @Length(1, 80)
  displayName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  encryptedSecret?: string;
}
