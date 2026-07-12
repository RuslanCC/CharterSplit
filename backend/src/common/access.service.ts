import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberRole, type TripMember, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Проверки доступа: пользователь работает только с поездками, где он участник. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Гарантирует, что пользователь — участник поездки. Возвращает его TripMember. */
  async assertMember(tripId: string, user: User): Promise<TripMember> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('trip not found');

    const member = await this.prisma.tripMember.findFirst({
      where: { tripId, userId: user.id },
    });
    if (!member) throw new ForbiddenException('not a member of this trip');
    return member;
  }

  /**
   * Гарантирует, что пользователь — владелец поездки (OWNER). Для trip-level
   * операций: смена валюты/настроек, деактивация участников. Расходы, кассу и
   * взаиморасчёты может вести любой участник.
   */
  async assertOwner(tripId: string, user: User): Promise<TripMember> {
    const member = await this.assertMember(tripId, user);
    if (member.role !== MemberRole.OWNER) {
      throw new ForbiddenException('only the trip owner can do this');
    }
    return member;
  }

  /** Проверяет, что участник принадлежит поездке. */
  async assertMemberInTrip(tripId: string, memberId: string): Promise<TripMember> {
    const member = await this.prisma.tripMember.findFirst({
      where: { id: memberId, tripId },
    });
    if (!member) throw new NotFoundException('member not found in this trip');
    return member;
  }
}
