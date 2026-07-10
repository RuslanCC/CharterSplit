import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { TelegramModule } from '../telegram/telegram.module';
import { FundService } from './fund.service';
import { FundController } from './fund.controller';

@Module({
  imports: [HistoryModule, TelegramModule],
  providers: [FundService],
  controllers: [FundController],
})
export class FundModule {}
