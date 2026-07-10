import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParticipantsService } from './participants.service';
import { AddMemberDto, UpdateMemberDto } from './dto';

@Controller('trips/:tripId/members')
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}

  @Get()
  list(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.participants.list(tripId, user);
  }

  @Post()
  add(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Body() dto: AddMemberDto,
  ) {
    return this.participants.addGuest(tripId, user, dto);
  }

  @Patch(':memberId')
  update(
    @Param('tripId') tripId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.participants.update(tripId, memberId, user, dto);
  }

  @Delete(':memberId')
  deactivate(
    @Param('tripId') tripId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
  ) {
    return this.participants.deactivate(tripId, memberId, user);
  }
}
