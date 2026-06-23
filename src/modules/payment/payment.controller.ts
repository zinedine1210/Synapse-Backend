import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /api/v1/payments/create-snap-token
   * Buat transaksi Midtrans dan kembalikan snap token ke frontend.
   */
  @Post('create-snap-token')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  createSnapToken(@GetUser() user: User, @Body() dto: CreatePaymentDto) {
    return this.paymentService.createSnapToken(user, dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() payload: Record<string, unknown>) {
    return this.paymentService.handleMidtransWebhook(payload);
  }

  /**
   * POST /api/v1/payments/verify
   * Verifikasi status pembayaran secara manual/fallback (untuk dev/sandbox & realtime).
   */
  @Post('verify')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  verifyPayment(@GetUser() _user: User, @Body('orderId') orderId: string) {
    return this.paymentService.verifyPaymentStatus(orderId);
  }
}
