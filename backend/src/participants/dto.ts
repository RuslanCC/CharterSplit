import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { MemberRole } from '@prisma/client';

export class AddMemberDto {
  @IsString()
  @Length(1, 80)
  displayName!: string;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(MemberRole)
  role?: MemberRole;

  // Семейная связь: null — снять покрытие.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  coveredByMemberId?: string | null;
}
