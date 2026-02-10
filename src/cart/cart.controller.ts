import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { RequestUser } from '../common/interfaces/request-user.interface';
import { PutCartDto } from './dto/put-cart.dto';
import { CartService } from './cart.service';

@Controller('cart')
@UseGuards(SessionAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async get(@CurrentUser() user: RequestUser) {
    return this.cartService.getCart(user.id);
  }

  @Put()
  async put(@CurrentUser() user: RequestUser, @Body() body: PutCartDto) {
    return this.cartService.putCart(user.id, body.items);
  }
}
