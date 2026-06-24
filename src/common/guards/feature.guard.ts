import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check handler (method) first, then fall back to class-level decorator
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Superadmin is allowed to access everything or doesn't have features restriction
    if (user && user.role === 'SUPERADMIN') {
      return true;
    }

    if (
      !user ||
      !user.pricingPlan ||
      !user.pricingPlan.features.includes(requiredFeature)
    ) {
      throw new ForbiddenException(
        `Fitur '${requiredFeature}' tidak diizinkan pada paket Anda. Silakan tingkatkan paket Anda.`,
      );
    }

    return true;
  }
}
