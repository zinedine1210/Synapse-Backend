import { Module } from '@nestjs/common';
import { KolektifController } from './kolektif.controller';
import { KolektifService } from './kolektif.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [KolektifController],
  providers: [KolektifService],
})
export class KolektifModule {}
