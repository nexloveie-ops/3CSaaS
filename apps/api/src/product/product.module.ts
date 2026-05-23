import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CatalogCategory,
  CatalogCategorySchema,
  InventoryPosition,
  InventoryPositionSchema,
  Product,
  ProductSchema,
  TaxCategory,
  TaxCategorySchema,
} from '@lz3c/db';
import { CompanyModule } from '../company/company.module';
import { CatalogCategoryController } from './catalog-category.controller';
import { CatalogCategoryService } from './catalog-category.service';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [
    CompanyModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: InventoryPosition.name, schema: InventoryPositionSchema },
      { name: TaxCategory.name, schema: TaxCategorySchema },
      { name: CatalogCategory.name, schema: CatalogCategorySchema },
    ]),
  ],
  controllers: [ProductController, CatalogCategoryController],
  providers: [ProductService, CatalogCategoryService],
  exports: [ProductService, CatalogCategoryService],
})
export class ProductModule {}
