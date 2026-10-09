import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PurchaseProductType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PaystackService } from './paystack.service';
import { getPrices, toKobo } from './pricing';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
  ) {}

  /** Dev-only shortcut: without real keys, grants a pass so gating can be tested. */
  private get devMode(): boolean {
    return process.env.PAYSTACK_DEV_MODE === 'true';
  }

  async initialize(userId: string, productType: PurchaseProductType) {
    const priceNaira = getPrices()[productType];
    if (!priceNaira) throw new BadRequestException('Unknown product.');
    const amountKobo = toKobo(priceNaira);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const reference = `siwes-${productType.toLowerCase()}-${randomUUID()}`;

    if (!this.paystack.configured) {
      if (!this.devMode) {
        throw new ServiceUnavailableException(
          'Payments are not configured. Set PAYSTACK_SECRET_KEY, or PAYSTACK_DEV_MODE=true for local testing.',
        );
      }
      const purchase = await this.prisma.purchase.create({
        data: { userId, productType, amountKobo, paymentRef: reference, status: 'SUCCESSFUL' },
      });
      return { devMode: true, status: purchase.status, reference, purchase };
    }

    const callbackUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/dashboard/account`
      : undefined;

    const init = await this.paystack.initialize({
      email: user.email,
      amountKobo,
      reference,
      callbackUrl,
      metadata: { userId, productType },
    });

    // Record the attempt before the student leaves for Paystack, so the
    // webhook has a row to update even if they never come back to the tab.
    const purchase = await this.prisma.purchase.create({
      data: { userId, productType, amountKobo, paymentRef: reference, status: 'PENDING' },
    });

    return {
      devMode: false,
      status: purchase.status,
      reference,
      authorizationUrl: init.authorization_url,
      accessCode: init.access_code,
    };
  }

  async verify(userId: string, reference: string) {
    const purchase = await this.prisma.purchase.findUnique({ where: { paymentRef: reference } });
    if (!purchase) throw new NotFoundException('Payment not found');
    if (purchase.userId !== userId) throw new ForbiddenException('That payment is not yours.');
    if (purchase.status === 'SUCCESSFUL' || !this.paystack.configured) return purchase;

    const result = await this.paystack.verify(reference);
    const paidEnough = result.status === 'success' && result.amount >= purchase.amountKobo;
    return this.prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: paidEnough ? 'SUCCESSFUL' : 'FAILED' },
    });
  }

  /** Called from the (signature-verified) webhook, so it trusts Paystack's payload. */
  async handleWebhook(event: any) {
    const reference = event?.data?.reference;
    if (event?.event !== 'charge.success' || !reference) return { received: true };

    const purchase = await this.prisma.purchase.findUnique({ where: { paymentRef: reference } });
    if (purchase && purchase.status !== 'SUCCESSFUL') {
      const paid = event.data.amount;
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          status:
            typeof paid === 'number' && paid >= purchase.amountKobo ? 'SUCCESSFUL' : 'FAILED',
        },
      });
    }
    return { received: true };
  }

  listMine(userId: string) {
    return this.prisma.purchase.findMany({
      where: { userId },
      orderBy: { purchasedAt: 'desc' },
    });
  }
}
