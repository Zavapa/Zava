import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { StellarModule } from './stellar/stellar.module';
import { UsersModule } from './users/users.module';
import { SavingsModule } from './savings/savings.module';
import { ProofsModule } from './proofs/proofs.module';
import { CreditModule } from './credit/credit.module';
import { VaultModule } from './vault/vault.module';
import { PlanModule } from './plan/plan.module';
import { ScoreModule } from './score/score.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.local'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('database.url');
        const base = {
          type: 'postgres' as const,
          autoLoadEntities: true,
          synchronize: true,
          ssl: url ? { rejectUnauthorized: false } : false,
        };
        if (url) return { ...base, url };
        return {
          ...base,
          host: config.getOrThrow<string>('database.host'),
          port: config.getOrThrow<number>('database.port'),
          username: config.getOrThrow<string>('database.username'),
          password: config.getOrThrow<string>('database.password'),
          database: config.getOrThrow<string>('database.database'),
        };
      },
    }),
    StellarModule,
    UsersModule,
    SavingsModule,
    ProofsModule,
    CreditModule,
    VaultModule,
    PlanModule,
    ScoreModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
