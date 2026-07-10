import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class ResolveTripDto {
  // Telegram Chat ID (основной ключ поездки). Приходит числом из initData.chat.id.
  @IsOptional()
  @IsInt()
  telegramChatId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  chatInstance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  startParam?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 8)
  currency?: string;
}

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 8)
  currency?: string;
}
