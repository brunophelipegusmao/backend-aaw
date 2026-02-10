import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, inArray, lte, sql } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import {
  categories,
  productImages,
  products,
  reviews,
  variants,
} from '../database/schema';

const PAGE_SIZE = 12;

function toPriceString(value: number): string {
  return value.toFixed(2);
}

@Injectable()
export class ProductsService {
  constructor(private readonly drizzle: DrizzleService) {}

  async list(input: {
    search?: string;
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    color?: string;
    size?: string;
    sort?: string;
    page?: string;
  }) {
    const page = Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const where: any[] = [eq(products.active, true)];

    const search = input.search?.trim();
    if (search) {
      where.push(ilike(products.name, `%${search}%`));
    }

    const needsCategoryJoin = !!input.category;
    const needsVariantJoin =
      !!input.color || !!input.size || !!input.minPrice || !!input.maxPrice;

    const minPrice = input.minPrice ? Number(input.minPrice) : undefined;
    const maxPrice = input.maxPrice ? Number(input.maxPrice) : undefined;

    let idQuery = this.drizzle.db
      .selectDistinct({ id: products.id })
      .from(products)
      .$dynamic();

    if (needsCategoryJoin) {
      idQuery = idQuery.innerJoin(
        categories,
        eq(products.categoryId, categories.id),
      );
      where.push(eq(categories.slug, input.category!));
    }

    if (needsVariantJoin) {
      idQuery = idQuery.innerJoin(
        variants,
        eq(variants.productId, products.id),
      );

      if (input.color) where.push(eq(variants.color, input.color));
      if (input.size) where.push(eq(variants.size, input.size));

      const effectivePrice = sql`COALESCE(${variants.priceOverride}, ${products.basePrice})`;
      if (typeof minPrice === 'number' && !Number.isNaN(minPrice)) {
        where.push(gte(effectivePrice, toPriceString(minPrice)));
      }
      if (typeof maxPrice === 'number' && !Number.isNaN(maxPrice)) {
        where.push(lte(effectivePrice, toPriceString(maxPrice)));
      }
    }

    idQuery = idQuery.where(and(...where));

    const sort = input.sort ?? 'newest';
    if (sort === 'price-asc')
      idQuery = idQuery.orderBy(asc(products.basePrice));
    else if (sort === 'price-desc')
      idQuery = idQuery.orderBy(desc(products.basePrice));
    else if (sort === 'name-asc') idQuery = idQuery.orderBy(asc(products.name));
    else idQuery = idQuery.orderBy(desc(products.createdAt));

    const productIds = await idQuery.limit(PAGE_SIZE).offset(offset);
    const ids = productIds.map((row) => row.id);

    if (!ids.length) {
      return { page, pageSize: PAGE_SIZE, items: [] };
    }

    const rows = await this.drizzle.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        active: products.active,
        basePrice: products.basePrice,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(inArray(products.id, ids));

    const imageRows = await this.drizzle.db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        position: productImages.position,
      })
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.position));

    const variantRows = await this.drizzle.db
      .select({
        productId: variants.productId,
        color: variants.color,
        size: variants.size,
        priceOverride: variants.priceOverride,
        stockQty: variants.stockQty,
      })
      .from(variants)
      .where(inArray(variants.productId, ids));

    const imageByProduct = new Map<string, string>();
    for (const img of imageRows) {
      if (!imageByProduct.has(img.productId)) {
        imageByProduct.set(img.productId, img.url);
      }
    }

    const variantMetaByProduct = new Map<
      string,
      { colors: Set<string>; sizes: Set<string>; inStock: boolean }
    >();
    for (const v of variantRows) {
      if (!variantMetaByProduct.has(v.productId)) {
        variantMetaByProduct.set(v.productId, {
          colors: new Set<string>(),
          sizes: new Set<string>(),
          inStock: false,
        });
      }
      const meta = variantMetaByProduct.get(v.productId)!;
      meta.colors.add(v.color);
      meta.sizes.add(v.size);
      if ((v.stockQty ?? 0) > 0) meta.inStock = true;
    }

    const byId = new Map(rows.map((row) => [row.id, row]));

    const items = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((row) => {
        const meta = variantMetaByProduct.get(row!.id);
        return {
          id: row!.id,
          name: row!.name,
          slug: row!.slug,
          description: row!.description,
          active: row!.active,
          basePrice: row!.basePrice,
          createdAt: row!.createdAt,
          category: {
            id: row!.categoryId,
            name: row!.categoryName,
            slug: row!.categorySlug,
          },
          coverImageUrl: imageByProduct.get(row!.id) ?? null,
          availableColors: meta ? Array.from(meta.colors) : [],
          availableSizes: meta ? Array.from(meta.sizes) : [],
          inStock: meta?.inStock ?? false,
        };
      });

    return { page, pageSize: PAGE_SIZE, items };
  }

  async getBySlug(slug: string) {
    const rows = await this.drizzle.db
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        description: products.description,
        active: products.active,
        basePrice: products.basePrice,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categoryName: categories.name,
        categorySlug: categories.slug,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(eq(products.slug, slug))
      .limit(1);

    const product = rows[0];
    if (!product) throw new NotFoundException('Product not found');

    const images = await this.drizzle.db
      .select({
        id: productImages.id,
        url: productImages.url,
        position: productImages.position,
      })
      .from(productImages)
      .where(eq(productImages.productId, product.id))
      .orderBy(asc(productImages.position));

    const productVariants = await this.drizzle.db
      .select({
        id: variants.id,
        sku: variants.sku,
        color: variants.color,
        size: variants.size,
        priceOverride: variants.priceOverride,
        stockQty: variants.stockQty,
      })
      .from(variants)
      .where(eq(variants.productId, product.id))
      .orderBy(asc(variants.color), asc(variants.size));

    const productReviews = await this.drizzle.db
      .select({
        id: reviews.id,
        userName: reviews.userName,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(eq(reviews.productId, product.id))
      .orderBy(desc(reviews.createdAt));

    return {
      ...product,
      category: {
        id: product.categoryId,
        name: product.categoryName,
        slug: product.categorySlug,
      },
      images,
      variants: productVariants,
      reviews: productReviews,
    };
  }
}
