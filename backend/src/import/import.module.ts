import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [HistoryModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
