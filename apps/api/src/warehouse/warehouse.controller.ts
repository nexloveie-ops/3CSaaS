import { Body, Controller, Get, Headers, Param, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { UpdateWarehouseScopeDto } from './dto/update-warehouse-scope.dto';
import { WarehouseService } from './warehouse.service';

@Controller('warehouse')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('warehouse')
export class WarehouseController {
  constructor(private service: WarehouseService) {}

  @Get('scope')
  getScope(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
  ) {
    return this.service.getScope(user.userId, companyId, storeId);
  }

  @Put('scope')
  updateScope(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: UpdateWarehouseScopeDto,
  ) {
    return this.service.updateScope(user.userId, companyId, storeId, dto);
  }

  @Get('catalog/:warehouseStoreId')
  catalog(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('warehouseStoreId') warehouseStoreId: string,
  ) {
    return this.service.catalogForBuyer(
      user.userId,
      companyId,
      storeId,
      warehouseStoreId,
    );
  }
}
