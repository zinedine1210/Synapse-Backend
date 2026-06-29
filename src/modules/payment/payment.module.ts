import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PlanExpiryService } from './plan-expiry.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, PlanExpiryService],
})
export class PaymentModule {}
