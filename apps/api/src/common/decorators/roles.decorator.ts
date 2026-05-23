import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Allowed membership roles for this route (empty = use guard defaults). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
