import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateSettlementDto {
  @IsString()
  fromMemberId!: string; // должник (кто заплатил)

  @IsString()
  toMemberId!: string; // кредитор (кто получил)

  @IsInt()
  @Min(1)
  amount!: number; // минорные единицы, положительное

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;
}
