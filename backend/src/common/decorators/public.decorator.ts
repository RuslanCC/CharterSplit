import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Помечает маршрут как публичный — TelegramAuthGuard его пропускает. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
