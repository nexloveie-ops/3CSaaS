import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateTerminalPaymentDto } from './dto/create-terminal-payment.dto';
import { UpdateStoreProfileDto } from './dto/update-store-profile.dto';
import { UpdateStoreRepairTermsDto } from './dto/update-store-repair-terms.dto';
import { UpdateStoreSalesTermsDto } from './dto/update-store-sales-terms.dto';
import { TestStoreFeieDto } from './dto/test-store-feie.dto';
import { TestStoreStripeDto } from './dto/test-store-stripe.dto';
import { StoreService } from './store.service';

@Controller('stores')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class StoreController {
  constructor(private storeService: StoreService) {}

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: CreateStoreDto,
  ) {
    return this.storeService.create(user.userId, companyId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
  ) {
    return this.storeService.listByCompany(user.userId, companyId);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.storeService.getOne(user.userId, companyId, id);
  }

  @Post(':id/feie-test')
  testFeie(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: TestStoreFeieDto,
  ) {
    return this.storeService.testFeie(user.userId, companyId, id, dto);
  }

  @Post(':id/terminal/connection-token')
  connectionToken(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.storeService.createTerminalConnectionToken(user.userId, companyId, id);
  }

  @Post(':id/terminal/payment-intent')
  terminalPaymentIntent(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: CreateTerminalPaymentDto,
  ) {
    return this.storeService.createTerminalPaymentIntent(user.userId, companyId, id, dto);
  }

  @Post(':id/stripe-test')
  testStripe(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: TestStoreStripeDto,
  ) {
    return this.storeService.testStripe(user.userId, companyId, id, dto);
  }

  @Patch(':id/profile')
  updateProfile(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStoreProfileDto,
  ) {
    return this.storeService.updateProfile(user.userId, companyId, id, dto);
  }

  @Patch(':id/repair-terms')
  updateRepairTerms(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStoreRepairTermsDto,
  ) {
    return this.storeService.updateRepairTerms(
      user.userId,
      companyId,
      id,
      dto.repairTerms,
    );
  }

  @Patch(':id/sales-terms')
  updateSalesTerms(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStoreSalesTermsDto,
  ) {
    return this.storeService.updateSalesTerms(
      user.userId,
      companyId,
      id,
      dto.salesTerms,
    );
  }
}
