import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CreateInboundDto } from './dto/create-inbound.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('positions')
  listPositions(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
  ) {
    return this.inventoryService.listPositions(user.userId, companyId, storeId);
  }

  @Get('inbound')
  listInbound(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventoryService.listInbound(
      user.userId,
      companyId,
      storeId,
      from,
      to,
    );
  }

  @Post('inbound')
  inbound(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: CreateInboundDto,
  ) {
    return this.inventoryService.createInbound(
      user.userId,
      companyId,
      storeId,
      dto,
    );
  }
}
