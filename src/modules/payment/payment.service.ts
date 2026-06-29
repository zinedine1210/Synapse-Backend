import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AuthGuard } from '../../common/guards/auth.guard';
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
    private readonly authGuard: AuthGuard,
  ) {
    const config = {
      isProduction: this.configService.get<string>('MIDTRANS_IS_PRODUCTION') === 'true',
      serverKey: this.configService.get<string>('MIDTRANS_SERVER_KEY')!,
      clientKey: this.configService.get<string>('MIDTRANS_CLIENT_KEY')!,
    };
    this.snap = new MidtransClient.Snap(config);
    this.core = new MidtransClient.CoreApi(config);
  }

  /** Returns all available pricing plans for the billing page */
  async getAvailablePlans() {
    return this.prisma.pricingPlan.findMany({
      orderBy: { price: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        maxUploadPerMonth: true,
        maxFileSizeMb: true,
        aiRequestLimit: true,
        aiBriefingLimit: true,
        aiWeeklyRoastLimit: true,
        aiFoodLimit: true,
        aiDigitalizationLimit: true,
        aiInsightLimit: true,
        aiExamPredictionLimit: true,
        aiQuizGenLimit: true,
        aiReceiptScanLimit: true,
        aiSkripsweetLimit: true,
        aiTodoParseLimit: true,
        features: true,
        price: true,
        durationDays: true,
      },
    });
  }

  /** Get user's payment history (recent 20) */
  async getPaymentHistory(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        orderId: true,
        plan: true,
        grossAmount: true,
        transactionStatus: true,
        snapToken: true,
        createdAt: true,
      },
    });
  }

  /** Resume a pending payment — returns its snap token so user can re-open popup */
  async resumePayment(userId: string, orderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, userId, transactionStatus: 'pending' },
    });

    if (!payment) {
      throw new BadRequestException('Transaksi tidak ditemukan atau sudah tidak pending.');
    }

    if (!payment.snapToken) {
      throw new BadRequestException('Token pembayaran sudah tidak tersedia. Silakan buat transaksi baru.');
    }

    // Check if the payment is still valid on Midtrans side
    try {
      const statusResponse = await this.core.transaction.status(orderId);
      if (statusResponse.transaction_status === 'expire' || statusResponse.transaction_status === 'cancel') {
        await this.prisma.payment.update({
          where: { orderId },
          data: { transactionStatus: statusResponse.transaction_status },
        });
        throw new BadRequestException('Transaksi sudah kadaluarsa. Silakan buat transaksi baru.');
      }
    } catch (error) {
      // If Midtrans returns 404, the transaction might still be usable with snap token
      if (error instanceof BadRequestException) throw error;
    }

    return {
      snapToken: payment.snapToken,
      orderId: payment.orderId,
      plan: payment.plan,
      grossAmount: payment.grossAmount,
    };
  }

  /** Membuat transaksi Midtrans dan mendapatkan snapToken */
  async createSnapToken(user: User, dto: CreatePaymentDto) {
    const pricingPlan = await this.prisma.pricingPlan.findUnique({
      where: { name: dto.plan },
    });

    if (!pricingPlan) {
      throw new BadRequestException(`Plan "${dto.plan}" tidak valid.`);
    }

    // Prevent downgrade — user can't buy a plan cheaper than their current one
    const currentPlan = await this.prisma.pricingPlan.findUnique({
      where: { name: (user as any).plan || 'FREE' },
    });
    if (currentPlan && pricingPlan.price <= currentPlan.price && pricingPlan.price > 0) {
      throw new BadRequestException('Tidak bisa membeli paket yang lebih rendah atau sama dari paket aktif.');
    }

    // Check for existing pending payment for the same plan — reuse it
    const existingPending = await this.prisma.payment.findFirst({
      where: {
        userId: user.id,
        plan: dto.plan,
        transactionStatus: 'pending',
        snapToken: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPending && existingPending.snapToken) {
      // Verify it's still valid on Midtrans
      try {
        const statusResponse = await this.core.transaction.status(existingPending.orderId);
        if (statusResponse.transaction_status === 'pending') {
          this.logger.log(`Reusing existing pending payment ${existingPending.orderId} for user ${user.id}`);
          return {
            snapToken: existingPending.snapToken,
            redirectUrl: null,
            orderId: existingPending.orderId,
          };
        }
        // If expired/cancelled, update DB and create new
        if (statusResponse.transaction_status === 'expire' || statusResponse.transaction_status === 'cancel') {
          await this.prisma.payment.update({
            where: { orderId: existingPending.orderId },
            data: { transactionStatus: statusResponse.transaction_status },
          });
        }
      } catch {
        // Midtrans error — proceed to create new transaction
      }
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
      // Calculate expiration date based on plan's durationDays
      const pricingPlan = await this.prisma.pricingPlan.findUnique({ where: { name: payment.plan } });
      const durationDays = pricingPlan?.durationDays || 30;
      const planExpiresAt = durationDays > 0 ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: payment.userId },
        data: { plan: payment.plan, planExpiresAt, dataRetentionDeadline: null },
      });

      // Kirim notifikasi in-app
      await this.prisma.notification.create({
        data: {
          userId: payment.userId,
          title: '🎉 Pembayaran Berhasil!',
          message: `Selamat! Akun Anda telah diupgrade ke plan ${payment.plan}. Nikmati semua fitur premium Synapse!`,
        },
      });

      // Invalidate auth cache so next /auth/me returns fresh plan data
      this.authGuard.invalidateUser(payment.userId);

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
        // Calculate expiration date based on plan's durationDays
        const pricingPlan = await this.prisma.pricingPlan.findUnique({ where: { name: payment.plan } });
        const durationDays = pricingPlan?.durationDays || 30;
        const planExpiresAt = durationDays > 0 ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;

        await this.prisma.user.update({
          where: { id: payment.userId },
          data: { plan: payment.plan, planExpiresAt, dataRetentionDeadline: null },
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

        // Invalidate auth cache so next /auth/me returns fresh plan data
        this.authGuard.invalidateUser(payment.userId);

        this.logger.log(`User ${payment.userId} berhasil diverifikasi & diupgrade ke plan ${payment.plan}`);
      }

      return { status: finalStatus };
    } catch (error) {
      this.logger.error(`Gagal verifikasi pembayaran untuk orderId ${orderId}:`, error);
      throw new BadRequestException('Gagal memverifikasi status pembayaran.');
    }
  }
}
