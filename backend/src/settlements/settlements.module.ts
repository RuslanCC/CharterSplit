import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { TelegramModule } from '../telegram/telegram.module';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';

@Module({
  imports: [HistoryModule, TelegramModule],
  providers: [SettlementsService],
  controllers: [SettlementsController],
})
export class SettlementsModule {}
