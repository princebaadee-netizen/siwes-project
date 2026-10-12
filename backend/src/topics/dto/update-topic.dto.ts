import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  field?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
