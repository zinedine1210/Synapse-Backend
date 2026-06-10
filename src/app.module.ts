import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassModule } from './modules/class/class.module';
import { SessionModule } from './modules/session/session.module';
import { MaterialModule } from './modules/material/material.module';
import { AiModule } from './modules/ai/ai.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SuperadminModule } from './modules/superadmin/superadmin.module';
import { ForumModule } from './modules/forum/forum.module';
import { KolektifModule } from './modules/kolektif/kolektif.module';
import { TaskModule } from './modules/task/task.module';
import { GroupModule } from './modules/group/group.module';
import { ExamPredictionModule } from './modules/exam-prediction/exam-prediction.module';
import { DuitTrackerModule } from './modules/duit-tracker/duit-tracker.module';
import { SiBawelModule } from './modules/si-bawel/si-bawel.module';
import { TodoModule } from './modules/todo/todo.module';
import { QnaModule } from './modules/qna/qna.module';
import { BriefingModule } from './modules/briefing/briefing.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    // ─── Config & Env Validation (Fail-Fast) ────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv, // Server crash jika .env tidak lengkap
    }),

    // ─── Rate Limiting (Proteksi API AI) ─────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL ?? '60') * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '30'),
      },
    ]),

    // ─── Core Modules ─────────────────────────────────────────────────────────
    DatabaseModule,
    AuthModule,
    ClassModule,
    SessionModule,
    MaterialModule,
    AiModule,
    QuizModule,
    PaymentModule,
    NotificationModule,
    SuperadminModule,
    ForumModule,
    KolektifModule,
    TaskModule,
    GroupModule,
    ExamPredictionModule,
    DuitTrackerModule,
    SiBawelModule,
    TodoModule,
    QnaModule,
    BriefingModule,
  ],
  providers: [
    // ─── Global Rate Limit Guard ──────────────────────────────────────────────
    // Memastikan ThrottlerModule benar-benar aktif untuk SEMUA endpoint
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
