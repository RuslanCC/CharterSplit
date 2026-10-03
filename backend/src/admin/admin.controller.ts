import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminTripsQueryDto } from './dto';

/** Статистика использования бота и отчёты по всем поездкам — только для админов. */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('trips')
  trips(@Query() q: AdminTripsQueryDto) {
    return this.admin.listTrips(q);
  }

  @Get('trips/:id')
  trip(@Param('id') id: string) {
    return this.admin.tripReport(id);
  }
}
