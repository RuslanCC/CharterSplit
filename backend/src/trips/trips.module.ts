import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { TripsService } from './trips.service';
import { TripsController } from './trips.controller';
import { BalancesService } from './balances.service';

@Module({
  imports: [HistoryModule],
  providers: [TripsService, BalancesService],
  controllers: [TripsController],
  exports: [TripsService, BalancesService],
})
export class TripsModule {}
