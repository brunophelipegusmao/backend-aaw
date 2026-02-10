import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('color') color?: string,
    @Query('size') size?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
  ) {
    return this.productsService.list({
      search,
      category,
      minPrice,
      maxPrice,
      color,
      size,
      sort,
      page,
    });
  }

  @Get(':slug')
  async bySlug(@Param('slug') slug: string) {
    return this.productsService.getBySlug(slug);
  }
}
