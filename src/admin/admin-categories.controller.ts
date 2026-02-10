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
import { categories } from '../database/schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('admin/categories')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCategoriesController {
  constructor(private readonly drizzle: DrizzleService) {}

  @Post()
  async create(@Body() body: CreateCategoryDto) {
    const slug = slugify(body.name, { lower: true, strict: true });
    const created = await this.drizzle.db
      .insert(categories)
      .values({ name: body.name, slug })
      .onConflictDoNothing({ target: categories.slug })
      .returning({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      });

    return created[0] ?? null;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
    if (!body.name) {
      throw new BadRequestException('name is required');
    }

    const updated = await this.drizzle.db
      .update(categories)
      .set({
        name: body.name,
        slug: slugify(body.name, { lower: true, strict: true }),
      })
      .where(eq(categories.id, id))
      .returning({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      });

    return updated[0] ?? null;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.drizzle.db.delete(categories).where(eq(categories.id, id));
    return { ok: true };
  }
}
