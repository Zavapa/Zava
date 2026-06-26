import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ProofsService } from './proofs.service';
import { GenerateProofDto } from './dto/generate-proof.dto';

@Controller('proofs')
export class ProofsController {
  constructor(private readonly proofs: ProofsService) {}

  @Post('generate')
  @HttpCode(200)
  async generate(@Body() dto: GenerateProofDto) {
    return this.proofs.generate(dto);
  }
}
