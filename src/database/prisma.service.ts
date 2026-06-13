import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Append connection_limit to DATABASE_URL if not already present (keeps Prisma pool within Supabase limits)
    let dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl && !dbUrl.includes('connection_limit')) {
      const separator = dbUrl.includes('?') ? '&' : '?';
      dbUrl = `${dbUrl}${separator}connection_limit=5`;
    }

    super({
      log: process.env.APP_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
      datasources: {
        db: { url: dbUrl },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('✅ Database terhubung (Prisma)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database terputus');
  }
}
