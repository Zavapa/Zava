import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CreditService } from './credit.service';
import { VerifyProofDto } from './dto/verify-proof.dto';

@Controller('credit')
export class CreditController {
  constructor(private readonly credit: CreditService) {}

  @Post('verify')
  @HttpCode(200)
  async verify(@Body() dto: VerifyProofDto) {
    return this.credit.verifyProof(dto);
  }

  @Get('tier/:wallet')
  async getTier(@Param('wallet') wallet: string) {
    const record = await this.credit.getCreditTier(wallet);
    return { record };
  }

  @Get('valid/:wallet')
  async isValid(@Param('wallet') wallet: string) {
    const valid = await this.credit.isCreditValid(wallet);
    return { valid };
  }
}
