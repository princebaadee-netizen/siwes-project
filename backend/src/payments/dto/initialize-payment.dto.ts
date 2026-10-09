import { IsEnum } from 'class-validator';
import { PurchaseProductType } from '@prisma/client';

export class InitializePaymentDto {
  @IsEnum(PurchaseProductType)
  productType: PurchaseProductType;
}
