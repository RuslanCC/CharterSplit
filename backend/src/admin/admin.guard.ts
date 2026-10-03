import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';
import { isAdmin, parseAdminIds } from './admin-ids';

/**
 * Доступ к админ-разделу только для ADMIN_TELEGRAM_IDS. Работает после
 * глобального TelegramAuthGuard, который уже проверил initData и положил
 * пользователя в req.currentUser.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly ids: Set<bigint>;

  constructor(config: ConfigService) {
    this.ids = parseAdminIds(config.get<string>('ADMIN_TELEGRAM_IDS', ''));
  }

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ currentUser?: User }>().currentUser;
    if (!isAdmin(this.ids, user?.telegramUserId)) {
      throw new ForbiddenException('admin only');
    }
    return true;
  }
}
