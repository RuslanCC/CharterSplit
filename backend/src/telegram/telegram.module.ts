import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { ExportModule } from '../export/export.module';
import { BotService } from './bot.service';
import { NotifyService } from './notify.service';
import { TelegramController } from './telegram.controller';
import { ExportController } from './export.controller';

@Module({
  imports: [TripsModule, ExportModule],
  providers: [BotService, NotifyService],
  controllers: [TelegramController, ExportController],
  exports: [BotService, NotifyService],
})
export class TelegramModule {}
