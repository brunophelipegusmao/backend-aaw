import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { Role } from '../common/enums/role.enum';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { DrizzleService } from '../database/drizzle.service';
import {
  cartItems,
  carts,
  orderItems,
  orders,
  products,
  variants,
} from '../database/schema';
import { CreateOrderDto } from './dto/create-order.dto';

function toMoney(value: number): string {
  return value.toFixed(2);
}

@Injectable()
export class OrdersService {
  constructor(private readonly drizzle: DrizzleService) {}

  async createFromCart(user: RequestUser, body: CreateOrderDto) {
    // Coupon support is part of the MVP scope, but discount logic is implemented later.
    const couponCode = body.couponCode?.trim();
    void couponCode;

    const cart = await this.drizzle.db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, user.id))
      .limit(1);

    const cartId = cart[0]?.id;
    if (!cartId) throw new BadRequestException('Cart is empty');

    const items = await this.drizzle.db
      .select({
        variantId: variants.id,
        qty: cartItems.qty,
        sku: variants.sku,
        color: variants.color,
        size: variants.size,
        priceOverride: variants.priceOverride,
        stockQty: variants.stockQty,
        productId: products.id,
        productName: products.name,
        basePrice: products.basePrice,
      })
      .from(cartItems)
      .innerJoin(variants, eq(cartItems.variantId, variants.id))
      .innerJoin(products, eq(variants.productId, products.id))
      .where(eq(cartItems.cartId, cartId));

    if (!items.length) throw new BadRequestException('Cart is empty');

    let subtotal = 0;
    for (const item of items) {
      const unitPrice = Number.parseFloat(
        String(item.priceOverride ?? item.basePrice),
      );
      subtotal += unitPrice * item.qty;
    }

    const shipping = 0;
    const discount = 0;
    const total = subtotal + shipping - discount;

    const createdOrder = await this.drizzle.db.transaction(async (tx) => {
      const insertedOrder = await tx
        .insert(orders)
        .values({
          userId: user.id,
          status: 'PENDING',
          subtotal: toMoney(subtotal),
          shipping: toMoney(shipping),
          discount: toMoney(discount),
          total: toMoney(total),
        })
        .returning({
          id: orders.id,
          status: orders.status,
          subtotal: orders.subtotal,
          shipping: orders.shipping,
          discount: orders.discount,
          total: orders.total,
          createdAt: orders.createdAt,
        });

      const order = insertedOrder[0];

      await tx.insert(orderItems).values(
        items.map((item) => ({
          orderId: order.id,
          variantId: item.variantId,
          productNameSnapshot: item.productName,
          variantSnapshot: {
            sku: item.sku,
            color: item.color,
            size: item.size,
          },
          unitPrice: String(item.priceOverride ?? item.basePrice),
          qty: item.qty,
        })),
      );

      await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));

      return order;
    });

    return createdOrder;
  }

  async listForUser(userId: string) {
    const rows = await this.drizzle.db
      .select({
        id: orders.id,
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
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));

    return rows;
  }

  async getById(user: RequestUser, id: string) {
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
      .where(eq(orders.id, id))
      .limit(1);

    const order = rows[0];
    if (!order) throw new NotFoundException('Order not found');

    if (user.role !== Role.ADMIN && order.userId !== user.id) {
      throw new NotFoundException('Order not found');
    }

    const items = await this.drizzle.db
      .select({
        id: orderItems.id,
        variantId: orderItems.variantId,
        productNameSnapshot: orderItems.productNameSnapshot,
        variantSnapshot: orderItems.variantSnapshot,
        unitPrice: orderItems.unitPrice,
        qty: orderItems.qty,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    return { ...order, items };
  }
}
