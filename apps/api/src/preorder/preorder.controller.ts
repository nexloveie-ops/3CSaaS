import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { CurrentUser } from '../auth/current-user.decorator';

import { RequireModule } from '../common/decorators/require-module.decorator';

import { ReadOnlyGuard } from '../common/guards/read-only.guard';

import { RolesGuard } from '../common/guards/roles.guard';

import { SubscriptionGuard } from '../common/guards/subscription.guard';

import { ConvertPreorderDto } from './dto/convert-preorder.dto';

import { CreatePreorderDto } from './dto/create-preorder.dto';

import { MarkPreorderArrivedDto } from './dto/mark-preorder-arrived.dto';

import { PayDepositDto } from './dto/pay-deposit.dto';

import { PreorderService } from './preorder.service';



@Controller('preorders')

@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)

@RequireModule('preorder')

export class PreorderController {

  constructor(private service: PreorderService) {}



  @Get()

  list(

    @CurrentUser() user: { userId: string },

    @Headers('x-company-id') companyId: string,

    @Headers('x-store-id') storeId: string,

  ) {

    return this.service.list(user.userId, companyId, storeId);

  }



  @Post()

  create(

    @CurrentUser() user: { userId: string },

    @Headers('x-company-id') companyId: string,

    @Headers('x-store-id') storeId: string,

    @Body() dto: CreatePreorderDto,

  ) {

    return this.service.create(user.userId, companyId, storeId, dto);

  }



  @Post(':id/arrived')

  markArrived(

    @CurrentUser() user: { userId: string },

    @Headers('x-company-id') companyId: string,

    @Headers('x-store-id') storeId: string,

    @Param('id') id: string,

    @Body() dto: MarkPreorderArrivedDto,

  ) {

    return this.service.markArrived(user.userId, companyId, storeId, id, dto);

  }



  @Post(':id/complete')

  markCompleted(

    @CurrentUser() user: { userId: string },

    @Headers('x-company-id') companyId: string,

    @Headers('x-store-id') storeId: string,

    @Param('id') id: string,

  ) {

    return this.service.markCompleted(user.userId, companyId, storeId, id);

  }



  @Post(':id/deposit')

  payDeposit(

    @CurrentUser() user: { userId: string },

    @Headers('x-company-id') companyId: string,

    @Headers('x-store-id') storeId: string,

    @Param('id') id: string,

    @Body() dto: PayDepositDto,

  ) {

    return this.service.payDeposit(user.userId, companyId, storeId, id, dto);

  }



  @Post(':id/ready')

  markReady(

    @CurrentUser() user: { userId: string },

    @Headers('x-company-id') companyId: string,

    @Param('id') id: string,

  ) {

    return this.service.markReady(user.userId, companyId, id);

  }



  @Post(':id/convert')

  convert(

    @CurrentUser() user: { userId: string },

    @Headers('x-company-id') companyId: string,

    @Headers('x-store-id') storeId: string,

    @Param('id') id: string,

    @Body() dto: ConvertPreorderDto,

  ) {

    return this.service.convert(user.userId, companyId, storeId, id, dto);

  }



  @Post(':id/cancel')

  cancel(

    @CurrentUser() user: { userId: string },

    @Headers('x-company-id') companyId: string,

    @Headers('x-store-id') storeId: string,

    @Param('id') id: string,

  ) {

    return this.service.cancel(user.userId, companyId, storeId, id);

  }

}

