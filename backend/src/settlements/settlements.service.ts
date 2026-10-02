import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { NotifyService } from '../telegram/notify.service';
import { CreateSettlementDto } from './dto';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
    private readonly notify: NotifyService,
  ) {}

  async list(tripId: string, user: User) {
    await this.access.assertMember(tripId, user);
    return this.prisma.settlement.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      include: { fromMember: true, toMember: true },
    });
  }

  async create(tripId: string, user: User, dto: CreateSettlementDto) {
    await this.access.assertMember(tripId, user);
    if (dto.fromMemberId === dto.toMemberId) {
      throw new BadRequestException('должник и кредитор совпадают');
    }
    const [from, to] = await Promise.all([
      this.access.assertMemberInTrip(tripId, dto.fromMemberId),
      this.access.assertMemberInTrip(tripId, dto.toMemberId),
    ]);
    const settlement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
        data: {
          tripId,
          fromMemberId: dto.fromMemberId,
          toMemberId: dto.toMemberId,
          amount: dto.amount,
          note: dto.note ?? null,
        },
      });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.SETTLEMENT_RECORDED,
          entityType: 'Settlement',
          entityId: created.id,
          payload: {
            fromName: from.displayName,
            toName: to.displayName,
            amount: dto.amount,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
      return created;
    });

    void this.notify.balanceChanged(tripId);

    return settlement;
  }

  async remove(tripId: string, settlementId: string, user: User) {
    await this.access.assertMember(tripId, user);
    const settlement = await this.prisma.settlement.findFirst({
      where: { id: settlementId, tripId },
      include: { fromMember: true, toMember: true },
    });
    if (!settlement) throw new NotFoundException('settlement not found');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.settlement.delete({ where: { id: settlement.id } });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.SETTLEMENT_DELETED,
          entityType: 'Settlement',
          entityId: settlement.id,
          payload: {
            fromName: settlement.fromMember.displayName,
            toName: settlement.toMember.displayName,
            amount: settlement.amount,
          } as Prisma.InputJsonValue,
        },
        tx,
      );
      return { deleted: true };
    });

    void this.notify.balanceChanged(tripId);

    return result;
  }
}
