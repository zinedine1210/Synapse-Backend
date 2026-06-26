import { Module } from '@nestjs/common';
import { SkripsweetController } from './skripsweet.controller';
import { SkripsweetService } from './skripsweet.service';
import { DatabaseModule } from '../../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [SkripsweetController],
  providers: [SkripsweetService],
})
export class SkripsweetModule {}
