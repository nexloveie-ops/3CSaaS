import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { join } from 'path';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { InviteModule } from './invite/invite.module';
import { B2bModule } from './b2b/b2b.module';
import { ChainModule } from './chain/chain.module';
import { CommonModule } from './common/common.module';
import { CompanyModule } from './company/company.module';
import { CustomerModule } from './customer/customer.module';
import { HealthModule } from './health/health.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { InvoiceModule } from './invoice/invoice.module';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationModule } from './notification/notification.module';
import { PosModule } from './pos/pos.module';
import { CreditNoteModule } from './credit-note/credit-note.module';
import { PreorderModule } from './preorder/preorder.module';
import { ReportModule } from './report/report.module';
import { ServiceModule } from './service/service.module';
import { ProductModule } from './product/product.module';
import { SerialModule } from './serial/serial.module';
import { StoreModule } from './store/store.module';
import { TransferModule } from './transfer/transfer.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { StorageModule } from './storage/storage.module';
import { TaxModule } from './tax/tax.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '.env.local'),
        join(process.cwd(), '../../.env.local'),
        join(process.cwd(), '.env'),
        join(process.cwd(), '../../.env'),
      ],
    }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME ?? 'lz3c',
        serverSelectionTimeoutMS: 10_000,
      }),
    }),
    CommonModule,
    StorageModule,
    HealthModule,
    MaintenanceModule,
    AuthModule,
    AdminModule,
    CompanyModule,
    StoreModule,
    SubscriptionModule,
    TaxModule,
    ProductModule,
    SerialModule,
    InventoryModule,
    CustomerModule,
    PosModule,
    NotificationModule,
    ServiceModule,
    PreorderModule,
    CreditNoteModule,
    B2bModule,
    InvoiceModule,
    TransferModule,
    WarehouseModule,
    ChainModule,
    ReportModule,
    AuditModule,
    InviteModule,
  ],
})
export class AppModule {}
