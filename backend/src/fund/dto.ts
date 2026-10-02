import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { MAX_MINOR } from '../common/money';

export class FundTxnDto {
  // участник, к которому относится движение (взнос/выплата). Может быть пустым для корректировки.
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  amount!: number; // минорные единицы, положительное

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;
}

export class FundAdjustDto {
  // знак задаётся клиентом: положительное — пополнение, отрицательное — списание
  @IsInt()
  @Min(-MAX_MINOR)
  @Max(MAX_MINOR)
  delta!: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;
}
