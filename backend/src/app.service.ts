import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly config: ConfigService) {}

  health() {
    return {
      ok: true,
      service: 'zava-backend',
      network: this.config.get<string>('stellar.network'),
      contracts: this.config.get('stellar.contracts'),
    };
  }
}
