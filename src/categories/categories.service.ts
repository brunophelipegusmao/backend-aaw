import { Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { DrizzleService } from '../database/drizzle.service';
import { categories } from '../database/schema';

@Injectable()
export class CategoriesService {
  constructor(private readonly drizzle: DrizzleService) {}

  async list() {
    const rows = await this.drizzle.db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      })
      .from(categories)
      .orderBy(asc(categories.name));

    return rows;
  }
}
