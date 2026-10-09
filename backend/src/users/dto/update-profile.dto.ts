import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleChoice } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsString()
  school?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsEnum(ModuleChoice)
  moduleChoice?: ModuleChoice;
}
