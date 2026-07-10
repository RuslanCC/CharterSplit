import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [HistoryModule],
  providers: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
