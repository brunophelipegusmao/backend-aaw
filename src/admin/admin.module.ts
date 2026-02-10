import { Module } from '@nestjs/common';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminInventoryController } from './admin-inventory.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminProductsController } from './admin-products.controller';

@Module({
  controllers: [
    AdminCategoriesController,
    AdminProductsController,
    AdminInventoryController,
    AdminOrdersController,
  ],
})
export class AdminModule {}
