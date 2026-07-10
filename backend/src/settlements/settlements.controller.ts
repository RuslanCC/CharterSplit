import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SettlementsService } from './settlements.service';
import { CreateSettlementDto } from './dto';

@Controller('trips/:tripId/settlements')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  list(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.settlements.list(tripId, user);
  }

  @Post()
  create(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.settlements.create(tripId, user, dto);
  }

  @Delete(':settlementId')
  remove(
    @Param('tripId') tripId: string,
    @Param('settlementId') settlementId: string,
    @CurrentUser() user: User,
  ) {
    return this.settlements.remove(tripId, settlementId, user);
  }
}
