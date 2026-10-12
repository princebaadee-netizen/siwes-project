import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegenerateChapterDto {
  // Optional — when omitted the chapter is regenerated from the notes it was
  // last drafted from.
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rawInputText?: string;
}
