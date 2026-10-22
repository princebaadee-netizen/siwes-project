import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { TopicSource } from '@prisma/client';
import { IsNotBlank } from '../../common/validators';

export class CreateProjectDto {
  @IsNotEmpty()
  @IsNotBlank()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  supervisorName?: string;

  @IsOptional()
  @IsEnum(TopicSource)
  topicSource?: TopicSource;
}
