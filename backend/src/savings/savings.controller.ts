import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { SavingsService } from './savings.service';
import { CreateDepositDto } from './dto/deposit.dto';

@Controller('savings')
export class SavingsController {
  constructor(private readonly savings: SavingsService) {}

  @Get('count')
  async getCount() {
    const count = await this.savings.getCount();
    return { count };
  }

  @Get('merkle-root')
  async getRoot() {
    const root = await this.savings.getMerkleRoot();
    return { root };
  }

  @Get('commitments')
  async getCommitments(@Query('start') start = '0', @Query('end') end = '24') {
    const s = Math.max(0, parseInt(start, 10));
    const e = Math.max(s, parseInt(end, 10));
    const rows = await this.savings.getCommitmentsByRange(s, e);
    return { commitments: rows };
  }

  @Post('deposit')
  @HttpCode(201)
  async deposit(@Body() dto: CreateDepositDto) {
    const result = await this.savings.deposit(dto);
    return result;
  }
}
