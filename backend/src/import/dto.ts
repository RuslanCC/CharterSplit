import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

/** Соответствие имени участника из CSV участнику поездки.
 *  memberId — существующий участник; guestName — создать гостя с этим именем. */
export class ImportMappingDto {
  @IsString()
  @Length(1, 120)
  csvName!: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  guestName?: string;
}

/** Чистый эффект участника в строке Splitwise: paid − share (минорные единицы, со знаком). */
export class ImportNetDto {
  @IsString()
  @Length(1, 120)
  csvName!: string;

  @IsInt()
  amount!: number;
}

export class ImportRowDto {
  @IsISO8601()
  date!: string;

  @IsString()
  @Length(1, 200)
  description!: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  category?: string;

  @IsInt()
  @Min(1)
  cost!: number; // минорные единицы

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportNetDto)
  nets!: ImportNetDto[];
}

export class SplitwiseImportDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportMappingDto)
  mappings!: ImportMappingDto[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}
