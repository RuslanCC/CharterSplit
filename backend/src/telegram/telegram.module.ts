import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { TelegramController } from './telegram.controller';

@Module({
  providers: [BotService],
  controllers: [TelegramController],
  exports: [BotService],
})
export class TelegramModule {}
