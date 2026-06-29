import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VaultEventEntity } from './vault-event.entity';
import { VaultIndexerService } from './vault-indexer.service';
import { VaultController } from './vault.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VaultEventEntity])],
  controllers: [VaultController],
  providers: [VaultIndexerService],
  exports: [VaultIndexerService],
})
export class VaultModule {}
