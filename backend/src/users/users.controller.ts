import { Controller, Get } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  @Get('me')
  me(@CurrentUser() user: User) {
    return user;
  }
}
