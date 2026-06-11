import { Module } from '@nestjs/common';
import { SplitBillController } from './split-bill.controller';
import { SplitBillService } from './split-bill.service';
import { DatabaseModule } from '../../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [SplitBillController],
  providers: [SplitBillService],
})
export class SplitBillModule {}
