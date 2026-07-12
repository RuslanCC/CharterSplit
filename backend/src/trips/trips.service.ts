import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { BalancesService } from './balances.service';
import { displayNameOf } from '../common/format';
import { ResolveTripDto, UpdateTripDto } from './dto';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
    private readonly balances: BalancesService,
  ) {}

  /**
   * Находит или создаёт поездку для группового чата (вызывается ботом при
   * добавлении в группу). Участников нет — первый открывший станет OWNER.
   * startParam = "c<chatId>" — ключ для запуска Mini App по прямой ссылке.
   */
  async ensureForGroupChat(chatId: number, title?: string) {
    const telegramChatId = BigInt(chatId);
    const existing = await this.prisma.trip.findUnique({
      where: { telegramChatId },
    });
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          telegramChatId,
          startParam: `c${chatId}`,
          title: title?.trim() || 'Поездка',
          settings: { create: {} },
        },
      });
      await this.history.record(
        {
          tripId: created.id,
          action: HistoryAction.TRIP_CREATED,
          entityType: 'Trip',
          entityId: created.id,
          payload: { title: created.title, fromGroupChat: true },
        },
        tx,
      );
      return created;
    });
  }

  /**
   * Поездка группового чата с рассчитанными балансами (для команды /balance).
   * Создаёт поездку, если её ещё нет.
   */
  async balancesForGroupChat(chatId: number, chatTitle?: string) {
    const trip = await this.ensureForGroupChat(chatId, chatTitle);
    const balances = await this.balances.compute(trip.id);
    return { trip, ...balances };
  }

  /** Сохраняет id закреплённого «табло баланса» (null — сбросить). */
  async setPinnedMessageId(tripId: string, messageId: number | null): Promise<void> {
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { pinnedMessageId: messageId === null ? null : BigInt(messageId) },
    });
  }

  /** Итоги поездки группового чата (для команды /summary). */
  async summaryForGroupChat(chatId: number, chatTitle?: string) {
    const trip = await this.ensureForGroupChat(chatId, chatTitle);
    const summary = await this.balances.summary(trip.id);
    return { trip, summary };
  }

  /**
   * Регистрирует автора сообщения в группе как участника поездки (вызывается
   * ботом). Если участник добавлялся заглушкой по @username — привязывает её.
   * Владельца не назначает: OWNER станет первый открывший приложение.
   */
  async registerChatMember(
    chatId: number,
    chatTitle: string | undefined,
    tg: {
      id: number;
      username?: string;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<void> {
    const trip = await this.ensureForGroupChat(chatId, chatTitle);
    const user = await this.prisma.user.upsert({
      where: { telegramUserId: BigInt(tg.id) },
      create: {
        telegramUserId: BigInt(tg.id),
        username: tg.username ?? null,
        firstName: tg.firstName ?? null,
        lastName: tg.lastName ?? null,
      },
      update: {
        username: tg.username ?? null,
        firstName: tg.firstName ?? null,
        lastName: tg.lastName ?? null,
      },
    });

    const existing = await this.prisma.tripMember.findFirst({
      where: { tripId: trip.id, userId: user.id },
    });
    if (existing) {
      // Вернулся в группу после выхода — реактивируем.
      if (!existing.isActive) {
        await this.prisma.tripMember.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
      return;
    }

    const uname = user.username?.toLowerCase() ?? null;
    await this.prisma.$transaction(async (tx) => {
      const placeholder = uname
        ? await tx.tripMember.findFirst({
            where: { tripId: trip.id, userId: null, telegramUsername: uname },
          })
        : null;
      const m = placeholder
        ? await tx.tripMember.update({
            where: { id: placeholder.id },
            data: {
              userId: user.id,
              displayName: displayNameOf(user),
              isActive: true,
            },
          })
        : await tx.tripMember.create({
            data: {
              tripId: trip.id,
              userId: user.id,
              displayName: displayNameOf(user),
              telegramUsername: uname,
            },
          });
      await this.history.record(
        {
          tripId: trip.id,
          actorUserId: user.id,
          action: placeholder
            ? HistoryAction.MEMBER_UPDATED
            : HistoryAction.MEMBER_ADDED,
          entityType: 'TripMember',
          entityId: m.id,
          payload: {
            displayName: m.displayName,
            fromChat: true,
            ...(placeholder ? { claimedUsername: uname } : {}),
          },
        },
        tx,
      );
    });
  }

  /** Деактивирует участника, покинувшего групповой чат (история сохраняется). */
  async deactivateChatMember(chatId: number, telegramUserId: number): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { telegramChatId: BigInt(chatId) },
    });
    if (!trip) return;
    const member = await this.prisma.tripMember.findFirst({
      where: {
        tripId: trip.id,
        isActive: true,
        user: { telegramUserId: BigInt(telegramUserId) },
      },
    });
    if (!member) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.tripMember.update({
        where: { id: member.id },
        data: { isActive: false },
      });
      await this.history.record(
        {
          tripId: trip.id,
          action: HistoryAction.MEMBER_DEACTIVATED,
          entityType: 'TripMember',
          entityId: member.id,
          payload: { displayName: member.displayName, leftChat: true },
        },
        tx,
      );
    });
  }

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
      // Не создаём «сиротскую» поездку из запуска без стабильного ключа группы.
      // startParam ("c<chatId>") приходит только с кнопки-ссылки из группового
      // чата; telegramChatId — при запуске из самого чата. Запуск без них
      // (web_app-кнопка из лички, Menu Button, голый URL приложения) не привязан
      // ни к какой поездке, и chatInstance у него свой — иначе пользователь
      // молча получал бы новую пустую поездку вместо общей.
      const hasGroupKey = !!dto.startParam || dto.telegramChatId !== undefined;
      if (!hasGroupKey) {
        throw new ConflictException(
          'Откройте приложение кнопкой «Открыть CharterSplit» из группового чата поездки.',
        );
      }
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
      await this.prisma.$transaction(async (tx) => {
        // Поездка, созданная ботом от группы, не имеет владельца —
        // первый открывший приложение становится OWNER (даже если его
        // запись уже была создана пассивно из сообщений чата).
        const hasOwner =
          (await tx.tripMember.count({
            where: { tripId: trip!.id, role: MemberRole.OWNER },
          })) > 0;
        if (existing) {
          if (!hasOwner) {
            await tx.tripMember.update({
              where: { id: existing.id },
              data: { role: MemberRole.OWNER },
            });
          }
          return;
        }
        // Заглушка, добавленная по @username, привязывается к аккаунту.
        const uname = user.username?.toLowerCase() ?? null;
        const placeholder = uname
          ? await tx.tripMember.findFirst({
              where: { tripId: trip!.id, userId: null, telegramUsername: uname },
            })
          : null;
        const role = hasOwner ? MemberRole.MEMBER : MemberRole.OWNER;
        const m = placeholder
          ? await tx.tripMember.update({
              where: { id: placeholder.id },
              data: {
                userId: user.id,
                displayName: displayNameOf(user),
                role: hasOwner ? placeholder.role : MemberRole.OWNER,
              },
            })
          : await tx.tripMember.create({
              data: {
                tripId: trip!.id,
                userId: user.id,
                displayName: displayNameOf(user),
                role,
              },
            });
        await this.history.record(
          {
            tripId: trip!.id,
            actorUserId: user.id,
            action: placeholder
              ? HistoryAction.MEMBER_UPDATED
              : HistoryAction.MEMBER_ADDED,
            entityType: 'TripMember',
            entityId: m.id,
            payload: {
              displayName: m.displayName,
              self: true,
              ...(placeholder ? { claimedUsername: uname } : {}),
            },
          },
          tx,
        );
      });
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
    // Trip-level (название/валюта) меняет только владелец.
    await this.access.assertOwner(id, user);
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

  async getSummary(id: string, user: User) {
    await this.access.assertMember(id, user);
    return this.balances.summary(id);
  }
}
