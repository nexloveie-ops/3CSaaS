import {
  Body,
  Controller,
  Delete,
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
import { B2bCustomerService } from './b2b-customer.service';
import { CreateB2bCustomerDto } from './dto/create-b2b-customer.dto';
import { UpdateB2bCustomerDto } from './dto/update-b2b-customer.dto';

@Controller('b2b/customers')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('b2b')
export class B2bCustomerController {
  constructor(private b2bCustomerService: B2bCustomerService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('q') q?: string,
  ) {
    return this.b2bCustomerService.list(user.userId, companyId, q);
  }

  @Get(':id/orders')
  listOrders(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.b2bCustomerService.listOrders(user.userId, companyId, id);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.b2bCustomerService.getOne(user.userId, companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Body() dto: CreateB2bCustomerDto,
  ) {
    return this.b2bCustomerService.create(user.userId, companyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateB2bCustomerDto,
  ) {
    return this.b2bCustomerService.update(user.userId, companyId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
  ) {
    return this.b2bCustomerService.remove(user.userId, companyId, id);
  }
}
