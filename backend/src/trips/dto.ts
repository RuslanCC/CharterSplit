import { IsOptional, IsString, Length, Matches } from 'class-validator';

/** ISO 4217: три заглавные латинские буквы (RUB, EUR, USD…). */
const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Параметры новой поездки. Сам ключ поездки (чат) берётся только из
 * подписанного initData, а не из тела запроса.
 */
export class ResolveTripDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @Matches(CURRENCY_RE, { message: 'currency must be an ISO 4217 code' })
  currency?: string;
}

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @Matches(CURRENCY_RE, { message: 'currency must be an ISO 4217 code' })
  currency?: string;
}
