import { Module } from '@nestjs/common';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';
import { ResponseCacheInterceptor } from '../../common/interceptors/response-cache.interceptor';

@Module({
  controllers: [SuperadminController],
  providers: [SuperadminService, ResponseCacheInterceptor],
})
export class SuperadminModule {}
