import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { SplitType } from '@prisma/client';

// Суммы хранятся в 32-битном Int (макс 2 147 483 647 минорных единиц).
// Держим потолок с запасом, чтобы вместо переполнения БД прилетала 400.
export const MAX_MINOR = 2_000_000_000;
const MAX_SHARE_UNITS = 1_000_000;

export class ExpenseParticipantDto {
  @IsString()
  memberId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SHARE_UNITS)
  shareUnits?: number; // для SHARES

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MINOR)
  amount?: number; // для EXACT (минорные единицы)
}

export class CreateExpenseDto {
  @IsString()
  @Length(1, 200)
  description!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  amount!: number; // минорные единицы

  @IsOptional()
  @IsString()
  @Length(1, 60)
  category?: string;

  @IsOptional()
  @IsISO8601()
  spentAt?: string;

  @IsString()
  paidByMemberId!: string;

  @IsOptional()
  @IsBoolean()
  fromFund?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MINOR)
  tipAmount?: number; // чаевые (минорные единицы), делятся поровну между участниками

  @IsEnum(SplitType)
  splitType!: SplitType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseParticipantDto)
  participants?: ExpenseParticipantDto[];
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  amount?: number;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  category?: string;

  @IsOptional()
  @IsISO8601()
  spentAt?: string;

  @IsOptional()
  @IsString()
  paidByMemberId?: string;

  @IsOptional()
  @IsBoolean()
  fromFund?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MINOR)
  tipAmount?: number; // чаевые (минорные единицы), делятся поровну между участниками

  @IsOptional()
  @IsEnum(SplitType)
  splitType?: SplitType;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ExpenseParticipantDto)
  participants?: ExpenseParticipantDto[];
}
