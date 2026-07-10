import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@prisma/client';

/** Текущий пользователь (upsert в TelegramAuthGuard из initData). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const req = ctx.switchToHttp().getRequest();
    return req.currentUser;
  },
);

export interface ParsedInitData {
  user?: {
    id: number;
    firstName?: string;
    lastName?: string;
    username?: string;
    languageCode?: string;
    photoUrl?: string;
  };
  chat?: { id: number; type?: string; title?: string };
  chatInstance?: string;
  chatType?: string;
  startParam?: string;
  authDate?: Date;
}

/** Разобранные данные запуска Mini App. */
export const InitData = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ParsedInitData => {
    const req = ctx.switchToHttp().getRequest();
    return req.initData;
  },
);
