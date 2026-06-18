import { Module } from '@nestjs/common';
import { KolektifController } from './kolektif.controller';
import { KolektifService } from './kolektif.service';
import { DatabaseModule } from '../../database/database.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [KolektifController],
  providers: [KolektifService],
})
export class KolektifModule {}
