import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { SplitType } from '@prisma/client';

export class UpdateSettingsDto {
  @IsOptional()
  @IsEnum(SplitType)
  defaultSplit?: SplitType;

  @IsOptional()
  @IsIn(['BANKERS', 'HALF_UP', 'FLOOR'])
  roundingMode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 8)
  locale?: string;

  @IsOptional()
  @IsBoolean()
  allowGuestMembers?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyChat?: boolean;
}
