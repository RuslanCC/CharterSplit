import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { BalancesService } from './balances.service';
import { ResolveTripDto, UpdateTripDto } from './dto';

function displayNameOf(user: User): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.username || `user_${user.telegramUserId}`;
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
    private readonly balances: BalancesService,
  ) {}

  /** Находит поездку по Chat ID / chatInstance / startParam или создаёт новую. */
  async resolveOrCreate(user: User, dto: ResolveTripDto) {
    const keys: Prisma.TripWhereInput[] = [];
    if (dto.telegramChatId !== undefined)
      keys.push({ telegramChatId: BigInt(dto.telegramChatId) });
    if (dto.chatInstance) keys.push({ chatInstance: dto.chatInstance });
    if (dto.startParam) keys.push({ startParam: dto.startParam });

    let trip =
      keys.length > 0
        ? await this.prisma.trip.findFirst({ where: { OR: keys } })
        : null;

    if (!trip) {
      trip = await this.prisma.$transaction(async (tx) => {
        const created = await tx.trip.create({
          data: {
            telegramChatId:
              dto.telegramChatId !== undefined ? BigInt(dto.telegramChatId) : null,
            chatInstance: dto.chatInstance ?? null,
            startParam: dto.startParam ?? null,
            title: dto.title?.trim() || 'Поездка',
            currency: dto.currency ?? 'RUB',
            settings: { create: {} },
            members: {
              create: {
                userId: user.id,
                displayName: displayNameOf(user),
                role: MemberRole.OWNER,
              },
            },
          },
        });
        await this.history.record(
          {
            tripId: created.id,
            actorUserId: user.id,
            action: HistoryAction.TRIP_CREATED,
            entityType: 'Trip',
            entityId: created.id,
            payload: { title: created.title },
          },
          tx,
        );
        return created;
      });
    } else {
      // Гарантируем членство открывшего пользователя.
      const existing = await this.prisma.tripMember.findFirst({
        where: { tripId: trip.id, userId: user.id },
      });
      if (!existing) {
        await this.prisma.$transaction(async (tx) => {
          const m = await tx.tripMember.create({
            data: {
              tripId: trip!.id,
              userId: user.id,
              displayName: displayNameOf(user),
              role: MemberRole.MEMBER,
            },
          });
          await this.history.record(
            {
              tripId: trip!.id,
              actorUserId: user.id,
              action: HistoryAction.MEMBER_ADDED,
              entityType: 'TripMember',
              entityId: m.id,
              payload: { displayName: m.displayName, self: true },
            },
            tx,
          );
        });
      }
    }

    return this.getById(trip.id, user);
  }

  async getById(id: string, user: User) {
    await this.access.assertMember(id, user);
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        members: { orderBy: { joinedAt: 'asc' } },
        settings: true,
      },
    });
    if (!trip) throw new NotFoundException('trip not found');
    return trip;
  }

  async update(id: string, user: User, dto: UpdateTripDto) {
    await this.access.assertMember(id, user);
    if (dto.title === undefined && dto.currency === undefined) {
      throw new BadRequestException('nothing to update');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.trip.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        },
      });
      await this.history.record(
        {
          tripId: id,
          actorUserId: user.id,
          action: HistoryAction.TRIP_UPDATED,
          entityType: 'Trip',
          entityId: id,
          payload: { title: updated.title, currency: updated.currency },
        },
        tx,
      );
      return updated;
    });
  }

  async getBalances(id: string, user: User) {
    await this.access.assertMember(id, user);
    return this.balances.compute(id);
  }
}
