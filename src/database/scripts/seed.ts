import { config as loadEnv } from 'dotenv';
import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import slugify from 'slugify';
import * as dbSchema from '../schema';
import {
  categories,
  coupons,
  productImages,
  products,
  reviews,
  users,
  variants,
} from '../schema';

loadEnv();

const categorySeed = [
  'Leggings',
  'Tops',
  'Shorts',
  'Jaquetas',
  'Esportivo',
  'Acessórios',
];

const productSeed = [
  { name: 'Legging Sculpt Flex', category: 'Leggings', basePrice: 189.9 },
  { name: 'Legging Motion Pro', category: 'Leggings', basePrice: 219.9 },
  { name: 'Top Essential Support', category: 'Tops', basePrice: 129.9 },
  { name: 'Top Pulse Racer', category: 'Tops', basePrice: 149.9 },
  { name: 'Short Core Lift', category: 'Shorts', basePrice: 139.9 },
  { name: 'Short Aero Run', category: 'Shorts', basePrice: 129.9 },
  { name: 'Jaqueta Urban Flow', category: 'Jaquetas', basePrice: 299.9 },
  { name: 'Jaqueta Wind Guard', category: 'Jaquetas', basePrice: 259.9 },
  { name: 'Conjunto Active Prime', category: 'Esportivo', basePrice: 349.9 },
  { name: 'Conjunto Dynamic Fit', category: 'Esportivo', basePrice: 369.9 },
  { name: 'Mochila Training Pack', category: 'Acessórios', basePrice: 199.9 },
  { name: 'Garrafa Thermal Aura', category: 'Acessórios', basePrice: 89.9 },
];

const reviewSeed = [
  {
    userName: 'Camila Rocha',
    rating: 5,
    comment: 'Caimento impecavel e tecido super confortavel.',
  },
  {
    userName: 'Marina Alves',
    rating: 4,
    comment: 'Ótima qualidade, veste muito bem para treino funcional.',
  },
  {
    userName: 'Patricia Souza',
    rating: 5,
    comment: 'Secagem rápida e excelente respirabilidade.',
  },
  {
    userName: 'Renata Lima',
    rating: 4,
    comment: 'Gostei bastante do acabamento e da elasticidade.',
  },
  {
    userName: 'Aline Ferreira',
    rating: 5,
    comment: 'Superou as expectativas na corrida de longa distância.',
  },
  {
    userName: 'Jéssica Ramos',
    rating: 4,
    comment: 'Modelagem bonita e tecido firme.',
  },
  {
    userName: 'Bruna Costa',
    rating: 5,
    comment: 'Virou minha peça favorita para academia.',
  },
  {
    userName: 'Larissa Nunes',
    rating: 4,
    comment: 'Confortável e elegante para usar no dia a dia também.',
  },
];

const colors = ['Lilac', 'Black', 'White'];
const sizes = ['P', 'M', 'G'];

async function ensureAdmin(args: {
  db: ReturnType<typeof drizzle>;
  adminEmail: string;
  adminPassword: string;
  secret: string;
  baseURL?: string;
  basePath: string;
  trustedOrigins: string[];
}) {
  const [{ betterAuth }, { drizzleAdapter }, { jwt }] = await Promise.all([
    import('better-auth/minimal'),
    import('better-auth/adapters/drizzle'),
    import('better-auth/plugins/jwt'),
  ]);

  const auth = betterAuth({
    secret: args.secret,
    baseURL: args.baseURL,
    basePath: args.basePath,
    trustedOrigins: args.trustedOrigins.length
      ? args.trustedOrigins
      : undefined,
    advanced: { database: { generateId: 'uuid' } },
    emailAndPassword: { enabled: true },
    user: {
      modelName: 'users',
      fields: {
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        emailVerified: 'email_verified',
      },
      additionalFields: {
        role: {
          type: 'string',
          required: true,
          defaultValue: 'CUSTOMER',
          fieldName: 'role',
        },
      },
    },
    session: {
      modelName: 'session',
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
      },
    },
    account: {
      modelName: 'account',
      fields: {
        userId: 'user_id',
        providerId: 'provider_id',
        accountId: 'account_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        password: 'password_hash',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'verification',
      fields: {
        identifier: 'identifier',
        value: 'value',
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    database: drizzleAdapter(args.db, { provider: 'pg' }),
    plugins: [
      jwt({
        schema: {
          jwks: {
            modelName: 'jwks',
            fields: {
              publicKey: 'public_key',
              privateKey: 'private_key',
              createdAt: 'created_at',
              expiresAt: 'expires_at',
            },
          },
        },
        jwks: { jwksPath: '/jwks' },
      }),
    ],
  });

  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(args.adminEmail, {
    includeAccounts: true,
  });

  if (existing?.user) {
    await args.db
      .update(users)
      .set({ role: 'ADMIN' } as any)
      .where(eq(users.id, existing.user.id));
    return;
  }

  const createdUser = await ctx.internalAdapter.createUser({
    email: args.adminEmail.toLowerCase(),
    name: 'Aura Admin',
    role: 'ADMIN',
    emailVerified: true,
  } as any);

  const hashedPassword = await ctx.password.hash(args.adminPassword);
  await ctx.internalAdapter.linkAccount({
    userId: createdUser.id,
    providerId: 'credential',
    accountId: createdUser.id,
    password: hashedPassword,
  } as any);

  // Keep the MVP `users.password_hash` populated.
  await args.db
    .update(users)
    .set({ passwordHash: hashedPassword, role: 'ADMIN' } as any)
    .where(eq(users.id, createdUser.id));
}

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!databaseUrl || !adminEmail || !adminPassword || !secret) {
    throw new Error(
      'DATABASE_URL, BETTER_AUTH_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD are required to seed',
    );
  }

  const client = postgres(databaseUrl, {
    max: 1,
    ssl: databaseUrl.includes('neon.tech') ? 'require' : undefined,
    prepare: false,
  });

  const db = drizzle(client, { schema: dbSchema });

  await ensureAdmin({
    db,
    adminEmail,
    adminPassword,
    secret,
    baseURL: process.env.BETTER_AUTH_BASE_URL,
    basePath: process.env.BETTER_AUTH_BASE_PATH || '/api/v1/auth',
    trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  });

  for (const name of categorySeed) {
    const slug = slugify(name, { lower: true, strict: true });
    await db
      .insert(categories)
      .values({ name, slug })
      .onConflictDoNothing({ target: categories.slug });
  }

  const categoryRows = await db.select().from(categories);
  const categoryBySlug = new Map(
    categoryRows.map((category) => [category.slug, category]),
  );

  for (const item of productSeed) {
    const categorySlug = slugify(item.category, { lower: true, strict: true });
    const category = categoryBySlug.get(categorySlug);

    if (!category) continue;

    const productSlug = slugify(item.name, { lower: true, strict: true });

    const inserted = await db
      .insert(products)
      .values({
        name: item.name,
        slug: productSlug,
        description: `${item.name} com tecido premium para treino e rotina ativa.`,
        active: true,
        basePrice: item.basePrice.toFixed(2),
        categoryId: category.id,
      })
      .onConflictDoNothing({ target: products.slug })
      .returning({ id: products.id, slug: products.slug });

    const productId = inserted[0]?.id;

    const persistedProduct = productId
      ? { id: productId, slug: inserted[0].slug }
      : (
          await db
            .select({ id: products.id, slug: products.slug })
            .from(products)
            .where(eq(products.slug, productSlug))
            .limit(1)
        )[0];

    if (!persistedProduct) continue;

    await db
      .insert(productImages)
      .values([
        {
          productId: persistedProduct.id,
          url: `https://images.unsplash.com/photo-1518459031867-a89b944bffe4?auto=format&fit=crop&w=1200&q=80&sig=${persistedProduct.slug}-1`,
          position: 0,
        },
        {
          productId: persistedProduct.id,
          url: `https://images.unsplash.com/photo-1506629905607-d9ff8d3dff6a?auto=format&fit=crop&w=1200&q=80&sig=${persistedProduct.slug}-2`,
          position: 1,
        },
      ])
      .onConflictDoNothing();

    const variantRows = colors.map((color, index) => ({
      productId: persistedProduct.id,
      sku: `${persistedProduct.slug.toUpperCase().replace(/-/g, '_')}_${color.toUpperCase()}_${sizes[index]}`,
      color,
      size: sizes[index],
      priceOverride:
        index === 0 ? null : (item.basePrice + index * 10).toFixed(2),
      stockQty: 15 + index * 5,
    }));

    await db
      .insert(variants)
      .values(variantRows)
      .onConflictDoNothing({ target: variants.sku });
  }

  const latestProducts = await db
    .select({ id: products.id })
    .from(products)
    .orderBy(desc(products.createdAt))
    .limit(8);

  for (let index = 0; index < reviewSeed.length; index += 1) {
    const target = latestProducts[index];
    if (!target) break;

    const review = reviewSeed[index];

    const duplicate = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.productId, target.id),
          eq(reviews.userName, review.userName),
        ),
      )
      .limit(1);

    if (duplicate.length === 0) {
      await db.insert(reviews).values({
        productId: target.id,
        userName: review.userName,
        rating: review.rating,
        comment: review.comment,
      });
    }
  }

  await db
    .insert(coupons)
    .values([
      { code: 'AURA10', type: 'PERCENT', value: '10.00', active: true },
      { code: 'WELCOME20', type: 'FIXED', value: '20.00', active: true },
    ])
    .onConflictDoNothing({ target: coupons.code });

  const productCount = await db
    .select({ total: sql<number>`count(*)` })
    .from(products);
  const variantCount = await db
    .select({ total: sql<number>`count(*)` })
    .from(variants);

  console.log(
    `Seed completed: ${productCount[0]?.total ?? 0} products, ${variantCount[0]?.total ?? 0} variants`,
  );

  await client.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
