import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import * as compression from 'compression';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── Security Headers (Helmet + CSP) ──────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https:'],
        fontSrc: ["'self'", 'https:', 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow loading external images
  }));

  // ─── Response Compression (gzip) ──────────────────────────────────────────
  app.use(compression());

  // ─── Global Exception Filter ──────────────────────────────────────────────
  // Prevents stack traces & internal details from leaking to clients
  app.useGlobalFilters(new AllExceptionsFilter());

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
