import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

/**
 * @GetUser() – Decorator untuk mengambil user dari request secara langsung di controller.
 *
 * Contoh penggunaan:
 * @Get('profile')
 * @UseGuards(AuthGuard)
 * getProfile(@GetUser() user: User) {
 *   return user;
 * }
 */
export const GetUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: User = request.user;

    // Jika data parameter diisi, kembalikan field spesifik
    return data ? user?.[data] : user;
  },
);
