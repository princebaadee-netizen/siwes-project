import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReferenceSourceType } from '@prisma/client';
import { IsNotBlank } from '../../common/validators';

export class CreateReferenceDto {
  @IsString()
  @IsNotEmpty()
  @IsNotBlank()
  @MaxLength(2000)
  citationText: string;

  @IsEnum(ReferenceSourceType)
  sourceType: ReferenceSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  doiOrIsbnOrLink?: string;
}
