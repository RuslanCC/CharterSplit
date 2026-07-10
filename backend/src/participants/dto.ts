import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import { MemberRole } from '@prisma/client';

// Нужно хотя бы одно из двух: имя гостя или ник Telegram.
export class AddMemberDto {
  @ValidateIf((o) => !o.telegramUsername || o.displayName !== undefined)
  @IsString()
  @Length(1, 80)
  displayName?: string;

  // Ник Telegram, можно с ведущим @ (5–32 символа: латиница, цифры, «_»).
  @IsOptional()
  @IsString()
  @Matches(/^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/, {
    message: 'invalid telegram username',
  })
  telegramUsername?: string;
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
