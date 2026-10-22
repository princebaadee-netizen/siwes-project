import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsNotBlank } from '../../common/validators';

export class CreateTopicDto {
  @IsString()
  @IsNotBlank()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotBlank()
  @MinLength(2)
  @MaxLength(100)
  field: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
