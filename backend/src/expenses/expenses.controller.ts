import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { ClaimShareDto, CreateExpenseDto, UpdateExpenseDto } from './dto';

@Controller('trips/:tripId/expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.expenses.list(tripId, user);
  }

  @Post()
  create(
    @Param('tripId') tripId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expenses.create(tripId, user, dto);
  }

  @Get(':expenseId')
  get(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: User,
  ) {
    return this.expenses.get(tripId, expenseId, user);
  }

  @Patch(':expenseId')
  update(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(tripId, expenseId, user, dto);
  }

  /** «Открытый счёт»: участник вносит (или убирает) свою часть. */
  @Put(':expenseId/claims/:memberId')
  claim(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: User,
    @Body() dto: ClaimShareDto,
  ) {
    return this.expenses.claim(tripId, expenseId, memberId, user, dto);
  }

  @Delete(':expenseId')
  remove(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user: User,
  ) {
    return this.expenses.remove(tripId, expenseId, user);
  }
}
