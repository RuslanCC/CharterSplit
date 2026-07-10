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
  Min,
  ValidateNested,
} from 'class-validator';
import { SplitType } from '@prisma/client';

export class ExpenseParticipantDto {
  @IsString()
  memberId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  shareUnits?: number; // для SHARES

  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number; // для EXACT (минорные единицы)
}

export class CreateExpenseDto {
  @IsString()
  @Length(1, 200)
  description!: string;

  @IsInt()
  @Min(1)
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
  @IsEnum(SplitType)
  splitType?: SplitType;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ExpenseParticipantDto)
  participants?: ExpenseParticipantDto[];
}
