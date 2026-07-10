import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { TelegramAuthGuard } from './telegram-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [TelegramAuthGuard],
  exports: [TelegramAuthGuard],
})
export class AuthModule {}
