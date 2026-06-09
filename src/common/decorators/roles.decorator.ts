import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * @Roles() – Decorator untuk membatasi akses endpoint berdasarkan role user.
 *
 * Contoh penggunaan:
 * @Get('admin/users')
 * @UseGuards(AuthGuard, RolesGuard)
 * @Roles(Role.SUPERADMIN)
 * getAllUsers() { ... }
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
