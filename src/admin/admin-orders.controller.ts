import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DrizzleService } from '../database/drizzle.service';
import { orders } from '../database/schema';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Controller('admin/orders')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminOrdersController {
  constructor(private readonly drizzle: DrizzleService) {}

  @Get()
  async list() {
    const rows = await this.drizzle.db
      .select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        subtotal: orders.subtotal,
        shipping: orders.shipping,
        discount: orders.discount,
        total: orders.total,
        stripeCheckoutSessionId: orders.stripeCheckoutSessionId,
        stripePaymentIntentId: orders.stripePaymentIntentId,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt));

    return rows;
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
  ) {
    const updated = await this.drizzle.db
      .update(orders)
      .set({ status: body.status })
      .where(eq(orders.id, id))
      .returning({ id: orders.id, status: orders.status });

    return updated[0] ?? null;
  }
}
