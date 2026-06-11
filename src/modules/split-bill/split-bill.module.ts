import { Module } from '@nestjs/common';
import { SplitBillController } from './split-bill.controller';
import { SplitBillService } from './split-bill.service';
import { SplitBillGateway } from './split-bill.gateway';
import { DatabaseModule } from '../../database/database.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AiModule],
  controllers: [SplitBillController],
  providers: [SplitBillService, SplitBillGateway],
  exports: [SplitBillGateway],
})
export class SplitBillModule {}
