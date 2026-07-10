import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto';

@Controller('trips/:tripId/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.settings.get(tripId, user);
  }

  @Patch()
  update(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settings.update(tripId, user, dto);
  }
}
