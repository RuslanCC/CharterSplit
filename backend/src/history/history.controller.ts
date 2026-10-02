import { Controller, Get, Param, Query } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccessService } from '../common/access.service';
import { HistoryService } from './history.service';
import { HistoryQueryDto } from './dto';

@Controller('trips/:tripId/history')
export class HistoryController {
  constructor(
    private readonly history: HistoryService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Query() query: HistoryQueryDto,
  ) {
    await this.access.assertMember(tripId, user);
    return this.history.list(tripId, query);
  }
}
