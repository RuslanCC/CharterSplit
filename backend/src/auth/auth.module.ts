import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';

// Сам TelegramAuthGuard подключён глобально (APP_GUARD в AppModule).
@Module({
  controllers: [AuthController],
})
export class AuthModule {}
