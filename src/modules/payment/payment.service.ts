import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { User } from '@prisma/client';
import * as MidtransClient from 'midtrans-client';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly snap: MidtransClient.Snap;
  private readonly core: MidtransClient.CoreApi;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const config = {
      isProduction: this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true',
      serverKey: this.configService.get<string>('MIDTRANS_SERVER_KEY')!,
      clientKey: this.configService.get<string>('MIDTRANS_CLIENT_KEY')!,
    };
    this.snap = new MidtransClient.Snap(config);
    this.core = new MidtransClient.CoreApi(config);
  }

  /** Membuat transaksi Midtrans dan mendapatkan snapToken */
  async createSnapToken(user: User, dto: CreatePaymentDto) {
    const pricingPlan = await this.prisma.pricingPlan.findUnique({
      where: { name: dto.plan },
    });

    if (!pricingPlan) {
      throw new BadRequestException(`Plan "${dto.plan}" tidak valid.`);
    }

    const grossAmount = pricingPlan.price;

    const orderId = `SYN-${uuidv4()}`;

    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: user.fullName,
        email: user.email,
      },
      item_details: [
        {
          id: dto.plan,
          price: grossAmount,
          quantity: 1,
          name: `Synapse Plan ${dto.plan}`,
        },
      ],
    };

    const transaction = await this.snap.createTransaction(parameter);

    // Simpan record payment dengan status pending
    await this.prisma.payment.create({
      data: {
        userId: user.id,
        orderId,
        snapToken: transaction.token,
        grossAmount,
        transactionStatus: 'pending',
        plan: dto.plan,
      },
    });

    this.logger.log(`Snap token dibuat untuk user ${user.id}, orderId: ${orderId}`);

    return {
      snapToken: transaction.token,
      redirectUrl: transaction.redirect_url,
      orderId,
    };
  }

  /** Memproses webhook notifikasi dari Midtrans */
  async handleMidtransWebhook(payload: Record<string, unknown>) {
    const orderId = payload['order_id'] as string;
    const transactionStatus = payload['transaction_status'] as string;
    const fraudStatus = payload['fraud_status'] as string;
    const signatureKey = payload['signature_key'] as string;
    const statusCode = payload['status_code'] as string;
    const grossAmount = payload['gross_amount'] as string;

    // ─── Verify Midtrans signature ────────────────────────────────────────
    const serverKey = this.configService.get<string>('MIDTRANS_SERVER_KEY')!;
    const expectedSignature = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex');

    if (!signatureKey || signatureKey !== expectedSignature) {
      this.logger.warn(`Invalid webhook signature for orderId=${orderId}`);
      throw new ForbiddenException('Invalid webhook signature.');
    }

    this.logger.log(`Webhook diterima: orderId=${orderId}, status=${transactionStatus}`);

    // Tentukan status pembayaran final
    let finalStatus = transactionStatus;
    if (transactionStatus === 'capture') {
      finalStatus = fraudStatus === 'accept' ? 'settlement' : 'fraud';
    }

    // Update status payment di database
    const payment = await this.prisma.payment.update({
      where: { orderId },
      data: { transactionStatus: finalStatus },
    });

    // Jika pembayaran berhasil, upgrade plan user
    if (finalStatus === 'settlement') {
      await this.prisma.user.update({
        where: { id: payment.userId },
        data: { plan: payment.plan },
      });

      // Kirim notifikasi in-app
      await this.prisma.notification.create({
        data: {
          userId: payment.userId,
          title: '🎉 Pembayaran Berhasil!',
          message: `Selamat! Akun Anda telah diupgrade ke plan ${payment.plan}. Nikmati semua fitur premium Synapse!`,
        },
      });

      this.logger.log(`User ${payment.userId} diupgrade ke plan ${payment.plan}`);
    }

    return { message: 'Webhook diproses.' };
  }

  /** Memverifikasi status transaksi langsung ke Midtrans API (fallback/instant) */
  async verifyPaymentStatus(orderId: string) {
    this.logger.log(`Memverifikasi status pembayaran ke Midtrans untuk orderId: ${orderId}`);
    try {
      const statusResponse = await this.core.transaction.status(orderId);
      const transactionStatus = statusResponse.transaction_status;
      const fraudStatus = statusResponse.fraud_status;

      let finalStatus = transactionStatus;
      if (transactionStatus === 'capture') {
        finalStatus = fraudStatus === 'accept' ? 'settlement' : 'fraud';
      }

      // Update status payment di database jika berubah
      const payment = await this.prisma.payment.update({
        where: { orderId },
        data: { transactionStatus: finalStatus },
      });

      if (finalStatus === 'settlement') {
        await this.prisma.user.update({
          where: { id: payment.userId },
          data: { plan: payment.plan },
        });

        // Cek apakah notifikasi sudah ada agar tidak duplikat
        const existingNotif = await this.prisma.notification.findFirst({
          where: {
            userId: payment.userId,
            title: '🎉 Pembayaran Berhasil!',
          },
        });

        if (!existingNotif) {
          await this.prisma.notification.create({
            data: {
              userId: payment.userId,
              title: '🎉 Pembayaran Berhasil!',
              message: `Selamat! Akun Anda telah diupgrade ke plan ${payment.plan}. Nikmati semua fitur premium Synapse!`,
            },
          });
        }

        this.logger.log(`User ${payment.userId} berhasil diverifikasi & diupgrade ke plan ${payment.plan}`);
      }

      return { status: finalStatus };
    } catch (error) {
      this.logger.error(`Gagal verifikasi pembayaran untuk orderId ${orderId}:`, error);
      throw new BadRequestException('Gagal memverifikasi status pembayaran.');
    }
  }
}
