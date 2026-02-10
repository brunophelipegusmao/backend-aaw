import { Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import {
  cartItems,
  carts,
  productImages,
  products,
  variants,
} from '../database/schema';

@Injectable()
export class CartService {
  constructor(private readonly drizzle: DrizzleService) {}

  private async ensureCartId(userId: string): Promise<string> {
    const existing = await this.drizzle.db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);

    if (existing[0]?.id) return existing[0].id;

    const inserted = await this.drizzle.db
      .insert(carts)
      .values({ userId })
      .returning({ id: carts.id });

    return inserted[0].id;
  }

  async getCart(userId: string) {
    const cart = await this.drizzle.db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);

    const cartId = cart[0]?.id;
    if (!cartId) return { items: [] };

    const rows = await this.drizzle.db
      .select({
        cartItemId: cartItems.id,
        variantId: variants.id,
        qty: cartItems.qty,
        sku: variants.sku,
        color: variants.color,
        size: variants.size,
        priceOverride: variants.priceOverride,
        stockQty: variants.stockQty,
        productId: products.id,
        productName: products.name,
        productSlug: products.slug,
        basePrice: products.basePrice,
      })
      .from(cartItems)
      .innerJoin(variants, eq(cartItems.variantId, variants.id))
      .innerJoin(products, eq(variants.productId, products.id))
      .where(eq(cartItems.cartId, cartId));

    const productIds = Array.from(new Set(rows.map((row) => row.productId)));

    const imageRows = productIds.length
      ? await this.drizzle.db
          .select({
            productId: productImages.productId,
            url: productImages.url,
            position: productImages.position,
          })
          .from(productImages)
          .where(inArray(productImages.productId, productIds))
          .orderBy(asc(productImages.position))
      : [];

    const coverByProduct = new Map<string, string>();
    for (const img of imageRows) {
      if (!coverByProduct.has(img.productId))
        coverByProduct.set(img.productId, img.url);
    }

    return {
      items: rows.map((row) => {
        const unitPrice = row.priceOverride ?? row.basePrice;
        return {
          id: row.cartItemId,
          qty: row.qty,
          variant: {
            id: row.variantId,
            sku: row.sku,
            color: row.color,
            size: row.size,
            unitPrice,
            stockQty: row.stockQty,
          },
          product: {
            id: row.productId,
            name: row.productName,
            slug: row.productSlug,
            coverImageUrl: coverByProduct.get(row.productId) ?? null,
          },
        };
      }),
    };
  }

  async putCart(
    userId: string,
    items: Array<{ variantId: string; qty: number }>,
  ) {
    const cartId = await this.ensureCartId(userId);

    const normalized = items
      .map((item) => ({
        variantId: item.variantId,
        qty: Math.max(1, Number(item.qty) || 1),
      }))
      .filter((item) => !!item.variantId);

    const variantIds = Array.from(
      new Set(normalized.map((item) => item.variantId)),
    );

    const existingVariants = variantIds.length
      ? await this.drizzle.db
          .select({ id: variants.id })
          .from(variants)
          .where(inArray(variants.id, variantIds))
      : [];

    const existingSet = new Set(existingVariants.map((v) => v.id));

    const safeItems = normalized.filter((item) =>
      existingSet.has(item.variantId),
    );

    await this.drizzle.db.transaction(async (tx) => {
      await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));

      if (safeItems.length) {
        await tx.insert(cartItems).values(
          safeItems.map((item) => ({
            cartId,
            variantId: item.variantId,
            qty: item.qty,
          })),
        );
      }
    });

    return this.getCart(userId);
  }
}
