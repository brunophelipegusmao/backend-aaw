import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { RequestUser } from '../common/interfaces/request-user.interface';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(SessionAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout-session')
  async checkoutSession(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateCheckoutSessionDto,
  ) {
    return this.paymentsService.createCheckoutSession(user.id, body.orderId);
  }
}
