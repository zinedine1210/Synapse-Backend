import { Global, Module } from '@nestjs/common';
import { AiJobService } from './ai-job.service';
import { AiJobController } from './ai-job.controller';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AiJobController],
  providers: [AiJobService],
  exports: [AiJobService],
})
export class AiJobModule {}
