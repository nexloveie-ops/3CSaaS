import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
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
import { BulkPriceMatrixDto } from './dto/bulk-price-matrix.dto';
import { CreatePriceListBrandDto } from './dto/create-price-list-brand.dto';
import { CreatePriceListIssueTemplateDto } from './dto/create-price-list-issue-template.dto';
import { CreatePriceListModelDto } from './dto/create-price-list-model.dto';
import { PriceListService } from './price-list.service';

@Controller('price-list')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('service')
export class PriceListController {
  constructor(private service: PriceListService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
  ) {
    return this.service.list(user.userId, companyId);
  }

  @Get('brands')
  listBrands(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
  ) {
    return this.service.listBrands(user.userId, companyId);
  }

  @Post('brands')
  createBrand(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: CreatePriceListBrandDto,
  ) {
    return this.service.createBrand(user.userId, companyId, dto);
  }

  @Delete('brands/:id')
  deleteBrand(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteBrand(user.userId, companyId, id);
  }

  @Get('brands/:brandId/models')
  listModels(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('brandId') brandId: string,
  ) {
    return this.service.listModels(user.userId, companyId, brandId);
  }

  @Post('brands/:brandId/models')
  createModel(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('brandId') brandId: string,
    @Body() dto: CreatePriceListModelDto,
  ) {
    return this.service.createModel(user.userId, companyId, brandId, dto);
  }

  @Delete('models/:id')
  deleteModel(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteModel(user.userId, companyId, id);
  }

  @Get('issue-templates')
  listIssueTemplates(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
  ) {
    return this.service.listIssueTemplates(user.userId, companyId);
  }

  @Post('issue-templates')
  createIssueTemplate(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: CreatePriceListIssueTemplateDto,
  ) {
    return this.service.createIssueTemplate(user.userId, companyId, dto);
  }

  @Delete('issue-templates/:id')
  deleteIssueTemplate(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteIssueTemplate(user.userId, companyId, id);
  }

  @Get('matrix')
  getMatrix(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('brandId') brandId: string,
  ) {
    return this.service.getMatrix(user.userId, companyId, brandId);
  }

  @Post('matrix/bulk')
  bulkSaveMatrix(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: BulkPriceMatrixDto,
  ) {
    return this.service.bulkSaveMatrix(user.userId, companyId, dto);
  }
}
