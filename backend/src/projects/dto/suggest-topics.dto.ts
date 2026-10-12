import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuggestTopicsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  field?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  interests?: string;
}
