import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScoreReportEntity } from './score-report.entity';
import { ScoreController } from './score.controller';
import { ScoreService } from './score.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScoreReportEntity])],
  controllers: [ScoreController],
  providers: [ScoreService],
  exports: [ScoreService],
})
export class ScoreModule {}
