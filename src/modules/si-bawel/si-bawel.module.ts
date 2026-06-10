import { Module } from '@nestjs/common';
import { SiBawelController } from './si-bawel.controller';
import { SiBawelService } from './si-bawel.service';
import { DatabaseModule } from '../../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [SiBawelController],
  providers: [SiBawelService],
})
export class SiBawelModule {}
