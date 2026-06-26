import { Module } from '@nestjs/common';
import { CreditService } from './credit.service';
import { CreditV3Service } from './credit-v3.service';
import { CreditController } from './credit.controller';

@Module({
  controllers: [CreditController],
  providers: [CreditService, CreditV3Service],
  exports: [CreditService, CreditV3Service],
})
export class CreditModule {}
