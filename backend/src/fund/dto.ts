import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class FundTxnDto {
  // участник, к которому относится движение (взнос/выплата). Может быть пустым для корректировки.
  @IsOptional()
  @IsString()
  memberId?: string;

  @IsInt()
  @Min(1)
  amount!: number; // минорные единицы, положительное

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;
}

export class FundAdjustDto {
  // знак задаётся клиентом: положительное — пополнение, отрицательное — списание
  @IsInt()
  delta!: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;
}
