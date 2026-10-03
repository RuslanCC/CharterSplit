import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [TripsModule],
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
})
export class AdminModule {}
