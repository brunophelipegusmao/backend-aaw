import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { and, eq, gte, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { DrizzleService } from '../database/drizzle.service';
import { orderItems, orders, stripeEvents, variants } from '../database/schema';

@Injectable()
@Processor('stripe')
export class StripeEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(StripeEventsProcessor.name);

  constructor(private readonly drizzle: DrizzleService) {
    super();
  }

  async process(job: Job<{ stripeEventId: string }>): Promise<void> {
    const stripeEventId = job.data?.stripeEventId;
    if (!stripeEventId) return;

    const rows = await this.drizzle.db
      .select({
        id: stripeEvents.id,
        type: stripeEvents.type,
        payload: stripeEvents.payload,
        processedAt: stripeEvents.processedAt,
      })
      .from(stripeEvents)
      .where(eq(stripeEvents.id, stripeEventId))
      .limit(1);

    const eventRow = rows[0];
    if (!eventRow) return;
    if (eventRow.processedAt) return;

    const event = eventRow.payload as Stripe.Event;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const sessionId = session.id;
      const orderId =
        session.metadata?.orderId || session.client_reference_id || null;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || null;

      await this.drizzle.db.transaction(async (tx) => {
        // Find order by metadata orderId first, fallback to stripeCheckoutSessionId.
        const orderRows = orderId
          ? await tx
              .select({ id: orders.id, status: orders.status })
              .from(orders)
              .where(eq(orders.id, orderId))
              .limit(1)
          : await tx
              .select({ id: orders.id, status: orders.status })
              .from(orders)
              .where(eq(orders.stripeCheckoutSessionId, sessionId))
              .limit(1);

        const order = orderRows[0];

        if (!order) {
          await tx
            .update(stripeEvents)
            .set({ processedAt: new Date() })
            .where(eq(stripeEvents.id, eventRow.id));
          return;
        }

        if (order.status === 'PAID') {
          await tx
            .update(stripeEvents)
            .set({ processedAt: new Date() })
            .where(eq(stripeEvents.id, eventRow.id));
          return;
        }

        const items = await tx
          .select({ variantId: orderItems.variantId, qty: orderItems.qty })
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id));

        for (const item of items) {
          // Decrement stock (best-effort) inside a transaction.
          const updated = await tx
            .update(variants)
            .set({ stockQty: sql`${variants.stockQty} - ${item.qty}` })
            .where(
              and(
                eq(variants.id, item.variantId),
                gte(variants.stockQty, item.qty),
              ),
            )
            .returning({ id: variants.id });

          if (!updated.length) {
            this.logger.warn(
              `Insufficient stock for variantId=${item.variantId} (orderId=${order.id})`,
            );
          }
        }

        await tx
          .update(orders)
          .set({
            status: 'PAID',
            stripeCheckoutSessionId: sessionId,
            stripePaymentIntentId: paymentIntentId,
          })
          .where(eq(orders.id, order.id));

        await tx
          .update(stripeEvents)
          .set({ processedAt: new Date() })
          .where(eq(stripeEvents.id, eventRow.id));
      });

      return;
    }

    // Default: mark as processed to avoid infinite retries.
    await this.drizzle.db
      .update(stripeEvents)
      .set({ processedAt: new Date() })
      .where(eq(stripeEvents.id, eventRow.id));
  }
}
