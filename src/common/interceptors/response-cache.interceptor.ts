import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

export const CACHE_TTL_KEY = 'cache_ttl';

/**
 * Decorator to set response cache TTL (in seconds) on a controller method.
 * Usage: @CacheTTL(60) → cache response for 60 seconds
 */
export const CacheTTL = (seconds: number) => SetMetadata(CACHE_TTL_KEY, seconds);

interface CacheEntry {
  data: any;
  expiresAt: number;
}

/**
 * In-memory response cache interceptor.
 * Caches GET responses based on URL + user ID to avoid re-querying heavy analytics.
 */
@Injectable()
export class ResponseCacheInterceptor implements NestInterceptor {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly reflector: Reflector) {
    // Cleanup every 2 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= now) this.cache.delete(key);
      }
    }, 2 * 60 * 1000);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ttl = this.reflector.get<number>(CACHE_TTL_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest();

    // For mutations (POST/PATCH/PUT/DELETE): invalidate all caches for this user
    if (request.method !== 'GET') {
      return next.handle().pipe(
        tap(() => {
          const userId = request.user?.id || 'anon';
          for (const key of this.cache.keys()) {
            if (key.startsWith(`${userId}:`)) this.cache.delete(key);
          }
        }),
      );
    }

    if (!ttl) return next.handle();

    const userId = request.user?.id || 'anon';
    const cacheKey = `${userId}:${request.url}`;

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return of(cached.data);
    }

    return next.handle().pipe(
      tap((data) => {
        this.cache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ttl * 1000,
        });
      }),
    );
  }
}
