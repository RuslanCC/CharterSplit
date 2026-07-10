import { Controller, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser, InitData } from '../common/decorators/current-user.decorator';
import type { ParsedInitData } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  /**
   * Открытие сессии: валидация initData происходит в guard.
   * Возвращаем пользователя и контекст чата, чтобы фронт мог зарезолвить поездку.
   */
  @Post('session')
  session(@CurrentUser() user: User, @InitData() initData: ParsedInitData) {
    return {
      user,
      context: {
        telegramChatId: initData?.chat?.id ?? null,
        chatInstance: initData?.chatInstance ?? null,
        chatType: initData?.chatType ?? initData?.chat?.type ?? null,
        startParam: initData?.startParam ?? null,
      },
    };
  }
}
