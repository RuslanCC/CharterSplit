import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { MAX_MINOR } from '../expenses/dto';

export class CreateSettlementDto {
  @IsString()
  fromMemberId!: string; // должник (кто заплатил)

  @IsString()
  toMemberId!: string; // кредитор (кто получил)

  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  amount!: number; // минорные единицы, положительное

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;
}
