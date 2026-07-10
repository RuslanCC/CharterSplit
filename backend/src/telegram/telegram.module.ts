import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { BotService } from './bot.service';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [TripsModule],
  providers: [BotService],
  controllers: [TelegramController],
  exports: [BotService],
})
export class TelegramModule {}
