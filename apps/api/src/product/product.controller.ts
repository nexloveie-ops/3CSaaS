import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { SyncProductVariantsDto } from './dto/sync-product-variants.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductService } from './product.service';

@Controller('products')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('core')
export class ProductController {
  constructor(private productService: ProductService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('productType') productType?: string,
    @Query('catalogCategoryId') catalogCategoryId?: string,
    @Query('q') q?: string,
  ) {
    return this.productService.list(
      user.userId,
      companyId,
      productType,
      catalogCategoryId,
      q,
    );
  }

  @Get(':id/variants/in-stock')
  listVariantsInStock(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Param('id') id: string,
  ) {
    return this.productService.listVariantsInStockForStore(
      user.userId,
      companyId,
      storeId,
      id,
    );
  }

  @Get(':id/variants')
  listVariants(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.productService.listVariantChildren(user.userId, companyId, id);
  }

  @Post(':id/variants/sync')
  syncVariants(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: SyncProductVariantsDto,
  ) {
    return this.productService.syncVariants(user.userId, companyId, id, dto);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.productService.getOne(user.userId, companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(user.userId, companyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(user.userId, companyId, id, dto);
  }
}
