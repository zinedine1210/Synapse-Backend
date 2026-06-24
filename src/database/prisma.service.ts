import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Optimize connection URL for pgbouncer + Supabase
    let dbUrl = process.env.DATABASE_URL || '';
    const params = new URLSearchParams();

    // Parse existing params
    const [baseUrl, existingParams] = dbUrl.split('?');
    if (existingParams) {
      new URLSearchParams(existingParams).forEach((v, k) => params.set(k, v));
    }

    // Ensure optimal connection settings
    if (!params.has('connection_limit')) params.set('connection_limit', '10');
    if (!params.has('pool_timeout')) params.set('pool_timeout', '10');
    // pgbouncer mode: disable prepared statements (required for transaction pooling)
    if (params.has('pgbouncer') && !params.has('statement_cache_size')) {
      params.set('statement_cache_size', '0');
    }

    dbUrl = `${baseUrl}?${params.toString()}`;

    super({
      log: process.env.APP_ENV === 'development' ? ['warn', 'error'] : ['error'],
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
