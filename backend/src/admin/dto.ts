import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const TRIP_SORTS = ['activity', 'created', 'spent'] as const;
export type TripSort = (typeof TRIP_SORTS)[number];

export class AdminTripsQueryDto {
  /** Поиск по названию поездки. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(TRIP_SORTS)
  sort?: TripSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
