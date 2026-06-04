import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CreateInboundDto } from './dto/create-inbound.dto';
import { SetPositionQuantityDto } from './dto/set-position-quantity.dto';
import { UpdateStoreProductSettingDto } from './dto/update-store-product-setting.dto';
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

  @Get('store-catalog')
  listStoreCatalog(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
  ) {
    return this.inventoryService.listStoreCatalog(user.userId, companyId, storeId);
  }

  @Patch('positions/:productId')
  setPositionQuantity(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('productId') productId: string,
    @Body() dto: SetPositionQuantityDto,
  ) {
    return this.inventoryService.setPositionQuantity(
      user.userId,
      companyId,
      storeId,
      productId,
      dto.quantity,
    );
  }

  @Patch('store-catalog/:productId')
  updateStoreProductSetting(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateStoreProductSettingDto,
  ) {
    return this.inventoryService.updateStoreProductSetting(
      user.userId,
      companyId,
      storeId,
      productId,
      dto,
    );
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
