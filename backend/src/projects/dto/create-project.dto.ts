import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProjectDto {
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  supervisorName?: string;
}
