import {
  CanActivate,
  ExecutionContext,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';

/**
 * Guard that checks uploaded file size (multipart or base64) against user's plan maxFileSizeMb.
 * Apply with @UseGuards(FileSizeGuard) on upload endpoints.
 */
@Injectable()
export class FileSizeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.pricingPlan) return true;
    if (user.role === 'SUPERADMIN') return true;

    const maxBytes = (user.pricingPlan.maxFileSizeMb || 10) * 1024 * 1024;

    // Check multipart file upload
    const file = request.file;
    if (file && file.size > maxBytes) {
      throw new PayloadTooLargeException(
        `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Batas paket Anda: ${user.pricingPlan.maxFileSizeMb} MB.`,
      );
    }

    // Check base64 image in body (imageBase64 or base64)
    const body = request.body;
    if (body) {
      const b64 = body.imageBase64 || body.base64;
      if (typeof b64 === 'string' && b64.length > 0) {
        // base64 is ~33% larger than raw bytes
        const estimatedBytes = Math.ceil(b64.length * 0.75);
        if (estimatedBytes > maxBytes) {
          throw new PayloadTooLargeException(
            `File terlalu besar (~${(estimatedBytes / 1024 / 1024).toFixed(1)} MB). Batas paket Anda: ${user.pricingPlan.maxFileSizeMb} MB.`,
          );
        }
      }
    }

    return true;
  }
}
