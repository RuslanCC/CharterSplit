import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { ParticipantsService } from './participants.service';
import { ParticipantsController } from './participants.controller';

@Module({
  imports: [HistoryModule],
  providers: [ParticipantsService],
  controllers: [ParticipantsController],
})
export class ParticipantsModule {}
