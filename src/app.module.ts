import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { CommonModule } from './common/common.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { DrizzleModule } from './database/drizzle.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { JobsModule } from './jobs/jobs.module';
import { StripeWebhookModule } from './stripe-webhook/stripe-webhook.module';
import { AdminModule } from './admin/admin.module';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: isTest ? undefined : validateEnv,
    }),
    ...(isTest
      ? []
      : [
          DrizzleModule,
          CommonModule,
          CategoriesModule,
          ProductsModule,
          CartModule,
          OrdersModule,
          PaymentsModule,
          JobsModule,
          StripeWebhookModule,
          AdminModule,
        ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
