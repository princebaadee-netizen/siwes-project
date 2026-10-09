import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DraftChapterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  rawInputText: string;
}
