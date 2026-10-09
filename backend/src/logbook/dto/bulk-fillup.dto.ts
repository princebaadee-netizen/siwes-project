import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BulkFillupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(6000)
  description: string;
}
