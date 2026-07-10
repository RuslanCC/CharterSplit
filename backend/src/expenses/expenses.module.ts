import { Module } from '@nestjs/common';
import { HistoryModule } from '../history/history.module';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';

@Module({
  imports: [HistoryModule],
  providers: [ExpensesService],
  controllers: [ExpensesController],
})
export class ExpensesModule {}
