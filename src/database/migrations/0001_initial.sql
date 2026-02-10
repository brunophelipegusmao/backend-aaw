CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "role" AS ENUM ('ADMIN', 'CUSTOMER');
CREATE TYPE "coupon_type" AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "order_status" AS ENUM ('PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELED');

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL DEFAULT '',
  "role" "role" NOT NULL DEFAULT 'CUSTOMER',
  "email_verified" boolean NOT NULL DEFAULT false,
  "image" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE
);

CREATE TABLE "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "description" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "base_price" numeric(10, 2) NOT NULL,
  "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "product_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "position" integer NOT NULL DEFAULT 0
);

CREATE TABLE "variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "sku" text NOT NULL UNIQUE,
  "color" text NOT NULL,
  "size" text NOT NULL,
  "price_override" numeric(10, 2),
  "stock_qty" integer NOT NULL DEFAULT 0
);

CREATE TABLE "reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "user_name" text NOT NULL,
  "rating" integer NOT NULL,
  "comment" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "addresses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "zip" text NOT NULL,
  "street" text NOT NULL,
  "number" text NOT NULL,
  "complement" text,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "country" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false
);

CREATE TABLE "carts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "cart_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cart_id" uuid NOT NULL REFERENCES "carts"("id") ON DELETE CASCADE,
  "variant_id" uuid NOT NULL REFERENCES "variants"("id") ON DELETE RESTRICT,
  "qty" integer NOT NULL
);

CREATE TABLE "coupons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text NOT NULL UNIQUE,
  "type" "coupon_type" NOT NULL,
  "value" numeric(10, 2) NOT NULL,
  "active" boolean NOT NULL DEFAULT true
);

CREATE TABLE "orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" "order_status" NOT NULL DEFAULT 'PENDING',
  "subtotal" numeric(10, 2) NOT NULL,
  "shipping" numeric(10, 2) NOT NULL,
  "discount" numeric(10, 2) NOT NULL,
  "total" numeric(10, 2) NOT NULL,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "variant_id" uuid NOT NULL REFERENCES "variants"("id") ON DELETE RESTRICT,
  "product_name_snapshot" text NOT NULL,
  "variant_snapshot" jsonb NOT NULL,
  "unit_price" numeric(10, 2) NOT NULL,
  "qty" integer NOT NULL
);

CREATE TABLE "stripe_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" text NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  CONSTRAINT "stripe_events_event_id_unique" UNIQUE ("event_id")
);

CREATE INDEX "idx_products_category_id" ON "products"("category_id");
CREATE INDEX "idx_variants_product_id" ON "variants"("product_id");
CREATE INDEX "idx_order_items_order_id" ON "order_items"("order_id");
CREATE INDEX "idx_carts_user_id" ON "carts"("user_id");
CREATE INDEX "idx_orders_user_id" ON "orders"("user_id");
CREATE INDEX "idx_orders_status" ON "orders"("status");
CREATE INDEX "idx_stripe_events_processed_at" ON "stripe_events"("processed_at");
