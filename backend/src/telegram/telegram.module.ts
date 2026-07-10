import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { BotService } from './bot.service';
import { NotifyService } from './notify.service';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [TripsModule],
  providers: [BotService, NotifyService],
  controllers: [TelegramController],
  exports: [BotService, NotifyService],
})
export class TelegramModule {}
