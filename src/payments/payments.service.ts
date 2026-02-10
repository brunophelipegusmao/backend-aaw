import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { DrizzleService } from '../database/drizzle.service';
import { orderItems, orders } from '../database/schema';

function toCents(value: string | number): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Math.max(0, Math.round(parsed * 100));
}

type VariantSnapshot = { color?: string; size?: string };

function toVariantSuffix(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const color = (value as VariantSnapshot).color;
  const size = (value as VariantSnapshot).size;
  if (typeof color !== 'string' || typeof size !== 'string') return '';
  return ` (${color}/${size})`;
}

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly configService: ConfigService,
  ) {
    const secret = this.configService.getOrThrow<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(secret);
  }

  async createCheckoutSession(userId: string, orderId: string) {
    const orderRow = await this.drizzle.db
      .select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        total: orders.total,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);

    const order = orderRow[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING')
      throw new NotFoundException('Order not found');

    const items = await this.drizzle.db
      .select({
        id: orderItems.id,
        productNameSnapshot: orderItems.productNameSnapshot,
        variantSnapshot: orderItems.variantSnapshot,
        unitPrice: orderItems.unitPrice,
        qty: orderItems.qty,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    const successUrl =
      this.configService.get<string>('STRIPE_SUCCESS_URL') ||
      'http://localhost:3000/checkout/sucesso?session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl =
      this.configService.get<string>('STRIPE_CANCEL_URL') ||
      'http://localhost:3000/checkout/cancelado';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: order.id,
      metadata: {
        orderId: order.id,
      },
      line_items: items.map((item) => {
        const suffix = toVariantSuffix(item.variantSnapshot);
        return {
          quantity: item.qty,
          price_data: {
            currency: 'brl',
            unit_amount: toCents(item.unitPrice),
            product_data: {
              name: `${item.productNameSnapshot}${suffix}`,
            },
          },
        };
      }),
    });

    await this.drizzle.db
      .update(orders)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(orders.id, order.id));

    return { id: session.id, url: session.url };
  }
}
