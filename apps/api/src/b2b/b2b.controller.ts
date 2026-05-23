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
import { CreateB2bOrderDto } from './dto/create-b2b-order.dto';
import { TransitionB2bDto } from './dto/transition-b2b.dto';
import { UpdateB2bPaymentDto } from './dto/update-b2b-payment.dto';
import { B2bService } from './b2b.service';

@Controller('b2b')
@UseGuards(AuthGuard('jwt'), ReadOnlyGuard, SubscriptionGuard, RolesGuard)
@RequireModule('b2b')
export class B2bController {
  constructor(private b2bService: B2bService) {}

  @Get('orders')
  list(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Query('role') role: 'seller' | 'buyer' = 'seller',
  ) {
    return this.b2bService.list(user.userId, companyId, role);
  }

  @Post('orders')
  create(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Headers('x-store-id') storeId: string,
    @Body() dto: CreateB2bOrderDto,
  ) {
    return this.b2bService.create(user.userId, companyId, storeId, dto);
  }

  @Post('orders/:id/transition')
  transition(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: TransitionB2bDto,
  ) {
    return this.b2bService.transition(user.userId, companyId, id, dto);
  }

  @Patch('orders/:id/payment')
  payment(
    @CurrentUser() user: { userId: string },
    @Headers('x-company-id') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateB2bPaymentDto,
  ) {
    return this.b2bService.updatePayment(user.userId, companyId, id, dto);
  }
}
