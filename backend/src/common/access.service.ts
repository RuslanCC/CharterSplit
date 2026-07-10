import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { TripMember, User } from '@prisma/client';
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

  /** Проверяет, что участник принадлежит поездке. */
  async assertMemberInTrip(tripId: string, memberId: string): Promise<TripMember> {
    const member = await this.prisma.tripMember.findFirst({
      where: { id: memberId, tripId },
    });
    if (!member) throw new NotFoundException('member not found in this trip');
    return member;
  }
}
