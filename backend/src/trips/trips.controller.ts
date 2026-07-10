import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TripsService } from './trips.service';
import { ResolveTripDto, UpdateTripDto } from './dto';

@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  /** Резолвит поездку по контексту чата (создаёт при отсутствии). */
  @Post('resolve')
  resolve(@CurrentUser() user: User, @Body() dto: ResolveTripDto) {
    return this.trips.resolveOrCreate(user, dto);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.trips.getById(id, user);
  }

  @Get(':id/balances')
  balances(@Param('id') id: string, @CurrentUser() user: User) {
    return this.trips.getBalances(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateTripDto,
  ) {
    return this.trips.update(id, user, dto);
  }
}
