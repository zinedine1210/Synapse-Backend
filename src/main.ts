import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── Security Headers (Helmet) ────────────────────────────────────────────
  app.use(helmet());

  // ─── Body Size Limit ──────────────────────────────────────────────────────
  // Dikurangi dari 50mb → 10mb untuk mencegah abuse via payload besar
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  // ─── Global Validation Pipe ───────────────────────────────────────────────
  // Mencegah SQL injection & data tidak valid masuk ke controller
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // Hapus properti yang tidak terdaftar di DTO
      forbidNonWhitelisted: true, // Tolak request jika ada properti ekstra
      transform: true,         // Auto-transform tipe data (string → number, dll)
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── CORS ─────────────────────────────────────────────────────────────────
  const corsOriginEnv = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  // Support multiple origins separated by comma
  const allowedOrigins = corsOriginEnv.split(',').map(o => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  // ─── WebSocket Adapter (with CORS) ────────────────────────────────────────
  const ioAdapter = new IoAdapter(app);
  app.useWebSocketAdapter(ioAdapter);

  // ─── Global Prefix ────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  const port = process.env.APP_PORT ?? 3001;
  await app.listen(port);

  console.log(`🧠 Synapse Backend berjalan di: http://localhost:${port}/api/v1`);
}

bootstrap();
