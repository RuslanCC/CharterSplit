import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { HistoryService } from './history.service';

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
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
    @Query('action') action?: string,
    @Query('memberId') memberId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.access.assertMember(tripId, user);
    return this.history.list(tripId, {
      cursor,
      take: take ? Number(take) : undefined,
      action,
      memberId,
      from,
      to,
    });
  }
}
