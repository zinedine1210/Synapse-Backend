import { Module } from '@nestjs/common';
import { MaterialController } from './material.controller';
import { MaterialService } from './material.service';
import { AiModule } from '../ai/ai.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [AiModule, NotificationModule],
  controllers: [MaterialController],
  providers: [MaterialService],
})
export class MaterialModule {}
