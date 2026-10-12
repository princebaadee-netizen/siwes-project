import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { TopicSource } from '@prisma/client';

export class CreateProjectDto {
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  supervisorName?: string;

  @IsOptional()
  @IsEnum(TopicSource)
  topicSource?: TopicSource;
}
