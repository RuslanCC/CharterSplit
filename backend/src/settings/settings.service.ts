import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { UpdateSettingsDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
  ) {}

  async get(tripId: string, user: User) {
    await this.access.assertMember(tripId, user);
    return this.prisma.tripSettings.upsert({
      where: { tripId },
      create: { tripId },
      update: {},
    });
  }

  async update(tripId: string, user: User, dto: UpdateSettingsDto) {
    await this.access.assertMember(tripId, user);
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.tripSettings.upsert({
        where: { tripId },
        create: { tripId, ...dto },
        update: { ...dto },
      });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.SETTINGS_UPDATED,
          entityType: 'TripSettings',
          entityId: settings.id,
          payload: { ...dto },
        },
        tx,
      );
      return settings;
    });
  }
}
