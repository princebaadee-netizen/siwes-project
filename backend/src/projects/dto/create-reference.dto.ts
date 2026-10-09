import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReferenceSourceType } from '@prisma/client';

export class CreateReferenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  citationText: string;

  @IsEnum(ReferenceSourceType)
  sourceType: ReferenceSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  doiOrIsbnOrLink?: string;
}
