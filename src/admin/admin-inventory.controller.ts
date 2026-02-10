import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DrizzleService } from '../database/drizzle.service';
import { variants } from '../database/schema';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Controller('admin/inventory')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminInventoryController {
  constructor(private readonly drizzle: DrizzleService) {}

  @Put(':variantId')
  async update(
    @Param('variantId') variantId: string,
    @Body() body: UpdateInventoryDto,
  ) {
    const updated = await this.drizzle.db
      .update(variants)
      .set({ stockQty: body.stockQty })
      .where(eq(variants.id, variantId))
      .returning({ id: variants.id, stockQty: variants.stockQty });

    return updated[0] ?? null;
  }
}
