import {
  BadRequestException,
  Controller,
  Param,
  Post,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ExportService } from '../export/export.service';
import { BotService } from './bot.service';

/**
 * Экспорт из Mini App: пользователь просит бота прислать CSV в чат поездки.
 * Живёт в TelegramModule, чтобы использовать BotService без циклов модулей.
 */
@Controller('trips/:tripId/export')
export class ExportController {
  constructor(
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
    private readonly bot: BotService,
  ) {}

  @Post('send-to-chat')
  async sendToChat(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
  ) {
    await this.access.assertMember(tripId, user);
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip?.telegramChatId) {
      throw new BadRequestException('поездка не привязана к групповому чату');
    }
    const { filename, content } = await this.exporter.buildCsv(tripId);
    await this.bot.sendDocumentToChat(
      trip.telegramChatId,
      filename,
      content,
      `📄 Расходы поездки «${trip.title}»`,
    );
    return { sent: true };
  }
}
