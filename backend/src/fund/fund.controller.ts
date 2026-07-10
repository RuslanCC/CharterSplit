import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FundService } from './fund.service';
import { FundAdjustDto, FundTxnDto } from './dto';

@Controller('trips/:tripId/fund')
export class FundController {
  constructor(private readonly fund: FundService) {}

  @Get()
  get(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.fund.getFund(tripId, user);
  }

  @Post('contribute')
  contribute(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Body() dto: FundTxnDto,
  ) {
    return this.fund.contribute(tripId, user, dto);
  }

  @Post('payout')
  payout(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Body() dto: FundTxnDto,
  ) {
    return this.fund.payout(tripId, user, dto);
  }

  @Post('adjust')
  adjust(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Body() dto: FundAdjustDto,
  ) {
    return this.fund.adjust(tripId, user, dto);
  }
}
