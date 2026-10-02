import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { validate } from '@tma.js/init-data-node';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { parseInitData } from '../common/init-data';

/**
 * Авторизация исключительно через Telegram Mini Apps.
 * Клиент присылает сырой initData в заголовке:  Authorization: tma <initDataRaw>
 * Сервер проверяет HMAC-подпись и свежесть auth_date, затем upsert-ит User по Telegram User ID.
 */
@Injectable()
export class TelegramAuthGuard implements CanActivate {
  private readonly logger = new Logger(TelegramAuthGuard.name);
  private readonly botToken: string;
  private readonly expiresIn: number;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    // С пустым токеном ключ подписи initData общеизвестен — подделать вход
    // смог бы кто угодно. Без токена не стартуем.
    if (!this.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }
    this.expiresIn = Number(this.config.get('INIT_DATA_EXPIRES_IN', 3600));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const raw = this.extractRaw(req);
    if (!raw) {
      throw new UnauthorizedException('missing Telegram init data');
    }

    try {
      validate(raw, this.botToken, { expiresIn: this.expiresIn });
    } catch (e) {
      this.logger.warn(`initData validation failed: ${(e as Error).message}`);
      throw new UnauthorizedException('invalid Telegram init data');
    }

    const initData = parseInitData(raw);
    const tgUser = initData.user;
    if (!tgUser?.id) {
      throw new UnauthorizedException('init data has no user');
    }

    const user = await this.prisma.user.upsert({
      where: { telegramUserId: BigInt(tgUser.id) },
      create: {
        telegramUserId: BigInt(tgUser.id),
        username: tgUser.username ?? null,
        firstName: tgUser.firstName ?? null,
        lastName: tgUser.lastName ?? null,
        photoUrl: tgUser.photoUrl ?? null,
        languageCode: tgUser.languageCode ?? null,
      },
      update: {
        username: tgUser.username ?? null,
        firstName: tgUser.firstName ?? null,
        lastName: tgUser.lastName ?? null,
        photoUrl: tgUser.photoUrl ?? null,
        languageCode: tgUser.languageCode ?? null,
      },
    });

    req.currentUser = user;
    req.initData = initData;
    return true;
  }

  private extractRaw(req: { headers?: { authorization?: string } }): string | null {
    const header = req.headers?.authorization;
    if (!header) return null;
    const [scheme, ...rest] = header.split(' ');
    if (scheme?.toLowerCase() !== 'tma') return null;
    const value = rest.join(' ').trim();
    return value.length > 0 ? value : null;
  }
}
