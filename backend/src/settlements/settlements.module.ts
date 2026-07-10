import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';

@Module({
  imports: [HistoryModule],
  providers: [SettlementsService],
  controllers: [SettlementsController],
})
export class SettlementsModule {}
