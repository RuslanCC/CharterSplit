import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { AddMemberDto, UpdateMemberDto } from './dto';

@Injectable()
export class ParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
  ) {}

  async list(tripId: string, user: User) {
    await this.access.assertMember(tripId, user);
    return this.prisma.tripMember.findMany({
      where: { tripId },
      orderBy: { joinedAt: 'asc' },
      include: {
        user: { select: { username: true, firstName: true, lastName: true } },
      },
    });
  }

  async addGuest(tripId: string, user: User, dto: AddMemberDto) {
    await this.access.assertMember(tripId, user);
    const settings = await this.prisma.tripSettings.findUnique({ where: { tripId } });
    if (settings && !settings.allowGuestMembers) {
      throw new ForbiddenException('guest members are disabled for this trip');
    }
    const username = dto.telegramUsername
      ? dto.telegramUsername.replace(/^@/, '').toLowerCase()
      : null;
    const displayName = dto.displayName?.trim() || (username ? `@${username}` : '');
    if (!displayName) {
      throw new BadRequestException('displayName or telegramUsername required');
    }
    if (username) {
      // Ник уже занят: заглушкой или участником, чей аккаунт носит этот ник.
      const taken = await this.prisma.tripMember.findFirst({
        where: {
          tripId,
          OR: [
            { telegramUsername: username },
            { user: { username: { equals: username, mode: 'insensitive' } } },
          ],
        },
      });
      if (taken) {
        throw new BadRequestException(`@${username} уже есть в поездке`);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.tripMember.create({
        data: { tripId, displayName, telegramUsername: username, userId: null },
      });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.MEMBER_ADDED,
          entityType: 'TripMember',
          entityId: member.id,
          payload: {
            displayName: member.displayName,
            guest: true,
            ...(username ? { telegramUsername: username } : {}),
          },
        },
        tx,
      );
      return member;
    });
  }

  async update(tripId: string, memberId: string, user: User, dto: UpdateMemberDto) {
    // Смена активности/роли участника — trip-level, только владелец.
    // Переименование и семейные связи может менять любой участник.
    if (dto.isActive !== undefined || dto.role !== undefined) {
      await this.access.assertOwner(tripId, user);
    } else {
      await this.access.assertMember(tripId, user);
    }
    const target = await this.access.assertMemberInTrip(tripId, memberId);
    // Владелец не может снять роль или деактивировать сам себя — иначе поездка
    // останется без владельца и им молча станет первый открывший приложение.
    if (
      target.userId === user.id &&
      ((dto.role !== undefined && dto.role !== target.role) || dto.isActive === false)
    ) {
      throw new BadRequestException('you cannot demote or deactivate yourself');
    }
    if (
      dto.displayName === undefined &&
      dto.isActive === undefined &&
      dto.role === undefined &&
      dto.coveredByMemberId === undefined
    ) {
      throw new BadRequestException('nothing to update');
    }
    if (dto.coveredByMemberId != null) {
      await this.assertCoverageAllowed(tripId, memberId, dto.coveredByMemberId);
    }
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.tripMember.update({
        where: { id: memberId },
        data: {
          ...(dto.displayName !== undefined
            ? { displayName: dto.displayName.trim() }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.coveredByMemberId !== undefined
            ? { coveredByMemberId: dto.coveredByMemberId }
            : {}),
        },
      });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.MEMBER_UPDATED,
          entityType: 'TripMember',
          entityId: member.id,
          payload: { displayName: member.displayName, isActive: member.isActive },
        },
        tx,
      );
      return member;
    });
  }

  /** Валидация семейной связи: покрывающий — из этой поездки, без само- и циклических ссылок. */
  private async assertCoverageAllowed(
    tripId: string,
    memberId: string,
    coveredByMemberId: string,
  ) {
    if (coveredByMemberId === memberId) {
      throw new BadRequestException('member cannot cover themselves');
    }
    await this.access.assertMemberInTrip(tripId, coveredByMemberId);
    // проверка цикла: поднимаемся по цепочке покрытий от нового покрывающего
    const members = await this.prisma.tripMember.findMany({
      where: { tripId },
      select: { id: true, coveredByMemberId: true },
    });
    const parent = new Map(members.map((m) => [m.id, m.coveredByMemberId]));
    let cursor: string | null | undefined = coveredByMemberId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === memberId || seen.has(cursor)) {
        throw new BadRequestException('circular family coverage is not allowed');
      }
      seen.add(cursor);
      cursor = parent.get(cursor);
    }
  }

  /** Мягкое удаление: деактивация (история и доли сохраняются). Только владелец. */
  async deactivate(tripId: string, memberId: string, user: User) {
    await this.access.assertOwner(tripId, user);
    await this.access.assertMemberInTrip(tripId, memberId);
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.tripMember.update({
        where: { id: memberId },
        data: { isActive: false },
      });
      await this.history.record(
        {
          tripId,
          actorUserId: user.id,
          action: HistoryAction.MEMBER_DEACTIVATED,
          entityType: 'TripMember',
          entityId: member.id,
          payload: { displayName: member.displayName },
        },
        tx,
      );
      return member;
    });
  }
}
