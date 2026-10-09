import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { PaymentsService } from './payments.service';
import { PaystackService } from './paystack.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { getPrices } from './pricing';

@Controller('payments')
export class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private paystack: PaystackService,
  ) {}

  // Public: the current pass prices, so every screen shows the same figures the
  // checkout will charge.
  @Get('prices')
  prices() {
    return getPrices();
  }

  @UseGuards(JwtAuthGuard)
  @Post('initialize')
  initialize(@CurrentUserId() userId: string, @Body() dto: InitializePaymentDto) {
    return this.payments.initialize(userId, dto.productType);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUserId() userId: string) {
    return this.payments.listMine(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify/:reference')
  verify(@CurrentUserId() userId: string, @Param('reference') reference: string) {
    return this.payments.verify(userId, reference);
  }

  /**
   * Paystack server-to-server callback. This route is public by design: it is
   * authenticated by the HMAC signature over the raw body, not a JWT.
   */
  @SkipThrottle()
  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    if (!this.paystack.isValidWebhook(req.rawBody, signature)) {
      throw new BadRequestException('Invalid signature');
    }
    const event = req.rawBody ? JSON.parse(req.rawBody.toString('utf8')) : {};
    return this.payments.handleWebhook(event);
  }
}
