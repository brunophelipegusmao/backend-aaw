import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import slugify from 'slugify';
import { Roles } from '../common/decorators/roles.decorator';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { DrizzleService } from '../database/drizzle.service';
import { productImages, products } from '../database/schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('admin/products')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminProductsController {
  constructor(private readonly drizzle: DrizzleService) {}

  @Post()
  async create(@Body() body: CreateProductDto) {
    const slug = slugify(body.name, { lower: true, strict: true });

    const created = await this.drizzle.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(products)
        .values({
          name: body.name,
          slug,
          description: body.description,
          active: body.active ?? true,
          basePrice: body.basePrice,
          categoryId: body.categoryId,
        })
        .returning({ id: products.id, slug: products.slug });

      const product = inserted[0];

      if (body.images?.length) {
        await tx.insert(productImages).values(
          body.images.map((url, index) => ({
            productId: product.id,
            url,
            position: index,
          })),
        );
      }

      return product;
    });

    return created;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateProductDto) {
    const update: Partial<{
      name: string;
      slug: string;
      description: string;
      basePrice: string;
      active: boolean;
      categoryId: string;
    }> = {};
    if (body.name) {
      update.name = body.name;
      update.slug = slugify(body.name, { lower: true, strict: true });
    }
    if (typeof body.description === 'string')
      update.description = body.description;
    if (typeof body.basePrice === 'string') update.basePrice = body.basePrice;
    if (typeof body.active === 'boolean') update.active = body.active;
    if (typeof body.categoryId === 'string')
      update.categoryId = body.categoryId;

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const updated = await this.drizzle.db
      .update(products)
      .set(update)
      .where(eq(products.id, id))
      .returning({ id: products.id, slug: products.slug });

    return updated[0] ?? null;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.drizzle.db.delete(products).where(eq(products.id, id));
    return { ok: true };
  }
}
