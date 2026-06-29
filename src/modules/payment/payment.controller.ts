import {
  Controller,
  Get,
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
   * GET /api/v1/payments/plans
   * Public — returns all available plans for the billing page.
   */
  @Get('plans')
  getAvailablePlans() {
    return this.paymentService.getAvailablePlans();
  }

  /**
   * GET /api/v1/payments/history
   * Returns user's payment history (recent 20 transactions).
   */
  @Get('history')
  @UseGuards(AuthGuard)
  getPaymentHistory(@GetUser() user: User) {
    return this.paymentService.getPaymentHistory(user.id);
  }

  /**
   * POST /api/v1/payments/create-snap-token
   * Buat transaksi Midtrans dan kembalikan snap token ke frontend.
   * If user has a pending payment for the same plan, reuse it.
   */
  @Post('create-snap-token')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  createSnapToken(@GetUser() user: User, @Body() dto: CreatePaymentDto) {
    return this.paymentService.createSnapToken(user, dto);
  }

  /**
   * POST /api/v1/payments/resume
   * Resume a pending payment by returning its existing snap token.
   */
  @Post('resume')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  resumePayment(@GetUser() user: User, @Body('orderId') orderId: string) {
    return this.paymentService.resumePayment(user.id, orderId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() payload: Record<string, unknown>) {
    return this.paymentService.handleMidtransWebhook(payload);
  }

  /**
   * POST /api/v1/payments/verify
   * Verifikasi status pembayaran secara manual/fallback.
   */
  @Post('verify')
  @UseGuards(AuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  verifyPayment(@GetUser() _user: User, @Body('orderId') orderId: string) {
    return this.paymentService.verifyPaymentStatus(orderId);
  }
}
