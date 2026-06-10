import { AiRateLimitGuard } from './ai-rate-limit.guard';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

describe('AiRateLimitGuard', () => {
  let guard: AiRateLimitGuard;
  const mockPrisma = {} as any;

  beforeEach(() => {
    guard = new AiRateLimitGuard(mockPrisma);
  });

  function createMockContext(user: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  }

  it('should allow request when no user (let AuthGuard handle)', async () => {
    const ctx = createMockContext(null);
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should allow SUPERADMIN without limit', async () => {
    const ctx = createMockContext({ id: 'admin-1', role: 'SUPERADMIN' });
    // Call many times — should never throw
    for (let i = 0; i < 100; i++) {
      expect(await guard.canActivate(ctx)).toBe(true);
    }
  });

  it('should allow requests under the limit', async () => {
    const user = {
      id: 'user-1',
      role: 'USER',
      pricingPlan: { aiRequestLimit: 5, name: 'STARTER' },
    };
    const ctx = createMockContext(user);
    for (let i = 0; i < 5; i++) {
      expect(await guard.canActivate(ctx)).toBe(true);
    }
  });

  it('should block requests at the limit with 429', async () => {
    const user = {
      id: 'user-2',
      role: 'USER',
      pricingPlan: { aiRequestLimit: 3, name: 'FREE' },
    };
    const ctx = createMockContext(user);

    // Use all 3 requests
    for (let i = 0; i < 3; i++) {
      await guard.canActivate(ctx);
    }

    // 4th request should throw
    try {
      await guard.canActivate(ctx);
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const response = (err as HttpException).getResponse() as any;
      expect(response.limit).toBe(3);
      expect(response.used).toBe(3);
      expect(response.remaining).toBe(0);
      expect(response.plan).toBe('FREE');
    }
  });

  it('should use fallback limit when no pricing plan', async () => {
    const user = { id: 'user-3', role: 'USER' };
    const ctx = createMockContext(user);
    // Default fallback is 20, allow 20 calls
    for (let i = 0; i < 20; i++) {
      expect(await guard.canActivate(ctx)).toBe(true);
    }
    // 21st should throw
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('should reset counter on a new day', async () => {
    const user = {
      id: 'user-4',
      role: 'USER',
      pricingPlan: { aiRequestLimit: 1, name: 'FREE' },
    };
    const ctx = createMockContext(user);

    // Use the 1 request
    await guard.canActivate(ctx);

    // Simulate next day by manipulating the internal map
    const internalMap = (guard as any).dailyCounts;
    internalMap.set('user-4', { count: 1, date: '2020-01-01' });

    // Should work again because date changed
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should track separate limits per user', async () => {
    const user1 = {
      id: 'user-a',
      role: 'USER',
      pricingPlan: { aiRequestLimit: 1, name: 'FREE' },
    };
    const user2 = {
      id: 'user-b',
      role: 'USER',
      pricingPlan: { aiRequestLimit: 1, name: 'FREE' },
    };

    await guard.canActivate(createMockContext(user1));
    // user1 exhausted, user2 should still work
    expect(await guard.canActivate(createMockContext(user2))).toBe(true);

    // user1 should be blocked
    await expect(guard.canActivate(createMockContext(user1))).rejects.toThrow(HttpException);
  });
});
