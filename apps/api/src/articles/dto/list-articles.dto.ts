import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsIn,
  IsString,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class ListArticlesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsIn(['AI', 'Products', 'Technology'])
  category?: string;
}
