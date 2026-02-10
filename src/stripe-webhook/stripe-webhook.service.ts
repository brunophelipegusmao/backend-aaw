import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { DrizzleService } from '../database/drizzle.service';
import { stripeEvents } from '../database/schema';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly configService: ConfigService,
    @InjectQueue('stripe') private readonly stripeQueue: Queue,
  ) {
    const secretKey =
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    this.stripe = new Stripe(secretKey);
  }

  async handleWebhook(input: { rawBody: Buffer; signature: string }) {
    if (!input.signature) {
      throw new BadRequestException('Missing Stripe-Signature');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        input.rawBody,
        input.signature,
        this.webhookSecret,
      );
    } catch {
      this.logger.warn('Stripe signature verification failed');
      throw new BadRequestException('Invalid signature');
    }

    const inserted = await this.drizzle.db
      .insert(stripeEvents)
      .values({
        eventId: event.id,
        type: event.type,
        payload: event as any,
      })
      .onConflictDoNothing({ target: stripeEvents.eventId })
      .returning({ id: stripeEvents.id });

    const stripeEventId =
      inserted[0]?.id ??
      (
        await this.drizzle.db
          .select({
            id: stripeEvents.id,
            processedAt: stripeEvents.processedAt,
          })
          .from(stripeEvents)
          .where(eq(stripeEvents.eventId, event.id))
          .limit(1)
      )[0]?.id;

    if (stripeEventId) {
      await this.stripeQueue.add(
        'process-stripe-event',
        { stripeEventId },
        {
          jobId: event.id,
          removeOnComplete: true,
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    }

    return { received: true };
  }
}
