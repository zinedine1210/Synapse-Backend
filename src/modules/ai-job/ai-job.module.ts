import { Global, Module } from '@nestjs/common';
import { AiJobService } from './ai-job.service';
import { AiJobController } from './ai-job.controller';
import { DatabaseModule } from '../../database/database.module';
import { NotificationModule } from '../notification/notification.module';

@Global()
@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [AiJobController],
  providers: [AiJobService],
  exports: [AiJobService],
})
export class AiJobModule {}
