import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { RequestUser } from '../common/interfaces/request-user.interface';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(SessionAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() body: CreateOrderDto) {
    return this.ordersService.createFromCart(user, body);
  }

  @Get('me')
  async myOrders(@CurrentUser() user: RequestUser) {
    return this.ordersService.listForUser(user.id);
  }

  @Get(':id')
  async byId(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ordersService.getById(user, id);
  }
}
