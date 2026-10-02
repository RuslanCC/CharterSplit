import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { ChatMembershipService } from '../common/chat-membership.service';
import type { ParsedInitData } from '../common/decorators/current-user.decorator';
import { HistoryService } from '../history/history.service';
import { HistoryAction } from '../common/history-actions';
import { BalancesService } from './balances.service';
import { displayNameOf } from '../common/format';
import { ResolveTripDto, UpdateTripDto } from './dto';
import { launchKeysFromInitData, needsMembershipCheck } from './launch-keys';

const DEFAULT_TRIP_TITLE = 'Поездка';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly history: HistoryService,
    private readonly balances: BalancesService,
    private readonly membership: ChatMembershipService,
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
          title: title?.trim() || DEFAULT_TRIP_TITLE,
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
   * Telegram превратил группу в супергруппу (смена видимости истории, публичная
   * ссылка, >200 участников…) — у чата новый chat_id. Переносим поездку на новый
   * id; если бот уже успел завести под новым id пустую поездку-дубль, вливаем её
   * в исходную. Идемпотентно: повторный вызов (оба сервисных сообщения) — no-op.
   */
  async migrateGroupChat(fromChatId: number, toChatId: number): Promise<void> {
    const from = BigInt(fromChatId);
    const to = BigInt(toChatId);
    for (let attempt = 0; ; attempt++) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const source = await tx.trip.findUnique({
            where: { telegramChatId: from },
          });
          if (!source) return; // уже перенесено или бота не было в группе
          const dup = await tx.trip.findUnique({ where: { telegramChatId: to } });
          if (dup) await this.mergeTripInto(tx, dup.id, source.id);
          await tx.trip.update({
            where: { id: source.id },
            data: {
              telegramChatId: to,
              migratedFromChatId: from,
              startParam: `c${toChatId}`,
              // id сообщений старой группы в супергруппе недействительны.
              pinnedMessageId: null,
            },
          });
          await tx.expense.updateMany({
            where: { tripId: source.id },
            data: { chatMessageId: null },
          });
          await this.history.record(
            {
              tripId: source.id,
              action: HistoryAction.TRIP_UPDATED,
              entityType: 'Trip',
              entityId: source.id,
              payload: {
                chatMigrated: true,
                fromChatId: String(from),
                toChatId: String(to),
                ...(dup ? { mergedTripId: dup.id } : {}),
              },
            },
            tx,
          );
        });
        return;
      } catch (e) {
        // Параллельный апдейт из новой супергруппы успел создать дубль —
        // повторяем, теперь он будет влит.
        if (
          attempt < 2 &&
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue;
        }
        throw e;
      }
    }
  }

  /**
   * Вливает поездку `fromId` в `intoId`: участники сопоставляются по аккаунту
   * (или по @username у заглушек), все ссылки на них переназначаются; расходы,
   * касса, взаиморасчёты и история переносятся. Поездка `fromId` удаляется.
   */
  private async mergeTripInto(
    tx: Prisma.TransactionClient,
    fromId: string,
    intoId: string,
  ): Promise<void> {
    const [fromMembers, intoMembers] = await Promise.all([
      tx.tripMember.findMany({ where: { tripId: fromId } }),
      tx.tripMember.findMany({ where: { tripId: intoId } }),
    ]);
    const intoHasOwner = intoMembers.some((m) => m.role === MemberRole.OWNER);

    for (const m of fromMembers) {
      const target = m.userId
        ? intoMembers.find((t) => t.userId === m.userId)
        : m.telegramUsername
          ? intoMembers.find(
              (t) => t.userId === null && t.telegramUsername === m.telegramUsername,
            )
          : undefined;
      if (!target) {
        await tx.tripMember.update({
          where: { id: m.id },
          data: {
            tripId: intoId,
            ...(intoHasOwner && m.role === MemberRole.OWNER
              ? { role: MemberRole.MEMBER }
              : {}),
          },
        });
        continue;
      }
      await tx.expense.updateMany({
        where: { paidByMemberId: m.id },
        data: { paidByMemberId: target.id },
      });
      await tx.expenseShare.updateMany({
        where: { memberId: m.id },
        data: { memberId: target.id },
      });
      await tx.fundTransaction.updateMany({
        where: { memberId: m.id },
        data: { memberId: target.id },
      });
      await tx.settlement.updateMany({
        where: { fromMemberId: m.id },
        data: { fromMemberId: target.id },
      });
      await tx.settlement.updateMany({
        where: { toMemberId: m.id },
        data: { toMemberId: target.id },
      });
      await tx.tripMember.updateMany({
        where: { coveredByMemberId: m.id },
        data: { coveredByMemberId: target.id },
      });
      if (m.isActive && !target.isActive) {
        await tx.tripMember.update({
          where: { id: target.id },
          data: { isActive: true },
        });
      }
      await tx.tripMember.delete({ where: { id: m.id } });
      // Записи дубля о его появлении — повтор уже существующего участника.
      await tx.operationHistory.deleteMany({
        where: { tripId: fromId, entityType: 'TripMember', entityId: m.id },
      });
    }

    // «Поездка создана» у дубля — артефакт, в истории исходной поездки не нужен.
    await tx.operationHistory.deleteMany({
      where: { tripId: fromId, action: HistoryAction.TRIP_CREATED },
    });
    const moved = { where: { tripId: fromId }, data: { tripId: intoId } };
    await tx.expense.updateMany(moved);
    await tx.fundTransaction.updateMany(moved);
    await tx.settlement.updateMany(moved);
    await tx.operationHistory.updateMany(moved);
    await tx.trip.delete({ where: { id: fromId } });
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
          action: placeholder ? HistoryAction.MEMBER_UPDATED : HistoryAction.MEMBER_ADDED,
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

  /**
   * Находит поездку по ключам запуска (Chat ID / chatInstance / startParam)
   * или создаёт новую. Ключи берутся только из подписанного initData — тело
   * запроса задаёт лишь название и валюту новой поездки.
   */
  async resolveOrCreate(
    user: User,
    initData: ParsedInitData | undefined,
    dto: ResolveTripDto,
  ) {
    const launch = launchKeysFromInitData(initData);
    const keys: Prisma.TripWhereInput[] = [];
    // Chat ID сверяем и с прежним id группы: после превращения в супергруппу
    // старые кнопки «c<старый id>» должны вести в ту же поездку.
    if (launch.chatId !== undefined) {
      const id = BigInt(launch.chatId);
      keys.push({ telegramChatId: id }, { migratedFromChatId: id });
    }
    if (launch.chatInstance) keys.push({ chatInstance: launch.chatInstance });
    if (launch.startParam) keys.push({ startParam: launch.startParam });

    let trip =
      keys.length > 0
        ? await this.prisma.trip.findFirst({
            where: { OR: keys },
            orderBy: { createdAt: 'asc' },
          })
        : null;

    if (!trip) {
      // Не создаём «сиротскую» поездку из запуска без стабильного ключа группы.
      // startParam ("c<chatId>") приходит только с кнопки-ссылки из группового
      // чата; chat — при запуске из самого чата. Запуск без них
      // (web_app-кнопка из лички, Menu Button, голый URL приложения) не привязан
      // ни к какой поездке, и chatInstance у него свой — иначе пользователь
      // молча получал бы новую пустую поездку вместо общей.
      if (launch.chatId === undefined) {
        throw new ConflictException(
          'Откройте приложение кнопкой «Открыть CharterSplit» из группового чата поездки.',
        );
      }
      await this.assertChatMembership(
        {
          alreadyMember: false,
          claimsPlaceholder: false,
          chatIdSource: launch.chatIdSource,
        },
        launch.chatId,
        user,
      );
      trip = await this.prisma.$transaction(async (tx) => {
        const created = await tx.trip.create({
          data: {
            telegramChatId: BigInt(launch.chatId!),
            chatInstance: launch.chatInstance ?? null,
            startParam: launch.startParam ?? null,
            title: dto.title?.trim() || DEFAULT_TRIP_TITLE,
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
      const found = trip;
      // Гарантируем членство открывшего пользователя.
      const existing = await this.prisma.tripMember.findFirst({
        where: { tripId: found.id, userId: user.id },
      });
      // Заглушка, добавленная по @username, привязывается к аккаунту.
      const uname = user.username?.toLowerCase() ?? null;
      const placeholder =
        !existing && uname
          ? await this.prisma.tripMember.findFirst({
              where: { tripId: found.id, userId: null, telegramUsername: uname },
            })
          : null;
      if (!existing && launch.chatId !== undefined) {
        // Поездка могла переехать на новый id супергруппы — проверяем по актуальному.
        const chatId =
          found.telegramChatId !== null ? Number(found.telegramChatId) : launch.chatId;
        await this.assertChatMembership(
          {
            alreadyMember: false,
            claimsPlaceholder: !!placeholder,
            chatIdSource: launch.chatIdSource,
          },
          chatId,
          user,
        );
      }
      await this.prisma.$transaction(async (tx) => {
        // Поездка, созданная ботом от группы, не имеет владельца —
        // первый открывший приложение становится OWNER (даже если его
        // запись уже была создана пассивно из сообщений чата).
        const hasOwner =
          (await tx.tripMember.count({
            where: { tripId: found.id, role: MemberRole.OWNER },
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
                tripId: found.id,
                userId: user.id,
                displayName: displayNameOf(user),
                role: hasOwner ? MemberRole.MEMBER : MemberRole.OWNER,
              },
            });
        await this.history.record(
          {
            tripId: found.id,
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

  /** Бросает 403, если по правилам нужна проверка членства в чате и она не пройдена. */
  private async assertChatMembership(
    opts: Parameters<typeof needsMembershipCheck>[0],
    chatId: number,
    user: User,
  ): Promise<void> {
    if (!needsMembershipCheck(opts)) return;
    const ok = await this.membership.isMember(chatId, Number(user.telegramUserId));
    if (ok === false) {
      throw new ForbiddenException(
        'Вы не состоите в групповом чате этой поездки. Попросите участников добавить вас в чат.',
      );
    }
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
