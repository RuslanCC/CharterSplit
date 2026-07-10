import { Body, Controller, Param, Post } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ImportService } from './import.service';
import { SplitwiseImportDto } from './dto';

@Controller('trips/:tripId/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('splitwise')
  importSplitwise(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Body() dto: SplitwiseImportDto,
  ) {
    return this.importService.importSplitwise(tripId, user, dto);
  }
}
